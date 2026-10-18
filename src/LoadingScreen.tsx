export function LoadingScreen() {
  return <main className="boot-screen" aria-label="GetYourFit">
    <span className="brand-mark" aria-hidden="true">g.</span>
    <p className="boot-status" role="status"><span className="spinner" aria-hidden="true" />Opening your account…</p>
  </main>;
}
