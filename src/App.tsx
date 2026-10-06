import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { AuthGate } from './AuthGate';
import { AccountSecurity } from './AccountSecurity';
import { request, type EmailDeliveryMode } from './api';

type SessionState =
  | { signedIn: false; emailDeliveryMode: EmailDeliveryMode }
  | { signedIn: true; email: string; twoFactorEnabled: boolean; emailDeliveryMode: EmailDeliveryMode };

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    setSession(await request<SessionState>('/api/session'));
  }, []);

  useEffect(() => {
    let mounted = true;
    void request<SessionState>('/api/session').then((state) => {
      if (mounted) setSession(state);
    }).catch((cause: unknown) => {
      if (!mounted) return;
      setError(cause instanceof Error ? cause.message : 'Could not reach the local service.');
      setSession({ signedIn: false, emailDeliveryMode: 'unknown' });
    });
    return () => { mounted = false; };
  }, []);

  async function perform(action: string, callback: () => Promise<void>) {
    setBusy(action);
    setError('');
    try {
      await callback();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That action could not be completed.');
    } finally {
      setBusy('');
    }
  }

  function showSignedOut() {
    setSession((current) => ({ signedIn: false, emailDeliveryMode: current?.emailDeliveryMode ?? 'unknown' }));
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

  function signOut() {
    return perform('sign-out', async () => {
      await request('/api/auth/sign-out', { method: 'POST', body: '{}' });
      showSignedOut();
    });
  }

  function signOutEverywhere() {
    return perform('revoke', async () => {
      await request('/api/auth/sign-out-everywhere', { method: 'POST', body: '{}' });
      showSignedOut();
    });
  }

  function deleteAccount() {
    return perform('delete', async () => {
      await request('/api/data', { method: 'DELETE', body: JSON.stringify({ confirm: 'delete my account' }) });
      setConfirmDelete(false);
      showSignedOut();
    });
  }

  if (!session) return <div className="boot-screen"><span className="brand-mark">g.</span><span className="spinner" aria-label="Loading" /></div>;
  if (!session.signedIn) return <AuthGate onSignedIn={refresh} deliveryMode={session.emailDeliveryMode} initialError={error} />;

  return <main className="account-shell">
    <header className="account-topbar"><a className="brand-lockup" href="/" aria-label="GetYourFit home"><span className="brand-mark">g.</span><span>GETYOURFIT</span></a><span className="account-email">{session.email}</span><button className="text-button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>Privacy</button></header>
    <section className="account-content" aria-labelledby="account-title">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1 id="account-title">Your account, in your hands.</h1>
      <p className="lede">This build covers account access and account data. Garment photos, wardrobe, and outfit decisions are not available here.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <section className="privacy-card" aria-labelledby="privacy-title">
        <div className="privacy-card-title"><span className="privacy-icon"><ShieldCheck size={18} /></span><div><h2 id="privacy-title">Stored on this device</h2><p>{session.email} · Account details stay in the local app database.</p></div></div>
        <div className="privacy-list"><p><ShieldCheck size={14} /> {session.emailDeliveryMode === 'smtp' ? 'Verification and reset messages are sent to your email address.' : session.emailDeliveryMode === 'local-test' ? 'Automated test messages are available only to the verification runner.' : 'Email delivery mode is unknown.'}</p><p><ShieldCheck size={14} /> Personal data is never sold.</p><p><ShieldCheck size={14} /> Your password is stored as a one-way hash.</p><p><ShieldCheck size={14} /> Sign out here or revoke every active session.</p></div>
      </section>
      <section className="data-action-card">
        <span className="data-action-icon"><ArrowDownToLine size={18} /></span><div className="data-action-copy"><h2>Export account data</h2><p>Download your account details as a JSON file.</p></div>
        <button className="button button-secondary" onClick={() => void exportData()} disabled={busy !== ''}>{busy === 'export' ? 'Preparing…' : 'Download export'}</button>
      </section>
      <section className="data-action-card">
        <span className="data-action-icon"><LogOut size={18} /></span><div className="data-action-copy"><h2>End active sessions</h2><p>Sign out of this browser or revoke all sessions for this account.</p></div>
        <div className="button-stack"><button className="button button-secondary" onClick={() => void signOut()} disabled={busy !== ''}>Sign out</button><button className="button button-secondary" onClick={() => void signOutEverywhere()} disabled={busy !== ''}>Revoke sessions</button></div>
      </section>
      <AccountSecurity enabled={session.twoFactorEnabled === true} />
      <section className="delete-card">
        <div><p className="eyebrow">ACCOUNT CONTROL</p><h2>Delete your account</h2><p>This permanently removes your account, credentials, and active sessions from this device.</p></div>
        {!confirmDelete ? <button className="button button-danger-outline" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete my data</button> : <div className="delete-confirm"><span>Delete this account and its data?</span><button className="button button-danger" onClick={() => void deleteAccount()} disabled={busy !== ''}>{busy === 'delete' ? 'Deleting…' : 'Erase permanently'}</button><button className="text-button" onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
      </section>
    </section>
  </main>;
}
