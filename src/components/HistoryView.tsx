import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FileJson, Play, Trash2 } from 'lucide-react';
import type { ExamSession, ScoringConfig } from '../types/exam';
import {
  computeRunningLog,
  computeSessionSummary,
  formatNumber,
  formatSignedMark,
  generateAllSessionsJson,
  generateSessionCsv,
  generateSessionJson,
  getLocalDateStamp,
  slugifyFilename,
} from '../utils/scoring';
import { triggerFileDownload } from '../utils/theme';

interface HistoryViewProps {
  history: ExamSession[];
  activeSession: ExamSession;
  defaultConfig: ScoringConfig;
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
  const filename = `${slugifyFilename(session.name)}.csv`;
  triggerFileDownload(csv, filename, 'text/csv;charset=utf-8;');
}

function downloadSessionJson(session: ExamSession) {
  const json = generateSessionJson(session);
  const filename = `${slugifyFilename(session.name)}.json`;
  triggerFileDownload(json, filename, 'application/json;charset=utf-8;');
}

export function HistoryView({
  history,
  activeSession,
  defaultConfig,
  onResumeSession,
  onDeleteSession,
  onClearAllHistory,
  onGoToCalculator,
}: HistoryViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    if (!confirmClearAll && confirmDeleteId === null) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setConfirmClearAll(false);
        setConfirmDeleteId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmClearAll, confirmDeleteId]);

  const activeSummary = computeSessionSummary(activeSession);
  const activeDisplayName = activeSession.name.trim() || 'Untitled Session';
  const canExportAll = history.length > 0 || activeSummary.recordedCount > 0;

  const totalPct = history.reduce(
    (sum, session) => sum + computeSessionSummary(session).scorePercent,
    0
  );
  const rawAvgPct = history.length > 0 ? Math.round((totalPct / history.length) * 10) / 10 : 0;
  const avgPct = rawAvgPct === 0 ? 0 : rawAvgPct;

  function handleExportAllJson() {
    const json = generateAllSessionsJson(activeSession, history, defaultConfig);
    const dateStamp = getLocalDateStamp();
    triggerFileDownload(
      json,
      `marksheet-all-sessions-${dateStamp}.json`,
      'application/json;charset=utf-8;'
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Aggregate Metrics */}
      <section className="bg-white dark:bg-[#1C1C1E] border border-[#E2E6EC] dark:border-[#2E2E32] rounded-xl p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F172A] dark:text-[#F2F2F4]">
              Session History
            </h1>
            <p className="text-sm text-[#5B6576] dark:text-[#9E9EA6] mt-1">
              Every completed or archived session is stored in your browser with its full question-by-question mark record.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canExportAll}
              onClick={handleExportAllJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0F172A] dark:text-[#F2F2F4] bg-[#F8FAFC] dark:bg-[#242427] hover:bg-[#F1F5F9] dark:hover:bg-[#2E2E32] border border-[#E2E6EC] dark:border-[#323236] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#A1A1AA]"
            >
              <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export All JSON</span>
            </button>

            {history.length > 0 && (
              <>
                {confirmClearAll ? (
                  <>
                    <span className="text-xs text-[#5B6576] dark:text-[#9E9EA6]">
                      Delete all history?
                    </span>
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
                      className="px-2.5 py-1.5 text-xs font-medium text-[#475569] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#F2F2F4] transition-colors whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="px-3 py-2 text-xs font-medium text-[#5B6576] dark:text-[#9E9EA6] hover:text-[#BE123C] dark:hover:text-[#FB7185] hover:bg-[#FFF1F2] dark:hover:bg-[#2A1519] border border-[#E2E6EC] dark:border-[#323236] hover:border-[#FECDD3] dark:hover:border-[#5C2530] rounded-lg transition-colors whitespace-nowrap"
                  >
                    Clear History
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Unboxed Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 sm:gap-y-0 sm:divide-x divide-[#E2E6EC] dark:divide-[#2E2E32] mt-6 pt-6 border-t border-[#E2E6EC] dark:border-[#2E2E32]">
          <div className="sm:pr-6">
            <p className="text-xs text-[#5B6576] dark:text-[#9E9EA6]">
              Active Session (Auto-saved)
            </p>
            <p className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F2F2F4] mt-0.5 truncate">
              {activeDisplayName}
            </p>
            <p className="font-mono text-xs text-[#5B6576] dark:text-[#9E9EA6] tabular-nums mt-0.5">
              Score {formatNumber(activeSummary.totalScore)} · {activeSummary.recordedCount}/
              {activeSession.config.totalQuestions} recorded
            </p>
          </div>

          <div className="sm:px-6">
            <p className="text-xs text-[#5B6576] dark:text-[#9E9EA6]">Saved Sessions</p>
            <p className="font-mono text-2xl font-semibold text-[#0F172A] dark:text-[#F2F2F4] tabular-nums mt-0.5">
              {history.length}
            </p>
          </div>

          <div className="sm:pl-6">
            <p className="text-xs text-[#5B6576] dark:text-[#9E9EA6]">Average Percentage</p>
            <p className="font-mono text-2xl font-semibold text-[#0F172A] dark:text-[#F2F2F4] tabular-nums mt-0.5">
              {history.length > 0 ? `${avgPct.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
      </section>

      {/* Saved Sessions List */}
      <section
        aria-label="Saved sessions"
        className="bg-white dark:bg-[#1C1C1E] border border-[#E2E6EC] dark:border-[#2E2E32] rounded-xl overflow-hidden"
      >
        {history.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <h2 className="font-display text-base font-semibold text-[#0F172A] dark:text-[#F2F2F4]">
              No archived sessions yet
            </h2>
            <p className="text-sm text-[#5B6576] dark:text-[#9E9EA6] mt-1.5 max-w-md mx-auto">
              Record marks in the Calculator and click New Session to archive your completed session and question records here.
            </p>
            <button
              type="button"
              onClick={onGoToCalculator}
              className="mt-5 px-4 py-2 text-sm font-medium text-white dark:text-[#141415] bg-[#1D4ED8] dark:bg-[#F2F2F4] hover:bg-[#1E40AF] dark:hover:bg-[#E4E4E7] rounded-lg transition-colors"
            >
              Return to Calculator
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E6EC] dark:divide-[#2E2E32]">
            {history.map((session) => {
              const summary = computeSessionSummary(session);
              const displayName = session.name.trim() || 'Untitled Session';
              const isExpanded = expandedId === session.id;
              const log = isExpanded ? computeRunningLog(session) : [];

              return (
                <article key={session.id} className="p-5 sm:p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F2F2F4] truncate">
                          {displayName}
                        </h2>
                        <span className="text-xs text-[#64748B] dark:text-[#8E8E96]">
                          {formatDateTime(session.updatedAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5B6576] dark:text-[#9E9EA6] mt-1.5 tabular-nums">
                        <span className="font-mono">
                          {formatSignedMark(session.config.positiveMark)} /{' '}
                          {formatSignedMark(session.config.negativeMark)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {summary.recordedCount} of {session.config.totalQuestions} questions
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#047857] dark:text-[#34D399]">
                          {summary.correctCount} correct
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#BE123C] dark:text-[#FB7185]">
                          {summary.wrongCount} wrong
                        </span>
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
                        <p
                          className={`font-mono text-2xl font-semibold tabular-nums leading-none ${
                            summary.totalScore < 0
                              ? 'text-[#BE123C] dark:text-[#FB7185]'
                              : 'text-[#0F172A] dark:text-[#F2F2F4]'
                          }`}
                        >
                          {formatNumber(summary.totalScore)}
                          <span className="text-sm font-normal text-[#64748B] dark:text-[#8E8E96]">
                            {' '}
                            / {formatNumber(summary.maxScore)}
                          </span>
                        </p>
                        <p className="font-mono text-xs text-[#5B6576] dark:text-[#9E9EA6] tabular-nums mt-1">
                          {summary.scorePercent.toFixed(1)}%
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`Inspect record for ${displayName}`}
                          onClick={() => setExpandedId(isExpanded ? null : session.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#F2F2F4] bg-[#F8FAFC] dark:bg-[#242427] hover:bg-[#F1F5F9] dark:hover:bg-[#2E2E32] border border-[#E2E6EC] dark:border-[#323236] rounded-lg transition-colors whitespace-nowrap"
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
                          aria-label={`Resume ${displayName}`}
                          onClick={() => onResumeSession(session.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] dark:text-[#E4E4E7] hover:bg-[#EFF6FF] dark:hover:bg-[#2C2C30] border border-transparent hover:border-[#BFDBFE] dark:hover:border-[#3F3F46] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Resume</span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Export JSON for ${displayName}`}
                          onClick={() => downloadSessionJson(session)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#475569] dark:text-[#D4D4D8] hover:text-[#0F172A] dark:hover:text-[#F2F2F4] hover:bg-[#F1F5F9] dark:hover:bg-[#2C2C30] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>JSON</span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Export CSV for ${displayName}`}
                          onClick={() => downloadCsv(session)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#475569] dark:text-[#D4D4D8] hover:text-[#0F172A] dark:hover:text-[#F2F2F4] hover:bg-[#F1F5F9] dark:hover:bg-[#2C2C30] rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>CSV</span>
                        </button>

                        {confirmDeleteId === session.id ? (
                          <div className="inline-flex items-center gap-1.5 pl-1">
                            <button
                              type="button"
                              aria-label={`Confirm delete ${displayName}`}
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
                              className="px-2 py-1.5 text-xs font-medium text-[#5B6576] dark:text-[#A1A1AA] hover:text-[#0F172A] dark:hover:text-[#F2F2F4] whitespace-nowrap"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Delete ${displayName}`}
                            onClick={() => setConfirmDeleteId(session.id)}
                            className="p-1.5 text-[#64748B] dark:text-[#8E8E96] hover:text-[#BE123C] dark:hover:text-[#FB7185] hover:bg-[#FFF1F2] dark:hover:bg-[#2A1519] rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Question-by-Question Record */}
                  {isExpanded && (
                    <div className="mt-5 pt-4 border-t border-[#E2E6EC] dark:border-[#2E2E32]">
                      {log.length === 0 ? (
                        <p className="text-xs text-[#5B6576] dark:text-[#9E9EA6]">
                          No questions were recorded in this session.
                        </p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white dark:bg-[#1C1C1E] border-b border-[#E2E6EC] dark:border-[#2E2E32]">
                              <tr className="text-xs font-medium text-[#5B6576] dark:text-[#9E9EA6]">
                                <th className="py-2 pr-3">Question</th>
                                <th className="py-2 px-3">Assigned Status</th>
                                <th className="py-2 px-3 text-right">Mark</th>
                                <th className="py-2 pl-3 text-right">Running Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E6EC] dark:divide-[#2E2E32]">
                              {log.map((row) => {
                                const tone =
                                  row.outcome === 'correct'
                                    ? 'text-[#047857] dark:text-[#34D399]'
                                    : row.outcome === 'wrong'
                                      ? 'text-[#BE123C] dark:text-[#FB7185]'
                                      : 'text-[#475569] dark:text-[#A1A1AA]';
                                const label =
                                  row.outcome === 'correct'
                                    ? '+ Correct'
                                    : row.outcome === 'wrong'
                                      ? '− Wrong'
                                      : '○ Skipped';
                                return (
                                  <tr key={row.questionNumber} className="text-xs">
                                    <td className="py-2 pr-3 font-mono font-semibold text-[#0F172A] dark:text-[#F2F2F4] tabular-nums">
                                      Q{row.questionNumber}
                                    </td>
                                    <td className={`py-2 px-3 font-medium ${tone}`}>{label}</td>
                                    <td
                                      className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${tone}`}
                                    >
                                      {formatSignedMark(row.mark)}
                                    </td>
                                    <td className="py-2 pl-3 text-right font-mono text-[#334155] dark:text-[#D4D4D8] tabular-nums">
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
