import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100vh',
              padding: 24,
              textAlign: 'center',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              background: '#1a1a2e',
              color: '#eaeaea',
            }}
          >
            <h2 style={{ marginBottom: 12, color: '#e94560' }}>Something went wrong</h2>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px',
                background: '#e94560',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
