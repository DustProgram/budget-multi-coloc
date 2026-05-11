import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Incomes } from './pages/Incomes';
import { Charges } from './pages/Charges';
import { Transfers } from './pages/Transfers';
import { Savings } from './pages/Savings';
import { Purchases } from './pages/Purchases';
import { Simulator } from './pages/Simulator';
import { MonthlyView } from './pages/MonthlyView';
import { YearlyView } from './pages/YearlyView';
import { Shopping } from './pages/Shopping';
import { ColocSummary } from './pages/ColocSummary';
import { Calendar } from './pages/Calendar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  // Détecter le base URL via l'ingress HA
  const basename = window.location.pathname.includes('/api/hassio_ingress/')
    ? window.location.pathname.split('/').slice(0, 4).join('/')
    : '';

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="incomes" element={<Incomes />} />
            <Route path="charges" element={<Charges />} />
            <Route path="transfers" element={<Transfers />} />
            <Route path="savings" element={<Savings />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="monthly" element={<MonthlyView />} />
            <Route path="yearly" element={<YearlyView />} />
            <Route path="shopping" element={<Shopping />} />
            <Route path="coloc" element={<ColocSummary />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
