import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, Trash2, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { eur } from '../lib/format';
import type { ShoppingItem, ShoppingPriority } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select } from '../components/ui';

const PRIORITIES: ShoppingPriority[] = ['low', 'normal', 'high', 'urgent'];
const PRIORITY_META: Record<ShoppingPriority, { label: string; class: string }> = {
  low: { label: 'Faible', class: 'bg-slate-100 text-slate-600' },
  normal: { label: 'Normal', class: 'bg-sky-100 text-sky-700' },
  high: { label: 'Élevé', class: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', class: 'bg-rose-100 text-rose-700' },
};

interface AddForm {
  label: string;
  quantity: string;
  category: string;
  priority: ShoppingPriority;
  estimated_price: string;
}

const emptyForm: AddForm = {
  label: '',
  quantity: '',
  category: '',
  priority: 'normal',
  estimated_price: '',
};

export function Shopping() {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddForm>(emptyForm);
  const [showBought, setShowBought] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('');

  const list = useQuery({
    queryKey: ['shopping', { showBought, filterCategory }],
    queryFn: async () => {
      const params: Record<string, string | boolean> = { show_bought: showBought };
      if (filterCategory) params.category = filterCategory;
      return (await api.get<ShoppingItem[]>('/shopping/', { params })).data;
    },
  });

  const categories = useQuery({
    queryKey: ['shopping', 'categories'],
    queryFn: async () => (await api.get<string[]>('/shopping/categories')).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      await api.post('/shopping/', {
        label: form.label,
        quantity: form.quantity || null,
        category: form.category || null,
        priority: form.priority,
        estimated_price: form.estimated_price ? form.estimated_price : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping'] });
      setForm(emptyForm);
    },
  });

  const markBought = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/shopping/${id}/mark-bought`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });

  const uncheck = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/shopping/${id}/uncheck`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/shopping/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });

  const cleanup = useMutation({
    mutationFn: async () => {
      await api.post('/shopping/cleanup-bought');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const item of list.data ?? []) {
      const cat = item.category || 'Sans catégorie';
      const arr = map.get(cat) ?? [];
      arr.push(item);
      map.set(cat, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [list.data]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader icon={<ListChecks />} title="Liste de courses">
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showBought}
              onChange={(e) => setShowBought(e.target.checked)}
            />
            Voir achetés
          </label>
          <Select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-44"
          >
            <option value="">Toutes catégories</option>
            {categories.data?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            onClick={() => {
              if (confirm('Vider tous les articles achetés ?')) cleanup.mutate();
            }}
          >
            <Trash2 size={14} /> Nettoyer achetés
          </Button>
        </div>
      </PageHeader>

      <Card className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.label.trim()) create.mutate();
          }}
          className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end"
        >
          <div className="md:col-span-2">
            <Field label="Article">
              <Input
                required
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="ex: Lait demi-écrémé"
              />
            </Field>
          </div>
          <Field label="Quantité">
            <Input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="2, 500g, 1 pack"
            />
          </Field>
          <Field label="Catégorie">
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              list="cat-list"
            />
            <datalist id="cat-list">
              {categories.data?.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Priorité">
            <Select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as ShoppingPriority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={create.isPending}>
            <Plus size={16} /> Ajouter
          </Button>
        </form>
        {create.isError && <ErrorBox message="Erreur à l'ajout." />}
      </Card>

      {list.isLoading && <Loader />}
      {list.data && list.data.length === 0 && (
        <EmptyState message="Aucun article dans la liste 🛒" />
      )}

      <div className="space-y-4">
        {grouped.map(([category, items]) => (
          <Card key={category} className="p-0 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs uppercase tracking-wide text-slate-600 font-medium">
              {category} <span className="text-slate-400">({items.length})</span>
            </div>
            <ul>
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-2 border-t border-slate-100 ${
                    item.is_bought ? 'opacity-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.is_bought}
                    onChange={() =>
                      item.is_bought ? uncheck.mutate(item.id) : markBought.mutate(item.id)
                    }
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${item.is_bought ? 'line-through' : 'font-medium'}`}>
                      {item.label}
                      {item.quantity && (
                        <span className="text-slate-500 ml-2 font-normal">— {item.quantity}</span>
                      )}
                    </p>
                    {(item.bought_by_name || item.added_by_name) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {item.is_bought && item.bought_by_name
                          ? `Acheté par ${item.bought_by_name}`
                          : `Ajouté par ${item.added_by_name ?? '—'}`}
                      </p>
                    )}
                  </div>
                  {item.priority !== 'normal' && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${PRIORITY_META[item.priority].class}`}
                    >
                      {item.priority === 'urgent' && <AlertTriangle size={10} />}
                      {PRIORITY_META[item.priority].label}
                    </span>
                  )}
                  {item.estimated_price && (
                    <span className="text-xs text-slate-500 tabular-nums">
                      ~{eur(item.estimated_price)}
                    </span>
                  )}
                  <div className="flex gap-1">
                    {item.is_bought ? (
                      <Button variant="ghost" onClick={() => uncheck.mutate(item.id)} title="Décocher">
                        <RotateCcw size={14} />
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => markBought.mutate(item.id)} title="Acheté">
                        <Check size={14} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Supprimer "${item.label}" ?`)) remove.mutate(item.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
