import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { SpaceProvider } from './lib/space';
import { AuthGate } from './lib/AuthGate';
import { prefetchProbableRoutes } from './lib/prefetch';

// Pages eagerly chargées (essentielles ou très utilisées)
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Shopping } from './pages/Shopping';
import { ColocSummary } from './pages/ColocSummary';
import { Calendar } from './pages/Calendar';

// Pages chargées à la demande (chunk séparé)
const Incomes = lazy(() => import('./pages/Incomes').then((m) => ({ default: m.Incomes })));
const Charges = lazy(() => import('./pages/Charges').then((m) => ({ default: m.Charges })));
const Transfers = lazy(() => import('./pages/Transfers').then((m) => ({ default: m.Transfers })));
const Savings = lazy(() => import('./pages/Savings').then((m) => ({ default: m.Savings })));
const Purchases = lazy(() => import('./pages/Purchases').then((m) => ({ default: m.Purchases })));
const Simulator = lazy(() => import('./pages/Simulator').then((m) => ({ default: m.Simulator })));
const MonthlyView = lazy(() => import('./pages/MonthlyView').then((m) => ({ default: m.MonthlyView })));
const YearlyView = lazy(() => import('./pages/YearlyView').then((m) => ({ default: m.YearlyView })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const ComptaPro = lazy(() => import('./pages/ComptaPro').then((m) => ({ default: m.ComptaPro })));
const Chat = lazy(() => import('./pages/Chat').then((m) => ({ default: m.Chat })));
const Events = lazy(() => import('./pages/Events').then((m) => ({ default: m.Events })));
const ImportPage = lazy(() => import('./pages/Import').then((m) => ({ default: m.Import })));
const BulkImportPage = lazy(() => import('./pages/BulkImport').then((m) => ({ default: m.BulkImport })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Données considérées fraîches 60s : pas de refetch automatique pendant
      // ce délai (les hooks dans plusieurs composants ne déclenchent qu'une
      // seule requête réseau). Les composants qui veulent du temps réel
      // (chat foyer, shopping) le surchargent explicitement avec
      // refetchInterval / un staleTime court.
      staleTime: 60_000,
      // Garde en mémoire 5 min avant garbage collection : retour rapide
      // entre les onglets sans re-fetch.
      gcTime: 5 * 60_000,
      retry: 1,
      // Pas de refetch quand la fenêtre reprend le focus — l'utilisateur
      // a une connexion permanente et les ressources sont stables (sauf
      // chat/shopping qui ont leur propre refetchInterval).
      refetchOnWindowFocus: false,
      // Ne refetch pas non plus à chaque reconnexion réseau (rare en LAN).
      refetchOnReconnect: false,
    },
  },
});

function PageFallback() {
  return (
    <div style={{
      padding: 40, textAlign: 'center',
      color: 'var(--ink-3)', fontSize: 14,
    }}>
      Chargement…
    </div>
  );
}

export default function App() {
  // Détecter le base URL via l'ingress HA
  const basename = window.location.pathname.includes('/api/hassio_ingress/')
    ? window.location.pathname.split('/').slice(0, 4).join('/')
    : '';

  useEffect(() => {
    prefetchProbableRoutes();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
       <SpaceProvider>
        <BrowserRouter basename={basename}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="shopping" element={<Shopping />} />
              <Route path="coloc" element={<ColocSummary />} />
              <Route path="incomes" element={
                <Suspense fallback={<PageFallback />}><Incomes /></Suspense>
              } />
              <Route path="charges" element={
                <Suspense fallback={<PageFallback />}><Charges /></Suspense>
              } />
              <Route path="transfers" element={
                <Suspense fallback={<PageFallback />}><Transfers /></Suspense>
              } />
              <Route path="savings" element={
                <Suspense fallback={<PageFallback />}><Savings /></Suspense>
              } />
              <Route path="purchases" element={
                <Suspense fallback={<PageFallback />}><Purchases /></Suspense>
              } />
              <Route path="simulator" element={
                <Suspense fallback={<PageFallback />}><Simulator /></Suspense>
              } />
              <Route path="monthly" element={
                <Suspense fallback={<PageFallback />}><MonthlyView /></Suspense>
              } />
              <Route path="yearly" element={
                <Suspense fallback={<PageFallback />}><YearlyView /></Suspense>
              } />
              <Route path="compta-pro" element={
                <Suspense fallback={<PageFallback />}><ComptaPro /></Suspense>
              } />
              <Route path="chat" element={
                <Suspense fallback={<PageFallback />}><Chat /></Suspense>
              } />
              <Route path="import" element={
                <Suspense fallback={<PageFallback />}><ImportPage /></Suspense>
              } />
              <Route path="bulk-import" element={
                <Suspense fallback={<PageFallback />}><BulkImportPage /></Suspense>
              } />
              <Route path="events" element={
                <Suspense fallback={<PageFallback />}><Events /></Suspense>
              } />
              <Route path="settings" element={
                <Suspense fallback={<PageFallback />}><Settings /></Suspense>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
       </SpaceProvider>
      </AuthGate>
    </QueryClientProvider>
  );
}
