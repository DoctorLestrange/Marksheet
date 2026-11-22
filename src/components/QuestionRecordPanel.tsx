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
    <div className="bg-white dark:bg-[#1C1C1E] border border-[#E2E6EC] dark:border-[#2E2E32] rounded-xl p-5 sm:p-6">
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#E2E6EC] dark:border-[#2E2E32]">
        <div>
          <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F2F2F4]">
            Question Record
          </h2>
          <p className="text-xs text-[#5B6576] dark:text-[#9E9EA6] mt-0.5">
            Select any question to inspect or reassign its mark
          </p>
        </div>

        {/* Segmented Grid / List Toggle */}
        <div
          role="group"
          aria-label="Record display mode"
          className="inline-flex items-center p-0.5 bg-[#F1F5F9] dark:bg-[#242427] rounded-lg shrink-0"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-[#323236] text-[#0F172A] dark:text-[#F2F2F4] shadow-xs'
                : 'text-[#5B6576] dark:text-[#9E9EA6] hover:text-[#0F172A] dark:hover:text-[#F2F2F4]'
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
                ? 'bg-white dark:bg-[#323236] text-[#0F172A] dark:text-[#F2F2F4] shadow-xs'
                : 'text-[#5B6576] dark:text-[#9E9EA6] hover:text-[#0F172A] dark:hover:text-[#F2F2F4]'
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
        className="flex flex-wrap sm:flex-nowrap items-center gap-1 py-3 border-b border-[#E2E6EC] dark:border-[#2E2E32] overflow-x-auto"
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
                  ? 'bg-[#0F172A] dark:bg-[#F2F2F4] text-white dark:text-[#141415]'
                  : 'text-[#5B6576] dark:text-[#9E9EA6] hover:bg-[#F1F5F9] dark:hover:bg-[#262629] hover:text-[#0F172A] dark:hover:text-[#F2F2F4]'
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
            <p className="py-10 text-center text-sm text-[#5B6576] dark:text-[#9E9EA6]">
              No questions match this filter.
            </p>
          ) : (
            <div className="max-h-[468px] overflow-y-auto p-1 -m-1">
              <div className="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10 gap-1">
                {filteredQuestions.map((qNum) => {
                  const rec = session.records[qNum];
                  const isActive = qNum === session.activeQuestion;

                  let cellTone =
                    'bg-[#F8FAFC] dark:bg-[#222225] border-[#E2E6EC] dark:border-[#303034] text-[#475569] dark:text-[#A1A1AA] hover:border-[#94A3B8] dark:hover:border-[#52525B]';
                  if (rec?.outcome === 'correct') {
                    cellTone =
                      'bg-[#ECFDF5] dark:bg-[#13261E] border-[#A7F3D0] dark:border-[#214B3A] text-[#065F46] dark:text-[#6EE7B7] hover:border-[#34D399] dark:hover:border-[#34D399]';
                  } else if (rec?.outcome === 'wrong') {
                    cellTone =
                      'bg-[#FFF1F2] dark:bg-[#2A1519] border-[#FECDD3] dark:border-[#5C2530] text-[#9F1239] dark:text-[#FDA4AF] hover:border-[#FB7185] dark:hover:border-[#FB7185]';
                  } else if (rec?.outcome === 'skipped') {
                    cellTone =
                      'bg-[#F1F5F9] dark:bg-[#2A2A2E] border-[#CBD5E1] dark:border-[#434349] text-[#334155] dark:text-[#D4D4D8] hover:border-[#94A3B8] dark:hover:border-[#63636B]';
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
                      className={`h-10 rounded-md border flex flex-col items-center justify-center leading-tight transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#F2F2F4] ${cellTone} ${
                        isActive
                          ? 'ring-2 ring-[#1D4ED8] dark:ring-[#F2F2F4] ring-offset-1 dark:ring-offset-[#1C1C1E] z-10'
                          : ''
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
              <p className="py-10 text-center text-sm text-[#5B6576] dark:text-[#9E9EA6]">
                All questions have been recorded.
              </p>
            ) : (
              <div className="divide-y divide-[#E2E6EC] dark:divide-[#2E2E32]">
                {filteredQuestions.map((qNum) => (
                  <button
                    key={qNum}
                    type="button"
                    onClick={() => onSelectQuestion(qNum)}
                    className={`w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-[#F8FAFC] dark:hover:bg-[#242427] transition-colors ${
                      qNum === session.activeQuestion ? 'bg-[#EFF6FF] dark:bg-[#28282C]' : ''
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold text-[#0F172A] dark:text-[#F2F2F4] tabular-nums">
                      Q{qNum}
                    </span>
                    <span className="text-xs text-[#64748B] dark:text-[#8E8E96]">Unanswered</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : filteredLog.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5B6576] dark:text-[#9E9EA6]">
            {summary.recordedCount === 0
              ? 'No marks recorded yet. Use Add Mark, Subtract Mark, or Skip Question to begin.'
              : 'No recorded questions match this filter.'}
          </p>
        ) : (
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-[#1C1C1E] border-b border-[#E2E6EC] dark:border-[#2E2E32]">
                <tr className="text-xs font-medium text-[#5B6576] dark:text-[#9E9EA6]">
                  <th className="py-2 pr-2">Q#</th>
                  <th className="py-2 px-2">Outcome</th>
                  <th className="py-2 px-2 text-right">Mark</th>
                  <th className="py-2 pl-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E6EC] dark:divide-[#2E2E32]">
                {filteredLog.map((row) => {
                  const isActive = row.questionNumber === session.activeQuestion;
                  const markColor =
                    row.outcome === 'correct'
                      ? 'text-[#047857] dark:text-[#34D399]'
                      : row.outcome === 'wrong'
                        ? 'text-[#BE123C] dark:text-[#FB7185]'
                        : 'text-[#475569] dark:text-[#A1A1AA]';

                  return (
                    <tr
                      key={row.questionNumber}
                      className={`hover:bg-[#F8FAFC] dark:hover:bg-[#242427] transition-colors ${
                        isActive ? 'bg-[#EFF6FF] dark:bg-[#28282C]' : ''
                      }`}
                    >
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => onSelectQuestion(row.questionNumber)}
                          className="font-mono text-xs font-semibold text-[#0F172A] dark:text-[#F2F2F4] hover:text-[#1D4ED8] dark:hover:text-white hover:underline tabular-nums"
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
                      <td className="py-2 pl-2 text-right font-mono text-xs text-[#334155] dark:text-[#D4D4D8] tabular-nums">
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
      <div className="mt-4 pt-3 border-t border-[#E2E6EC] dark:border-[#2E2E32] flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5B6576] dark:text-[#9E9EA6]">
        <span>
          <strong className="font-mono text-[#047857] dark:text-[#34D399]">+</strong> Correct (
          {formatSignedMark(session.config.positiveMark)})
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="font-mono text-[#BE123C] dark:text-[#FB7185]">−</strong> Wrong (
          {formatSignedMark(session.config.negativeMark)})
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="font-mono text-[#475569] dark:text-[#D4D4D8]">○</strong> Skipped (0)
        </span>
      </div>
    </div>
  );
}
