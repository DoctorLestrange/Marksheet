import { useMemo, useState } from 'react';
import { Grid2x2, List } from 'lucide-react';
import type { ExamSession, QuestionOutcome } from '../types/exam';
import {
  computeRunningLog,
  computeSessionSummary,
  formatNumber,
  formatSignedMark,
} from '../utils/scoring';

type RecordFilter = 'all' | QuestionOutcome | 'unanswered';
type ViewMode = 'grid' | 'list';

interface QuestionRecordPanelProps {
  session: ExamSession;
  onSelectQuestion: (questionNumber: number) => void;
}

const OUTCOME_SYMBOL: Record<QuestionOutcome, string> = {
  correct: '+',
  wrong: '−',
  skipped: '○',
};

const OUTCOME_TEXT: Record<QuestionOutcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  skipped: 'Skipped',
};

export function QuestionRecordPanel({
  session,
  onSelectQuestion,
}: QuestionRecordPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<RecordFilter>('all');

  const summary = useMemo(() => computeSessionSummary(session), [session]);
  const runningLog = useMemo(() => computeRunningLog(session), [session]);

  const filteredQuestions = useMemo(() => {
    const list: number[] = [];
    for (let q = 1; q <= session.config.totalQuestions; q++) {
      const rec = session.records[q];
      if (filter === 'all') {
        list.push(q);
      } else if (filter === 'unanswered') {
        if (!rec) list.push(q);
      } else if (rec?.outcome === filter) {
        list.push(q);
      }
    }
    return list;
  }, [filter, session.config.totalQuestions, session.records]);

  const filteredLog = useMemo(() => {
    if (filter === 'all') return runningLog;
    if (filter === 'unanswered') return [];
    return runningLog.filter((row) => row.outcome === filter);
  }, [filter, runningLog]);

  const filterTabs: { id: RecordFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: session.config.totalQuestions },
    { id: 'correct', label: 'Correct', count: summary.correctCount },
    { id: 'wrong', label: 'Wrong', count: summary.wrongCount },
    { id: 'skipped', label: 'Skipped', count: summary.skippedCount },
    { id: 'unanswered', label: 'Open', count: summary.remainingCount },
  ];

  return (
    <div className="bg-white border border-[#E2E6EC] rounded-xl p-5 sm:p-6">
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#E2E6EC]">
        <div>
          <h2 className="font-display text-base font-bold text-[#0F172A]">
            Question Record
          </h2>
          <p className="text-xs text-[#5B6576] mt-0.5">
            Select any question to inspect or reassign its mark
          </p>
        </div>

        {/* Segmented Grid / List Toggle */}
        <div
          role="group"
          aria-label="Record display mode"
          className="inline-flex items-center p-0.5 bg-[#F1F5F9] rounded-lg shrink-0"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'grid'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#5B6576] hover:text-[#0F172A]'
            }`}
          >
            <Grid2x2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Grid</span>
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'list'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#5B6576] hover:text-[#0F172A]'
            }`}
          >
            <List className="w-3.5 h-3.5" aria-hidden="true" />
            <span>List</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        role="group"
        aria-label="Filter questions"
        className="flex flex-wrap sm:flex-nowrap items-center gap-1 py-3 border-b border-[#E2E6EC] overflow-x-auto"
      >
        {filterTabs.map((tab) => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(tab.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                isActive
                  ? 'bg-[#0F172A] text-white'
                  : 'text-[#5B6576] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="pt-4">
        {viewMode === 'grid' ? (
          filteredQuestions.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#5B6576]">
              No questions match this filter.
            </p>
          ) : (
            <div className="max-h-[468px] overflow-y-auto p-1 -m-1">
              <div className="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10 gap-1">
                {filteredQuestions.map((qNum) => {
                  const rec = session.records[qNum];
                  const isActive = qNum === session.activeQuestion;

                  let cellTone =
                    'bg-[#F8FAFC] border-[#E2E6EC] text-[#475569] hover:border-[#94A3B8]';
                  if (rec?.outcome === 'correct') {
                    cellTone =
                      'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46] hover:border-[#34D399]';
                  } else if (rec?.outcome === 'wrong') {
                    cellTone =
                      'bg-[#FFF1F2] border-[#FECDD3] text-[#9F1239] hover:border-[#FB7185]';
                  } else if (rec?.outcome === 'skipped') {
                    cellTone =
                      'bg-[#F1F5F9] border-[#CBD5E1] text-[#334155] hover:border-[#94A3B8]';
                  }

                  const ariaDesc = rec
                    ? `Question ${qNum}: ${OUTCOME_TEXT[rec.outcome]} (${formatSignedMark(rec.mark)})`
                    : `Question ${qNum}: Unanswered`;

                  return (
                    <button
                      key={qNum}
                      type="button"
                      aria-label={ariaDesc}
                      aria-current={isActive ? 'step' : undefined}
                      onClick={() => onSelectQuestion(qNum)}
                      className={`h-10 rounded-md border flex flex-col items-center justify-center leading-tight transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${cellTone} ${
                        isActive ? 'ring-2 ring-[#1D4ED8] ring-offset-1 z-10' : ''
                      }`}
                    >
                      <span className="font-mono text-[11px] font-semibold tabular-nums">
                        {qNum}
                      </span>
                      <span className="font-mono text-[10px] leading-none mt-0.5" aria-hidden="true">
                        {rec ? OUTCOME_SYMBOL[rec.outcome] : '·'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ) : filter === 'unanswered' ? (
          <div className="max-h-[440px] overflow-y-auto">
            {filteredQuestions.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#5B6576]">
                All questions have been recorded.
              </p>
            ) : (
              <div className="divide-y divide-[#E2E6EC]">
                {filteredQuestions.map((qNum) => (
                  <button
                    key={qNum}
                    type="button"
                    onClick={() => onSelectQuestion(qNum)}
                    className={`w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-[#F8FAFC] transition-colors ${
                      qNum === session.activeQuestion ? 'bg-[#EFF6FF]' : ''
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold text-[#0F172A] tabular-nums">
                      Q{qNum}
                    </span>
                    <span className="text-xs text-[#64748B]">Unanswered</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : filteredLog.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5B6576]">
            {summary.recordedCount === 0
              ? 'No marks recorded yet. Use Add Mark, Subtract Mark, or Skip Question to begin.'
              : 'No recorded questions match this filter.'}
          </p>
        ) : (
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white border-b border-[#E2E6EC]">
                <tr className="text-xs font-medium text-[#5B6576]">
                  <th className="py-2 pr-2">Q#</th>
                  <th className="py-2 px-2">Outcome</th>
                  <th className="py-2 px-2 text-right">Mark</th>
                  <th className="py-2 pl-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E6EC]">
                {filteredLog.map((row) => {
                  const isActive = row.questionNumber === session.activeQuestion;
                  const markColor =
                    row.outcome === 'correct'
                      ? 'text-[#047857]'
                      : row.outcome === 'wrong'
                        ? 'text-[#BE123C]'
                        : 'text-[#475569]';

                  return (
                    <tr
                      key={row.questionNumber}
                      className={`hover:bg-[#F8FAFC] transition-colors ${
                        isActive ? 'bg-[#EFF6FF]' : ''
                      }`}
                    >
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => onSelectQuestion(row.questionNumber)}
                          className="font-mono text-xs font-semibold text-[#0F172A] hover:text-[#1D4ED8] hover:underline tabular-nums"
                        >
                          Q{row.questionNumber}
                        </button>
                      </td>
                      <td className={`py-2 px-2 text-xs font-medium ${markColor}`}>
                        <span className="font-mono mr-1" aria-hidden="true">
                          {OUTCOME_SYMBOL[row.outcome]}
                        </span>
                        {OUTCOME_TEXT[row.outcome]}
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-mono text-xs font-semibold tabular-nums ${markColor}`}
                      >
                        {formatSignedMark(row.mark)}
                      </td>
                      <td className="py-2 pl-2 text-right font-mono text-xs text-[#334155] tabular-nums">
                        {formatNumber(row.runningTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-[#E2E6EC] flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5B6576]">
        <span>
          <strong className="font-mono text-[#047857]">+</strong> Correct (
          {formatSignedMark(session.config.positiveMark)})
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="font-mono text-[#BE123C]">−</strong> Wrong (
          {formatSignedMark(session.config.negativeMark)})
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="font-mono text-[#475569]">○</strong> Skipped (0)
        </span>
      </div>
    </div>
  );
}
