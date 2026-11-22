import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Play, Trash2 } from 'lucide-react';
import type { ExamSession } from '../types/exam';
import {
  computeRunningLog,
  computeSessionSummary,
  formatNumber,
  formatSignedMark,
  generateSessionCsv,
} from '../utils/scoring';

interface HistoryViewProps {
  history: ExamSession[];
  activeSession: ExamSession;
  onResumeSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClearAllHistory: () => void;
  onGoToCalculator: () => void;
}

function formatDateTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function downloadCsv(session: ExamSession) {
  const csv = generateSessionCsv(session);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = session.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'exam-session';
  link.href = url;
  link.download = `${safeName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function HistoryView({
  history,
  activeSession,
  onResumeSession,
  onDeleteSession,
  onClearAllHistory,
  onGoToCalculator,
}: HistoryViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const activeSummary = computeSessionSummary(activeSession);

  const aggregateStats = history.reduce(
    (acc, session) => {
      const s = computeSessionSummary(session);
      return {
        totalPct: acc.totalPct + s.scorePercent,
        bestScore: Math.max(acc.bestScore, s.totalScore),
        bestPct: Math.max(acc.bestPct, s.scorePercent),
      };
    },
    { totalPct: 0, bestScore: -Infinity, bestPct: -Infinity }
  );

  const avgPct = history.length > 0 ? aggregateStats.totalPct / history.length : 0;

  return (
    <div className="space-y-6">
      {/* Header & Aggregate Metrics */}
      <section className="bg-white border border-[#E2E6EC] rounded-xl p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F172A]">
              Session History
            </h1>
            <p className="text-sm text-[#5B6576] mt-1">
              Every completed or archived session is stored in your browser with its full question-by-question mark record.
            </p>
          </div>

          {history.length > 0 && (
            <div className="flex items-center gap-2">
              {confirmClearAll ? (
                <>
                  <span className="text-xs text-[#5B6576]">Delete all history?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllHistory();
                      setConfirmClearAll(false);
                      setExpandedId(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#BE123C] hover:bg-[#9F1239] rounded-lg transition-colors whitespace-nowrap"
                  >
                    Confirm Delete All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="px-3 py-2 text-xs font-medium text-[#5B6576] hover:text-[#BE123C] hover:bg-[#FFF1F2] border border-[#E2E6EC] hover:border-[#FECDD3] rounded-lg transition-colors whitespace-nowrap"
                >
                  Clear History
                </button>
              )}
            </div>
          )}
        </div>

        {/* Unboxed Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 sm:gap-y-0 sm:divide-x divide-[#E2E6EC] mt-6 pt-6 border-t border-[#E2E6EC]">
          <div className="sm:pr-6">
            <p className="text-xs text-[#5B6576]">Active Session (Auto-saved)</p>
            <p className="font-display text-base font-semibold text-[#0F172A] mt-0.5 truncate">
              {activeSession.name}
            </p>
            <p className="font-mono text-xs text-[#5B6576] tabular-nums mt-0.5">
              Score {formatNumber(activeSummary.totalScore)} · {activeSummary.recordedCount}/
              {activeSession.config.totalQuestions} recorded
            </p>
          </div>

          <div className="sm:px-6">
            <p className="text-xs text-[#5B6576]">Saved Sessions</p>
            <p className="font-mono text-2xl font-semibold text-[#0F172A] tabular-nums mt-0.5">
              {history.length}
            </p>
          </div>

          <div className="sm:pl-6">
            <p className="text-xs text-[#5B6576]">Average Percentage</p>
            <p className="font-mono text-2xl font-semibold text-[#0F172A] tabular-nums mt-0.5">
              {history.length > 0 ? `${avgPct.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
      </section>

      {/* Saved Sessions List */}
      <section aria-label="Saved sessions" className="bg-white border border-[#E2E6EC] rounded-xl overflow-hidden">
        {history.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              No archived sessions yet
            </h2>
            <p className="text-sm text-[#5B6576] mt-1.5 max-w-md mx-auto">
              Record marks in the Calculator and click New Session to archive your completed session and question records here.
            </p>
            <button
              type="button"
              onClick={onGoToCalculator}
              className="mt-5 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
            >
              Return to Calculator
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E6EC]">
            {history.map((session) => {
              const summary = computeSessionSummary(session);
              const isExpanded = expandedId === session.id;
              const log = isExpanded ? computeRunningLog(session) : [];

              return (
                <article key={session.id} className="p-5 sm:p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="font-display text-base font-bold text-[#0F172A] truncate">
                          {session.name}
                        </h2>
                        <span className="text-xs text-[#64748B]">
                          {formatDateTime(session.updatedAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5B6576] mt-1.5 tabular-nums">
                        <span className="font-mono">
                          {formatSignedMark(session.config.positiveMark)} /{' '}
                          {formatSignedMark(session.config.negativeMark)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {summary.recordedCount} of {session.config.totalQuestions} questions
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#047857]">{summary.correctCount} correct</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#BE123C]">{summary.wrongCount} wrong</span>
                        <span aria-hidden="true">·</span>
                        <span>{summary.skippedCount} skipped</span>
                        {summary.accuracyPercent !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{summary.accuracyPercent.toFixed(1)}% accuracy</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between md:justify-end gap-4 shrink-0">
                      <div className="text-left md:text-right">
                        <p className="font-mono text-2xl font-semibold text-[#0F172A] tabular-nums leading-none">
                          {formatNumber(summary.totalScore)}
                          <span className="text-sm font-normal text-[#64748B]">
                            {' '}
                            / {formatNumber(summary.maxScore)}
                          </span>
                        </p>
                        <p className="font-mono text-xs text-[#5B6576] tabular-nums mt-1">
                          {summary.scorePercent.toFixed(1)}%
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`Inspect record for ${session.name}`}
                          onClick={() => setExpandedId(isExpanded ? null : session.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E6EC] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <span>{isExpanded ? 'Hide Record' : 'Inspect Record'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>

                        <button
                          type="button"
                          aria-label={`Resume ${session.name}`}
                          onClick={() => onResumeSession(session.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] hover:bg-[#EFF6FF] border border-transparent hover:border-[#BFDBFE] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Resume</span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Export CSV for ${session.name}`}
                          onClick={() => downloadCsv(session)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>CSV</span>
                        </button>

                        {confirmDeleteId === session.id ? (
                          <div className="inline-flex items-center gap-1.5 pl-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteSession(session.id);
                                setConfirmDeleteId(null);
                                if (expandedId === session.id) setExpandedId(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-[#BE123C] hover:bg-[#9F1239] rounded-lg transition-colors whitespace-nowrap"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 text-xs font-medium text-[#5B6576] hover:text-[#0F172A] whitespace-nowrap"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Delete ${session.name}`}
                            onClick={() => setConfirmDeleteId(session.id)}
                            className="p-1.5 text-[#64748B] hover:text-[#BE123C] hover:bg-[#FFF1F2] rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Question-by-Question Record */}
                  {isExpanded && (
                    <div className="mt-5 pt-4 border-t border-[#E2E6EC]">
                      {log.length === 0 ? (
                        <p className="text-xs text-[#5B6576]">
                          No questions were recorded in this session.
                        </p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white border-b border-[#E2E6EC]">
                              <tr className="text-xs font-medium text-[#5B6576]">
                                <th className="py-2 pr-3">Question</th>
                                <th className="py-2 px-3">Assigned Status</th>
                                <th className="py-2 px-3 text-right">Mark</th>
                                <th className="py-2 pl-3 text-right">Running Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E6EC]">
                              {log.map((row) => {
                                const tone =
                                  row.outcome === 'correct'
                                    ? 'text-[#047857]'
                                    : row.outcome === 'wrong'
                                      ? 'text-[#BE123C]'
                                      : 'text-[#475569]';
                                const label =
                                  row.outcome === 'correct'
                                    ? '+ Correct'
                                    : row.outcome === 'wrong'
                                      ? '− Wrong'
                                      : '○ Skipped';
                                return (
                                  <tr key={row.questionNumber} className="text-xs">
                                    <td className="py-2 pr-3 font-mono font-semibold text-[#0F172A] tabular-nums">
                                      Q{row.questionNumber}
                                    </td>
                                    <td className={`py-2 px-3 font-medium ${tone}`}>{label}</td>
                                    <td
                                      className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${tone}`}
                                    >
                                      {formatSignedMark(row.mark)}
                                    </td>
                                    <td className="py-2 pl-3 text-right font-mono text-[#334155] tabular-nums">
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
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
