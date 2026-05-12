import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus, Pencil, Trash2, X, Check, Repeat, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { eur, fmtDate, todayISO } from '../lib/format';
import { FREQUENCIES, type Account, type Frequency, type OneTimeTransfer, type RecurringTransfer } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select, Textarea } from '../components/ui';

type Tab = 'recurring' | 'onetime';

interface RecurringForm {
  label: string;
  source_account_id: number | null;
  dest_account_id: number | null;
  amount: string;
  day_of_month: number;
  frequency: Frequency;
  is_active: boolean;
  notes: string;
}

interface OneTimeForm {
  date: string;
  label: string;
  source_account_id: number | null;
  dest_account_id: number | null;
  amount: string;
  notes: string;
}

const emptyRecurring: RecurringForm = {
  label: '',
  source_account_id: null,
  dest_account_id: null,
  amount: '0',
  day_of_month: 1,
  frequency: 'Mensuelle',
  is_active: true,
  notes: '',
};

const emptyOneTime: OneTimeForm = {
  date: todayISO(),
  label: '',
  source_account_id: null,
  dest_account_id: null,
  amount: '0',
  notes: '',
};

export function Transfers() {
  const [tab, setTab] = useState<Tab>('recurring');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader icon={<ArrowLeftRight />} title="Virements interbancaires">
        <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setTab('recurring')}
            className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1.5 ${
              tab === 'recurring' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Repeat size={14} /> Récurrents
          </button>
          <button
            onClick={() => setTab('onetime')}
            className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1.5 ${
              tab === 'onetime' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock size={14} /> Ponctuels
          </button>
        </div>
      </PageHeader>

      {tab === 'recurring' ? <RecurringTab /> : <OneTimeTab />}
    </div>
  );
}

function RecurringTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<RecurringForm>(emptyRecurring);

  const list = useQuery({
    queryKey: ['transfers', 'recurring'],
    queryFn: async () => (await api.get<RecurringTransfer[]>('/transfers/recurring')).data,
  });
  const accounts = useQuery({
    queryKey: ['accounts', { includeInactive: false }],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, notes: form.notes || null };
      if (editId !== null) await api.patch(`/transfers/recurring/${editId}`, payload);
      else await api.post('/transfers/recurring', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers', 'recurring'] });
      reset();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/transfers/recurring/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers', 'recurring'] }),
  });

  function reset() {
    setForm(emptyRecurring);
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(t: RecurringTransfer) {
    setForm({
      label: t.label,
      source_account_id: t.source_account_id,
      dest_account_id: t.dest_account_id,
      amount: String(t.amount),
      day_of_month: t.day_of_month,
      frequency: t.frequency,
      is_active: t.is_active,
      notes: t.notes ?? '',
    });
    setEditId(t.id);
    setShowForm(true);
  }

  const accountName = (id: number) => accounts.data?.find((a) => a.id === id)?.name ?? `#${id}`;

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Nouveau virement récurrent
        </Button>
      </div>

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
            <Field label="Montant">
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
            <Field label="Compte destination">
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
            <Field label="Fréquence">
              <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex items-center gap-2 mt-5">
              <input
                id="is_active_rec"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="is_active_rec" className="text-sm">Actif</label>
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
      {list.data && list.data.length === 0 && <EmptyState message="Aucun virement récurrent." />}
      {list.data && list.data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Libellé</th>
                <th className="text-right px-4 py-2">Montant</th>
                <th className="text-left px-4 py-2">De</th>
                <th className="text-left px-4 py-2">Vers</th>
                <th className="text-center px-4 py-2">Jour</th>
                <th className="text-left px-4 py-2">Fréquence</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((t) => (
                <tr key={t.id} className={`border-t border-slate-100 ${!t.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-medium">{t.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(t.amount)}</td>
                  <td className="px-4 py-2 text-slate-600">{accountName(t.source_account_id)}</td>
                  <td className="px-4 py-2 text-slate-600">{accountName(t.dest_account_id)}</td>
                  <td className="px-4 py-2 text-center">{t.day_of_month}</td>
                  <td className="px-4 py-2 text-slate-600">{t.frequency}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" onClick={() => startEdit(t)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${t.label}" ?`)) remove.mutate(t.id);
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
    </>
  );
}

function OneTimeTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<OneTimeForm>(emptyOneTime);

  const list = useQuery({
    queryKey: ['transfers', 'onetime'],
    queryFn: async () => (await api.get<OneTimeTransfer[]>('/transfers/onetime')).data,
  });
  const accounts = useQuery({
    queryKey: ['accounts', { includeInactive: false }],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, notes: form.notes || null };
      if (editId !== null) await api.patch(`/transfers/onetime/${editId}`, payload);
      else await api.post('/transfers/onetime', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers', 'onetime'] });
      reset();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/transfers/onetime/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers', 'onetime'] }),
  });

  function reset() {
    setForm(emptyOneTime);
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(t: OneTimeTransfer) {
    setForm({
      date: t.date,
      label: t.label,
      source_account_id: t.source_account_id,
      dest_account_id: t.dest_account_id,
      amount: String(t.amount),
      notes: t.notes ?? '',
    });
    setEditId(t.id);
    setShowForm(true);
  }

  const accountName = (id: number) => accounts.data?.find((a) => a.id === id)?.name ?? `#${id}`;

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Nouveau virement ponctuel
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <Field label="Date">
              <Input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Libellé">
              <Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
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
            <Field label="Compte destination">
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
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
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
      {list.data && list.data.length === 0 && <EmptyState message="Aucun virement ponctuel." />}
      {list.data && list.data.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Libellé</th>
                <th className="text-right px-4 py-2">Montant</th>
                <th className="text-left px-4 py-2">De</th>
                <th className="text-left px-4 py-2">Vers</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{fmtDate(t.date)}</td>
                  <td className="px-4 py-2 font-medium">{t.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(t.amount)}</td>
                  <td className="px-4 py-2 text-slate-600">{accountName(t.source_account_id)}</td>
                  <td className="px-4 py-2 text-slate-600">{accountName(t.dest_account_id)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" onClick={() => startEdit(t)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer "${t.label}" ?`)) remove.mutate(t.id);
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
    </>
  );
}
