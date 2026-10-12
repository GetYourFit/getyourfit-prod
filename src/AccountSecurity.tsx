import { useState, type FormEvent } from 'react';
import { request } from './api';

export function AccountSecurity({ enabled }: { enabled: boolean }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function begin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await request<unknown>('/api/auth/two-factor/enable', { method: 'POST', body: JSON.stringify({ password, method: 'totp', issuer: 'GetYourFit' }) });
      if (typeof response !== 'object' || response === null || !('totpURI' in response) || typeof response.totpURI !== 'string' || !('backupCodes' in response) || !Array.isArray(response.backupCodes) || !response.backupCodes.every((entry) => typeof entry === 'string')) throw new Error('The authenticator setup could not be read.');
      setTotpUri(response.totpURI);
      setBackupCodes(response.backupCodes);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not start authenticator setup.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await request('/api/auth/two-factor/verify-totp', { method: 'POST', body: JSON.stringify({ code }) });
      window.location.reload();
    } catch {
      setMessage('That authenticator code is incorrect. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="two-factor-card">
    <div><span className="eyebrow">OPTIONAL ACCOUNT SECURITY</span><h2>Authenticator app</h2><p>{enabled ? 'A time-based code is required when you sign in.' : 'Add a second step to sign-in with a time-based authenticator code.'}</p></div>
    {enabled ? <span className="fact-pill">Enabled</span> : totpUri ? <form onSubmit={(event) => void confirm(event)} className="totp-setup">
      <label><span className="field-label">SETUP URI · COPY INTO YOUR AUTHENTICATOR</span><input className="text-input" name="totp-uri" readOnly value={totpUri} onFocus={(event) => event.currentTarget.select()} /></label>
      <p>Save these backup codes somewhere private. Each works once.</p><pre>{backupCodes.join('\n')}</pre>
      <label><span className="field-label">VERIFY SETUP CODE</span><input className="text-input" name="totp-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required /></label>
      {message && <p className="inline-error" role="alert">{message}</p>}<button className="button button-primary" disabled={busy}>{busy ? 'Checking…' : 'Enable authenticator'}</button>
    </form> : <form onSubmit={(event) => void begin(event)} className="totp-setup">
      <label><span className="field-label">CONFIRM PASSWORD</span><input className="text-input" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {message && <p className="inline-error" role="alert">{message}</p>}<button className="button button-secondary" disabled={busy}>{busy ? 'Preparing…' : 'Set up TOTP'}</button>
    </form>}
  </section>;
}
