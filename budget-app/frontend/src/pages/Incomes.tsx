import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { api } from '../lib/api';
import { eur } from '../lib/format';
import { INCOME_TYPES, type Account, type Income, type IncomeTypeName } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select, Textarea } from '../components/ui';

interface FormState {
  source: string;
  amount: string;
  day_of_month: number;
  type: IncomeTypeName;
  account_id: number | null;
  notes: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  source: '',
  amount: '0',
  day_of_month: 1,
  type: 'Régulier',
  account_id: null,
  notes: '',
  is_active: true,
};

export function Incomes() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const list = useQuery({
    queryKey: ['incomes'],
    queryFn: async () => (await api.get<Income[]>('/incomes/')).data,
  });

  const accounts = useQuery({
    queryKey: ['accounts', { includeInactive: false }],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, notes: form.notes || null };
      if (editId !== null) await api.patch(`/incomes/${editId}`, payload);
      else await api.post('/incomes/', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incomes'] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/incomes/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incomes'] }),
  });

  function reset() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(i: Income) {
    setForm({
      source: i.source,
      amount: String(i.amount),
      day_of_month: i.day_of_month,
      type: i.type,
      account_id: i.account_id,
      notes: i.notes ?? '',
      is_active: i.is_active,
    });
    setEditId(i.id);
    setShowForm(true);
  }

  const accountName = (id: number | null) =>
    accounts.data?.find((a) => a.id === id)?.name ?? '—';

  const total = (list.data ?? []).reduce((acc, i) => acc + Number(i.amount), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader icon={<TrendingUp />} title="Revenus">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Total mensuel : <span className="font-semibold text-emerald-600">{eur(total)}</span>
          </span>
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Nouveau
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
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <Field label="Source">
              <Input required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
            <Field label="Montant">
              <Input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Jour du mois">
              <Input
                type="number"
                min={1}
                max={31}
                required
                value={form.day_of_month}
                onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })}
              />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as IncomeTypeName })}>
                {INCOME_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Compte de réception">
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
            <div className="flex items-center gap-2 mt-5">
              <input
                id="is_active_inc"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="is_active_inc" className="text-sm">
                Revenu actif
              </label>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
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
      {list.data && list.data.length === 0 && (
        <EmptyState message="Aucun revenu déclaré pour l'instant." />
      )}

      {list.data && list.data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Source</th>
                <th className="text-right px-4 py-2">Montant</th>
                <th className="text-center px-4 py-2">Jour</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Compte</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((i) => (
                <tr key={i.id} className={`border-t border-slate-100 ${!i.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-medium">{i.source}</td>
                  <td className="px-4 py-2 text-right text-emerald-600 font-medium tabular-nums">
                    {eur(i.amount)}
                  </td>
                  <td className="px-4 py-2 text-center">{i.day_of_month}</td>
                  <td className="px-4 py-2 text-slate-600">{i.type}</td>
                  <td className="px-4 py-2 text-slate-600">{accountName(i.account_id)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" onClick={() => startEdit(i)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${i.source}" ?`)) remove.mutate(i.id);
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
