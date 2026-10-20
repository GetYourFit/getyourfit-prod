import { useEffect, useRef, useState } from 'react';
import { Download, LockKeyhole, LogOut, Trash2 } from 'lucide-react';
import { AccountPassword } from './AccountPassword';
import { AccountSecurity } from './AccountSecurity';
import { request } from './api';
import { discardPendingPlan } from './pending-plan';
import type { SignedInSession } from './AccountApp';
import { Notice } from './ui';

export function AccountPage({ session }: { session: SignedInSession }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  async function perform(action: string, callback: () => Promise<void>) {
    setBusy(action);
    setError('');
    try {
      await callback();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That action could not be completed. Try again.');
    } finally {
      setBusy('');
    }
  }

  function exportData() {
    return perform('export', async () => {
      const response = await fetch('/api/data/export', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Your account export could not be prepared. Try again.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'getyourfit-account-export.json';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const signOut = (path: string, action: string) => perform(action, async () => {
    await request(path, { method: 'POST', body: '{}' });
    discardPendingPlan();
    window.location.assign('/');
  });

  function deleteAccount() {
    return perform('delete', async () => {
      await request('/api/data', { method: 'DELETE', body: JSON.stringify({ confirm: 'delete my account' }) });
      discardPendingPlan();
      window.location.assign('/');
    });
  }

  return <div className="page page-narrow">
    <header className="page-header">
      <div className="page-heading">
        <h1 id="account-title" className="page-title" ref={titleRef} tabIndex={-1}>Account</h1>
        <p className="lead">Signed in as <strong className="account-email">{session.email}</strong></p>
      </div>
    </header>
    {error && <Notice tone="error" role="alert">{error}</Notice>}

    <section className="card settings-card" aria-labelledby="privacy-title">
      <div className="settings-icon" aria-hidden="true"><LockKeyhole size={20} /></div>
      <div className="settings-copy">
        <h2 id="privacy-title" className="card-title">Your data and privacy</h2>
        <ul className="settings-list">
          <li>Your photos, garment facts, plans and outfit corrections are stored in your private account on the GetYourFit server, not in this browser.</li>
          <li>They are never sold or used for model training.</li>
          <li>Your password is stored as a one-way hash.</li>
          <li>Your email address is not verified. Password changes require your current password. A forgotten password cannot be recovered until email reset is connected, even if you are signed in.</li>
        </ul>
      </div>
    </section>

    <section className="card settings-card" aria-labelledby="export-title">
      <div className="settings-icon" aria-hidden="true"><Download size={20} /></div>
      <div className="settings-copy"><h2 id="export-title" className="card-title">Export your data</h2><p className="muted">Download your account, garment facts, photos, plans and outfit corrections as a JSON file.</p></div>
      <div className="settings-action"><button className="button button-secondary" onClick={() => void exportData()} disabled={busy !== ''}>{busy === 'export' ? 'Preparing…' : 'Download export'}</button></div>
    </section>

    <section className="card settings-card" aria-labelledby="sessions-title">
      <div className="settings-icon" aria-hidden="true"><LogOut size={20} /></div>
      <div className="settings-copy"><h2 id="sessions-title" className="card-title">Sessions</h2><p className="muted">Sign out of this browser, or sign out everywhere this account is open.</p></div>
      <div className="settings-action button-row"><button className="button button-secondary" onClick={() => void signOut('/api/auth/sign-out', 'sign-out')} disabled={busy !== ''}>Sign out</button><button className="button button-secondary" onClick={() => void signOut('/api/auth/sign-out-everywhere', 'revoke')} disabled={busy !== ''}>Sign out everywhere</button></div>
    </section>

    <AccountPassword />

    <AccountSecurity enabled={session.twoFactorEnabled === true} />

    <section className="card settings-card danger-zone" aria-labelledby="delete-title">
      <div className="settings-icon" aria-hidden="true"><Trash2 size={20} /></div>
      <div className="settings-copy"><h2 id="delete-title" className="card-title">Delete your account</h2><p className="muted">Permanently removes your account, sessions, photos, garment facts, plans and outfit corrections. This can’t be undone.</p></div>
      <div className="settings-action">{!confirmDelete
        ? <button ref={deleteTrigger} className="button button-secondary danger-outline" onClick={() => setConfirmDelete(true)}>Delete my data</button>
        : <div className="delete-confirm" role="group" aria-labelledby="delete-confirm-label"><p id="delete-confirm-label"><strong>Delete this account and all its data?</strong></p><div className="button-row"><button className="button button-danger" autoFocus onClick={() => void deleteAccount()} disabled={busy !== ''}>{busy === 'delete' ? 'Deleting…' : 'Erase permanently'}</button><button className="button button-ghost" onClick={() => { setConfirmDelete(false); globalThis.requestAnimationFrame(() => deleteTrigger.current?.focus()); }}>Cancel</button></div></div>}
      </div>
    </section>
  </div>;
}
