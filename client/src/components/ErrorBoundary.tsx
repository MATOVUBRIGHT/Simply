import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** If true, shows a compact inline error instead of full-screen */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Silent in production — no raw crash dumps to console
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error.message, errorInfo.componentStack?.slice(0, 300));
    }
  }

  private reset = () => this.setState({ hasError: false, error: null });

  public render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    // Inline compact error (for page-level boundaries)
    if (this.props.inline) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <p className="text-slate-700 dark:text-slate-200 font-medium mb-1">Something went wrong</p>
          <p className="text-sm text-slate-400 mb-4">
            {import.meta.env.DEV ? this.state.error?.message : 'An unexpected error occurred'}
          </p>
          <button onClick={this.reset} className="btn btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      );
    }

    // Full-screen error (app-level boundary)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-sm w-full bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={26} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Something went wrong</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {import.meta.env.DEV
              ? this.state.error?.message
              : 'The app ran into a problem. Reload to continue.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { this.reset(); window.location.href = '/'; }}
              className="flex-1 btn btn-secondary flex items-center justify-center gap-2 text-sm"
            >
              <Home size={14} /> Home
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 btn btn-primary flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCw size={14} /> Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
