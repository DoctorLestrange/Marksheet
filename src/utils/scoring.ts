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
export const MIN_POSITIVE_MARK = 0.0001;
export const MAX_MARK_VALUE = 1000;
export const MAX_UNDO_HISTORY = 250;
export const MAX_VALID_TIMESTAMP = 8_640_000_000_000_000;
const DECIMAL_SCALE = 10000;
const DECIMAL_INPUT_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const WINDOWS_RESERVED_FILENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

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
  // Fixed 4-decimal string with trailing zeros stripped — avoids scientific notation and -0
  return clean.toFixed(4).replace(/\.?0+$/, '');
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
 * Clamps and normalizes any ScoringConfig to safe, finite, exact values.
 */
export function normalizeConfig(config: Partial<ScoringConfig> | null | undefined): ScoringConfig {
  const rawPos =
    typeof config?.positiveMark === 'number' && Number.isFinite(config.positiveMark)
      ? Math.abs(config.positiveMark)
      : NaN;
  const normalizedPos = Number.isFinite(rawPos) ? normalizeDecimal(rawPos) : 0;
  const positiveMark =
    normalizedPos >= MIN_POSITIVE_MARK && normalizedPos <= MAX_MARK_VALUE
      ? normalizedPos
      : DEFAULT_CONFIG.positiveMark;

  const rawNeg =
    typeof config?.negativeMark === 'number' && Number.isFinite(config.negativeMark)
      ? Math.abs(config.negativeMark)
      : NaN;
  const normalizedNeg =
    Number.isFinite(rawNeg) && rawNeg <= MAX_MARK_VALUE
      ? normalizeDecimal(-rawNeg)
      : DEFAULT_CONFIG.negativeMark;
  const negativeMark = normalizedNeg === 0 ? 0 : normalizedNeg;

  const rawTotal =
    typeof config?.totalQuestions === 'number' && Number.isFinite(config.totalQuestions)
      ? Math.round(config.totalQuestions)
      : DEFAULT_CONFIG.totalQuestions;
  const totalQuestions = Math.min(
    MAX_TOTAL_QUESTIONS,
    Math.max(MIN_TOTAL_QUESTIONS, rawTotal)
  );

  return { positiveMark, negativeMark, totalQuestions };
}

/**
 * Computes exact maximum possible score using integer-scaled multiplication.
 */
export function calculateMaxScore(config: ScoringConfig): number {
  return fromScaledInt(toScaledInt(config.positiveMark) * config.totalQuestions);
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
  const safeConfig = normalizeConfig(config);
  const safeNow = isValidTimestamp(now) ? now : Date.now();

  return {
    id: id ?? `session_${safeNow}_${Math.random().toString(36).slice(2, 8)}`,
    name: `Session ${sessionNumber}`,
    createdAt: safeNow,
    updatedAt: safeNow,
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
  if (!Number.isInteger(qNum) || qNum < 1 || qNum > session.config.totalQuestions) {
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
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > session.config.totalQuestions) {
    return session;
  }
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

    if (
      Number.isInteger(last.questionNumber) &&
      last.questionNumber >= 1 &&
      last.questionNumber <= session.config.totalQuestions
    ) {
      if (last.previousRecord) {
        nextRecords[last.questionNumber] = last.previousRecord;
      } else {
        delete nextRecords[last.questionNumber];
      }
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
  const safeConfig = normalizeConfig(newConfig);
  const nextRecords: Record<number, QuestionRecord> = {};

  for (const key of Object.keys(session.records)) {
    const qNum = Number(key);
    if (!Number.isInteger(qNum) || qNum < 1 || qNum > safeConfig.totalQuestions) {
      continue;
    }
    const existing = session.records[qNum];
    if (!existing) continue;
    nextRecords[qNum] = {
      ...existing,
      mark: getMarkForOutcome(existing.outcome, safeConfig),
    };
  }

  const clampedActive = Math.min(safeConfig.totalQuestions, Math.max(1, session.activeQuestion));

  return {
    ...session,
    updatedAt: now,
    config: safeConfig,
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
  const maxScore = calculateMaxScore(session.config);
  const positiveTotal = fromScaledInt(positiveScaled);
  const negativeTotal = fromScaledInt(negativeScaled);
  const recordedCount = correctCount + wrongCount + skippedCount;
  const attemptedCount = correctCount + wrongCount;
  const remainingCount = Math.max(0, session.config.totalQuestions - recordedCount);
  const rawAccuracy =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 1000) / 10 : null;
  const accuracyPercent = rawAccuracy === 0 ? 0 : rawAccuracy;
  const rawScorePercent =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0;
  const scorePercent = rawScorePercent === 0 ? 0 : rawScorePercent;

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
 * Normalizes raw numeric string input (trimming whitespace and converting Unicode minus to ASCII).
 */
function cleanNumericInput(raw: string): string {
  return raw.trim().replace(/\u2212/g, '-');
}

/**
 * Validates raw form string inputs for scoring configuration.
 * Negative mark accepts either negative values (-0.25), positive magnitude (0.25 -> normalized to -0.25),
 * or 0 (no negative marking). Rejects non-decimal notations (hex, scientific) and sub-0.0001 values
 * that would silently round to 0.
 */
export function validateConfigInputs(raw: {
  positiveMark: string;
  negativeMark: string;
  totalQuestions: string;
}): ConfigValidationResult {
  const errors: ConfigValidationResult['errors'] = {};

  const posTrimmed = cleanNumericInput(raw.positiveMark);
  const posNum = DECIMAL_INPUT_PATTERN.test(posTrimmed) ? Number(posTrimmed) : NaN;
  if (!posTrimmed || !Number.isFinite(posNum)) {
    errors.positiveMark = 'Enter a valid number for positive mark.';
  } else if (posNum <= 0) {
    errors.positiveMark = 'Positive mark must be greater than 0.';
  } else if (posNum < MIN_POSITIVE_MARK || normalizeDecimal(posNum) < MIN_POSITIVE_MARK) {
    errors.positiveMark = `Positive mark must be at least ${MIN_POSITIVE_MARK}.`;
  } else if (posNum > MAX_MARK_VALUE) {
    errors.positiveMark = `Positive mark must be ${MAX_MARK_VALUE} or less.`;
  }

  const negTrimmed = cleanNumericInput(raw.negativeMark);
  const negNum = DECIMAL_INPUT_PATTERN.test(negTrimmed) ? Number(negTrimmed) : NaN;
  if (!negTrimmed || !Number.isFinite(negNum)) {
    errors.negativeMark = 'Enter a valid number (e.g. -0.25 or 0).';
  } else if (negNum !== 0 && Math.abs(negNum) < MIN_POSITIVE_MARK) {
    errors.negativeMark = `Negative mark must be 0 or at least ${MIN_POSITIVE_MARK} in magnitude.`;
  } else if (Math.abs(negNum) > MAX_MARK_VALUE) {
    errors.negativeMark = `Negative mark magnitude must be ${MAX_MARK_VALUE} or less.`;
  }

  const totalTrimmed = cleanNumericInput(raw.totalQuestions);
  const totalNum = DECIMAL_INPUT_PATTERN.test(totalTrimmed) ? Number(totalTrimmed) : NaN;
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
 * Returns true if a numeric value is a safe, valid millisecond epoch timestamp for Date.
 */
export function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_VALID_TIMESTAMP
  );
}

/**
 * Converts a timestamp to an ISO string safely without ever throwing RangeError.
 */
export function toSafeIsoString(ts: number, fallback: number = Date.now()): string {
  const safeTs = isValidTimestamp(ts) ? ts : isValidTimestamp(fallback) ? fallback : 0;
  return new Date(safeTs).toISOString();
}

/**
 * Returns local calendar date formatted as YYYY-MM-DD for user-friendly export filenames.
 */
export function getLocalDateStamp(now: number = Date.now()): string {
  const date = new Date(isValidTimestamp(now) ? now : Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the highest question number that currently has a recorded mark (or 0 if none).
 */
export function getHighestRecordedQuestion(session: ExamSession): number {
  let highest = 0;
  for (let q = 1; q <= session.config.totalQuestions; q++) {
    if (session.records[q]) {
      highest = q;
    }
  }
  return highest;
}

/**
 * Counts how many recorded questions would be pruned if totalQuestions is lowered to `limit`.
 */
export function countRecordsAboveLimit(session: ExamSession, limit: number): number {
  let count = 0;
  for (let q = limit + 1; q <= session.config.totalQuestions; q++) {
    if (session.records[q]) {
      count += 1;
    }
  }
  return count;
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
    createdAt: toSafeIsoString(session.createdAt),
    updatedAt: toSafeIsoString(session.updatedAt),
    config: { ...session.config },
    summary,
    records: log.map((row) => ({
      questionNumber: row.questionNumber,
      outcome: row.outcome,
      mark: row.mark,
      runningTotal: row.runningTotal,
      recordedAt: toSafeIsoString(row.recordedAt),
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
    exportedAt: toSafeIsoString(exportedAt),
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
    exportedAt: toSafeIsoString(exportedAt),
    defaultConfig: { ...defaultConfig },
    sessionCount: sessions.length,
    sessions,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Converts a session name into a safe cross-platform filename slug (avoids Windows reserved names).
 */
export function slugifyFilename(name: string, fallback: string = 'exam-session'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  if (!slug) return fallback;
  if (WINDOWS_RESERVED_FILENAME.test(slug)) {
    return `session-${slug}`;
  }
  return slug;
}
