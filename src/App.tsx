import { useCallback, useEffect, useState } from 'react';
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
import { loadPersistedState, savePersistedState } from './utils/storage';

export default function App() {
  const [initialLoad] = useState(() => loadPersistedState());
  const [state, setState] = useState<PersistedState>(initialLoad.state);
  const [activeTab, setActiveTab] = useState<ActiveTab>('calculator');
  const [storageError, setStorageError] = useState<string | null>(
    initialLoad.recoveredFromError
      ? 'Previous saved data was unreadable and has been reset to defaults.'
      : null
  );

  // Persist every state change automatically to localStorage
  useEffect(() => {
    const result = savePersistedState(state);
    if (!result.ok && result.error) {
      setStorageError(result.error);
    } else if (result.ok && storageError && !initialLoad.recoveredFromError) {
      setStorageError(null);
    }
  }, [state, storageError, initialLoad.recoveredFromError]);

  const handleRecordOutcome = useCallback((outcome: QuestionOutcome) => {
    setState((prev) => ({
      ...prev,
      activeSession: recordQuestionMark(prev.activeSession, outcome),
    }));
  }, []);

  const handleSelectQuestion = useCallback((questionNumber: number) => {
    setState((prev) => {
      const clamped = Math.min(
        prev.activeSession.config.totalQuestions,
        Math.max(1, questionNumber)
      );
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
    setState((prev) => ({
      ...prev,
      activeSession: {
        ...prev.activeSession,
        name,
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

      const remainingHistory = prev.history.filter((s) => s.id !== sessionId);
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

  const activeSummary = computeSessionSummary(state.activeSession);

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#0F172A]">
      <TopBar
        activeTab={activeTab}
        historyCount={state.history.length}
        onSelectTab={setActiveTab}
        onStartNewSession={handleStartNewSession}
      />

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {storageError && (
          <div
            role="alert"
            className="mb-5 px-4 py-3 bg-[#FFF1F2] border border-[#FECDD3] rounded-lg flex items-center justify-between gap-4 text-sm text-[#9F1239]"
          >
            <span>{storageError}</span>
            <button
              type="button"
              onClick={() => setStorageError(null)}
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
            onResumeSession={handleResumeSession}
            onDeleteSession={handleDeleteSession}
            onClearAllHistory={handleClearAllHistory}
            onGoToCalculator={() => setActiveTab('calculator')}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            config={state.config}
            activeSessionHasRecords={activeSummary.recordedCount > 0}
            activeSessionRecordedCount={activeSummary.recordedCount}
            onSaveConfig={handleSaveConfig}
          />
        )}
      </main>
    </div>
  );
}
