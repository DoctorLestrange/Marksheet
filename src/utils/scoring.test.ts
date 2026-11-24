import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConfigToSession,
  calculateMaxScore,
  clearQuestionMark,
  computeRunningLog,
  computeSessionSummary,
  countRecordsAboveLimit,
  createSession,
  DEFAULT_CONFIG,
  formatNumber,
  formatSignedMark,
  generateAllSessionsJson,
  generateSessionCsv,
  generateSessionJson,
  recordQuestionMark,
  resetSessionRecords,
  slugifyFilename,
  undoLastAction,
  validateConfigInputs,
} from './scoring';
import {
  createInitialState,
  loadPersistedState,
  savePersistedState,
  STORAGE_KEY,
  type StorageLike,
} from './storage';
import { loadStoredTheme, saveStoredTheme } from './theme';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

test('default config matches prompt specification (+1, -0.25, 100 questions)', () => {
  assert.equal(DEFAULT_CONFIG.positiveMark, 1);
  assert.equal(DEFAULT_CONFIG.negativeMark, -0.25);
  assert.equal(DEFAULT_CONFIG.totalQuestions, 100);
});

test('records add, subtract, and skip sequentially with exact marks', () => {
  let session = createSession(DEFAULT_CONFIG, 1, 1000, 's1');
  assert.equal(session.activeQuestion, 1);

  session = recordQuestionMark(session, 'correct', undefined, 1001);
  assert.equal(session.records[1].mark, 1);
  assert.equal(session.records[1].outcome, 'correct');
  assert.equal(session.activeQuestion, 2);

  session = recordQuestionMark(session, 'wrong', undefined, 1002);
  assert.equal(session.records[2].mark, -0.25);
  assert.equal(session.records[2].outcome, 'wrong');
  assert.equal(session.activeQuestion, 3);

  session = recordQuestionMark(session, 'skipped', undefined, 1003);
  assert.equal(session.records[3].mark, 0);
  assert.equal(session.records[3].outcome, 'skipped');
  assert.equal(session.activeQuestion, 4);

  const summary = computeSessionSummary(session);
  assert.equal(summary.totalScore, 0.75);
  assert.equal(summary.positiveTotal, 1);
  assert.equal(summary.negativeTotal, -0.25);
  assert.equal(summary.correctCount, 1);
  assert.equal(summary.wrongCount, 1);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.recordedCount, 3);
  assert.equal(summary.remainingCount, 97);
  assert.equal(summary.accuracyPercent, 50);
});

test('decimal arithmetic avoids IEEE-754 floating-point drift and negative zero', () => {
  const trickyConfig = { positiveMark: 0.1, negativeMark: -0.2, totalQuestions: 10 };
  let session = createSession(trickyConfig, 1, 1000, 's-float');
  session = recordQuestionMark(session, 'correct', 1, 1001);
  session = recordQuestionMark(session, 'correct', 2, 1002);
  session = recordQuestionMark(session, 'wrong', 3, 1003);

  const summary = computeSessionSummary(session);
  assert.equal(summary.totalScore, 0);
  assert.equal(Object.is(summary.totalScore, -0), false);
  assert.equal(formatNumber(summary.totalScore), '0');

  // 0.1 + 0.1 + 0.1 must be 0.3 exactly, never 0.30000000000000004
  session = recordQuestionMark(session, 'correct', 3, 1004);
  const summary2 = computeSessionSummary(session);
  assert.equal(summary2.totalScore, 0.3);
  assert.equal(formatNumber(summary2.totalScore), '0.3');

  // 3 wrong answers of -0.33 = -0.99 exactly
  const thirdConfig = { positiveMark: 1, negativeMark: -0.33, totalQuestions: 10 };
  let s3 = createSession(thirdConfig, 1, 1000, 's-third');
  s3 = recordQuestionMark(s3, 'correct', 1, 1001);
  s3 = recordQuestionMark(s3, 'wrong', 2, 1002);
  s3 = recordQuestionMark(s3, 'wrong', 3, 1003);
  s3 = recordQuestionMark(s3, 'wrong', 4, 1004);
  const sum3 = computeSessionSummary(s3);
  assert.equal(sum3.totalScore, 0.01);
  assert.equal(sum3.negativeTotal, -0.99);
});

test('editing an earlier question updates mark without duplicating and undo restores prior value', () => {
  let session = createSession(DEFAULT_CONFIG, 1, 1000, 's-edit');
  session = recordQuestionMark(session, 'correct', 1, 1001);
  session = recordQuestionMark(session, 'wrong', 2, 1002);
  session = recordQuestionMark(session, 'skipped', 3, 1003);
  assert.equal(computeSessionSummary(session).totalScore, 0.75);

  // Reassign Q2 from wrong (-0.25) to correct (+1)
  session = recordQuestionMark(session, 'correct', 2, 1004);
  assert.equal(session.records[2].mark, 1);
  assert.equal(computeSessionSummary(session).totalScore, 2);
  assert.equal(computeSessionSummary(session).recordedCount, 3);

  // Undo restores Q2 back to wrong (-0.25)
  session = undoLastAction(session, 1005);
  assert.equal(session.records[2].outcome, 'wrong');
  assert.equal(session.records[2].mark, -0.25);
  assert.equal(computeSessionSummary(session).totalScore, 0.75);

  // Undo removes Q3 entirely
  session = undoLastAction(session, 1006);
  assert.equal(session.records[3], undefined);
  assert.equal(session.activeQuestion, 3);
  assert.equal(computeSessionSummary(session).recordedCount, 2);
});

test('clearQuestionMark removes target question and can be undone', () => {
  let session = createSession(DEFAULT_CONFIG, 1, 1000, 's-clear');
  session = recordQuestionMark(session, 'correct', 1, 1001);
  session = recordQuestionMark(session, 'wrong', 2, 1002);
  session = clearQuestionMark(session, 1, 1003);

  assert.equal(session.records[1], undefined);
  assert.equal(computeSessionSummary(session).totalScore, -0.25);

  session = undoLastAction(session, 1004);
  assert.equal(session.records[1]?.mark, 1);
  assert.equal(computeSessionSummary(session).totalScore, 0.75);
});

test('computeRunningLog tracks cumulative running total accurately', () => {
  let session = createSession(DEFAULT_CONFIG, 1, 1000, 's-log');
  session = recordQuestionMark(session, 'correct', 1, 1001);
  session = recordQuestionMark(session, 'wrong', 2, 1002);
  session = recordQuestionMark(session, 'skipped', 3, 1003);
  session = recordQuestionMark(session, 'wrong', 4, 1004);

  const log = computeRunningLog(session);
  assert.equal(log.length, 4);
  assert.deepEqual(
    log.map((r) => [r.questionNumber, r.mark, r.runningTotal]),
    [
      [1, 1, 1],
      [2, -0.25, 0.75],
      [3, 0, 0.75],
      [4, -0.25, 0.5],
    ]
  );

  const csv = generateSessionCsv(session);
  assert.ok(csv.includes('1,correct,1,1'));
  assert.ok(csv.includes('2,wrong,-0.25,0.75'));
});

test('applyConfigToSession recalculates existing marks and prunes out-of-range questions', () => {
  let session = createSession(DEFAULT_CONFIG, 1, 1000, 's-reconfig');
  session = recordQuestionMark(session, 'correct', 1, 1001);
  session = recordQuestionMark(session, 'wrong', 2, 1002);
  session = recordQuestionMark(session, 'correct', 60, 1003);

  const updated = applyConfigToSession(
    session,
    { positiveMark: 4, negativeMark: -1, totalQuestions: 50 },
    1004
  );

  assert.equal(updated.records[1].mark, 4);
  assert.equal(updated.records[2].mark, -1);
  assert.equal(updated.records[60], undefined);
  assert.equal(updated.activeQuestion <= 50, true);
  assert.equal(computeSessionSummary(updated).totalScore, 3);
});

test('validateConfigInputs rejects invalid values and normalizes valid ones', () => {
  const invalidPos = validateConfigInputs({
    positiveMark: '0',
    negativeMark: '-0.25',
    totalQuestions: '100',
  });
  assert.equal(invalidPos.valid, false);
  assert.ok(invalidPos.errors.positiveMark);

  const invalidTotal = validateConfigInputs({
    positiveMark: '1',
    negativeMark: '-0.25',
    totalQuestions: '12.5',
  });
  assert.equal(invalidTotal.valid, false);
  assert.ok(invalidTotal.errors.totalQuestions);

  // Positive magnitude in negative mark field normalizes cleanly to negative
  const normalizedNeg = validateConfigInputs({
    positiveMark: '2',
    negativeMark: '0.5',
    totalQuestions: '50',
  });
  assert.equal(normalizedNeg.valid, true);
  assert.deepEqual(normalizedNeg.config, {
    positiveMark: 2,
    negativeMark: -0.5,
    totalQuestions: 50,
  });

  // Zero negative mark stays clean 0 (no -0)
  const zeroNeg = validateConfigInputs({
    positiveMark: '1',
    negativeMark: '0',
    totalQuestions: '25',
  });
  assert.equal(zeroNeg.valid, true);
  assert.equal(zeroNeg.config?.negativeMark, 0);
  assert.equal(Object.is(zeroNeg.config?.negativeMark, -0), false);
});

test('resetSessionRecords clears marks and returns cursor to Q1', () => {
  let session = createSession(DEFAULT_CONFIG, 1, 1000, 's-reset');
  session = recordQuestionMark(session, 'correct', 1, 1001);
  session = recordQuestionMark(session, 'wrong', 2, 1002);

  const reset = resetSessionRecords(session, 1003);
  assert.equal(Object.keys(reset.records).length, 0);
  assert.equal(reset.activeQuestion, 1);
  assert.equal(reset.undoStack.length, 0);
  assert.equal(computeSessionSummary(reset).totalScore, 0);
});

test('formatSignedMark renders crisp signed strings', () => {
  assert.equal(formatSignedMark(1), '+1');
  assert.equal(formatSignedMark(-0.25), '−0.25');
  assert.equal(formatSignedMark(0), '0');
  assert.equal(formatSignedMark(-0), '0');
});

test('localStorage persistence saves, reloads, and recovers gracefully from corrupt data', () => {
  const storage = createMemoryStorage();
  const initial = createInitialState(1000);
  initial.config = { positiveMark: 4, negativeMark: -1, totalQuestions: 50 };
  initial.activeSession = recordQuestionMark(
    createSession(initial.config, 1, 1000, 'active-1'),
    'correct',
    1,
    1001
  );
  initial.history = [
    recordQuestionMark(createSession(DEFAULT_CONFIG, 1, 900, 'past-1'), 'wrong', 1, 901),
  ];

  const saveResult = savePersistedState(initial, storage);
  assert.equal(saveResult.ok, true);

  const loaded = loadPersistedState(storage, 2000);
  assert.equal(loaded.recoveredFromError, false);
  assert.deepEqual(loaded.state.config, { positiveMark: 4, negativeMark: -1, totalQuestions: 50 });
  assert.equal(loaded.state.activeSession.records[1]?.mark, 4);
  assert.equal(loaded.state.history.length, 1);
  assert.equal(loaded.state.history[0].records[1]?.mark, -0.25);

  // Corrupt JSON should never throw; recovers cleanly to defaults
  storage.setItem(STORAGE_KEY, '{broken json');
  const recovered = loadPersistedState(storage, 3000);
  assert.equal(recovered.recoveredFromError, true);
  assert.deepEqual(recovered.state.config, DEFAULT_CONFIG);
  assert.equal(recovered.state.activeSession.activeQuestion, 1);
});

test('generateSessionJson exports clean structured session data without undoStack', () => {
  let session = createSession(DEFAULT_CONFIG, 1, 1000, 's-json');
  session.name = 'Physics Mock';
  session = recordQuestionMark(session, 'correct', 1, 1001);
  session = recordQuestionMark(session, 'wrong', 2, 1002);
  session = recordQuestionMark(session, 'skipped', 3, 1003);

  const raw = generateSessionJson(session, 2000);
  const parsed = JSON.parse(raw);

  assert.equal(parsed.format, 'marksheet-session');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.session.name, 'Physics Mock');
  assert.equal(parsed.session.summary.totalScore, 0.75);
  assert.equal(parsed.session.records.length, 3);
  assert.equal(parsed.session.records[1].mark, -0.25);
  assert.equal(parsed.session.records[1].runningTotal, 0.75);
  assert.equal('undoStack' in parsed.session, false);
});

test('generateAllSessionsJson exports active recorded session plus archived history', () => {
  const archived = recordQuestionMark(
    createSession({ positiveMark: 4, negativeMark: -1, totalQuestions: 50 }, 1, 1000, 'arch-1'),
    'correct',
    1,
    1001
  );
  const activeRecorded = recordQuestionMark(
    createSession(DEFAULT_CONFIG, 2, 2000, 'act-2'),
    'wrong',
    1,
    2001
  );

  const allRaw = generateAllSessionsJson(activeRecorded, [archived], DEFAULT_CONFIG, 3000);
  const allParsed = JSON.parse(allRaw);
  assert.equal(allParsed.format, 'marksheet-export-all');
  assert.equal(allParsed.sessionCount, 2);
  assert.equal(allParsed.sessions[0].id, 'act-2');
  assert.equal(allParsed.sessions[0].status, 'active');
  assert.equal(allParsed.sessions[1].id, 'arch-1');
  assert.equal(allParsed.sessions[1].status, 'archived');
  assert.equal(allParsed.sessions[1].config.positiveMark, 4);

  // When active session is empty and history exists, omit empty active shell
  const activeEmpty = createSession(DEFAULT_CONFIG, 3, 4000, 'act-empty');
  const archivedOnly = JSON.parse(
    generateAllSessionsJson(activeEmpty, [archived], DEFAULT_CONFIG, 5000)
  );
  assert.equal(archivedOnly.sessionCount, 1);
  assert.equal(archivedOnly.sessions[0].id, 'arch-1');
});

test('theme persistence loads saved preference and falls back cleanly', () => {
  const storage = createMemoryStorage();
  assert.equal(loadStoredTheme(storage, false), 'light');
  assert.equal(loadStoredTheme(storage, true), 'dark');

  saveStoredTheme('dark', storage);
  assert.equal(loadStoredTheme(storage, false), 'dark');

  saveStoredTheme('light', storage);
  assert.equal(loadStoredTheme(storage, true), 'light');
});

test('prevents -0.0% scorePercent on small negative scores over large maxScore', () => {
  let session = createSession(
    { positiveMark: 1, negativeMark: -0.25, totalQuestions: 1000 },
    1,
    1000,
    's-neg-zero-pct'
  );
  session = recordQuestionMark(session, 'wrong', 1, 1001);
  const summary = computeSessionSummary(session);
  assert.equal(summary.totalScore, -0.25);
  assert.equal(summary.scorePercent, 0);
  assert.equal(Object.is(summary.scorePercent, -0), false);
  assert.equal(summary.scorePercent.toFixed(1), '0.0');
  assert.equal(calculateMaxScore({ positiveMark: 0.1, negativeMark: 0, totalQuestions: 3 }), 0.3);
});

test('validateConfigInputs blocks sub-0.0001 values, hex/scientific notation, and accepts Unicode minus', () => {
  const tooSmallPos = validateConfigInputs({
    positiveMark: '0.00001',
    negativeMark: '-0.25',
    totalQuestions: '100',
  });
  assert.equal(tooSmallPos.valid, false);
  assert.ok(tooSmallPos.errors.positiveMark);

  const tooSmallNeg = validateConfigInputs({
    positiveMark: '1',
    negativeMark: '-0.00001',
    totalQuestions: '100',
  });
  assert.equal(tooSmallNeg.valid, false);
  assert.ok(tooSmallNeg.errors.negativeMark);

  const hexInput = validateConfigInputs({
    positiveMark: '0x10',
    negativeMark: '0',
    totalQuestions: '100',
  });
  assert.equal(hexInput.valid, false);
  assert.ok(hexInput.errors.positiveMark);

  const sciInput = validateConfigInputs({
    positiveMark: '1e2',
    negativeMark: '0',
    totalQuestions: '100',
  });
  assert.equal(sciInput.valid, false);
  assert.ok(sciInput.errors.positiveMark);

  const unicodeMinus = validateConfigInputs({
    positiveMark: '1',
    negativeMark: '−0.25',
    totalQuestions: '100',
  });
  assert.equal(unicodeMinus.valid, true);
  assert.equal(unicodeMinus.config?.negativeMark, -0.25);

  assert.equal(formatNumber(0.0001), '0.0001');
});

test('guards against NaN/non-integer question numbers, reserved filenames, and out-of-range timestamps', () => {
  const base = createSession(DEFAULT_CONFIG, 1, 1000, 's-guard');
  assert.equal(recordQuestionMark(base, 'correct', Number.NaN), base);
  assert.equal(recordQuestionMark(base, 'correct', 1.5), base);
  assert.equal(clearQuestionMark(base, Number.NaN), base);

  assert.equal(slugifyFilename('CON'), 'session-con');
  assert.equal(slugifyFilename('nul'), 'session-nul');
  assert.equal(slugifyFilename('   '), 'exam-session');
  assert.ok(slugifyFilename('a'.repeat(120)).length <= 60);

  // Out-of-range timestamp never throws RangeError during JSON export
  const weirdTsSession = {
    ...recordQuestionMark(base, 'correct', 1, 1e20),
    createdAt: 1e20,
    updatedAt: -999999,
  };
  const json = generateSessionJson(weirdTsSession, 1e20);
  const parsed = JSON.parse(json);
  assert.equal(typeof parsed.exportedAt, 'string');
  assert.equal(typeof parsed.session.createdAt, 'string');

  let pruningSession = createSession(DEFAULT_CONFIG, 1, 1000, 's-prune');
  pruningSession = recordQuestionMark(pruningSession, 'correct', 10, 1001);
  pruningSession = recordQuestionMark(pruningSession, 'wrong', 60, 1002);
  pruningSession = recordQuestionMark(pruningSession, 'skipped', 85, 1003);
  assert.equal(countRecordsAboveLimit(pruningSession, 50), 2);
});

test('storage sanitization enforces record-config consistency, deduplicates IDs, and compacts undoStack on quota error', () => {
  const storage = createMemoryStorage();
  const tampered = {
    version: 1,
    sessionCounter: 2,
    config: { positiveMark: 0.00001, negativeMark: -0.25, totalQuestions: 50 },
    activeSession: {
      id: 'same-id',
      name: 'Active',
      createdAt: 1e20,
      updatedAt: 1000,
      config: { positiveMark: 2, negativeMark: -0.5, totalQuestions: 50 },
      records: {
        1: { questionNumber: 1, outcome: 'skipped', mark: 9999, recordedAt: 1e20 },
        2: { questionNumber: 2, outcome: 'wrong', mark: 100, recordedAt: 1000 },
      },
      activeQuestion: 3,
      undoStack: [],
    },
    history: [
      // Duplicate of activeSession.id should be excluded
      {
        id: 'same-id',
        name: 'Duplicate Active',
        createdAt: 1000,
        updatedAt: 1000,
        config: DEFAULT_CONFIG,
        records: {},
        activeQuestion: 1,
        undoStack: [],
      },
      {
        id: 'hist-1',
        name: 'Archived 1',
        createdAt: 1000,
        updatedAt: 1000,
        config: DEFAULT_CONFIG,
        records: {},
        activeQuestion: 1,
        undoStack: [],
      },
      // Duplicate history ID should be excluded
      {
        id: 'hist-1',
        name: 'Archived 1 Copy',
        createdAt: 1000,
        updatedAt: 1000,
        config: DEFAULT_CONFIG,
        records: {},
        activeQuestion: 1,
        undoStack: [],
      },
    ],
  };

  storage.setItem(STORAGE_KEY, JSON.stringify(tampered));
  const loaded = loadPersistedState(storage, 5000);

  // Sub-0.0001 positive mark falls back to default 1 instead of 0
  assert.equal(loaded.state.config.positiveMark, 1);
  // Tampered marks re-derived from session config
  assert.equal(loaded.state.activeSession.records[1]?.mark, 0);
  assert.equal(loaded.state.activeSession.records[2]?.mark, -0.5);
  // Out-of-range createdAt sanitized cleanly to valid timestamp
  assert.equal(loaded.state.activeSession.createdAt, 5000);
  // Duplicate IDs stripped
  assert.equal(loaded.state.history.length, 1);
  assert.equal(loaded.state.history[0].id, 'hist-1');

  // Quota fallback strips archived undoStack and retries once
  const stateWithUndo = createInitialState(1000);
  const histSession = recordQuestionMark(createSession(DEFAULT_CONFIG, 1, 1000, 'h-undo'), 'correct', 1, 1001);
  stateWithUndo.history = [histSession];
  let writeAttempts = 0;
  const quotaStorage: StorageLike = {
    getItem: () => null,
    removeItem: () => {},
    setItem: (_k, val) => {
      writeAttempts += 1;
      if (writeAttempts === 1) {
        throw new Error('QuotaExceededError');
      }
      const saved = JSON.parse(val);
      assert.equal(saved.history[0].undoStack.length, 0);
    },
  };
  const saveRes = savePersistedState(stateWithUndo, quotaStorage);
  assert.equal(saveRes.ok, true);
  assert.equal(writeAttempts, 2);
});

