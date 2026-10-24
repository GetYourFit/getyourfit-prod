import './zod-config';
import { lazy, Suspense, useCallback, useEffect, useState, type MouseEvent } from 'react';
import { AuthGate } from './AuthGate';
import { AccountPage } from './AccountPage';
import { Wardrobe } from './Wardrobe';
import { accountEntry, intendedPath } from '../shared/auth-return';
import { readSession, SESSION_CHECK, SESSION_EXPIRED, type SessionState } from './session';
import type { SignedInSession } from './session';
import { LoadingScreen } from './LoadingScreen';
import { Brand } from './ui';
import { readPendingPlan } from './pending-plan';

export type { SignedInSession };
type Route = '/wardrobe' | '/account' | '/plan';
const PlanPage = lazy(() => import('./PlanPage'));

const titles: Record<Route, string> = { '/wardrobe': 'Wardrobe', '/account': 'Account', '/plan': 'Plan an outfit' };
const routeOf = (pathname: string): Route => pathname === '/account' ? '/account' : pathname === '/plan' ? '/plan' : '/wardrobe';

export default function AccountApp() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname));

  const refresh = useCallback(async () => {
    const state = await readSession();
    setSession(state);
    if (!state.signedIn) return;
    const destination = intendedPath();
    window.history.replaceState({}, '', destination);
    setRoute(routeOf(window.location.pathname));
    setError('');
  }, []);

  useEffect(() => {
    let mounted = true;
    void readSession().then((state) => {
      if (!mounted) return;
      if (state.signedIn) {
        window.history.replaceState({}, '', intendedPath());
        setRoute(routeOf(window.location.pathname));
      }
      setSession(state);
    }).catch((cause: unknown) => {
      if (!mounted) return;
      setError(cause instanceof Error ? cause.message : 'We could not connect to GetYourFit. Check your connection and try again.');
      setSession({ signedIn: false });
    });
    const onPop = () => setRoute(routeOf(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => { mounted = false; window.removeEventListener('popstate', onPop); };
  }, []);

  useEffect(() => {
    if (!session?.signedIn) return;
    let mounted = true;
    const expire = () => {
      if (!mounted) return;
      const pending = readPendingPlan();
      const destination = pending?.account === session.id ? '/wardrobe#build-plan' : intendedPath();
      window.history.replaceState({}, '', accountEntry('/sign-in', destination));
      setError('Your session has ended or changed. Sign in again to continue. Your saved plans and photos stay in your account.');
      setSession({ signedIn: false });
    };
    const confirm = () => {
      void readSession().then((state) => {
        if (mounted && (!state.signedIn || state.id !== session.id)) expire();
      }).catch(() => { /* The next action offers a connection retry without discarding input. */ });
    };
    const check = () => {
      if (document.visibilityState !== 'hidden') confirm();
    };
    window.addEventListener(SESSION_EXPIRED, expire);
    window.addEventListener(SESSION_CHECK, confirm);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener(SESSION_EXPIRED, expire);
      window.removeEventListener(SESSION_CHECK, confirm);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [session]);

  useEffect(() => {
    if (!session?.signedIn) return;
    document.title = `${titles[route]} · GetYourFit`;
  }, [session, route]);

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = new URL(event.currentTarget.href);
    window.history.pushState({}, '', `${target.pathname}${target.hash}`);
    setRoute(routeOf(target.pathname));
    globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(() => {
      const section = target.hash ? document.querySelector<HTMLElement>(target.hash) : null;
      const heading = target.hash ? section?.querySelector<HTMLElement>('h2') : document.querySelector<HTMLElement>('h1');
      if (!heading) return;
      if (section) section.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }));
  }

  if (!session) return <LoadingScreen />;
  if (!session.signedIn) return <AuthGate onSignedIn={refresh} initialError={error} />;
  if (route === '/plan') return <Suspense fallback={<LoadingScreen message="Opening your plan…" />}><PlanPage account={session.id} /></Suspense>;

  return <div className="app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header">
      <div className="app-header-inner">
        <Brand href="/wardrobe" onClick={navigate} />
        <nav className="app-nav" aria-label="Main">
          <a href="/wardrobe" onClick={navigate} aria-current={route === '/wardrobe' ? 'page' : undefined}>Wardrobe</a>
          <a href="/wardrobe#outfit" onClick={navigate}>Outfit</a>
          <a href="/wardrobe#build-plan" onClick={navigate}>Plan</a>
          <a href="/account" onClick={navigate} aria-current={route === '/account' ? 'page' : undefined}>Account</a>
        </nav>
      </div>
    </header>
    <main id="main" className="app-main" key={session.id}>{route === '/account' ? <AccountPage session={session} /> : <Wardrobe account={session.id} />}</main>
  </div>;
}
