export type QuestionOutcome = 'correct' | 'wrong' | 'skipped';

export interface ScoringConfig {
  positiveMark: number;
  negativeMark: number; // Stored as <= 0 (e.g. -0.25 or 0)
  totalQuestions: number; // Integer 1..1000
}

export interface QuestionRecord {
  questionNumber: number;
  outcome: QuestionOutcome;
  mark: number;
  recordedAt: number;
}

export interface UndoEntry {
  questionNumber: number;
  previousRecord: QuestionRecord | null;
  previousActiveQuestion: number;
}

export interface ExamSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  config: ScoringConfig;
  records: Record<number, QuestionRecord>;
  activeQuestion: number;
  undoStack: UndoEntry[];
}

export interface SessionSummary {
  totalScore: number;
  maxScore: number;
  positiveTotal: number;
  negativeTotal: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  recordedCount: number;
  attemptedCount: number;
  remainingCount: number;
  accuracyPercent: number | null; // null when 0 attempted
  scorePercent: number;
  isComplete: boolean;
}

export interface RunningLogRow {
  questionNumber: number;
  outcome: QuestionOutcome;
  mark: number;
  runningTotal: number;
  recordedAt: number;
}

export interface PersistedState {
  version: number;
  sessionCounter: number;
  config: ScoringConfig;
  activeSession: ExamSession;
  history: ExamSession[];
}

export interface ConfigValidationResult {
  valid: boolean;
  config?: ScoringConfig;
  errors: {
    positiveMark?: string;
    negativeMark?: string;
    totalQuestions?: string;
  };
}
