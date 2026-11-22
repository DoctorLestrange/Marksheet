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
  MAX_TOTAL_QUESTIONS,
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

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidOutcome(value: unknown): value is QuestionOutcome {
  return value === 'correct' || value === 'wrong' || value === 'skipped';
}

export function sanitizeConfig(raw: unknown): ScoringConfig {
  if (!isRecordObject(raw)) return { ...DEFAULT_CONFIG };

  const rawPos = typeof raw.positiveMark === 'number' && Number.isFinite(raw.positiveMark)
    ? raw.positiveMark
    : DEFAULT_CONFIG.positiveMark;
  const positiveMark = rawPos > 0 && rawPos <= 1000 ? normalizeDecimal(rawPos) : DEFAULT_CONFIG.positiveMark;

  const rawNeg = typeof raw.negativeMark === 'number' && Number.isFinite(raw.negativeMark)
    ? raw.negativeMark
    : DEFAULT_CONFIG.negativeMark;
  const negativeMark = Math.abs(rawNeg) <= 1000
    ? normalizeDecimal(-Math.abs(rawNeg))
    : DEFAULT_CONFIG.negativeMark;

  const rawTotal = typeof raw.totalQuestions === 'number' && Number.isFinite(raw.totalQuestions)
    ? Math.round(raw.totalQuestions)
    : DEFAULT_CONFIG.totalQuestions;
  const totalQuestions = Math.min(
    MAX_TOTAL_QUESTIONS,
    Math.max(MIN_TOTAL_QUESTIONS, rawTotal)
  );

  return { positiveMark, negativeMark, totalQuestions };
}

function sanitizeRecord(raw: unknown, totalQuestions: number): QuestionRecord | null {
  if (!isRecordObject(raw)) return null;

  const qNum = typeof raw.questionNumber === 'number' ? raw.questionNumber : NaN;
  if (!Number.isInteger(qNum) || qNum < 1 || qNum > totalQuestions) return null;
  if (!isValidOutcome(raw.outcome)) return null;

  const mark = typeof raw.mark === 'number' && Number.isFinite(raw.mark)
    ? normalizeDecimal(raw.mark)
    : 0;
  const recordedAt = typeof raw.recordedAt === 'number' && Number.isFinite(raw.recordedAt)
    ? raw.recordedAt
    : Date.now();

  return {
    questionNumber: qNum,
    outcome: raw.outcome,
    mark,
    recordedAt,
  };
}

function sanitizeUndoEntry(raw: unknown, totalQuestions: number): UndoEntry | null {
  if (!isRecordObject(raw)) return null;
  const qNum = typeof raw.questionNumber === 'number' ? raw.questionNumber : NaN;
  const prevActive = typeof raw.previousActiveQuestion === 'number' ? raw.previousActiveQuestion : NaN;
  if (!Number.isInteger(qNum) || qNum < 1 || qNum > totalQuestions) return null;
  if (!Number.isInteger(prevActive) || prevActive < 1 || prevActive > totalQuestions) return null;

  const previousRecord = raw.previousRecord === null
    ? null
    : sanitizeRecord(raw.previousRecord, totalQuestions);

  return {
    questionNumber: qNum,
    previousRecord,
    previousActiveQuestion: prevActive,
  };
}

export function sanitizeSession(raw: unknown, fallbackNumber: number): ExamSession | null {
  if (!isRecordObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;

  const config = sanitizeConfig(raw.config);
  const now = Date.now();
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : `Session ${fallbackNumber}`;

  const records: Record<number, QuestionRecord> = {};
  if (isRecordObject(raw.records)) {
    for (const val of Object.values(raw.records)) {
      const clean = sanitizeRecord(val, config.totalQuestions);
      if (clean) {
        records[clean.questionNumber] = clean;
      }
    }
  }

  const rawActive = typeof raw.activeQuestion === 'number' && Number.isInteger(raw.activeQuestion)
    ? raw.activeQuestion
    : 1;
  const activeQuestion = Math.min(config.totalQuestions, Math.max(1, rawActive));

  const undoStack: UndoEntry[] = [];
  if (Array.isArray(raw.undoStack)) {
    for (const entry of raw.undoStack) {
      const clean = sanitizeUndoEntry(entry, config.totalQuestions);
      if (clean) undoStack.push(clean);
    }
  }

  return {
    id: raw.id,
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
  return {
    version: SCHEMA_VERSION,
    sessionCounter: 1,
    config: { ...DEFAULT_CONFIG },
    activeSession: createSession(DEFAULT_CONFIG, 1, now),
    history: [],
  };
}

export function loadPersistedState(
  storage?: StorageLike | null,
  now: number = Date.now()
): { state: PersistedState; recoveredFromError: boolean } {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
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
    const history: ExamSession[] = [];
    if (Array.isArray(parsed.history)) {
      parsed.history.forEach((item, idx) => {
        const clean = sanitizeSession(item, idx + 1);
        if (clean) history.push(clean);
      });
    }

    const rawCounter =
      typeof parsed.sessionCounter === 'number' && Number.isInteger(parsed.sessionCounter) && parsed.sessionCounter >= 1
        ? parsed.sessionCounter
        : history.length + 1;

    const activeSession =
      sanitizeSession(parsed.activeSession, rawCounter) ??
      createSession(config, rawCounter, now);

    return {
      state: {
        version: SCHEMA_VERSION,
        sessionCounter: Math.max(rawCounter, history.length + 1),
        config,
        activeSession,
        history,
      },
      recoveredFromError: false,
    };
  } catch {
    return { state: createInitialState(now), recoveredFromError: true };
  }
}

export function savePersistedState(
  state: PersistedState,
  storage?: StorageLike | null
): { ok: boolean; error?: string } {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) {
    return { ok: false, error: 'Browser storage is unavailable.' };
  }

  try {
    target.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to save to localStorage.';
    return { ok: false, error: message };
  }
}
