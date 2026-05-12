import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, Trash2, Check } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { ShoppingItem, ShoppingPriority } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Input, Loader,
  PageHeader, Select,
} from '../components/ui';

const PRIORITIES: ShoppingPriority[] = ['low', 'normal', 'high', 'urgent'];

export function Shopping() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('todo');

  // Realtime côté HA → polling React Query toutes les 5s.
  const items = useQuery({
    queryKey: ['shopping', filter],
    queryFn: async () => {
      const params = filter === 'all' ? { show_bought: true } : filter === 'done' ? { show_bought: true } : {};
      return (await api.get<ShoppingItem[]>('/shopping/', { params })).data;
    },
    refetchInterval: 5000,
  });
  const cats = useQuery({
    queryKey: ['shopping-categories'],
    queryFn: async () => (await api.get<string[]>('/shopping/categories')).data,
  });

  const visible = (items.data ?? []).filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'todo') return !i.is_bought;
    return i.is_bought;
  });
  const todo = (items.data ?? []).filter((i) => !i.is_bought);
  const estTotal = todo.reduce((s, i) => s + num(i.estimated_price), 0);

  return (
    <>
      <PageHeader
        eyebrow="Courses partagées"
        title="Liste de courses"
        subtitle={`${todo.length} article${todo.length > 1 ? 's' : ''} à acheter · estimé ${eur(estTotal)}.`}
      >
        <div style={{ display: 'flex', gap: 3, background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
          {(['all', 'todo', 'done'] as const).map((f) => (
            <Button key={f}
              variant={filter === f ? 'primary' : 'ghost'}
              onClick={() => setFilter(f)}
              style={{ borderRadius: 7 }}
            >
              {f === 'all' ? 'Tout' : f === 'todo' ? 'À acheter' : 'Achetés'}
            </Button>
          ))}
        </div>
      </PageHeader>

      <AddItemForm categories={cats.data ?? []} onAdded={() => qc.invalidateQueries({ queryKey: ['shopping'] })} />

      {items.isLoading && <Loader />}
      {items.data && items.data.length === 0 && (
        <EmptyState
          icon={<ListChecks size={26} />}
          title="Liste vide"
          message="Ajoute un premier article — il sera visible par tous les colocs en temps réel."
        />
      )}

      {visible.length > 0 && (
        <ItemGroups items={visible} onChanged={() => qc.invalidateQueries({ queryKey: ['shopping'] })} />
      )}
    </>
  );
}

function AddItemForm({
  categories, onAdded,
}: { categories: string[]; onAdded: () => void }) {
  const [form, setForm] = useState({
    label: '', quantity: '',
    category: categories[0] ?? '',
    priority: 'normal' as ShoppingPriority,
    estimated_price: '',
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.label.trim()) return;
      await api.post('/shopping/', {
        label: form.label.trim(),
        quantity: form.quantity || null,
        category: form.category || null,
        priority: form.priority,
        estimated_price: form.estimated_price || null,
      });
    },
    onSuccess: () => { setForm({ ...form, label: '', quantity: '', estimated_price: '' }); onAdded(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Card style={{ marginBottom: 16 }}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}
        className="row gap-2" style={{ flexWrap: 'wrap' }}>
        <Plus size={16} style={{ color: 'var(--ink-3)' }} />
        <Input placeholder="Ajouter un article…" required
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          style={{ flex: 1, minWidth: 200, border: 'none' }} />
        <Input placeholder="Qté" value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          style={{ width: 80 }} />
        <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option value="">—</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value as ShoppingPriority })}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Input type="number" step="0.01" placeholder="€" value={form.estimated_price}
          onChange={(e) => setForm({ ...form, estimated_price: e.target.value })}
          style={{ width: 90 }} />
        <Button type="submit" variant="primary" disabled={submit.isPending}>Ajouter</Button>
      </form>
      {error && <ErrorBox message={error} />}
    </Card>
  );
}

function ItemGroups({ items, onChanged }: { items: ShoppingItem[]; onChanged: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, ShoppingItem[]>();
    for (const i of items) {
      const k = i.category || 'Autre';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    return [...m.entries()];
  }, [items]);

  return (
    <>
      {groups.map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <h3 className="eyebrow" style={{ marginBottom: 8 }}>
            {cat} · {list.filter((i) => !i.is_bought).length} restants
          </h3>
          {list.map((item) => (
            <ItemRow key={item.id} item={item} onChanged={onChanged} />
          ))}
        </div>
      ))}
    </>
  );
}

function ItemRow({ item, onChanged }: { item: ShoppingItem; onChanged: () => void }) {
  const toggle = useMutation({
    mutationFn: async () => {
      if (item.is_bought) await api.post(`/shopping/${item.id}/uncheck`);
      else await api.post(`/shopping/${item.id}/mark-bought`);
    },
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: async () => api.delete(`/shopping/${item.id}`),
    onSuccess: onChanged,
  });
  const bought = item.is_bought;
  const prio = item.priority;
  return (
    <div className={`shop-item ${bought ? 'done' : ''}`}>
      <button
        type="button"
        className={`checkbox ${bought ? 'checked' : ''}`}
        onClick={() => toggle.mutate()}
        aria-label={bought ? 'Décocher' : 'Cocher'}
      >
        {bought && <Check size={14} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="shop-label">
          {item.label}
          {item.quantity && <span className="muted small"> · {item.quantity}</span>}
        </div>
        <div className="shop-meta">
          Ajouté par {item.added_by_name || '—'}
          {bought && item.bought_by_name && <> · acheté par <strong>{item.bought_by_name}</strong></>}
        </div>
      </div>
      {!bought && (prio === 'urgent' || prio === 'high') && (
        <span className={`pill ${prio === 'urgent' ? 'rose' : 'amber'}`}>
          {prio === 'urgent' ? 'Urgent' : 'Important'}
        </span>
      )}
      <div className="num small right" style={{ width: 60 }}>
        {item.estimated_price ? eur(item.estimated_price) : ''}
      </div>
      <Button variant="ghost" onClick={() => { if (confirm(`Supprimer "${item.label}" ?`)) del.mutate(); }}>
        <Trash2 size={14} />
      </Button>
    </div>
  );
}
