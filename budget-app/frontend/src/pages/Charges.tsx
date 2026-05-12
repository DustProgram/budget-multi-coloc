import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Pencil, Trash2, X, Check, Users } from 'lucide-react';
import { api } from '../lib/api';
import { eur } from '../lib/format';
import { FREQUENCIES, SPLIT_MODES, type Account, type Charge, type Frequency, type SplitMode } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select, Textarea } from '../components/ui';

interface FormState {
  label: string;
  total_amount: string;
  frequency: Frequency;
  day_of_month: number;
  month: number | null;
  split_mode: SplitMode;
  num_colocs: number;
  split_value: string;
  account_id: number | null;
  is_shared: boolean;
  notes: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  label: '',
  total_amount: '0',
  frequency: 'Mensuelle',
  day_of_month: 1,
  month: null,
  split_mode: 'Perso',
  num_colocs: 1,
  split_value: '',
  account_id: null,
  is_shared: false,
  notes: '',
  is_active: true,
};

const splitHint: Record<SplitMode, string> = {
  Perso: 'Tu paies 100 %. Aucune répartition.',
  Égal: 'Total divisé en parts égales entre tous les colocs.',
  Pourcentage: 'Tu paies X % du total (X = valeur ci-dessous).',
  'Montant fixe': 'Tu paies un montant fixe en € (valeur ci-dessous).',
};

export function Charges() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const list = useQuery({
    queryKey: ['charges'],
    queryFn: async () => (await api.get<Charge[]>('/charges/')).data,
  });

  const accounts = useQuery({
    queryKey: ['accounts', { includeInactive: false }],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        split_value: form.split_value ? form.split_value : null,
        notes: form.notes || null,
        month: form.frequency === 'Mensuelle' ? null : form.month,
      };
      if (editId !== null) await api.patch(`/charges/${editId}`, payload);
      else await api.post('/charges/', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charges'] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/charges/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charges'] }),
  });

  function reset() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(c: Charge) {
    setForm({
      label: c.label,
      total_amount: String(c.total_amount),
      frequency: c.frequency,
      day_of_month: c.day_of_month,
      month: c.month,
      split_mode: c.split_mode,
      num_colocs: c.num_colocs,
      split_value: c.split_value ? String(c.split_value) : '',
      account_id: c.account_id,
      is_shared: c.is_shared,
      notes: c.notes ?? '',
      is_active: c.is_active,
    });
    setEditId(c.id);
    setShowForm(true);
  }

  const accountName = (id: number | null) =>
    accounts.data?.find((a) => a.id === id)?.name ?? '—';

  const totalMyShare = (list.data ?? []).reduce((acc, c) => acc + Number(c.my_share), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader icon={<FileText />} title="Charges fixes">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Ma part totale : <span className="font-semibold text-rose-600">{eur(totalMyShare)}</span>
          </span>
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Nouvelle
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
            <Field label="Libellé">
              <Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
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
            <Field label="Fréquence">
              <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
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
            {form.frequency !== 'Mensuelle' && (
              <Field label="Mois (pour non-mensuelles)">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={form.month ?? ''}
                  onChange={(e) => setForm({ ...form, month: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
            )}
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

            <Field label="Mode de partage">
              <Select value={form.split_mode} onChange={(e) => setForm({ ...form, split_mode: e.target.value as SplitMode })}>
                {SPLIT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre de colocs">
              <Input
                type="number"
                min={1}
                value={form.num_colocs}
                onChange={(e) => setForm({ ...form, num_colocs: Number(e.target.value) })}
              />
            </Field>
            {(form.split_mode === 'Pourcentage' || form.split_mode === 'Montant fixe') && (
              <Field
                label={form.split_mode === 'Pourcentage' ? 'Ma part (%)' : 'Ma part (€)'}
              >
                <Input
                  type="number"
                  step="0.01"
                  value={form.split_value}
                  onChange={(e) => setForm({ ...form, split_value: e.target.value })}
                />
              </Field>
            )}
            <div className="md:col-span-2 lg:col-span-3 text-xs text-slate-500 -mt-1">
              {splitHint[form.split_mode]}
            </div>

            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex items-center gap-4 mt-5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_shared}
                  onChange={(e) => setForm({ ...form, is_shared: e.target.checked })}
                />
                Partagé avec colocs
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>
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
      {list.data && list.data.length === 0 && <EmptyState message="Aucune charge déclarée pour l'instant." />}

      {list.data && list.data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Libellé</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-right px-4 py-2">Ma part</th>
                <th className="text-left px-4 py-2">Fréquence</th>
                <th className="text-center px-4 py-2">Jour</th>
                <th className="text-left px-4 py-2">Partage</th>
                <th className="text-left px-4 py-2">Compte</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className={`border-t border-slate-100 ${!c.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium flex items-center gap-1.5">
                      {c.is_shared && <Users size={12} className="text-sky-500" />}
                      {c.label}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(c.total_amount)}</td>
                  <td className="px-4 py-2 text-right text-rose-600 font-medium tabular-nums">
                    {eur(c.my_share)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{c.frequency}</td>
                  <td className="px-4 py-2 text-center">{c.day_of_month}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">
                    {c.split_mode}
                    {c.split_mode === 'Pourcentage' && c.split_value && ` (${c.split_value}%)`}
                    {c.split_mode === 'Montant fixe' && c.split_value && ` (${eur(c.split_value)})`}
                    {c.split_mode === 'Égal' && ` (÷${c.num_colocs})`}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{accountName(c.account_id)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" onClick={() => startEdit(c)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${c.label}" ?`)) remove.mutate(c.id);
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
