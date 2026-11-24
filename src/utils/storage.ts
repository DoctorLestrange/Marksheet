import type {
  ExamSession,
  PersistedState,
  QuestionOutcome,
  QuestionRecord,
  ScoringConfig,
  UndoEntry,
} from '../types/exam';
import {
  createSession,
  DEFAULT_CONFIG,
  getMarkForOutcome,
  isValidTimestamp,
  MAX_MARK_VALUE,
  MAX_TOTAL_QUESTIONS,
  MAX_UNDO_HISTORY,
  MIN_POSITIVE_MARK,
  MIN_TOTAL_QUESTIONS,
  normalizeDecimal,
} from './scoring';

export const STORAGE_KEY = 'marksheet_exam_calculator_v1';
const SCHEMA_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Safely resolves window.localStorage inside try/catch so privacy-restricted
 * browsers or sandboxed iframes throwing SecurityError never crash the app.
 */
export function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidOutcome(value: unknown): value is QuestionOutcome {
  return value === 'correct' || value === 'wrong' || value === 'skipped';
}

export function sanitizeConfig(raw: unknown): ScoringConfig {
  if (!isRecordObject(raw)) return { ...DEFAULT_CONFIG };

  const rawPos =
    typeof raw.positiveMark === 'number' && Number.isFinite(raw.positiveMark)
      ? raw.positiveMark
      : DEFAULT_CONFIG.positiveMark;
  const normalizedPos = normalizeDecimal(rawPos);
  const positiveMark =
    rawPos > 0 && normalizedPos >= MIN_POSITIVE_MARK && normalizedPos <= MAX_MARK_VALUE
      ? normalizedPos
      : DEFAULT_CONFIG.positiveMark;

  const rawNeg =
    typeof raw.negativeMark === 'number' && Number.isFinite(raw.negativeMark)
      ? raw.negativeMark
      : DEFAULT_CONFIG.negativeMark;
  const normalizedNeg =
    Math.abs(rawNeg) <= MAX_MARK_VALUE
      ? normalizeDecimal(-Math.abs(rawNeg))
      : DEFAULT_CONFIG.negativeMark;
  const negativeMark = normalizedNeg === 0 ? 0 : normalizedNeg;

  const rawTotal =
    typeof raw.totalQuestions === 'number' && Number.isFinite(raw.totalQuestions)
      ? Math.round(raw.totalQuestions)
      : DEFAULT_CONFIG.totalQuestions;
  const totalQuestions = Math.min(
    MAX_TOTAL_QUESTIONS,
    Math.max(MIN_TOTAL_QUESTIONS, rawTotal)
  );

  return { positiveMark, negativeMark, totalQuestions };
}

function sanitizeRecord(
  raw: unknown,
  config: ScoringConfig,
  fallbackNow: number
): QuestionRecord | null {
  if (!isRecordObject(raw)) return null;

  const qNum = typeof raw.questionNumber === 'number' ? raw.questionNumber : NaN;
  if (!Number.isInteger(qNum) || qNum < 1 || qNum > config.totalQuestions) return null;
  if (!isValidOutcome(raw.outcome)) return null;

  // Always derive mark from outcome + session config so tampered/stale marks cannot desync totals
  const mark = getMarkForOutcome(raw.outcome, config);
  const recordedAt = isValidTimestamp(raw.recordedAt) ? raw.recordedAt : fallbackNow;

  return {
    questionNumber: qNum,
    outcome: raw.outcome,
    mark,
    recordedAt,
  };
}

function sanitizeUndoEntry(
  raw: unknown,
  config: ScoringConfig,
  fallbackNow: number
): UndoEntry | null {
  if (!isRecordObject(raw)) return null;
  const qNum = typeof raw.questionNumber === 'number' ? raw.questionNumber : NaN;
  const prevActive = typeof raw.previousActiveQuestion === 'number' ? raw.previousActiveQuestion : NaN;
  if (!Number.isInteger(qNum) || qNum < 1 || qNum > config.totalQuestions) return null;
  if (!Number.isInteger(prevActive) || prevActive < 1 || prevActive > config.totalQuestions) return null;

  const previousRecord =
    raw.previousRecord === null
      ? null
      : sanitizeRecord(raw.previousRecord, config, fallbackNow);

  return {
    questionNumber: qNum,
    previousRecord,
    previousActiveQuestion: prevActive,
  };
}

export function sanitizeSession(
  raw: unknown,
  fallbackNumber: number,
  fallbackNow: number = Date.now()
): ExamSession | null {
  if (!isRecordObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;

  const config = sanitizeConfig(raw.config);
  const safeNow = isValidTimestamp(fallbackNow) ? fallbackNow : Date.now();
  const createdAt = isValidTimestamp(raw.createdAt) ? raw.createdAt : safeNow;
  const updatedAt = isValidTimestamp(raw.updatedAt) ? raw.updatedAt : createdAt;
  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 80)
      : `Session ${fallbackNumber}`;

  const records: Record<number, QuestionRecord> = {};
  if (isRecordObject(raw.records)) {
    for (const val of Object.values(raw.records)) {
      const clean = sanitizeRecord(val, config, updatedAt);
      if (clean) {
        records[clean.questionNumber] = clean;
      }
    }
  }

  const rawActive =
    typeof raw.activeQuestion === 'number' && Number.isInteger(raw.activeQuestion)
      ? raw.activeQuestion
      : 1;
  const activeQuestion = Math.min(config.totalQuestions, Math.max(1, rawActive));

  const undoStack: UndoEntry[] = [];
  if (Array.isArray(raw.undoStack)) {
    for (const entry of raw.undoStack.slice(-MAX_UNDO_HISTORY)) {
      const clean = sanitizeUndoEntry(entry, config, updatedAt);
      if (clean) undoStack.push(clean);
    }
  }

  return {
    id: raw.id.trim().slice(0, 120),
    name,
    createdAt,
    updatedAt,
    config,
    records,
    activeQuestion,
    undoStack,
  };
}

export function createInitialState(now: number = Date.now()): PersistedState {
  const safeNow = isValidTimestamp(now) ? now : Date.now();
  return {
    version: SCHEMA_VERSION,
    sessionCounter: 1,
    config: { ...DEFAULT_CONFIG },
    activeSession: createSession(DEFAULT_CONFIG, 1, safeNow),
    history: [],
  };
}

export function loadPersistedState(
  storage?: StorageLike | null,
  now: number = Date.now()
): { state: PersistedState; recoveredFromError: boolean } {
  const target = storage === undefined ? getBrowserStorage() : storage;
  if (!target) {
    return { state: createInitialState(now), recoveredFromError: false };
  }

  try {
    const rawText = target.getItem(STORAGE_KEY);
    if (!rawText) {
      return { state: createInitialState(now), recoveredFromError: false };
    }

    const parsed: unknown = JSON.parse(rawText);
    if (!isRecordObject(parsed)) {
      return { state: createInitialState(now), recoveredFromError: true };
    }

    const config = sanitizeConfig(parsed.config);
    const rawCounter =
      typeof parsed.sessionCounter === 'number' &&
      Number.isInteger(parsed.sessionCounter) &&
      parsed.sessionCounter >= 1
        ? parsed.sessionCounter
        : 1;

    const sanitizedActive = sanitizeSession(parsed.activeSession, rawCounter, now);
    const activeSession = sanitizedActive ?? createSession(config, rawCounter, now);

    // Deduplicate history IDs and ensure active session ID never duplicates into history
    const seenIds = new Set<string>([activeSession.id]);
    const history: ExamSession[] = [];
    if (Array.isArray(parsed.history)) {
      parsed.history.forEach((item, idx) => {
        const clean = sanitizeSession(item, idx + 1, now);
        if (clean && !seenIds.has(clean.id)) {
          seenIds.add(clean.id);
          history.push(clean);
        }
      });
    }

    const sessionCounter = Math.max(rawCounter, history.length + 1);

    return {
      state: {
        version: SCHEMA_VERSION,
        sessionCounter,
        config,
        activeSession,
        history,
      },
      recoveredFromError: !sanitizedActive && history.length === 0 && parsed.activeSession !== undefined,
    };
  } catch {
    return { state: createInitialState(now), recoveredFromError: true };
  }
}

export function savePersistedState(
  state: PersistedState,
  storage?: StorageLike | null
): { ok: boolean; error?: string } {
  const target = storage === undefined ? getBrowserStorage() : storage;
  if (!target) {
    return { ok: false, error: 'Browser storage is unavailable. Changes will not persist after reload.' };
  }

  try {
    target.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    // Fallback on quota pressure: strip undo stacks from archived history sessions and retry once
    if (state.history.some((session) => session.undoStack.length > 0)) {
      try {
        const compacted: PersistedState = {
          ...state,
          history: state.history.map((session) => ({ ...session, undoStack: [] })),
        };
        target.setItem(STORAGE_KEY, JSON.stringify(compacted));
        return { ok: true };
      } catch {
        // Fall through to report the storage error cleanly
      }
    }

    const message =
      err instanceof Error ? err.message : 'Unable to save to localStorage.';
    return { ok: false, error: message };
  }
}
