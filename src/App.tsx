import { lazy, Suspense, useEffect, useState } from 'react';
import { LandingPage } from './LandingPage';
import { LoadingScreen } from './LoadingScreen';
import { guides, guidePath } from '../shared/guides';

const AccountApp = lazy(() => import('./AccountApp'));
const GuidePage = lazy(() => import('./GuidePage'));

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const params = new URLSearchParams(window.location.search);
  const publicPage = pathname === '/' && !params.has('token') && !params.has('error');
  if (publicPage) return <LandingPage />;
  if (pathname === '/guides' || pathname.startsWith('/guides/')) {
    const route = `${pathname.replace(/\/+$/, '')}/`;
    const guide = route === '/guides/' ? null : guides.find((item) => guidePath(item) === route);
    return <Suspense fallback={<LoadingScreen message="Opening the guide…" />}><GuidePage guide={guide} /></Suspense>;
  }
  return <Suspense fallback={<LoadingScreen />}><AccountApp /></Suspense>;
}
