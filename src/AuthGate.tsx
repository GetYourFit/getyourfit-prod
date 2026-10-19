import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Brand, Field, Notice } from './ui';

type Mode = 'sign-in' | 'sign-up' | 'forgot';
function authTitle(mode: Mode, needsCode: boolean) {
  return mode === 'sign-up' ? 'Create your account' : mode === 'forgot' ? 'Forgot your password?' : needsCode ? 'Enter your code' : 'Sign in';
}
async function authRequest(path: string, body: Record<string, string | boolean>) {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? { name: cause.name, message: cause.message, cause: cause.cause instanceof Error ? cause.cause.message : cause.cause } : { cause: String(cause) };
    console.error('GetYourFit auth request transport failed', { url: `/api/auth/${path}`, method: 'POST', ...detail });
    throw new Error('We could not connect to GetYourFit. Check your connection and try again.');
  }
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof result === 'object' && result !== null && 'code' in result && typeof result.code === 'string' ? result.code : '';
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string' ? result.message : '';
    console.error(`GetYourFit auth request rejected ${JSON.stringify({ url: `/api/auth/${path}`, method: 'POST', status: response.status, code, message, origin: window.location.origin })}`);
    if (response.status >= 500) throw new Error('GetYourFit is temporarily unavailable. Try again in a moment.');
    if (path === 'sign-in/email') throw new Error('We could not sign you in. Check your email and password, then try again.');
    if (path === 'sign-up/email' && ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'].includes(code)) throw new Error('Use a password between 12 and 1024 characters.');
    if (path === 'sign-up/email') throw new Error('We could not create the account. If you may already have one, try signing in.');
    if (path === 'two-factor/verify-totp') throw new Error('That code is incorrect or expired. Check your authenticator and try again.');
    throw new Error('We could not complete that request. Check your details and try again.');
  }
  if (typeof result !== 'object' || result === null) return {};
  return result;
}

export function AuthGate({ onSignedIn, initialError = '' }: { onSignedIn: () => Promise<void>; initialError?: string }) {
  const [mode, setMode] = useState<Mode>(window.location.pathname === '/sign-up' ? 'sign-up' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [adult, setAdult] = useState(false);
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [ageMissing, setAgeMissing] = useState(false);

  useEffect(() => { document.title = `${authTitle(mode, needsCode)} · GetYourFit`; }, [mode, needsCode]);
  useEffect(() => { formRef.current?.querySelector<HTMLInputElement>('input')?.focus(); }, [mode, needsCode]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function retryService() {
    setBusy(true);
    try {
      await onSignedIn();
      setError('');
    } catch {
      setError('We could not connect to GetYourFit. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        if (!adult) { setAgeMissing(true); throw new Error('Confirm that you’re 18 or older to create an account.'); }
        setAgeMissing(false);
        const result = await authRequest('sign-up/email', { name: name.trim(), email: email.trim(), password, adultConfirmed: true });
        if (!('token' in result) || typeof result.token !== 'string') throw new Error('We could not create the account. If you may already have one, try signing in.');
        await onSignedIn();
      } else if (mode === 'sign-in') {
        const result = await authRequest('sign-in/email', { email: email.trim(), password, rememberMe: true });
        if ('twoFactorRedirect' in result && result.twoFactorRedirect === true) setNeedsCode(true);
        else await onSignedIn();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That request could not be completed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authRequest('two-factor/verify-totp', { code });
      await onSignedIn();
    } catch {
      setError('That code is incorrect. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    if (next === 'sign-in' || next === 'sign-up') window.history.replaceState({}, '', `/${next}`);
  }

  const title = authTitle(mode, needsCode);
  const intro = mode === 'sign-up' ? 'Use an email address you can access. Your wardrobe is private to your account.' : mode === 'forgot' ? 'Email reset is not available yet.' : needsCode ? 'Enter the six-digit code from your authenticator app.' : 'Welcome back. Sign in to see your wardrobe.';
  const submitLabel = mode === 'sign-up' ? 'Create account' : 'Sign in';

  return <div className="auth-page">
    <header className="auth-header"><Brand href="/" /></header>
    <main className="auth-main">
      <div className="auth-panel">
        <div className="auth-intro"><h1 className="page-title">{title}</h1><p className="muted">{intro}</p></div>
        {error && <Notice ref={errorRef} id="auth-error" tone="error" role="alert" focusable>{error}{error.includes('connect to GetYourFit') && <span><button type="button" className="text-link" onClick={() => void retryService()} disabled={busy}>Try the connection again</button></span>}</Notice>}
        {mode === 'forgot' ? <Notice tone="info" role="status">We can’t email password reset links yet. Changing your password requires your current password. A forgotten password cannot be recovered until email reset is connected, even if you are signed in.</Notice> : needsCode ? <form ref={formRef} onSubmit={verifyCode} className="auth-form" aria-busy={busy}>
          <Field label="Authenticator code">{(control) => <input {...control} className="input" name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />}</Field>
          <button className="button button-primary button-block" disabled={busy}>{busy ? 'Checking…' : 'Verify code'}</button>
        </form> : <form ref={formRef} onSubmit={(event) => void submit(event)} className="auth-form" aria-busy={busy} aria-describedby={error ? 'auth-error' : undefined}>
          {mode === 'sign-up' && <Field label="Your name">{(control) => <input {...control} className="input" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />}</Field>}
          <Field label="Email">{(control) => <input {...control} className="input" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />}</Field>
          <Field label="Password" hint={mode === 'sign-in' ? undefined : 'At least 12 characters. Choose a password you don’t use elsewhere.'} hintId="password-help">{(control) => <input {...control} className="input" name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'sign-in' ? undefined : 12} maxLength={1024} required />}</Field>
          {mode === 'sign-up' && <label className="check"><input type="checkbox" name="adult" checked={adult} onChange={(event) => { setAdult(event.target.checked); if (event.target.checked) setAgeMissing(false); }} aria-required="true" aria-invalid={ageMissing || undefined} /><span>I’m 18 or older. <span className="check-detail">GetYourFit doesn’t create accounts for minors.</span></span></label>}
          <button className="button button-primary button-block" type="submit" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" />Please wait</> : submitLabel}</button>
        </form>}
        <p className="auth-status caption" role="status">{busy ? mode === 'sign-up' ? 'Creating your account…' : needsCode ? 'Checking your code…' : 'Checking your request…' : ''}</p>
        {!needsCode && <div className="auth-switch">
          {mode === 'sign-in' && <><button type="button" className="text-link" onClick={() => switchMode('forgot')}>Forgot password?</button><p>New to GetYourFit? <button type="button" className="text-link" onClick={() => switchMode('sign-up')}>Create an account</button></p></>}
          {mode === 'sign-up' && <p>Already have an account? <button type="button" className="text-link" onClick={() => switchMode('sign-in')}>Sign in</button></p>}
          {mode === 'forgot' && <button type="button" className="text-link" onClick={() => switchMode('sign-in')}>Back to sign in</button>}
        </div>}
      </div>
      <p className="auth-privacy"><LockKeyhole size={16} aria-hidden="true" /><span>Your wardrobe is stored in your private account on the GetYourFit server. Your email address is not verified, and password reset by email is not available yet.</span></p>
    </main>
  </div>;
}
