import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, info.componentStack);
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'react_render',
          message: error?.message || String(error),
          stack: error?.stack || null,
          componentStack: info?.componentStack || null,
          component: this.props.name || 'unknown',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => { /* fire-and-forget */ });
    } catch { /* fire-and-forget */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-entity-drug/30 bg-entity-drug/5 p-6 m-4">
          <p className="text-entity-drug font-mono text-sm mb-2">
            Module failed to render: {this.props.name || 'unknown'}
          </p>
          <p className="text-sap-dim text-xs mb-3">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs font-mono text-sap-accent hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
