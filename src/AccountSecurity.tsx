import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { request } from './api';
import { Field, Notice } from './ui';

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

  return <section className="card settings-card" aria-labelledby="security-title">
    <div className="settings-icon" aria-hidden="true"><KeyRound size={20} /></div>
    <div className="settings-copy">
      <div className="settings-title-row"><h2 id="security-title" className="card-title">Two-step sign-in</h2>{enabled && <span className="badge badge-positive">On</span>}</div>
      <p className="muted">{enabled ? 'A code from your authenticator app is required when you sign in.' : 'Optional. Add a code from an authenticator app as a second step when you sign in.'}</p>
      {!enabled && (totpUri ? <form onSubmit={(event) => void confirm(event)} className="settings-form">
        <Field label="Setup key" hint="Copy this into your authenticator app.">{(control) => <input {...control} className="input" name="totp-uri" readOnly value={totpUri} onFocus={(event) => event.currentTarget.select()} />}</Field>
        <div className="field"><p className="field-label">Backup codes</p><p className="field-hint">Save these somewhere private. Each works once.</p><pre className="backup-codes">{backupCodes.join('\n')}</pre></div>
        <Field label="Code from your app">{(control) => <input {...control} className="input" name="totp-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />}</Field>
        {message && <Notice tone="error" role="alert">{message}</Notice>}
        <div><button className="button button-primary" disabled={busy}>{busy ? 'Checking…' : 'Turn on two-step sign-in'}</button></div>
      </form> : <form onSubmit={(event) => void begin(event)} className="settings-form">
        <Field label="Confirm your password">{(control) => <input {...control} className="input" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />}</Field>
        {message && <Notice tone="error" role="alert">{message}</Notice>}
        <div><button className="button button-secondary" disabled={busy}>{busy ? 'Preparing…' : 'Set up authenticator'}</button></div>
      </form>)}
    </div>
  </section>;
}
