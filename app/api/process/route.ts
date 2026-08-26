import { NextRequest, NextResponse } from 'next/server';
import type { ExtractedQuestion, MappedAnswer, ProcessResult } from '@/lib/types';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

async function callGemini(parts: GeminiPart[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data: GeminiResponse = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text;
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in Gemini response');
  return JSON.parse(raw.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questionPages, answerPages } = body as {
      questionPages: { dataUrl: string }[];
      answerPages: { dataUrl: string }[];
    };

    if (!questionPages?.length || !answerPages?.length) {
      return NextResponse.json({ error: 'Both question paper and answer sheet are required.' }, { status: 400 });
    }

    // Step 1: Extract questions
    const questionParts: GeminiPart[] = [
      {
        text: `You are an expert exam paper reader. Examine these question paper page images and extract EVERY question in the exact printed order. Treat labelled sub-parts as separate questions (e.g. "11 (a)" and "11 (b)" are two entries). Preserve the original question numbering. Return ONLY a JSON object with this exact shape:
{"questions": [{"number": "1", "prompt": "full question text", "maxMarks": 2}]}
- "number" is the printed question number as a string (e.g. "1", "11 (a)", "2b")
- "prompt" is the full question text
- "maxMarks" is the integer marks shown (use 1 if not visible)
Do not include any text outside the JSON.`,
      },
      ...questionPages.map((p) => inlineImage(p.dataUrl)),
    ];

    const questionText = await callGemini(questionParts);
    const questionData = extractJson(questionText) as { questions: ExtractedQuestion[] };

    const questions: ExtractedQuestion[] = (questionData.questions || []).map((q, i) => ({
      id: `q${i + 1}`,
      number: q.number || String(i + 1),
      prompt: q.prompt || '',
      maxMarks: q.maxMarks || 1,
    }));

    if (!questions.length) {
      return NextResponse.json({ error: 'No questions could be extracted from the question paper.' }, { status: 422 });
    }

    // Step 2: Extract and map answers
    const answerParts: GeminiPart[] = [
      {
        text: `You are an expert exam answer-sheet reader and grader. Here are the answer sheet page images for a student. For each question listed below, find the student's handwritten answer, determine the page it appears on, and estimate the vertical position of the answer region on that page.

Questions to find:
${JSON.stringify(questions.map((q) => ({ number: q.number, prompt: q.prompt, maxMarks: q.maxMarks })))}

There are ${answerPages.length} page(s) in the answer sheet. Page numbers start at 1.
For the region, "y" is the top position as a percentage (0-100) from the top of the page, and "height" is the vertical extent as a percentage (0-100) of the page height. Estimate based on where the answer handwriting appears.

Rules:
- If a question was NOT answered, set status to "unanswered", awardedMarks to 0, answerText to "", and region to null.
- If you find content that doesn't match any question, include it with status "unmatched".
- Grade fairly: awardedMarks should not exceed maxMarks.
- Provide concise feedback per question.

Return ONLY a JSON object with this exact shape:
{"answers": [{"questionNumber": "1", "awardedMarks": 2, "status": "correct|partial|unanswered|unmatched", "answerText": "summary of answer", "feedback": "brief feedback", "region": {"page": 1, "y": 15, "height": 20}}], "overallFeedback": "brief overall feedback"}

Do not include any text outside the JSON.`,
      },
      ...answerPages.map((p) => inlineImage(p.dataUrl)),
    ];

    const answerText = await callGemini(answerParts);
    const answerData = extractJson(answerText) as {
      answers: Array<{
        questionNumber: string;
        awardedMarks: number;
        status: 'correct' | 'partial' | 'unanswered' | 'unmatched';
        answerText: string;
        feedback: string;
        region: { page: number; y: number; height: number } | null;
      }>;
      overallFeedback: string;
    };

    const answers: MappedAnswer[] = (answerData.answers || []).map((a, i) => {
      const matchedQ = questions.find((q) => q.number === a.questionNumber) ?? questions[i];
      return {
        questionId: matchedQ?.id ?? `q${i + 1}`,
        questionNumber: a.questionNumber ?? matchedQ?.number ?? String(i + 1),
        prompt: matchedQ?.prompt ?? '',
        maxMarks: matchedQ?.maxMarks ?? a.awardedMarks ?? 1,
        awardedMarks: a.awardedMarks ?? 0,
        status: a.status ?? 'unanswered',
        answerText: a.answerText ?? '',
        feedback: a.feedback ?? '',
        region: a.region ?? null,
      };
    });

    const result: ProcessResult = {
      questions,
      answers,
      totalPages: answerPages.length,
      overallFeedback: answerData.overallFeedback ?? '',
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown processing error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function inlineImage(dataUrl: string): GeminiPart {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data URL');
  return { inlineData: { mimeType: match[1], data: match[2] } };
}
