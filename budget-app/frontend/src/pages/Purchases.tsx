import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { api } from '../lib/api';
import { eur, fmtDate, todayISO } from '../lib/format';
import { PAYMENT_METHODS, type Account, type PaymentMethod, type Purchase } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select, Textarea } from '../components/ui';

interface FormState {
  date: string;
  description: string;
  total_amount: string;
  nb_installments: number;
  category: string;
  payment_method: PaymentMethod;
  account_id: number | null;
  notes: string;
}

const emptyForm: FormState = {
  date: todayISO(),
  description: '',
  total_amount: '0',
  nb_installments: 1,
  category: '',
  payment_method: 'CB',
  account_id: null,
  notes: '',
};

export function Purchases() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterMonth, setFilterMonth] = useState<string>('');

  const filterYearMonth = filterMonth ? filterMonth.split('-') : null;

  const list = useQuery({
    queryKey: ['purchases', filterMonth],
    queryFn: async () => {
      const params: Record<string, number> = {};
      if (filterYearMonth) {
        params.year = Number(filterYearMonth[0]);
        params.month = Number(filterYearMonth[1]);
      }
      return (await api.get<Purchase[]>('/purchases/', { params })).data;
    },
  });

  const accounts = useQuery({
    queryKey: ['accounts', { includeInactive: false }],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        category: form.category || null,
        notes: form.notes || null,
      };
      if (editId !== null) await api.patch(`/purchases/${editId}`, payload);
      else await api.post('/purchases/', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/purchases/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchases'] }),
  });

  function reset() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(p: Purchase) {
    setForm({
      date: p.date,
      description: p.description,
      total_amount: String(p.total_amount),
      nb_installments: p.nb_installments,
      category: p.category ?? '',
      payment_method: p.payment_method,
      account_id: p.account_id,
      notes: p.notes ?? '',
    });
    setEditId(p.id);
    setShowForm(true);
  }

  const accountName = (id: number | null) => accounts.data?.find((a) => a.id === id)?.name ?? '—';
  const totalAll = (list.data ?? []).reduce((acc, p) => acc + Number(p.total_amount), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader icon={<ShoppingBag />} title="Achats">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-44"
          />
          <span className="text-sm text-slate-600">
            Total : <span className="font-semibold">{eur(totalAll)}</span>
          </span>
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Nouvel achat
          </Button>
        </div>
      </PageHeader>

      {showForm && (
        <Card className="mb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <Field label="Date">
              <Input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Montant total">
              <Input
                type="number"
                step="0.01"
                required
                value={form.total_amount}
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
              />
            </Field>
            <Field label="Nombre de mensualités">
              <Input
                type="number"
                min={1}
                value={form.nb_installments}
                onChange={(e) => setForm({ ...form, nb_installments: Number(e.target.value) })}
              />
            </Field>
            <Field label="Catégorie">
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="ex: Alimentation, Loisirs…"
              />
            </Field>
            <Field label="Moyen de paiement">
              <Select
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Compte débité">
              <Select
                value={form.account_id ?? ''}
                onChange={(e) => setForm({ ...form, account_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Non assigné —</option>
                {accounts.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank} — {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={reset}>
                <X size={16} /> Annuler
              </Button>
              <Button type="submit" disabled={save.isPending}>
                <Check size={16} /> {editId !== null ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </form>
          {save.isError && <ErrorBox message="Erreur lors de l'enregistrement." />}
        </Card>
      )}

      {list.isLoading && <Loader />}
      {list.data && list.data.length === 0 && <EmptyState message="Aucun achat enregistré." />}
      {list.data && list.data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Description</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-center px-4 py-2">Mensualités</th>
                <th className="text-right px-4 py-2">/mois</th>
                <th className="text-left px-4 py-2">Catégorie</th>
                <th className="text-left px-4 py-2">Paiement</th>
                <th className="text-left px-4 py-2">Compte</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{fmtDate(p.date)}</td>
                  <td className="px-4 py-2 font-medium">{p.description}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(p.total_amount)}</td>
                  <td className="px-4 py-2 text-center">{p.nb_installments}x</td>
                  <td className="px-4 py-2 text-right text-orange-600 tabular-nums">{eur(p.monthly_amount)}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">{p.category ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">{p.payment_method}</td>
                  <td className="px-4 py-2 text-slate-600">{accountName(p.account_id)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" onClick={() => startEdit(p)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${p.description}" ?`)) remove.mutate(p.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
