import './zod-config';
import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { AuthGate } from './AuthGate';
import { AccountPage } from './AccountPage';
import { Wardrobe } from './Wardrobe';
import { request } from './api';
import { LoadingScreen } from './LoadingScreen';
import { Brand } from './ui';

export type SignedInSession = { signedIn: true; id: string; email: string; twoFactorEnabled: boolean };
type SessionState = { signedIn: false } | SignedInSession;
type Route = '/wardrobe' | '/account';

const titles: Record<Route, string> = { '/wardrobe': 'Wardrobe', '/account': 'Account' };
const routeOf = (pathname: string): Route => pathname === '/account' ? '/account' : '/wardrobe';

export default function AccountApp() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname));

  const refresh = useCallback(async () => {
    setSession(await request<SessionState>('/api/session'));
    window.history.replaceState({}, '', '/wardrobe');
    setRoute('/wardrobe');
  }, []);

  useEffect(() => {
    let mounted = true;
    void request<SessionState>('/api/session').then((state) => {
      if (!mounted) return;
      if (state.signedIn && !['/wardrobe', '/account'].includes(window.location.pathname)) window.history.replaceState({}, '', `/wardrobe${window.location.hash}`);
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
    <main id="main" className="app-main">{route === '/account' ? <AccountPage session={session} /> : <Wardrobe account={session.id} />}</main>
  </div>;
}
