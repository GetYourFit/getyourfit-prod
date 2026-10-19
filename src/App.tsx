import { lazy, Suspense } from 'react';
import { LandingPage } from './LandingPage';
import { LoadingScreen } from './LoadingScreen';

const AccountApp = lazy(() => import('./AccountApp'));
const PlanPage = lazy(() => import('./PlanPage'));

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const publicPage = window.location.pathname === '/' && !params.has('token') && !params.has('error');
  if (publicPage) return <LandingPage />;
  if (window.location.pathname === '/plan') return <Suspense fallback={<LoadingScreen message="Opening your plan…" />}><PlanPage /></Suspense>;
  return <Suspense fallback={<LoadingScreen />}><AccountApp /></Suspense>;
}
