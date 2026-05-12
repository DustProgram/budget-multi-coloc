import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { CalendarEvent, EventType, UpcomingResponse } from '../types';
import {
  Button, Card, ErrorBox, Loader, PageHeader, Pill,
} from '../components/ui';

const TYPE_DOT: Record<EventType, string> = {
  income: 'income',
  charge: 'charge',
  transfer_in: 'saving',
  transfer_out: 'saving',
  saving_in: 'saving',
  saving_out: 'saving',
  purchase: 'purchase',
};

const TYPE_LABEL: Record<EventType, string> = {
  income: 'Revenu',
  charge: 'Charge',
  transfer_in: 'Virement reçu',
  transfer_out: 'Virement envoyé',
  saving_in: 'Épargne reçue',
  saving_out: 'Épargne envoyée',
  purchase: 'Achat',
};

const TYPE_TONE: Record<EventType, 'sage' | 'rose' | 'plum' | 'amber'> = {
  income: 'sage',
  charge: 'rose',
  transfer_in: 'plum',
  transfer_out: 'plum',
  saving_in: 'plum',
  saving_out: 'plum',
  purchase: 'amber',
};

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function Calendar() {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());

  const query = useQuery({
    queryKey: ['calendar', 'upcoming', 180],
    queryFn: async () => {
      const { data } = await api.get<UpcomingResponse>('/calendar/upcoming', {
        params: { days: 180 },
      });
      return data;
    },
  });

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of query.data?.events ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [query.data]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const grid = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  const selectedKey = format(selected, 'yyyy-MM-dd');
  const selectedEvents = byDate.get(selectedKey) ?? [];

  const monthLabel = format(cursor, 'LLLL yyyy', { locale: fr });

  const monthEvents = (query.data?.events ?? []).filter((e) =>
    isSameMonth(new Date(e.date), cursor),
  );
  const totalIn = monthEvents.filter((e) => num(e.amount) > 0).reduce((s, e) => s + num(e.amount), 0);
  const totalOut = monthEvents.filter((e) => num(e.amount) < 0).reduce((s, e) => s + num(e.amount), 0);

  return (
    <>
      <PageHeader
        eyebrow="Calendrier"
        title={monthLabel}
        subtitle={
          <>
            <span className="pos">↗ {eur(totalIn)} entrants</span>
            {' · '}
            <span className="neg">↘ {eur(Math.abs(totalOut))} sortants</span>
            {' · '}{monthEvents.length} événements
          </>
        }
      >
        <Button onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft size={14} /></Button>
        <Button onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Aujourd'hui</Button>
        <Button onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight size={14} /></Button>
      </PageHeader>

      {query.isLoading && <Loader />}
      {query.isError && <ErrorBox message="Erreur de chargement des événements." />}

      {query.data && (
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <Card>
            <div className="cal-grid" style={{ marginBottom: 8 }}>
              {DAYS.map((d) => <div key={d} className="cal-head">{d}</div>)}
            </div>
            <div className="cal-grid">
              {grid.map((d) => {
                const events = byDate.get(format(d, 'yyyy-MM-dd')) ?? [];
                const isMuted = !isSameMonth(d, cursor);
                const isToday = isSameDay(d, today);
                const isSelected = isSameDay(d, selected);
                const types = [...new Set(events.map((e) => TYPE_DOT[e.type]))];
                return (
                  <button
                    key={format(d, 'yyyy-MM-dd')}
                    onClick={() => setSelected(d)}
                    className={`cal-day ${isMuted ? 'muted' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  >
                    <span className="d">{format(d, 'd')}</span>
                    <div className="dots">
                      {types.map((t) => <span key={t} className={`dot ${t}`} />)}
                      {events.length > 0 && <span className="tiny" style={{ marginLeft: 2, opacity: .7 }}>{events.length}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="row gap-3" style={{ marginTop: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-3)' }}>
              {(['income', 'charge', 'saving_out', 'purchase'] as EventType[]).map((t) => (
                <span key={t} className="row gap-2" style={{ alignItems: 'center' }}>
                  <span className={`dot ${TYPE_DOT[t]}`} /> {TYPE_LABEL[t].split(' ')[0]}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <div className="card-title" style={{ marginBottom: 4 }}>
              {format(selected, "EEEE d MMMM", { locale: fr })}
            </div>
            <div className="small muted" style={{ marginBottom: 14 }}>
              {selectedEvents.length} événement{selectedEvents.length !== 1 ? 's' : ''}
            </div>
            {selectedEvents.length === 0 && (
              <div className="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>
                Rien de prévu ce jour-là.
              </div>
            )}
            {selectedEvents.map((e, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="row between">
                  <Pill tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Pill>
                  <span className={`num display ${num(e.amount) >= 0 ? 'pos' : ''}`} style={{ fontSize: 18 }}>
                    {num(e.amount) >= 0 ? '+' : ''}{eur(e.amount)}
                  </span>
                </div>
                <div style={{ fontWeight: 500, marginTop: 4 }}>{e.label}</div>
                <div className="small muted">{e.account_name}</div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {query.data && query.data.accounts.length > 0 && (
        <div className="grid" style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          marginTop: 24,
        }}>
          {query.data.accounts.map((a) => {
            const start = num(a.starting_balance);
            const end = num(a.projected_end_balance);
            const delta = end - start;
            return (
              <Card key={a.account_id}>
                <p className="eyebrow" style={{ margin: 0 }}>{a.name}</p>
                <div className="num display" style={{ fontSize: 28 }}>{eur(end)}</div>
                <div className={`small ${delta >= 0 ? 'pos' : 'neg'}`}>
                  {delta >= 0 ? '+' : ''}{eur(delta)} sur la période
                </div>
                <div className="small muted">Départ : {eur(start)}</div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
