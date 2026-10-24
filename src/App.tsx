import { lazy, Suspense, useEffect, useState } from 'react';
import { LandingPage } from './LandingPage';
import { LoadingScreen } from './LoadingScreen';

const AccountApp = lazy(() => import('./AccountApp'));

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
  return <Suspense fallback={<LoadingScreen />}><AccountApp /></Suspense>;
}
