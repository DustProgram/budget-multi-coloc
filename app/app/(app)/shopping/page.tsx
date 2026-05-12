'use client';

import { useState } from 'react';
import { shopping as initialShopping, users } from '@/lib/data';
import { eur } from '@/lib/format';
import { Icons } from '@/components/shell/icons';
import type { ShoppingItem } from '@/lib/types';

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>(initialShopping);
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');

  const visible = filter === 'all' ? items : items.filter(i => filter === 'todo' ? !i.bought : i.bought);
  const todo = items.filter(i => !i.bought).length;
  const estTotal = items.filter(i => !i.bought).reduce((s, i) => s + (i.est || 0), 0);
  const colorByPrio: Record<string, string> = { urgent: 'pill-rose', high: 'pill-amber' };

  const toggle = (id: number) => setItems(items.map(x => x.id === id ? { ...x, bought: !x.bought, bought_by: 'Lucas' } : x));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Courses · Pixel St-Marc</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Liste partagée</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>
            {todo} article{todo > 1 ? 's' : ''} à acheter · estimé {eur(estTotal)}. Camille a ajouté 3 articles aujourd&apos;hui.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 3, background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
            {(['all', 'todo', 'done'] as const).map(f => (
              <button key={f} className={`btn btn-sm btn-ghost ${filter === f ? 'btn-primary' : ''}`}
                style={{ borderRadius: 7 }}
                onClick={() => setFilter(f)}>
                {f === 'all' ? 'Tout' : f === 'todo' ? 'À acheter' : 'Achetés'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add item */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.plus size={16} />
          <input className="input" placeholder="Ajouter un article…" style={{ border: 'none', padding: 6 }} />
          <button className="btn btn-primary">Ajouter</button>
        </div>
      </div>

      {['Frigo', 'Sec', 'Maison'].map(cat => {
        const inCat = visible.filter(i => i.category === cat);
        if (!inCat.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>{cat} · {inCat.filter(i => !i.bought).length} restants</h3>
            {inCat.map(item => {
              const addedBy = users.find(u => u.name === item.added_by);
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg-elev)',
                  marginBottom: 8, opacity: item.bought ? .55 : 1,
                }}>
                  <button
                    onClick={() => toggle(item.id)}
                    style={{
                      width: 22, height: 22, borderRadius: 7,
                      border: `1.5px solid ${item.bought ? 'var(--ink)' : 'var(--line-strong)'}`,
                      background: item.bought ? 'var(--ink)' : 'var(--bg-elev)',
                      color: item.bought ? 'var(--bg)' : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, cursor: 'pointer',
                    }}
                  >
                    {item.bought && <Icons.check size={14} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, textDecoration: item.bought ? 'line-through' : 'none' }}>
                      {item.label} <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· {item.qty}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      Ajouté par {item.added_by}
                      {item.bought && item.bought_by && <> · acheté par <strong>{item.bought_by}</strong></>}
                    </div>
                  </div>
                  {item.priority !== 'normal' && item.priority !== 'low' && !item.bought && (
                    <span className={`pill ${colorByPrio[item.priority]}`}>
                      {item.priority === 'urgent' ? 'Urgent' : 'Important'}
                    </span>
                  )}
                  <div className="num small" style={{ textAlign: 'right' }}>{item.est ? eur(item.est) : ''}</div>
                  <div className={`avatar avatar-${addedBy?.color || 'terra'}`} style={{ width: 24, height: 24, fontSize: 11 }}>
                    {addedBy?.initial || '?'}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
