import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Minus,
  Plus,
  RotateCcw,
  Undo2,
  X,
} from 'lucide-react';
import type { ExamSession, QuestionOutcome } from '../types/exam';
import {
  computeSessionSummary,
  findFirstUnanswered,
  formatNumber,
  formatSignedMark,
} from '../utils/scoring';
import { QuestionRecordPanel } from './QuestionRecordPanel';

interface CalculatorViewProps {
  session: ExamSession;
  onRecordOutcome: (outcome: QuestionOutcome) => void;
  onSelectQuestion: (questionNumber: number) => void;
  onClearQuestion: (questionNumber: number) => void;
  onUndo: () => void;
  onResetSession: () => void;
  onRenameSession: (name: string) => void;
  onSaveAndNewSession: () => void;
}

const OUTCOME_LABELS: Record<QuestionOutcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  skipped: 'Skipped',
};

export function CalculatorView({
  session,
  onRecordOutcome,
  onSelectQuestion,
  onClearQuestion,
  onUndo,
  onResetSession,
  onRenameSession,
  onSaveAndNewSession,
}: CalculatorViewProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  const summary = computeSessionSummary(session);
  const currentRecord = session.records[session.activeQuestion] ?? null;
  const firstUnanswered = findFirstUnanswered(session.records, session.config.totalQuestions);
  const canUndo = session.undoStack.length > 0 || summary.recordedCount > 0;

  // Reset confirmation automatically clears when session changes or has 0 records
  useEffect(() => {
    if (summary.recordedCount === 0 && confirmingReset) {
      setConfirmingReset(false);
    }
  }, [summary.recordedCount, confirmingReset]);

  // Keyboard shortcuts for rapid grading (ignored inside text inputs/selects)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '+' || event.key === '=' || event.key === '1') {
        event.preventDefault();
        onRecordOutcome('correct');
      } else if (event.key === '-' || event.key === '_' || event.key === '2') {
        event.preventDefault();
        onRecordOutcome('wrong');
      } else if (event.key === '0' || event.key === 's' || event.key === 'S') {
        event.preventDefault();
        onRecordOutcome('skipped');
      } else if (event.key === 'Backspace' || event.key === 'z' || event.key === 'Z') {
        if (canUndo) {
          event.preventDefault();
          onUndo();
        }
      } else if (event.key === 'ArrowLeft') {
        if (session.activeQuestion > 1) {
          event.preventDefault();
          onSelectQuestion(session.activeQuestion - 1);
        }
      } else if (event.key === 'ArrowRight') {
        if (session.activeQuestion < session.config.totalQuestions) {
          event.preventDefault();
          onSelectQuestion(session.activeQuestion + 1);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canUndo,
    onRecordOutcome,
    onSelectQuestion,
    onUndo,
    session.activeQuestion,
    session.config.totalQuestions,
  ]);

  const positiveLabel = formatSignedMark(session.config.positiveMark);
  const negativeLabel = formatSignedMark(session.config.negativeMark);

  const correctPct =
    session.config.totalQuestions > 0
      ? (summary.correctCount / session.config.totalQuestions) * 100
      : 0;
  const wrongPct =
    session.config.totalQuestions > 0
      ? (summary.wrongCount / session.config.totalQuestions) * 100
      : 0;
  const skippedPct =
    session.config.totalQuestions > 0
      ? (summary.skippedCount / session.config.totalQuestions) * 100
      : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Primary Column: Scoreboard + Three Operational Buttons */}
      <section
        aria-label="Exam score calculator"
        className="lg:col-span-7 bg-white border border-[#E2E6EC] rounded-xl p-5 sm:p-7"
      >
        {/* Session Title & Unboxed Config Metadata */}
        <div className="flex flex-col gap-1.5 pb-6 border-b border-[#E2E6EC]">
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              aria-label="Session name"
              value={session.name}
              onChange={(e) => onRenameSession(e.target.value)}
              maxLength={80}
              placeholder="Untitled Session"
              className="w-full font-display text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A] bg-transparent border border-transparent hover:border-[#E2E6EC] focus:border-[#1D4ED8] focus:bg-[#F8FAFC] rounded-md px-2 -mx-2 py-0.5 transition-colors focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-[#5B6576]">
            <span className="font-mono tabular-nums">
              {positiveLabel} / {negativeLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{session.config.totalQuestions} questions</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {summary.recordedCount} of {session.config.totalQuestions} recorded
            </span>
          </div>
        </div>

        {/* Dominant Total Score Readout */}
        <div className="py-6 border-b border-[#E2E6EC]">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-medium text-[#5B6576] mb-1">Total Score</p>
              <div className="flex items-baseline gap-2.5">
                <span
                  data-testid="total-score"
                  className={`font-mono text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums leading-none ${
                    summary.totalScore < 0 ? 'text-[#BE123C]' : 'text-[#0F172A]'
                  }`}
                >
                  {formatNumber(summary.totalScore)}
                </span>
                <span className="font-mono text-base sm:text-lg text-[#64748B] tabular-nums">
                  / {formatNumber(summary.maxScore)}
                </span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs font-medium text-[#5B6576] mb-1">Percentage</p>
              <p className="font-mono text-xl sm:text-2xl font-medium text-[#0F172A] tabular-nums">
                {summary.scorePercent.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Segmented Progress Bar */}
          <div className="mt-5">
            <div
              role="progressbar"
              aria-label="Session progress"
              aria-valuenow={summary.recordedCount}
              aria-valuemin={0}
              aria-valuemax={session.config.totalQuestions}
              className="h-2 w-full bg-[#ECEFF4] rounded-full overflow-hidden flex"
            >
              {correctPct > 0 && (
                <div
                  style={{ width: `${correctPct}%` }}
                  className="bg-[#059669] h-full transition-all duration-150"
                />
              )}
              {wrongPct > 0 && (
                <div
                  style={{ width: `${wrongPct}%` }}
                  className="bg-[#E11D48] h-full transition-all duration-150"
                />
              )}
              {skippedPct > 0 && (
                <div
                  style={{ width: `${skippedPct}%` }}
                  className="bg-[#94A3B8] h-full transition-all duration-150"
                />
              )}
            </div>
          </div>

          {/* 4-Column Unboxed Breakdown Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 sm:gap-y-0 sm:divide-x divide-[#E2E6EC] mt-6">
            <div className="sm:pr-4">
              <p className="text-xs text-[#5B6576]">Correct</p>
              <p
                data-testid="correct-count"
                className="font-mono text-xl font-semibold text-[#047857] tabular-nums mt-0.5"
              >
                {summary.correctCount}
              </p>
              <p className="font-mono text-xs text-[#5B6576] tabular-nums">
                {formatSignedMark(summary.positiveTotal)}
              </p>
            </div>

            <div className="sm:px-4">
              <p className="text-xs text-[#5B6576]">Wrong</p>
              <p
                data-testid="wrong-count"
                className="font-mono text-xl font-semibold text-[#BE123C] tabular-nums mt-0.5"
              >
                {summary.wrongCount}
              </p>
              <p className="font-mono text-xs text-[#5B6576] tabular-nums">
                {formatSignedMark(summary.negativeTotal)}
              </p>
            </div>

            <div className="sm:px-4">
              <p className="text-xs text-[#5B6576]">Skipped</p>
              <p
                data-testid="skipped-count"
                className="font-mono text-xl font-semibold text-[#475569] tabular-nums mt-0.5"
              >
                {summary.skippedCount}
              </p>
              <p className="font-mono text-xs text-[#5B6576] tabular-nums">0</p>
            </div>

            <div className="sm:pl-4">
              <p className="text-xs text-[#5B6576]">Accuracy</p>
              <p className="font-mono text-xl font-semibold text-[#0F172A] tabular-nums mt-0.5">
                {summary.accuracyPercent !== null ? `${summary.accuracyPercent.toFixed(1)}%` : '—'}
              </p>
              <p className="font-mono text-xs text-[#5B6576] tabular-nums">
                {summary.attemptedCount} attempted
              </p>
            </div>
          </div>
        </div>

        {/* Active Question Stage & The Three Operational Buttons */}
        <div className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2
                data-testid="active-question-heading"
                className="font-display text-lg font-bold text-[#0F172A] tabular-nums"
              >
                Question {session.activeQuestion} of {session.config.totalQuestions}
              </h2>
              {currentRecord && (
                <span className="text-xs text-[#5B6576] tabular-nums">
                  Assigned: {OUTCOME_LABELS[currentRecord.outcome]} (
                  {formatSignedMark(currentRecord.mark)})
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {currentRecord && (
                <button
                  type="button"
                  onClick={() => onClearQuestion(session.activeQuestion)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#5B6576] hover:text-[#BE123C] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear Q{session.activeQuestion}</span>
                </button>
              )}
              {firstUnanswered !== null && firstUnanswered !== session.activeQuestion && (
                <button
                  type="button"
                  onClick={() => onSelectQuestion(firstUnanswered)}
                  className="text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] rounded"
                >
                  Next unanswered (Q{firstUnanswered})
                </button>
              )}
            </div>
          </div>

          {summary.isComplete && (
            <div className="mb-4 px-4 py-3 bg-[#F8FAFC] border border-[#E2E6EC] rounded-lg flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[#0F172A]">
                All {session.config.totalQuestions} questions recorded. Select any question to edit or archive this session.
              </p>
              <button
                type="button"
                onClick={onSaveAndNewSession}
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Save & Start New
              </button>
            </div>
          )}

          {/* Three Operational Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onRecordOutcome('correct')}
              className="group relative flex sm:flex-col items-center justify-between sm:justify-center gap-2 px-4 py-4 sm:py-6 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] hover:bg-[#D1FAE5] hover:border-[#6EE7B7] text-[#065F46] active:scale-[0.985] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] focus-visible:ring-offset-2 cursor-pointer"
            >
              <div className="flex sm:flex-col items-center gap-2.5 sm:gap-1.5">
                <span className="w-9 h-9 rounded-lg bg-[#059669] text-white inline-flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="font-display text-sm sm:text-base font-semibold whitespace-nowrap">
                  Add Mark
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base sm:text-lg font-bold tabular-nums">
                  {positiveLabel}
                </span>
                <kbd className="hidden sm:inline-block font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/80 border border-[#A7F3D0] text-[#047857]">
                  +
                </kbd>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onRecordOutcome('wrong')}
              className="group relative flex sm:flex-col items-center justify-between sm:justify-center gap-2 px-4 py-4 sm:py-6 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] hover:bg-[#FFE4E6] hover:border-[#FDA4AF] text-[#9F1239] active:scale-[0.985] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] focus-visible:ring-offset-2 cursor-pointer"
            >
              <div className="flex sm:flex-col items-center gap-2.5 sm:gap-1.5">
                <span className="w-9 h-9 rounded-lg bg-[#E11D48] text-white inline-flex items-center justify-center shrink-0">
                  <Minus className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="font-display text-sm sm:text-base font-semibold whitespace-nowrap">
                  Subtract Mark
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base sm:text-lg font-bold tabular-nums">
                  {negativeLabel}
                </span>
                <kbd className="hidden sm:inline-block font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/80 border border-[#FECDD3] text-[#BE123C]">
                  -
                </kbd>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onRecordOutcome('skipped')}
              className="group relative flex sm:flex-col items-center justify-between sm:justify-center gap-2 px-4 py-4 sm:py-6 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] hover:border-[#94A3B8] text-[#334155] active:scale-[0.985] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#475569] focus-visible:ring-offset-2 cursor-pointer"
            >
              <div className="flex sm:flex-col items-center gap-2.5 sm:gap-1.5">
                <span className="w-9 h-9 rounded-lg bg-[#475569] text-white inline-flex items-center justify-center shrink-0">
                  <CircleSlash className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="font-display text-sm sm:text-base font-semibold whitespace-nowrap">
                  Skip Question
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base sm:text-lg font-bold tabular-nums">
                  0
                </span>
                <kbd className="hidden sm:inline-block font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/80 border border-[#CBD5E1] text-[#475569]">
                  0
                </kbd>
              </div>
            </button>
          </div>

          {/* Secondary Utility Controls */}
          <div className="mt-5 pt-4 border-t border-[#E2E6EC] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#334155] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E6EC] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Undo</span>
              </button>

              <div className="inline-flex items-center border border-[#E2E6EC] rounded-lg overflow-hidden bg-[#F8FAFC]">
                <button
                  type="button"
                  aria-label="Previous question"
                  disabled={session.activeQuestion <= 1}
                  onClick={() => onSelectQuestion(session.activeQuestion - 1)}
                  className="px-2.5 py-2 text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D4ED8]"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="px-2.5 py-1.5 font-mono text-xs text-[#475569] tabular-nums border-x border-[#E2E6EC] bg-white">
                  Q{session.activeQuestion}
                </span>
                <button
                  type="button"
                  aria-label="Next question"
                  disabled={session.activeQuestion >= session.config.totalQuestions}
                  onClick={() => onSelectQuestion(session.activeQuestion + 1)}
                  className="px-2.5 py-2 text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D4ED8]"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {confirmingReset ? (
                <>
                  <span className="text-xs text-[#5B6576]">Clear all marks?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onResetSession();
                      setConfirmingReset(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#BE123C] hover:bg-[#9F1239] rounded-lg transition-colors whitespace-nowrap"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={summary.recordedCount === 0}
                  onClick={() => setConfirmingReset(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#5B6576] hover:text-[#BE123C] hover:bg-[#FFF1F2] border border-transparent hover:border-[#FECDD3] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reset Session</span>
                </button>
              )}
            </div>
          </div>

          <p className="hidden sm:block mt-4 text-xs text-[#64748B]">
            Keyboard: <span className="font-mono">+</span> Add ·{' '}
            <span className="font-mono">-</span> Subtract ·{' '}
            <span className="font-mono">0</span> Skip ·{' '}
            <span className="font-mono">Backspace</span> Undo ·{' '}
            <span className="font-mono">← →</span> Navigate
          </p>
        </div>
      </section>

      {/* Right Column: Question-by-Question Record Sheet */}
      <aside aria-label="Question records" className="lg:col-span-5">
        <QuestionRecordPanel
          session={session}
          onSelectQuestion={onSelectQuestion}
        />
      </aside>
    </div>
  );
}
