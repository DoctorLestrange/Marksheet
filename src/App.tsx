import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalculatorView } from './components/CalculatorView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { TopBar, type ActiveTab } from './components/TopBar';
import type { PersistedState, QuestionOutcome, ScoringConfig } from './types/exam';
import {
  applyConfigToSession,
  clearQuestionMark,
  computeSessionSummary,
  createSession,
  recordQuestionMark,
  resetSessionRecords,
  undoLastAction,
} from './utils/scoring';
import { loadPersistedState, savePersistedState, STORAGE_KEY } from './utils/storage';
import {
  applyThemeToDocument,
  loadStoredTheme,
  saveStoredTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './utils/theme';

export default function App() {
  const [initialLoad] = useState(() => loadPersistedState());
  const [state, setState] = useState<PersistedState>(initialLoad.state);
  const [theme, setTheme] = useState<ThemeMode>(() => loadStoredTheme());
  const [activeTab, setActiveTab] = useState<ActiveTab>('calculator');
  const [storageError, setStorageError] = useState<string | null>(
    initialLoad.recoveredFromError
      ? 'Previous saved data was unreadable and has been reset to defaults.'
      : null
  );

  const isRecoveryNoticeRef = useRef(initialLoad.recoveredFromError);
  const skipNextSaveRef = useRef(false);
  const skipNextThemeSaveRef = useRef(false);

  // Sync theme class and localStorage preference
  useEffect(() => {
    applyThemeToDocument(theme);
    if (skipNextThemeSaveRef.current) {
      skipNextThemeSaveRef.current = false;
      return;
    }
    saveStoredTheme(theme);
  }, [theme]);

  // Persist every state change automatically to localStorage (never re-runs on dismiss)
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const result = savePersistedState(state);
    if (!result.ok && result.error) {
      isRecoveryNoticeRef.current = false;
      setStorageError(result.error);
    } else if (result.ok && !isRecoveryNoticeRef.current) {
      setStorageError(null);
    }
  }, [state]);

  // Keep state and theme synchronized across multiple browser tabs
  useEffect(() => {
    function handleStorageEvent(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const reloaded = loadPersistedState();
        skipNextSaveRef.current = true;
        setState(reloaded.state);
        if (reloaded.recoveredFromError) {
          isRecoveryNoticeRef.current = true;
          setStorageError('Saved data from another tab was unreadable and has been reset.');
        }
      } else if (event.key === THEME_STORAGE_KEY) {
        const syncedTheme = loadStoredTheme();
        skipNextThemeSaveRef.current = true;
        setTheme(syncedTheme);
      }
    }

    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  const handleDismissStorageError = useCallback(() => {
    isRecoveryNoticeRef.current = false;
    setStorageError(null);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleRecordOutcome = useCallback((outcome: QuestionOutcome) => {
    setState((prev) => ({
      ...prev,
      activeSession: recordQuestionMark(prev.activeSession, outcome),
    }));
  }, []);

  const handleSelectQuestion = useCallback((questionNumber: number) => {
    if (!Number.isFinite(questionNumber)) return;
    setState((prev) => {
      const clamped = Math.min(
        prev.activeSession.config.totalQuestions,
        Math.max(1, Math.round(questionNumber))
      );
      if (clamped === prev.activeSession.activeQuestion) return prev;
      return {
        ...prev,
        activeSession: {
          ...prev.activeSession,
          activeQuestion: clamped,
        },
      };
    });
  }, []);

  const handleClearQuestion = useCallback((questionNumber: number) => {
    setState((prev) => ({
      ...prev,
      activeSession: clearQuestionMark(prev.activeSession, questionNumber),
    }));
  }, []);

  const handleUndo = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeSession: undoLastAction(prev.activeSession),
    }));
  }, []);

  const handleResetSession = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeSession: resetSessionRecords(prev.activeSession),
    }));
  }, []);

  const handleRenameSession = useCallback((name: string) => {
    const trimmedMax = name.slice(0, 80);
    setState((prev) => ({
      ...prev,
      activeSession: {
        ...prev.activeSession,
        name: trimmedMax,
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const handleStartNewSession = useCallback(() => {
    setState((prev) => {
      const currentSummary = computeSessionSummary(prev.activeSession);
      const hasRecords = currentSummary.recordedCount > 0;

      // Archive current session if it has recorded marks (replace existing entry if resumed)
      let nextHistory = prev.history;
      if (hasRecords) {
        const cleanedSession = {
          ...prev.activeSession,
          name: prev.activeSession.name.trim() || `Session ${prev.sessionCounter}`,
          updatedAt: Date.now(),
        };
        const filtered = prev.history.filter((s) => s.id !== cleanedSession.id);
        nextHistory = [cleanedSession, ...filtered];
      }

      const nextCounter = hasRecords ? prev.sessionCounter + 1 : prev.sessionCounter;
      const freshSession = createSession(prev.config, nextCounter);

      return {
        ...prev,
        sessionCounter: nextCounter,
        activeSession: freshSession,
        history: nextHistory,
      };
    });
    setActiveTab('calculator');
  }, []);

  const handleResumeSession = useCallback((sessionId: string) => {
    setState((prev) => {
      const target = prev.history.find((s) => s.id === sessionId);
      if (!target) return prev;

      const remainingHistory = prev.history.filter(
        (s) => s.id !== sessionId && s.id !== prev.activeSession.id
      );
      const activeHasRecords = computeSessionSummary(prev.activeSession).recordedCount > 0;

      const nextHistory = activeHasRecords
        ? [
            {
              ...prev.activeSession,
              name: prev.activeSession.name.trim() || `Session ${prev.sessionCounter}`,
              updatedAt: Date.now(),
            },
            ...remainingHistory,
          ]
        : remainingHistory;

      return {
        ...prev,
        activeSession: {
          ...target,
          updatedAt: Date.now(),
        },
        history: nextHistory,
      };
    });
    setActiveTab('calculator');
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setState((prev) => ({
      ...prev,
      history: prev.history.filter((s) => s.id !== sessionId),
    }));
  }, []);

  const handleClearAllHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      history: [],
    }));
  }, []);

  const handleSaveConfig = useCallback(
    (nextConfig: ScoringConfig, applyToActive: boolean) => {
      setState((prev) => ({
        ...prev,
        config: nextConfig,
        activeSession: applyToActive
          ? applyConfigToSession(prev.activeSession, nextConfig)
          : prev.activeSession,
      }));
    },
    []
  );

  const activeSummary = useMemo(
    () => computeSessionSummary(state.activeSession),
    [state.activeSession]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] dark:bg-[#141415] text-[#0F172A] dark:text-[#F2F2F4]">
      <TopBar
        activeTab={activeTab}
        historyCount={state.history.length}
        theme={theme}
        onSelectTab={setActiveTab}
        onToggleTheme={handleToggleTheme}
        onStartNewSession={handleStartNewSession}
      />

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {storageError && (
          <div
            role="alert"
            className="mb-5 px-4 py-3 bg-[#FFF1F2] dark:bg-[#2A1519] border border-[#FECDD3] dark:border-[#5C2530] rounded-lg flex items-center justify-between gap-4 text-sm text-[#9F1239] dark:text-[#FDA4AF]"
          >
            <span>{storageError}</span>
            <button
              type="button"
              onClick={handleDismissStorageError}
              className="text-xs font-medium underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'calculator' && (
          <CalculatorView
            session={state.activeSession}
            onRecordOutcome={handleRecordOutcome}
            onSelectQuestion={handleSelectQuestion}
            onClearQuestion={handleClearQuestion}
            onUndo={handleUndo}
            onResetSession={handleResetSession}
            onRenameSession={handleRenameSession}
            onSaveAndNewSession={handleStartNewSession}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            history={state.history}
            activeSession={state.activeSession}
            defaultConfig={state.config}
            onResumeSession={handleResumeSession}
            onDeleteSession={handleDeleteSession}
            onClearAllHistory={handleClearAllHistory}
            onGoToCalculator={() => setActiveTab('calculator')}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            config={state.config}
            theme={theme}
            activeSession={state.activeSession}
            activeSessionHasRecords={activeSummary.recordedCount > 0}
            activeSessionRecordedCount={activeSummary.recordedCount}
            onSaveConfig={handleSaveConfig}
            onSelectTheme={setTheme}
          />
        )}
      </main>
    </div>
  );
}
