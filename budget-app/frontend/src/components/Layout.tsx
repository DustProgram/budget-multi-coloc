import { NavLink, Outlet } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  TrendingUp,
  FileText,
  ArrowLeftRight,
  PiggyBank,
  ShoppingBag,
  Calculator,
  BarChart3,
  ListChecks,
  Users,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const nav: NavItem[] = [
  { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { to: 'accounts', label: 'Comptes', icon: CreditCard },
  { to: 'incomes', label: 'Revenus', icon: TrendingUp },
  { to: 'charges', label: 'Charges', icon: FileText },
  { to: 'transfers', label: 'Virements', icon: ArrowLeftRight },
  { to: 'savings', label: 'Épargne', icon: PiggyBank },
  { to: 'purchases', label: 'Achats', icon: ShoppingBag },
  { to: 'simulator', label: 'Simulateur', icon: Calculator },
  { to: 'monthly', label: 'Vue mois', icon: BarChart3 },
  { to: 'yearly', label: 'Vue année', icon: BarChart3 },
  { to: 'shopping', label: 'Courses', icon: ListChecks },
  { to: 'coloc', label: 'Coloc', icon: Users },
];

export function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-brand text-white p-4 flex-shrink-0">
        <h1 className="text-lg font-bold mb-6">Budget Multi-Coloc</h1>
        <nav className="space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${
                  isActive
                    ? 'bg-white/20 font-medium'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
