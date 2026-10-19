import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { request } from './api';
import { Field, Notice } from './ui';

export function AccountPassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function change(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next, revokeOtherSessions: true }) });
      setCurrent('');
      setNext('');
      setSaved(true);
    } catch {
      setError('We could not change your password. Check your current password, and use 12 to 1024 characters for the new one.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="card settings-card" aria-labelledby="password-title">
    <div className="settings-icon" aria-hidden="true"><KeyRound size={20} /></div>
    <div className="settings-copy">
      <h2 id="password-title" className="card-title">Change password</h2>
      <p className="muted">Password reset by email is not available yet, so changing it here while you are signed in is the way to recover control of your account. Other devices are signed out.</p>
      <form onSubmit={(event) => void change(event)} className="settings-form">
        <Field label="Current password">{(control) => <input {...control} className="input" name="current-password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} maxLength={1024} required />}</Field>
        <Field label="New password" hint="At least 12 characters. Choose a password you don’t use elsewhere." hintId="new-password-help">{(control) => <input {...control} className="input" name="new-password" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} minLength={12} maxLength={1024} required />}</Field>
        {error && <Notice tone="error" role="alert">{error}</Notice>}
        {saved && <Notice tone="success" role="status">Your password is changed. Other devices are signed out.</Notice>}
        <div><button className="button button-secondary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </div>
  </section>;
}
