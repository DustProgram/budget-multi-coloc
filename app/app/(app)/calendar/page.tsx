'use client';

import { useState } from 'react';
import { calendarEvents, today } from '@/lib/data';
import { eur } from '@/lib/format';
import { Icons } from '@/components/shell/icons';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function CalendarPage() {
  const [sel, setSel] = useState(today.getDate());
  const year = today.getFullYear(), month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startWeekDay = (firstDay.getDay() + 6) % 7; // Monday-first

  const eventsByDay: Record<number, typeof calendarEvents> = {};
  for (const e of calendarEvents) {
    (eventsByDay[e.date] = eventsByDay[e.date] || []).push(e);
  }

  const days: (number | null)[] = [];
  for (let i = 0; i < startWeekDay; i++) days.push(null);
  for (let d = 1; d <= lastDay; d++) days.push(d);

  const selectedEvents = eventsByDay[sel] || [];
  const labelByType: Record<string, string> = { income: 'Revenu', charge: 'Charge', saving: 'Épargne', purchase: 'Achat' };
  const colorByType: Record<string, string> = { income: 'pill-sage', charge: 'pill-rose', saving: 'pill-plum', purchase: 'pill-amber' };
  const monthName = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const totalIn = calendarEvents.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalOut = calendarEvents.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Calendrier</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>
            {monthName}
          </h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>
            <span className="pos">↗ {eur(totalIn)} entrants</span>
            {' · '}
            <span className="neg">↘ {eur(Math.abs(totalOut))} sortants</span>
            {' · '}{calendarEvents.length} événements
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-icon"><Icons.chevL size={14} /></button>
          <button className="btn">Aujourd&apos;hui</button>
          <button className="btn btn-icon"><Icons.chevR size={14} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="card">
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 8 }}>
            {DAYS.map(d => (
              <div key={d} style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', padding: '6px 0' }}>{d}</div>
            ))}
          </div>
          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {days.map((d, i) => {
              if (d === null) return <div key={i} />;
              const ev = eventsByDay[d] || [];
              const isToday = d === today.getDate();
              const isSel = d === sel;
              const types = [...new Set(ev.map(e => e.type))];
              return (
                <button key={i}
                  className={`cal-day ${isToday ? 'cal-day-today' : ''} ${isSel ? 'cal-day-selected' : ''}`}
                  onClick={() => setSel(d)}
                >
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{d}</span>
                  <div style={{ display: 'flex', gap: 2, marginTop: 'auto', flexWrap: 'wrap' }}>
                    {types.map(t => <span key={t} className={`dot dot-${t}`} />)}
                    {ev.length > 0 && <span className="tiny" style={{ marginLeft: 2, opacity: .7 }}>{ev.length}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16, justifyContent: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
            {[['income', 'Revenu'], ['charge', 'Charge'], ['saving', 'Épargne'], ['purchase', 'Achat']].map(([t, l]) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`dot dot-${t}`} /> {l}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
              {sel} {today.toLocaleDateString('fr-FR', { month: 'long' })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{selectedEvents.length} événement{selectedEvents.length !== 1 ? 's' : ''}</div>
          </div>
          {selectedEvents.length === 0 && (
            <div className="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>Rien de prévu ce jour-là.</div>
          )}
          {selectedEvents.map((e, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className={`pill ${colorByType[e.type]}`}>{labelByType[e.type]}</span>
                <span className={`num ${e.amount >= 0 ? 'pos' : ''}`} style={{ fontFamily: 'var(--display)', fontSize: 18 }}>
                  {eur(e.amount, { sign: true })}
                </span>
              </div>
              <div style={{ fontWeight: 500, marginTop: 4 }}>{e.label}</div>
              <div className="small muted">{e.account}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
