import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getBrowserStorage, STORAGE_KEY } from '../utils/storage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Marksheet encountered an unexpected rendering error:', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleResetAndReload = (): void => {
    try {
      const storage = getBrowserStorage();
      storage?.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage removal errors
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F6F7F9] dark:bg-[#141415] text-[#0F172A] dark:text-[#F2F2F4]">
        <div
          role="alert"
          className="w-full max-w-md bg-white dark:bg-[#1C1C1E] border border-[#E2E6EC] dark:border-[#2E2E32] rounded-xl p-6 space-y-4"
        >
          <h1 className="font-display text-lg font-bold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-[#5B6576] dark:text-[#9E9EA6]">
            Marksheet encountered an unexpected error. Your saved sessions in browser storage are
            usually intact — reload to try again, or reset saved data if the issue persists.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 text-sm font-medium text-white dark:text-[#141415] bg-[#1D4ED8] dark:bg-[#F2F2F4] hover:bg-[#1E40AF] dark:hover:bg-[#E4E4E7] rounded-lg transition-colors"
            >
              Reload App
            </button>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              className="px-4 py-2 text-sm font-medium text-[#BE123C] dark:text-[#FB7185] bg-[#FFF1F2] dark:bg-[#2A1519] hover:bg-[#FFE4E6] dark:hover:bg-[#381B21] border border-[#FECDD3] dark:border-[#5C2530] rounded-lg transition-colors"
            >
              Reset Saved Data
            </button>
          </div>
        </div>
      </div>
    );
  }
}
