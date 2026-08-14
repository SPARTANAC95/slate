import { Component, type ReactNode } from 'react';
import { exportToFile } from '../db/transfer';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * A render crash used to mean a white screen with no way back — and if the
 * cause was a bad row in IndexedDB it recurred on every reload. This keeps
 * the data reachable so it can always be exported and repaired.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[slate]', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="panel-lit w-[460px] rounded-xl border border-line bg-panel p-4">
          <div className="section-label mb-2">something broke</div>
          <p className="text-13 text-text-2">
            slate could not draw this screen. your data is still on disk and can be exported.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-line p-2 font-mono text-11 text-text-3">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => exportToFile()}
              className="rounded-lg border border-line-strong bg-panel-hover px-3 py-1 text-12 text-text transition-colors duration-150 hover:bg-panel"
            >
              Export data
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-line px-3 py-1 text-12 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
