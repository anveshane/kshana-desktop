import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RendererErrorBoundary] Unhandled render error:', error, {
      componentStack: info.componentStack,
    });
  }

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (!error) {
      return children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          padding: 24,
          background: '#111418',
          color: '#f4f6f8',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Renderer startup error</h1>
        <p style={{ color: '#aeb7c2' }}>
          The app hit a render error. Check the console for the component stack.
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            padding: 16,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
          }}
        >
          {error.message}
        </pre>
      </div>
    );
  }
}
