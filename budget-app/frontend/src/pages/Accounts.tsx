import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { api } from '../lib/api';
import { eur } from '../lib/format';
import { ACCOUNT_TYPES, type Account, type AccountType } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select, Textarea } from '../components/ui';

interface FormState {
  bank: string;
  type: AccountType;
  name: string;
  initial_balance: string;
  notes: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  bank: '',
  type: 'Compte courant',
  name: '',
  initial_balance: '0',
  notes: '',
  is_active: true,
};

export function Accounts() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [includeInactive, setIncludeInactive] = useState(false);

  const list = useQuery({
    queryKey: ['accounts', { includeInactive }],
    queryFn: async () => {
      const { data } = await api.get<Account[]>('/accounts/', {
        params: { include_inactive: includeInactive },
      });
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        initial_balance: form.initial_balance || '0',
        notes: form.notes || null,
      };
      if (editId !== null) {
        await api.patch(`/accounts/${editId}`, payload);
      } else {
        await api.post('/accounts/', payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  function reset() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(a: Account) {
    setForm({
      bank: a.bank,
      type: a.type,
      name: a.name,
      initial_balance: String(a.initial_balance),
      notes: a.notes ?? '',
      is_active: a.is_active,
    });
    setEditId(a.id);
    setShowForm(true);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader icon={<CreditCard />} title="Comptes bancaires">
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Inclure inactifs
          </label>
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
            <Field label="Banque">
              <Input required value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Libellé">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Solde initial">
              <Input
                type="number"
                step="0.01"
                value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <div className="flex items-center gap-2 mt-5">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="is_active" className="text-sm">
                Compte actif
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
      {list.isError && <ErrorBox message="Erreur de chargement." />}
      {list.data && list.data.length === 0 && (
        <EmptyState
          message="Aucun compte pour l'instant."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} /> Ajouter mon premier compte
            </Button>
          }
        />
      )}

      {list.data && list.data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Banque</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Libellé</th>
                <th className="text-right px-4 py-2">Solde initial</th>
                <th className="text-center px-4 py-2">État</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{a.bank}</td>
                  <td className="px-4 py-2 text-slate-600">{a.type}</td>
                  <td className="px-4 py-2 font-medium">{a.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(a.initial_balance)}</td>
                  <td className="px-4 py-2 text-center">
                    {a.is_active ? (
                      <span className="text-emerald-600 text-xs">Actif</span>
                    ) : (
                      <span className="text-slate-400 text-xs">Inactif</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" onClick={() => startEdit(a)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${a.name}" ?`)) remove.mutate(a.id);
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
