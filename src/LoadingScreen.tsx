export function LoadingScreen({ message = 'Opening your account…' }: { message?: string }) {
  return <main className="boot-screen" aria-label="GetYourFit">
    <span className="brand-mark" aria-hidden="true">g.</span>
    <p className="boot-status" role="status"><span className="spinner" aria-hidden="true" />{message}</p>
  </main>;
}
