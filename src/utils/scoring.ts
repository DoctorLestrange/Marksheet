import type {
  ConfigValidationResult,
  ExamSession,
  QuestionOutcome,
  QuestionRecord,
  RunningLogRow,
  ScoringConfig,
  SessionSummary,
  UndoEntry,
} from '../types/exam';

export const DEFAULT_CONFIG: ScoringConfig = {
  positiveMark: 1,
  negativeMark: -0.25,
  totalQuestions: 100,
};

export const MAX_TOTAL_QUESTIONS = 1000;
export const MIN_TOTAL_QUESTIONS = 1;
const DECIMAL_SCALE = 10000;
const MAX_UNDO_HISTORY = 250;

/**
 * Converts a finite decimal number to a scaled integer to eliminate
 * IEEE-754 floating-point accumulation errors (e.g. 0.1 + 0.2 !== 0.3).
 */
export function toScaledInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * DECIMAL_SCALE);
}

/**
 * Converts a scaled integer back to a clean JS number, normalizing -0 to 0.
 */
export function fromScaledInt(scaled: number): number {
  const result = scaled / DECIMAL_SCALE;
  return Object.is(result, -0) || result === 0 ? 0 : result;
}

/**
 * Rounds a number cleanly to 4 decimal places and eliminates -0.
 */
export function normalizeDecimal(value: number): number {
  return fromScaledInt(toScaledInt(value));
}

/**
 * Formats a numeric mark cleanly without trailing zeroes or negative zero.
 */
export function formatNumber(value: number): string {
  const clean = normalizeDecimal(value);
  if (clean === 0) return '0';
  // Use up to 4 decimal places without trailing zeros
  return Number(clean.toFixed(4)).toString();
}

/**
 * Formats a mark with an explicit sign for clarity (+1, -0.25, 0).
 */
export function formatSignedMark(value: number): string {
  const clean = normalizeDecimal(value);
  if (clean > 0) return `+${formatNumber(clean)}`;
  if (clean < 0) return `−${formatNumber(Math.abs(clean))}`;
  return '0';
}

/**
 * Computes the exact mark value for an outcome given a session's config.
 */
export function getMarkForOutcome(outcome: QuestionOutcome, config: ScoringConfig): number {
  switch (outcome) {
    case 'correct':
      return normalizeDecimal(Math.abs(config.positiveMark));
    case 'wrong': {
      const neg = normalizeDecimal(-Math.abs(config.negativeMark));
      return neg === 0 ? 0 : neg;
    }
    case 'skipped':
      return 0;
  }
}

/**
 * Creates a fresh exam session with a unique ID and snapshot of the scoring config.
 */
export function createSession(
  config: ScoringConfig,
  sessionNumber: number,
  now: number = Date.now(),
  id?: string
): ExamSession {
  const safeConfig: ScoringConfig = {
    positiveMark: normalizeDecimal(Math.abs(config.positiveMark)) || DEFAULT_CONFIG.positiveMark,
    negativeMark: normalizeDecimal(-Math.abs(config.negativeMark)),
    totalQuestions: Math.min(
      MAX_TOTAL_QUESTIONS,
      Math.max(MIN_TOTAL_QUESTIONS, Math.round(config.totalQuestions))
    ),
  };

  return {
    id: id ?? `session_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: `Session ${sessionNumber}`,
    createdAt: now,
    updatedAt: now,
    config: safeConfig,
    records: {},
    activeQuestion: 1,
    undoStack: [],
  };
}

/**
 * Finds the lowest question number (1..totalQuestions) that has not yet been recorded.
 * Returns null if all questions have been recorded.
 */
export function findFirstUnanswered(
  records: Record<number, QuestionRecord>,
  totalQuestions: number
): number | null {
  for (let q = 1; q <= totalQuestions; q++) {
    if (!records[q]) return q;
  }
  return null;
}

/**
 * Determines the next active question after recording `questionNumber`.
 * Advances to `questionNumber + 1` if within bounds; otherwise stays on `questionNumber`
 * or jumps to an unanswered question if one exists.
 */
export function getNextQuestionNumber(
  questionNumber: number,
  records: Record<number, QuestionRecord>,
  totalQuestions: number
): number {
  if (questionNumber < totalQuestions) {
    return questionNumber + 1;
  }
  const firstUnanswered = findFirstUnanswered(records, totalQuestions);
  return firstUnanswered ?? totalQuestions;
}

/**
 * Records an outcome (correct / wrong / skipped) for the session's activeQuestion
 * (or an explicitly specified questionNumber). Pure function returning a new ExamSession.
 */
export function recordQuestionMark(
  session: ExamSession,
  outcome: QuestionOutcome,
  targetQuestion?: number,
  now: number = Date.now()
): ExamSession {
  const qNum = targetQuestion ?? session.activeQuestion;
  if (qNum < 1 || qNum > session.config.totalQuestions) {
    return session;
  }

  const previousRecord = session.records[qNum] ?? null;
  const mark = getMarkForOutcome(outcome, session.config);

  const nextRecord: QuestionRecord = {
    questionNumber: qNum,
    outcome,
    mark,
    recordedAt: now,
  };

  const nextRecords: Record<number, QuestionRecord> = {
    ...session.records,
    [qNum]: nextRecord,
  };

  const undoEntry: UndoEntry = {
    questionNumber: qNum,
    previousRecord,
    previousActiveQuestion: session.activeQuestion,
  };

  const nextUndoStack = [...session.undoStack, undoEntry].slice(-MAX_UNDO_HISTORY);
  const nextActiveQuestion = getNextQuestionNumber(qNum, nextRecords, session.config.totalQuestions);

  return {
    ...session,
    updatedAt: now,
    records: nextRecords,
    activeQuestion: nextActiveQuestion,
    undoStack: nextUndoStack,
  };
}

/**
 * Clears the recorded mark for a specific question number, pushing an undo entry.
 */
export function clearQuestionMark(
  session: ExamSession,
  questionNumber: number,
  now: number = Date.now()
): ExamSession {
  const existing = session.records[questionNumber];
  if (!existing) return session;

  const nextRecords = { ...session.records };
  delete nextRecords[questionNumber];

  const undoEntry: UndoEntry = {
    questionNumber,
    previousRecord: existing,
    previousActiveQuestion: session.activeQuestion,
  };

  return {
    ...session,
    updatedAt: now,
    records: nextRecords,
    activeQuestion: questionNumber,
    undoStack: [...session.undoStack, undoEntry].slice(-MAX_UNDO_HISTORY),
  };
}

/**
 * Reverts the most recent action on the session using the undo stack.
 * If the undo stack is empty (e.g. after reloading a trimmed session) but records exist,
 * falls back to removing the most recently recorded entry by timestamp / question number.
 */
export function undoLastAction(session: ExamSession, now: number = Date.now()): ExamSession {
  if (session.undoStack.length > 0) {
    const nextUndoStack = session.undoStack.slice(0, -1);
    const last = session.undoStack[session.undoStack.length - 1];
    const nextRecords = { ...session.records };

    if (last.previousRecord) {
      nextRecords[last.questionNumber] = last.previousRecord;
    } else {
      delete nextRecords[last.questionNumber];
    }

    const clampedActive = Math.min(
      session.config.totalQuestions,
      Math.max(1, last.previousActiveQuestion)
    );

    return {
      ...session,
      updatedAt: now,
      records: nextRecords,
      activeQuestion: clampedActive,
      undoStack: nextUndoStack,
    };
  }

  // Fallback if undoStack is empty but records exist: remove highest recorded question
  const recordedKeys = Object.keys(session.records)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= session.config.totalQuestions);

  if (recordedKeys.length === 0) return session;

  let latestKey = recordedKeys[0];
  for (const key of recordedKeys) {
    const curr = session.records[key];
    const prev = session.records[latestKey];
    if (curr.recordedAt > prev.recordedAt || (curr.recordedAt === prev.recordedAt && key > latestKey)) {
      latestKey = key;
    }
  }

  const nextRecords = { ...session.records };
  delete nextRecords[latestKey];

  return {
    ...session,
    updatedAt: now,
    records: nextRecords,
    activeQuestion: latestKey,
  };
}

/**
 * Clears all recorded marks in the active session while keeping its id, name, and config.
 */
export function resetSessionRecords(session: ExamSession, now: number = Date.now()): ExamSession {
  return {
    ...session,
    updatedAt: now,
    records: {},
    activeQuestion: 1,
    undoStack: [],
  };
}

/**
 * Updates a session's scoring config, recalculating all existing question marks to match
 * the new positive/negative rules and pruning records above the new totalQuestions limit.
 */
export function applyConfigToSession(
  session: ExamSession,
  newConfig: ScoringConfig,
  now: number = Date.now()
): ExamSession {
  const nextRecords: Record<number, QuestionRecord> = {};

  for (const key of Object.keys(session.records)) {
    const qNum = Number(key);
    if (!Number.isInteger(qNum) || qNum < 1 || qNum > newConfig.totalQuestions) {
      continue;
    }
    const existing = session.records[qNum];
    nextRecords[qNum] = {
      ...existing,
      mark: getMarkForOutcome(existing.outcome, newConfig),
    };
  }

  const clampedActive = Math.min(newConfig.totalQuestions, Math.max(1, session.activeQuestion));

  return {
    ...session,
    updatedAt: now,
    config: { ...newConfig },
    records: nextRecords,
    activeQuestion: clampedActive,
    // Clear undo stack when config changes to avoid restoring stale mark values
    undoStack: [],
  };
}

/**
 * Computes exact summary metrics for a session using integer-scaled arithmetic.
 */
export function computeSessionSummary(session: ExamSession): SessionSummary {
  let totalScaled = 0;
  let positiveScaled = 0;
  let negativeScaled = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  for (let q = 1; q <= session.config.totalQuestions; q++) {
    const rec = session.records[q];
    if (!rec) continue;

    const scaledMark = toScaledInt(rec.mark);
    totalScaled += scaledMark;

    if (rec.outcome === 'correct') {
      correctCount += 1;
      positiveScaled += scaledMark;
    } else if (rec.outcome === 'wrong') {
      wrongCount += 1;
      negativeScaled += scaledMark;
    } else {
      skippedCount += 1;
    }
  }

  const totalScore = fromScaledInt(totalScaled);
  const maxScore = fromScaledInt(toScaledInt(session.config.positiveMark) * session.config.totalQuestions);
  const positiveTotal = fromScaledInt(positiveScaled);
  const negativeTotal = fromScaledInt(negativeScaled);
  const recordedCount = correctCount + wrongCount + skippedCount;
  const attemptedCount = correctCount + wrongCount;
  const remainingCount = Math.max(0, session.config.totalQuestions - recordedCount);
  const accuracyPercent =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 1000) / 10 : null;
  const scorePercent =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0;

  return {
    totalScore,
    maxScore,
    positiveTotal,
    negativeTotal,
    correctCount,
    wrongCount,
    skippedCount,
    recordedCount,
    attemptedCount,
    remainingCount,
    accuracyPercent,
    scorePercent,
    isComplete: recordedCount >= session.config.totalQuestions,
  };
}

/**
 * Builds an ordered question-by-question ledger with exact cumulative running totals.
 */
export function computeRunningLog(session: ExamSession): RunningLogRow[] {
  const rows: RunningLogRow[] = [];
  let runningScaled = 0;

  for (let q = 1; q <= session.config.totalQuestions; q++) {
    const rec = session.records[q];
    if (!rec) continue;
    runningScaled += toScaledInt(rec.mark);
    rows.push({
      questionNumber: rec.questionNumber,
      outcome: rec.outcome,
      mark: normalizeDecimal(rec.mark),
      runningTotal: fromScaledInt(runningScaled),
      recordedAt: rec.recordedAt,
    });
  }

  return rows;
}

/**
 * Validates raw form string inputs for scoring configuration.
 * Negative mark accepts either negative values (-0.25), positive magnitude (0.25 -> normalized to -0.25),
 * or 0 (no negative marking).
 */
export function validateConfigInputs(raw: {
  positiveMark: string;
  negativeMark: string;
  totalQuestions: string;
}): ConfigValidationResult {
  const errors: ConfigValidationResult['errors'] = {};

  const posTrimmed = raw.positiveMark.trim();
  const posNum = Number(posTrimmed);
  if (!posTrimmed || !Number.isFinite(posNum)) {
    errors.positiveMark = 'Enter a valid number for positive mark.';
  } else if (posNum <= 0) {
    errors.positiveMark = 'Positive mark must be greater than 0.';
  } else if (posNum > 1000) {
    errors.positiveMark = 'Positive mark must be 1000 or less.';
  }

  const negTrimmed = raw.negativeMark.trim();
  const negNum = Number(negTrimmed);
  if (!negTrimmed || !Number.isFinite(negNum)) {
    errors.negativeMark = 'Enter a valid number (e.g. -0.25 or 0).';
  } else if (Math.abs(negNum) > 1000) {
    errors.negativeMark = 'Negative mark magnitude must be 1000 or less.';
  }

  const totalTrimmed = raw.totalQuestions.trim();
  const totalNum = Number(totalTrimmed);
  if (!totalTrimmed || !Number.isFinite(totalNum)) {
    errors.totalQuestions = 'Enter a valid number of questions.';
  } else if (!Number.isInteger(totalNum)) {
    errors.totalQuestions = 'Number of questions must be a whole number.';
  } else if (totalNum < MIN_TOTAL_QUESTIONS || totalNum > MAX_TOTAL_QUESTIONS) {
    errors.totalQuestions = `Must be between ${MIN_TOTAL_QUESTIONS} and ${MAX_TOTAL_QUESTIONS}.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  const normalizedNegative = normalizeDecimal(-Math.abs(negNum));

  return {
    valid: true,
    errors: {},
    config: {
      positiveMark: normalizeDecimal(posNum),
      negativeMark: normalizedNegative === 0 ? 0 : normalizedNegative,
      totalQuestions: totalNum,
    },
  };
}

/**
 * Exports a session's question-by-question record as CSV text.
 */
export function generateSessionCsv(session: ExamSession): string {
  const rows = computeRunningLog(session);
  const summary = computeSessionSummary(session);
  const lines: string[] = [
    'Question,Outcome,Mark,Running Total',
    ...rows.map(
      (row) =>
        `${row.questionNumber},${row.outcome},${formatNumber(row.mark)},${formatNumber(row.runningTotal)}`
    ),
    '',
    `Summary,Total Score,${formatNumber(summary.totalScore)},Max Score: ${formatNumber(summary.maxScore)}`,
    `Breakdown,Correct: ${summary.correctCount},Wrong: ${summary.wrongCount},Skipped: ${summary.skippedCount}`,
  ];
  return lines.join('\n');
}

export interface ExportedSessionPayload {
  id: string;
  name: string;
  status?: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  config: ScoringConfig;
  summary: SessionSummary;
  records: {
    questionNumber: number;
    outcome: QuestionOutcome;
    mark: number;
    runningTotal: number;
    recordedAt: string;
  }[];
}

/**
 * Serializes an ExamSession into a clean, self-describing JSON object without internal undo state.
 */
export function serializeSessionForExport(
  session: ExamSession,
  status?: 'active' | 'archived'
): ExportedSessionPayload {
  const summary = computeSessionSummary(session);
  const log = computeRunningLog(session);

  return {
    id: session.id,
    name: session.name.trim() || 'Untitled Session',
    ...(status ? { status } : {}),
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
    config: { ...session.config },
    summary,
    records: log.map((row) => ({
      questionNumber: row.questionNumber,
      outcome: row.outcome,
      mark: row.mark,
      runningTotal: row.runningTotal,
      recordedAt: new Date(row.recordedAt).toISOString(),
    })),
  };
}

/**
 * Generates pretty-printed JSON for a single exam session.
 */
export function generateSessionJson(
  session: ExamSession,
  exportedAt: number = Date.now()
): string {
  const payload = {
    format: 'marksheet-session',
    version: 1,
    exportedAt: new Date(exportedAt).toISOString(),
    session: serializeSessionForExport(session),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Generates pretty-printed JSON containing all sessions (active session if it has recorded marks + archived history).
 */
export function generateAllSessionsJson(
  activeSession: ExamSession,
  history: ExamSession[],
  defaultConfig: ScoringConfig,
  exportedAt: number = Date.now()
): string {
  const sessions: ExportedSessionPayload[] = [];
  const activeSummary = computeSessionSummary(activeSession);
  const seenIds = new Set<string>();

  if (activeSummary.recordedCount > 0 || history.length === 0) {
    sessions.push(serializeSessionForExport(activeSession, 'active'));
    seenIds.add(activeSession.id);
  }

  for (const archived of history) {
    if (seenIds.has(archived.id)) continue;
    sessions.push(serializeSessionForExport(archived, 'archived'));
    seenIds.add(archived.id);
  }

  const payload = {
    format: 'marksheet-export-all',
    version: 1,
    exportedAt: new Date(exportedAt).toISOString(),
    defaultConfig: { ...defaultConfig },
    sessionCount: sessions.length,
    sessions,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Converts a session name into a safe filename slug.
 */
export function slugifyFilename(name: string, fallback: string = 'exam-session'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || fallback;
}
