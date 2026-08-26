'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  LayoutList,
  Menu,
  MoreHorizontal,
  Play,
  Search,
  Settings,
  Sparkles,
  Upload,
  X,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { convertFileToImages } from '@/lib/pdf';
import type { MappedAnswer, PageImage, ProcessResult } from '@/lib/types';

const statusStyles = {
  correct: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  partial: 'bg-orange-50 text-orange-700 border-orange-100',
  unanswered: 'bg-red-50 text-red-600 border-red-100',
  unmatched: 'bg-slate-100 text-slate-600 border-slate-200',
};

type ProcessingStep = 'idle' | 'converting' | 'extracting' | 'done' | 'error';

function UploadCard({ title, file, onChange, onClear }: { title: string; file: File | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onClear: () => void }) {
  return (
    <label className="upload-card group">
      <input className="sr-only" type="file" accept="application/pdf,image/*" onChange={onChange} />
      <div className="flex items-center gap-3">
        <div className="file-icon"><FileText size={19} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{file ? file.name : `Upload ${title}`}</p>
          <p className="mt-1 text-xs text-slate-400">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB • Ready to process` : 'PDF, JPG or PNG • Max 20MB'}</p>
        </div>
        {file ? <button type="button" aria-label={`Remove ${title}`} onClick={(event) => { event.preventDefault(); onClear(); }} className="icon-button"><X size={16} /></button> : <Upload className="text-orange-500" size={18} />}
      </div>
    </label>
  );
}

export default function Home() {
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [step, setStep] = useState<ProcessingStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [answerPages, setAnswerPages] = useState<PageImage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [mobilePanel, setMobilePanel] = useState<'questions' | 'answer'>('questions');

  const answers = result?.answers ?? [];
  const selected = answers[selectedIdx] ?? answers[0];
  const filteredAnswers = useMemo(() => answers.filter((a) => `${a.questionNumber} ${a.prompt}`.toLowerCase().includes(search.toLowerCase())), [answers, search]);
  const canStart = Boolean(paperFile && answerFile) && step === 'idle';

  async function startMapping() {
    if (!paperFile || !answerFile) return;
    setStep('converting');
    setErrorMsg('');
    try {
      const qPages = await convertFileToImages(paperFile);
      const aPages = await convertFileToImages(answerFile);
      setAnswerPages(aPages);

      setStep('extracting');
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPages: qPages.map((p) => ({ dataUrl: p.dataUrl })),
          answerPages: aPages.map((p) => ({ dataUrl: p.dataUrl })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Processing failed');
      }

      const data: ProcessResult = await res.json();
      setResult(data);
      setSelectedIdx(0);
      setPage(data.answers[0]?.region?.page ?? 1);
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setStep('error');
    }
  }

  function selectAnswer(idx: number) {
    setSelectedIdx(idx);
    const a = answers[idx];
    if (a?.region?.page) setPage(a.region.page);
    setMobilePanel('answer');
  }

  function reset() {
    setStep('idle');
    setResult(null);
    setAnswerPages([]);
    setErrorMsg('');
    setSelectedIdx(0);
    setPage(1);
  }

  const isProcessing = step === 'converting' || step === 'extracting';

  if (step === 'done' && result && selected) {
    const totalMarks = result.answers.reduce((s, a) => s + a.maxMarks, 0);
    const awarded = result.answers.reduce((s, a) => s + a.awardedMarks, 0);
    const answeredCount = result.answers.filter((a) => a.status !== 'unanswered').length;
    const unansweredCount = result.answers.filter((a) => a.status === 'unanswered').length;
    const pct = totalMarks > 0 ? Math.round((awarded / totalMarks) * 1000) / 10 : 0;
    const currentPageImg = answerPages.find((p) => p.pageNumber === page) ?? answerPages[0];

    return (
      <main className="min-h-screen bg-[#f4f5f7] text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar active="Exams" compact />
          <section className="min-w-0 flex-1">
            <Topbar title="Review assessment" />
            <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
                <div><p className="text-xs font-medium text-slate-400">Student answer sheet review</p><h1 className="mt-1 text-lg font-bold tracking-tight">Assessment review</h1></div>
                <div className="flex items-center gap-2"><button className="secondary-button" onClick={reset}><ArrowLeft size={14} /> New upload</button><button className="primary-button !px-4 !py-2">Export report <ArrowRight size={14} /></button></div>
              </div>
            </div>
            <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Questions" value={String(result.answers.length)} detail={`${answeredCount} answered`} icon={<BookOpen size={16} />} />
                <SummaryCard label="Score" value={`${awarded} / ${totalMarks}`} detail={`${pct}% overall`} icon={<Sparkles size={16} />} />
                <SummaryCard label="Unanswered" value={String(unansweredCount)} detail="Needs attention" icon={<CircleHelp size={16} />} alert={unansweredCount > 0} />
                <SummaryCard label="Processing" value="Complete" detail={`${answerPages.length} pages reviewed`} icon={<Check size={16} />} />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 lg:hidden"><button className={`mobile-tab ${mobilePanel === 'questions' ? 'active' : ''}`} onClick={() => setMobilePanel('questions')}>Questions</button><button className={`mobile-tab ${mobilePanel === 'answer' ? 'active' : ''}`} onClick={() => setMobilePanel('answer')}>Answer sheet</button></div>
              <div className="mt-4 grid min-h-[690px] gap-4 lg:grid-cols-[390px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
                <aside className={`${mobilePanel === 'answer' ? 'hidden lg:block' : ''} panel overflow-hidden`}>
                  <div className="border-b border-slate-100 p-4"><div className="flex items-center justify-between"><div><h2 className="font-bold">Extracted questions</h2><p className="mt-1 text-xs text-slate-400">Click a question to find its answer</p></div><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><MoreHorizontal size={18} /></button></div><div className="relative mt-4"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search questions" className="search-input" /></div></div>
                  <div className="question-list">{filteredAnswers.map((answer, idx) => {
                    const realIdx = answers.indexOf(answer);
                    return <QuestionRow key={`${answer.questionId}-${idx}`} answer={answer} selected={realIdx === selectedIdx} onSelect={() => selectAnswer(realIdx)} />;
                  })}</div>
                </aside>
                <section className={`${mobilePanel === 'questions' ? 'hidden lg:flex' : 'flex'} panel min-w-0 flex-col overflow-hidden`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><p className="text-xs font-medium text-slate-400">Answer sheet</p><p className="mt-1 text-sm font-semibold">{answerFile?.name ?? 'Student response'}</p></div><div className="flex items-center gap-2"><button className="toolbar-button" onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={15} /> Prev</button><span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">Page {page} of {answerPages.length}</span><button className="toolbar-button" onClick={() => setPage((p) => Math.min(answerPages.length, p + 1))}>Next <ChevronRight size={15} /></button></div></div>
                  <div className="answer-stage">
                    {currentPageImg ? (
                      <div className="paper-image-wrapper">
                        <img src={currentPageImg.dataUrl} alt={`Answer sheet page ${page}`} className="paper-image" />
                        {selected.region && selected.region.page === page && (
                          <div className="highlight-overlay" style={{ top: `${selected.region.y}%`, height: `${selected.region.height}%` }}>
                            <span className="highlight-label">Q{selected.questionNumber} · {selected.awardedMarks}/{selected.maxMarks} marks</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty-answer"><CircleHelp size={28} /><p>No page image available</p></div>
                    )}
                  </div>
                  <div className="border-t border-slate-100 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="feedback-icon"><Sparkles size={15} /></div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-600">AI feedback · Q{selected.questionNumber}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{selected.feedback || 'No feedback available.'}</p>
                        {selected.answerText && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Answer: </strong>{selected.answerText}</p>}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
              {result.overallFeedback && (
                <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="feedback-icon"><Sparkles size={15} /></div>
                    <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-600">Overall feedback</p><p className="mt-1 text-sm leading-5 text-slate-600">{result.overallFeedback}</p></div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f9fb] text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar active="Exams" />
        <section className="flex-1">
          <Topbar title="Exams" />
          <div className="mx-auto flex max-w-[900px] flex-col items-center px-5 pb-16 pt-12 text-center sm:px-10 lg:pt-20">
            {step === 'error' && (
              <div className="mb-6 w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-left">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 shrink-0 text-red-500" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Processing failed</p>
                    <p className="mt-1 text-xs text-red-600">{errorMsg}</p>
                    <button className="mt-2 text-xs font-semibold text-red-700 underline" onClick={() => setStep('idle')}>Try again</button>
                  </div>
                </div>
              </div>
            )}
            <div className="eyebrow"><Sparkles size={14} /> AI-powered assessment</div>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-[-0.04em] text-slate-900 sm:text-5xl">Upload <span className="text-orange-500">Question Paper</span><br className="hidden sm:block" /> & Answer Sheet</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-500">Turn handwritten answers into an organised, reviewable assessment in seconds.</p>
            <div className="mt-12 grid w-full gap-4 md:grid-cols-2">
              <UploadCard title="Question Paper" file={paperFile} onChange={(event) => setPaperFile(event.target.files?.[0] ?? null)} onClear={() => setPaperFile(null)} />
              <UploadCard title="Answer Sheet" file={answerFile} onChange={(event) => setAnswerFile(event.target.files?.[0] ?? null)} onClear={() => setAnswerFile(null)} />
            </div>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <button className="primary-button" disabled={!canStart} onClick={startMapping}>
                {isProcessing ? <><span className="spinner" /> {step === 'converting' ? 'Converting files...' : 'Extracting with AI...'}</> : <>Start Mapping <ArrowRight size={16} /></>}
              </button>
            </div>
            {isProcessing && (
              <div className="mt-6 w-full max-w-md">
                <div className="flex items-center justify-between text-xs text-slate-400"><span>{step === 'converting' ? 'Converting PDFs to images' : 'AI extracting questions and answers'}</span><span>{step === 'converting' ? 'Step 1/2' : 'Step 2/2'}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full bg-orange-500 transition-all duration-700 ${step === 'converting' ? 'w-1/2' : 'w-full'}`} /></div>
              </div>
            )}
            <p className="mt-6 text-xs text-slate-400">Your files are processed privately and are not stored.</p>
            <div className="mt-14 grid grid-cols-3 gap-5 border-t border-slate-200 pt-7 text-left text-xs text-slate-500 sm:gap-12">
              <div><Zap className="mb-2 text-orange-500" size={17} /><strong className="block text-slate-700">Fast extraction</strong><span>Printed questions in order</span></div>
              <div><LayoutList className="mb-2 text-orange-500" size={17} /><strong className="block text-slate-700">Smart mapping</strong><span>Even when answers move</span></div>
              <div><ImageIcon className="mb-2 text-orange-500" size={17} /><strong className="block text-slate-700">Exact highlights</strong><span>See every answer region</span></div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({ active, compact = false }: { active: string; compact?: boolean }) {
  return <aside className={`hidden shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col ${compact ? 'w-[72px] items-center' : 'w-[230px]'}`}><div className={`flex h-16 items-center border-b border-slate-100 ${compact ? 'justify-center' : 'gap-2 px-6'}`}><div className="brand-mark">V</div>{!compact && <span className="text-lg font-extrabold tracking-tight">Veda<span className="text-orange-500">AI</span></span>}</div>{compact ? <div className="mt-6 flex flex-col gap-4"><button className="side-icon active"><Zap size={17} /></button><button className="side-icon"><Grid2X2 size={17} /></button><button className="side-icon"><FileText size={17} /></button><button className="side-icon"><BookOpen size={17} /></button></div> : <><div className="p-5"><button className="ai-button"><Sparkles size={14} /> AI Teacher&apos;s Toolkit</button></div><nav className="space-y-1 px-3">{['Home', 'My Classroom', 'Assignments', 'Exams', 'My Library'].map((item) => <button key={item} className={`nav-item ${active === item ? 'active' : ''}`}><FileText size={14} />{item}</button>)}</nav><div className="mt-auto p-4"><button className="nav-item"><Settings size={14} />Settings</button><div className="school-card"><div className="school-seal">D</div><div><strong>Delhi Public School</strong><span>Bakshi Kaa Talab</span></div></div></div></>}</aside>;
}

function Topbar({ title }: { title: string }) { return <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6"><div className="flex items-center gap-3"><button className="lg:hidden"><Menu size={19} /></button><ArrowLeft className="hidden text-slate-400 sm:block" size={17} /><span className="text-sm font-medium text-slate-500">{title}</span></div><div className="flex items-center gap-3"><button className="icon-button"><CircleHelp size={17} /></button><button className="icon-button"><Bell size={17} /></button><div className="avatar">MR</div><span className="hidden text-xs font-semibold sm:block">Madhur Rastogi</span><ChevronDown className="hidden text-slate-400 sm:block" size={14} /></div></header>; }
function SummaryCard({ label, value, detail, icon, alert = false }: { label: string; value: string; detail: string; icon: React.ReactNode; alert?: boolean }) { return <div className="summary-card"><div className={`summary-icon ${alert ? 'alert' : ''}`}>{icon}</div><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-400">{label}</p><p className="mt-1 truncate text-lg font-bold tracking-tight">{value}</p><p className={`mt-0.5 truncate text-[11px] ${alert ? 'text-red-500' : 'text-slate-400'}`}>{detail}</p></div></div>; }
function QuestionRow({ answer, selected, onSelect }: { answer: MappedAnswer; selected: boolean; onSelect: () => void }) { return <button onClick={onSelect} className={`question-row ${selected ? 'selected' : ''}`}><div className={`number-badge ${answer.status === 'unanswered' ? 'red' : ''}`}>{answer.questionNumber}</div><div className="min-w-0 flex-1 text-left"><p className="question-text">{answer.prompt || '(no prompt extracted)'}</p><span className={`score-pill ${statusStyles[answer.status]}`}>{answer.awardedMarks} / {answer.maxMarks}</span></div><ChevronDown className={`shrink-0 text-slate-300 transition-transform ${selected ? 'rotate-180 text-orange-500' : ''}`} size={16} /></button>; }
