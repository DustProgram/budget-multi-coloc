import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PiggyBank, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { api } from '../lib/api';
import { eur } from '../lib/format';
import type { Account, Saving } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select, Textarea } from '../components/ui';

interface FormState {
  label: string;
  amount: string;
  source_account_id: number | null;
  dest_account_id: number | null;
  day_of_month: number;
  is_active: boolean;
  notes: string;
}

const emptyForm: FormState = {
  label: '',
  amount: '0',
  source_account_id: null,
  dest_account_id: null,
  day_of_month: 1,
  is_active: true,
  notes: '',
};

export function Savings() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const list = useQuery({
    queryKey: ['savings'],
    queryFn: async () => (await api.get<Saving[]>('/savings/')).data,
  });
  const accounts = useQuery({
    queryKey: ['accounts', { includeInactive: false }],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, notes: form.notes || null };
      if (editId !== null) await api.patch(`/savings/${editId}`, payload);
      else await api.post('/savings/', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savings'] });
      reset();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/savings/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings'] }),
  });

  function reset() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(s: Saving) {
    setForm({
      label: s.label,
      amount: String(s.amount),
      source_account_id: s.source_account_id,
      dest_account_id: s.dest_account_id,
      day_of_month: s.day_of_month,
      is_active: s.is_active,
      notes: s.notes ?? '',
    });
    setEditId(s.id);
    setShowForm(true);
  }

  const accountName = (id: number) => accounts.data?.find((a) => a.id === id)?.name ?? `#${id}`;
  const total = (list.data ?? []).reduce((acc, s) => acc + Number(s.amount), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader icon={<PiggyBank />} title="Épargne automatique">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Total mensuel mis de côté : <span className="font-semibold text-violet-600">{eur(total)}</span>
          </span>
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Nouvelle ligne
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
            <Field label="Libellé">
              <Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
            <Field label="Montant mensuel">
              <Input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Compte source">
              <Select
                required
                value={form.source_account_id ?? ''}
                onChange={(e) => setForm({ ...form, source_account_id: Number(e.target.value) })}
              >
                <option value="">— Choisir —</option>
                {accounts.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank} — {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Compte destination (épargne)">
              <Select
                required
                value={form.dest_account_id ?? ''}
                onChange={(e) => setForm({ ...form, dest_account_id: Number(e.target.value) })}
              >
                <option value="">— Choisir —</option>
                {accounts.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank} — {a.name}
                  </option>
                ))}
              </Select>
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
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex items-center gap-2 mt-5">
              <input
                id="is_active_sv"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="is_active_sv" className="text-sm">Active</label>
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
      {list.data && list.data.length === 0 && <EmptyState message="Aucune épargne automatique configurée." />}
      {list.data && list.data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Libellé</th>
                <th className="text-right px-4 py-2">Montant</th>
                <th className="text-left px-4 py-2">Source</th>
                <th className="text-left px-4 py-2">Destination</th>
                <th className="text-center px-4 py-2">Jour</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id} className={`border-t border-slate-100 ${!s.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-medium">{s.label}</td>
                  <td className="px-4 py-2 text-right text-violet-600 font-medium tabular-nums">
                    {eur(s.amount)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{accountName(s.source_account_id)}</td>
                  <td className="px-4 py-2 text-slate-600">{accountName(s.dest_account_id)}</td>
                  <td className="px-4 py-2 text-center">{s.day_of_month}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" onClick={() => startEdit(s)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${s.label}" ?`)) remove.mutate(s.id);
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
