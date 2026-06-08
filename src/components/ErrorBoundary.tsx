import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">{this.props.fallbackTitle ?? "Something went wrong"}</h1>
          <p className="auth-subtitle">
            The app hit an unexpected error. Reload to try again.
          </p>
          <button type="button" className="auth-submit" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
