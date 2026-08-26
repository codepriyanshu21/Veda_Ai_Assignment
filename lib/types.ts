export type QuestionStatus = 'correct' | 'partial' | 'unanswered' | 'unmatched';

export interface ExtractedQuestion {
  id: string;
  number: string;
  prompt: string;
  maxMarks: number;
}

export interface AnswerRegion {
  page: number;
  y: number;
  height: number;
}

export interface MappedAnswer {
  questionId: string;
  questionNumber: string;
  prompt: string;
  maxMarks: number;
  awardedMarks: number;
  status: QuestionStatus;
  feedback: string;
  answerText: string;
  region: AnswerRegion | null;
}

export interface ProcessResult {
  questions: ExtractedQuestion[];
  answers: MappedAnswer[];
  totalPages: number;
  overallFeedback: string;
}

export interface PageImage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}
