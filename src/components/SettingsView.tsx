import { useEffect, useState, type FormEvent } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import type { ExamSession, ScoringConfig } from '../types/exam';
import {
  calculateMaxScore,
  countRecordsAboveLimit,
  DEFAULT_CONFIG,
  formatNumber,
  formatSignedMark,
  validateConfigInputs,
} from '../utils/scoring';
import type { ThemeMode } from '../utils/theme';

interface SettingsViewProps {
  config: ScoringConfig;
  theme: ThemeMode;
  activeSession: ExamSession;
  activeSessionHasRecords: boolean;
  activeSessionRecordedCount: number;
  onSaveConfig: (nextConfig: ScoringConfig, applyToActive: boolean) => void;
  onSelectTheme: (theme: ThemeMode) => void;
}

interface ConfigPreset {
  label: string;
  config: ScoringConfig;
}

const PRESETS: ConfigPreset[] = [
  { label: 'Default (+1 / −0.25 · 100 Qs)', config: { positiveMark: 1, negativeMark: -0.25, totalQuestions: 100 } },
  { label: 'JEE / NEET (+4 / −1 · 90 Qs)', config: { positiveMark: 4, negativeMark: -1, totalQuestions: 90 } },
  { label: 'No Penalty (+1 / 0 · 50 Qs)', config: { positiveMark: 1, negativeMark: 0, totalQuestions: 50 } },
  { label: 'UPSC (+2 / −0.66 · 100 Qs)', config: { positiveMark: 2, negativeMark: -0.66, totalQuestions: 100 } },
];

export function SettingsView({
  config,
  theme,
  activeSession,
  activeSessionHasRecords,
  activeSessionRecordedCount,
  onSaveConfig,
  onSelectTheme,
}: SettingsViewProps) {
  const [positiveMark, setPositiveMark] = useState(String(config.positiveMark));
  const [negativeMark, setNegativeMark] = useState(String(config.negativeMark));
  const [totalQuestions, setTotalQuestions] = useState(String(config.totalQuestions));
  const [applyToActive, setApplyToActive] = useState(!activeSessionHasRecords);
  const [errors, setErrors] = useState<{
    positiveMark?: string;
    negativeMark?: string;
    totalQuestions?: string;
  }>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    setPositiveMark(String(config.positiveMark));
    setNegativeMark(String(config.negativeMark));
    setTotalQuestions(String(config.totalQuestions));
  }, [config.positiveMark, config.negativeMark, config.totalQuestions]);

  useEffect(() => {
    if (!activeSessionHasRecords) {
      setApplyToActive(true);
    }
  }, [activeSessionHasRecords]);

  function handlePreset(preset: ScoringConfig) {
    setPositiveMark(String(preset.positiveMark));
    setNegativeMark(String(preset.negativeMark));
    setTotalQuestions(String(preset.totalQuestions));
    setErrors({});
    setSavedNotice(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateConfigInputs({
      positiveMark,
      negativeMark,
      totalQuestions,
    });

    if (!validation.valid || !validation.config) {
      setErrors(validation.errors);
      setSavedNotice(null);
      return;
    }

    setErrors({});
    // Sync normalized inputs back into fields (e.g. "0.25" -> "-0.25")
    setPositiveMark(String(validation.config.positiveMark));
    setNegativeMark(String(validation.config.negativeMark));
    setTotalQuestions(String(validation.config.totalQuestions));

    const shouldApplyToActive = !activeSessionHasRecords || applyToActive;
    onSaveConfig(validation.config, shouldApplyToActive);
    setSavedNotice(
      shouldApplyToActive
        ? 'Settings saved to localStorage and applied to the current session.'
        : 'Settings saved to localStorage for future sessions.'
    );
  }

  function handleRestoreDefaults() {
    setPositiveMark(String(DEFAULT_CONFIG.positiveMark));
    setNegativeMark(String(DEFAULT_CONFIG.negativeMark));
    setTotalQuestions(String(DEFAULT_CONFIG.totalQuestions));
    setErrors({});
    const shouldApplyToActive = !activeSessionHasRecords || applyToActive;
    onSaveConfig({ ...DEFAULT_CONFIG }, shouldApplyToActive);
    setSavedNotice(
      shouldApplyToActive
        ? 'Default settings restored (+1, −0.25, 100 questions) and applied to the current session.'
        : 'Default settings restored (+1, −0.25, 100 questions) for future sessions.'
    );
  }

  const previewValidation = validateConfigInputs({
    positiveMark,
    negativeMark,
    totalQuestions,
  });

  const recordsToPrune =
    activeSessionHasRecords &&
    applyToActive &&
    previewValidation.valid &&
    previewValidation.config
      ? countRecordsAboveLimit(activeSession, previewValidation.config.totalQuestions)
      : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <section className="bg-white dark:bg-[#1C1C1E] border border-[#E2E6EC] dark:border-[#2E2E32] rounded-xl p-5 sm:p-7">
        <div className="pb-5 border-b border-[#E2E6EC] dark:border-[#2E2E32]">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F172A] dark:text-[#F2F2F4]">
            Scoring Configuration
          </h1>
          <p className="text-sm text-[#5B6576] dark:text-[#9E9EA6] mt-1">
            Configure positive marks, negative deductions, and total question count. Saved automatically in localStorage.
          </p>
        </div>

        {/* Presets */}
        <div className="py-5 border-b border-[#E2E6EC] dark:border-[#2E2E32]">
          <p className="text-xs font-medium text-[#5B6576] dark:text-[#9E9EA6] mb-2.5">
            Quick Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset.config)}
                className="px-3 py-1.5 text-xs font-medium text-[#334155] dark:text-[#D4D4D8] bg-[#F8FAFC] dark:bg-[#242427] hover:bg-[#F1F5F9] dark:hover:bg-[#2E2E32] border border-[#E2E6EC] dark:border-[#323236] rounded-lg transition-colors whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="config-positive"
                className="block text-sm font-medium text-[#0F172A] dark:text-[#F2F2F4] mb-1.5"
              >
                Positive Mark
              </label>
              <input
                id="config-positive"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={positiveMark}
                onChange={(e) => {
                  setPositiveMark(e.target.value);
                  setSavedNotice(null);
                }}
                aria-invalid={Boolean(errors.positiveMark)}
                aria-describedby={errors.positiveMark ? 'error-positive' : 'hint-positive'}
                className={`w-full px-3 py-2 font-mono text-sm tabular-nums bg-white dark:bg-[#242427] text-[#0F172A] dark:text-[#F2F2F4] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] dark:focus:ring-[#A1A1AA] ${
                  errors.positiveMark
                    ? 'border-[#BE123C] dark:border-[#FB7185]'
                    : 'border-[#CBD5E1] dark:border-[#3A3A40]'
                }`}
              />
              {errors.positiveMark ? (
                <p id="error-positive" className="text-xs text-[#BE123C] dark:text-[#FB7185] mt-1">
                  {errors.positiveMark}
                </p>
              ) : (
                <p id="hint-positive" className="text-xs text-[#64748B] dark:text-[#8E8E96] mt-1">
                  Added for each correct answer
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="config-negative"
                className="block text-sm font-medium text-[#0F172A] dark:text-[#F2F2F4] mb-1.5"
              >
                Negative Mark
              </label>
              <input
                id="config-negative"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={negativeMark}
                onChange={(e) => {
                  setNegativeMark(e.target.value);
                  setSavedNotice(null);
                }}
                aria-invalid={Boolean(errors.negativeMark)}
                aria-describedby={errors.negativeMark ? 'error-negative' : 'hint-negative'}
                className={`w-full px-3 py-2 font-mono text-sm tabular-nums bg-white dark:bg-[#242427] text-[#0F172A] dark:text-[#F2F2F4] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] dark:focus:ring-[#A1A1AA] ${
                  errors.negativeMark
                    ? 'border-[#BE123C] dark:border-[#FB7185]'
                    : 'border-[#CBD5E1] dark:border-[#3A3A40]'
                }`}
              />
              {errors.negativeMark ? (
                <p id="error-negative" className="text-xs text-[#BE123C] dark:text-[#FB7185] mt-1">
                  {errors.negativeMark}
                </p>
              ) : (
                <p id="hint-negative" className="text-xs text-[#64748B] dark:text-[#8E8E96] mt-1">
                  Deducted on wrong (e.g. -0.25 or 0)
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="config-total"
                className="block text-sm font-medium text-[#0F172A] dark:text-[#F2F2F4] mb-1.5"
              >
                Total Questions
              </label>
              <input
                id="config-total"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={totalQuestions}
                onChange={(e) => {
                  setTotalQuestions(e.target.value);
                  setSavedNotice(null);
                }}
                aria-invalid={Boolean(errors.totalQuestions)}
                aria-describedby={errors.totalQuestions ? 'error-total' : 'hint-total'}
                className={`w-full px-3 py-2 font-mono text-sm tabular-nums bg-white dark:bg-[#242427] text-[#0F172A] dark:text-[#F2F2F4] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] dark:focus:ring-[#A1A1AA] ${
                  errors.totalQuestions
                    ? 'border-[#BE123C] dark:border-[#FB7185]'
                    : 'border-[#CBD5E1] dark:border-[#3A3A40]'
                }`}
              />
              {errors.totalQuestions ? (
                <p id="error-total" className="text-xs text-[#BE123C] dark:text-[#FB7185] mt-1">
                  {errors.totalQuestions}
                </p>
              ) : (
                <p id="hint-total" className="text-xs text-[#64748B] dark:text-[#8E8E96] mt-1">
                  Whole number (1 to 1000)
                </p>
              )}
            </div>
          </div>

          {/* Live Rule Preview */}
          {previewValidation.valid && previewValidation.config && (
            <div className="px-4 py-3 bg-[#F8FAFC] dark:bg-[#242427] border border-[#E2E6EC] dark:border-[#323236] rounded-lg text-xs text-[#334155] dark:text-[#D4D4D8] flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums">
              <span>
                Add:{' '}
                <strong className="text-[#047857] dark:text-[#34D399]">
                  {formatSignedMark(previewValidation.config.positiveMark)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Subtract:{' '}
                <strong className="text-[#BE123C] dark:text-[#FB7185]">
                  {formatSignedMark(previewValidation.config.negativeMark)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Skip: <strong className="text-[#0F172A] dark:text-[#F2F2F4]">0</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Max score:{' '}
                <strong className="text-[#0F172A] dark:text-[#F2F2F4]">
                  {formatNumber(calculateMaxScore(previewValidation.config))}
                </strong>
              </span>
            </div>
          )}

          {/* Active Session Application Option */}
          {activeSessionHasRecords && (
            <div className="space-y-2.5">
              <label className="flex items-start gap-2.5 text-sm text-[#334155] dark:text-[#D4D4D8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToActive}
                  onChange={(e) => setApplyToActive(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#CBD5E1] dark:border-[#52525B] accent-[#1D4ED8] dark:accent-[#F2F2F4]"
                />
                <span>
                  Apply to current active session ({activeSessionRecordedCount} recorded questions)
                  <span className="block text-xs text-[#64748B] dark:text-[#8E8E96] mt-0.5">
                    Recalculates marks for existing answers using the new values. Archived history sessions are never altered.
                  </span>
                </span>
              </label>

              {recordsToPrune > 0 && previewValidation.config && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 text-xs text-[#9F1239] dark:text-[#FDA4AF] bg-[#FFF1F2] dark:bg-[#2A1519] border border-[#FECDD3] dark:border-[#5C2530] rounded-lg"
                >
                  Warning: Lowering total questions to {previewValidation.config.totalQuestions}{' '}
                  will permanently remove {recordsToPrune} recorded{' '}
                  {recordsToPrune === 1 ? 'question' : 'questions'} numbered above Q
                  {previewValidation.config.totalQuestions} from your active session.
                </div>
              )}
            </div>
          )}

          {savedNotice && (
            <div
              role="status"
              className="flex items-center gap-2 text-sm text-[#047857] dark:text-[#6EE7B7] bg-[#ECFDF5] dark:bg-[#13261E] border border-[#A7F3D0] dark:border-[#214B3A] rounded-lg px-3.5 py-2.5"
            >
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{savedNotice}</span>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white dark:text-[#141415] bg-[#1D4ED8] dark:bg-[#F2F2F4] hover:bg-[#1E40AF] dark:hover:bg-[#E4E4E7] active:scale-[0.99] rounded-lg transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#A1A1AA] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1C1C1E]"
            >
              Save Settings
            </button>

            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="px-4 py-2 text-sm font-medium text-[#475569] dark:text-[#D4D4D8] hover:text-[#0F172A] dark:hover:text-[#F2F2F4] bg-[#F8FAFC] dark:bg-[#242427] hover:bg-[#F1F5F9] dark:hover:bg-[#2E2E32] border border-[#E2E6EC] dark:border-[#323236] rounded-lg transition-colors whitespace-nowrap"
            >
              Restore Defaults
            </button>
          </div>
        </form>
      </section>

      {/* Appearance Section */}
      <section className="bg-white dark:bg-[#1C1C1E] border border-[#E2E6EC] dark:border-[#2E2E32] rounded-xl p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-[#F2F2F4]">
              Appearance
            </h2>
            <p className="text-sm text-[#5B6576] dark:text-[#9E9EA6] mt-0.5">
              Choose between light paper and neutral dark graphite gray.
            </p>
          </div>

          <div
            role="group"
            aria-label="Theme preference"
            className="inline-flex items-center p-1 bg-[#F1F5F9] dark:bg-[#242427] rounded-lg shrink-0"
          >
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => onSelectTheme('light')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                theme === 'light'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#5B6576] dark:text-[#9E9EA6] hover:text-[#0F172A] dark:hover:text-[#F2F2F4]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Light</span>
            </button>
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => onSelectTheme('dark')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-[#323236] text-[#F2F2F4] shadow-xs'
                  : 'text-[#5B6576] dark:text-[#9E9EA6] hover:text-[#0F172A] dark:hover:text-[#F2F2F4]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dark Graphite</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
