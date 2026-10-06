import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { EmailDeliveryMode } from './api';

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'reset' | 'sent';
const deliveryCopy: Record<EmailDeliveryMode, { sent: string; privacy: string }> = {
  smtp: {
    sent: 'Verification and reset links are sent by email to the address you provide.',
    privacy: 'Verification and reset messages go to the email address you provide.',
  },
  'local-test': {
    sent: 'Automated verification and recovery messages are available only to the test runner.',
    privacy: 'Automated test messages are restricted to the verification runner.',
  },
  unknown: {
    sent: 'Email delivery mode is unknown.',
    privacy: 'Email delivery mode is unknown.',
  },
};

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
    throw new Error('The local service is unavailable. Check that it is running, then try again.');
  }
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof result === 'object' && result !== null && 'code' in result && typeof result.code === 'string' ? result.code : '';
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string' ? result.message : '';
    console.error(`GetYourFit auth request rejected ${JSON.stringify({ url: `/api/auth/${path}`, method: 'POST', status: response.status, code, message, origin: window.location.origin })}`);
    if (path === 'sign-in/email') throw new Error('We could not sign you in. Check your email and password, then try again.');
    if (path === 'sign-up/email' && ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'].includes(code)) throw new Error('Use a password between 12 and 1024 characters.');
    if (path === 'sign-up/email') throw new Error('We could not create the account. If you may already have one, try signing in or reset your password.');
    if (path === 'reset-password') throw new Error('This reset link is invalid or expired. Request another link.');
    if (path === 'two-factor/verify-totp') throw new Error('That code is incorrect or expired. Check your authenticator and try again.');
    throw new Error('We could not complete that request. Check your details and try again.');
  }
  if (typeof result !== 'object' || result === null) return {};
  return result;
}

export function AuthGate({ onSignedIn, deliveryMode, initialError = '' }: { onSignedIn: () => Promise<void>; deliveryMode: EmailDeliveryMode; initialError?: string }) {
  const resetToken = new URLSearchParams(window.location.search).get('token');
  const verificationError = new URLSearchParams(window.location.search).get('error');
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [adult, setAdult] = useState(false);
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || (verificationError === 'INVALID_TOKEN' ? 'That verification link is invalid, expired, or already used. Sign in to request a fresh link.' : ''));

  async function retryService() {
    setBusy(true);
    try {
      await onSignedIn();
      setError('');
    } catch {
      setError('The local service is unavailable. Check that it is running, then try again.');
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
        if (!adult) throw new Error('Confirm that you are at least 18 before creating an account.');
        await authRequest('sign-up/email', { name: name.trim(), email: email.trim(), password, adultConfirmed: true, callbackURL: window.location.origin });
        setMode('sent');
      } else if (mode === 'sign-in') {
        const result = await authRequest('sign-in/email', { email: email.trim(), password, rememberMe: true });
        if ('twoFactorRedirect' in result && result.twoFactorRedirect === true) setNeedsCode(true);
        else await onSignedIn();
      } else if (mode === 'forgot') {
        await authRequest('request-password-reset', { email: email.trim(), redirectTo: `${window.location.origin}/` });
        setMode('sent');
      } else if (mode === 'reset') {
        if (!resetToken) throw new Error('This reset link has expired. Request a new one.');
        await authRequest('reset-password', { token: resetToken, newPassword: password });
        window.history.replaceState({}, '', '/');
        setMode('sign-in');
        setPassword('');
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

  const title = mode === 'sign-up' ? 'Make it yours.' : mode === 'forgot' ? 'Find your way back.' : mode === 'reset' ? 'Choose a new password.' : mode === 'sent' ? 'Request received.' : needsCode ? 'One more step.' : 'Welcome back.';
  const intro = mode === 'sign-up' ? 'Create a private account with an email address you can access.' : mode === 'forgot' ? 'We’ll send a single-use reset link if this address has an account.' : mode === 'reset' ? 'Use a long, unique password you do not use elsewhere.' : mode === 'sent' ? 'If this request can be completed, follow the link sent to your email address.' : needsCode ? 'Enter the code from your authenticator app.' : 'Sign in to your GetYourFit account.';
  const showCredential = mode === 'sign-up' || mode === 'sign-in' || mode === 'forgot';

  return <main className="auth-layout">
    <section className="auth-copy">
      <span className="brand-mark">g.</span>
      <div className="auth-main">
        <h1>GetYourFit</h1>
        <p className="auth-description">Account access for your local GetYourFit setup.</p>
      </div>
    </section>
    <section className="auth-action">
      <div className="auth-action-inner">
        <span className="auth-number">01 / YOUR ACCOUNT</span>
        <h2>{title}</h2><p>{intro}</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {error.includes('local service is unavailable') && <button className="text-button" onClick={() => void retryService()} disabled={busy}>Try the connection again</button>}
        {mode === 'sent' ? <div className="mail-delivery-note"><ShieldCheck size={17} /><span>{deliveryCopy[deliveryMode].sent}</span></div> : needsCode ? <form onSubmit={verifyCode} className="auth-form">
          <label><span className="field-label">AUTHENTICATOR CODE</span><input className="text-input" name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required /></label>
          <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Checking…' : 'Verify code'}<ArrowRight size={16} /></button>
        </form> : <form onSubmit={(event) => void submit(event)} className="auth-form">
          {mode === 'sign-up' && <label><span className="field-label">YOUR NAME</span><input className="text-input" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>}
          {showCredential && <label><span className="field-label">EMAIL ADDRESS</span><input className="text-input" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>}
          {mode !== 'forgot' && <label><span className="field-label">{mode === 'reset' ? 'NEW PASSWORD' : 'PASSWORD'}</span><input className="text-input" name={mode === 'reset' ? 'new-password' : 'password'} type="password" autoComplete={mode === 'sign-up' ? 'new-password' : mode === 'reset' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'sign-in' ? undefined : 12} maxLength={1024} required /></label>}
          {mode === 'sign-up' && <label className="consent-check age-check"><input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} /><span>I confirm I am at least 18 years old. GetYourFit does not create an account for minors.</span></label>}
          <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save new password' : 'Sign in'}<ArrowRight size={16} /></button>
        </form>}
        {mode !== 'sent' && !needsCode && <div className="auth-links">
          {mode === 'sign-in' && <><button className="text-button" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button><button className="text-button" onClick={() => { setMode('sign-up'); setError(''); }}>Create an account</button></>}
          {mode === 'sign-up' && <button className="text-button" onClick={() => { setMode('sign-in'); setError(''); }}>Already have an account? Sign in</button>}
          {(mode === 'forgot' || mode === 'reset') && <button className="text-button" onClick={() => { setMode('sign-in'); setError(''); }}>Back to sign in</button>}
        </div>}
        <div className="privacy-note"><LockKeyhole size={15} /><span>Account details stay in the local app. {deliveryCopy[deliveryMode].privacy}</span></div>
      </div>
      <span className="auth-edge-note">GETYOURFIT / LOCAL EDITION</span>
    </section>
  </main>;
}
