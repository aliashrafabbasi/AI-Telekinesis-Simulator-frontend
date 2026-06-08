export function AuthLoadingShell({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="auth-shell">
      <div className="auth-card auth-card--loading">
        <div className="auth-spinner" />
        <p className="auth-loading-text">{message}</p>
      </div>
    </div>
  );
}
