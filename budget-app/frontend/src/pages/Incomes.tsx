import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Plus, Trash2, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import { useUsersDirectory } from '../lib/useUsersDirectory';
import { INCOME_TYPES, type Account, type Income, type IncomeTypeName } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Select, Pill,
} from '../components/ui';

export function Incomes() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);

  const allIncomes = useQuery({
    queryKey: ['incomes'],
    queryFn: async () => (await api.get<Income[]>('/incomes/')).data,
  });
  const spaceAccounts = useSpaceAccountIdsSet();
  const users = useUsersDirectory();
  // Tous les comptes (pas filtrés) pour la modal de création
  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  // Filtre par space : on ne montre que les revenus liés à un compte du space actif
  const incomes = {
    ...allIncomes,
    data: (allIncomes.data ?? []).filter(
      (i) => i.account_id !== null && spaceAccounts.idsSet.has(i.account_id),
    ),
  };
  const total = incomes.data.reduce((s, i) => s + num(i.amount), 0);
  const accById = new Map((accounts.data ?? []).map((a) => [a.id, a]));

  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`/incomes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incomes'] }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Revenus"
        title="Revenus du mois"
        subtitle={`${eur(total)} prévus — ${incomes.data?.length ?? 0} source${(incomes.data?.length ?? 0) > 1 ? 's' : ''} active${(incomes.data?.length ?? 0) > 1 ? 's' : ''}.`}
      >
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nouveau revenu
        </Button>
      </PageHeader>

      {incomes.isLoading && <Loader />}
      {incomes.data && incomes.data.length === 0 && (
        <EmptyState
          icon={<TrendingUp size={26} />}
          title="Aucun revenu"
          message="Ajoute ton salaire, tes piges, tes APL."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Ajouter</Button>}
        />
      )}

      {incomes.data && incomes.data.length > 0 && (
        <Card>
          <table className="t">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Jour</th>
                <th>Compte</th>
                <th>Par</th>
                <th className="r">Montant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {incomes.data.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.source}</strong></td>
                  <td><Pill>{i.type}</Pill></td>
                  <td>Le {i.day_of_month}</td>
                  <td>{i.account_id ? accById.get(i.account_id)?.name ?? '—' : '—'}</td>
                  <td className="muted small">{users.display(i.user_id)}</td>
                  <td className="r num pos display" style={{ fontSize: 18 }}>+{eur(i.amount)}</td>
                  <td className="r">
                    <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                      <Button variant="sm" onClick={() => setEditing(i)} title="Modifier">
                        <Pencil size={12} />
                      </Button>
                      <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${i.source}" ?`)) remove.mutate(i.id); }} title="Supprimer">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <IncomeModal
        open={creating || !!editing}
        existing={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        accounts={accounts.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ['incomes'] })}
      />
    </>
  );
}

function IncomeModal({
  open, onClose, accounts, existing, onSaved,
}: {
  open: boolean; onClose: () => void; accounts: Account[];
  existing: Income | null; onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [form, setForm] = useState<{
    source: string;
    amount: string;
    day_of_month: number;
    type: IncomeTypeName;
    account_id: number | null;
    valid_from: string;
    valid_to: string;
  }>(() => existing ? {
    source: existing.source,
    amount: existing.amount,
    day_of_month: existing.day_of_month,
    type: existing.type,
    account_id: existing.account_id,
    valid_from: existing.valid_from ?? '',
    valid_to: existing.valid_to ?? '',
  } : {
    source: '', amount: '0', day_of_month: 1,
    type: 'Régulier' as IncomeTypeName,
    account_id: accounts[0]?.id ?? null,
    valid_from: '',
    valid_to: '',
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        amount: form.amount || '0',
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
      };
      if (isEdit && existing) {
        await api.patch(`/incomes/${existing.id}`, body);
      } else {
        await api.post('/incomes/', body);
      }
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier le revenu' : 'Nouveau revenu'}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Source"><Input required value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
        <Field label="Montant">
          <Input type="number" step="0.01" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="Jour du mois">
          <Input type="number" min="1" max="31" required value={form.day_of_month}
            onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })} />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as IncomeTypeName })}>
            {INCOME_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Compte">
          <Select value={form.account_id ?? ''}
            onChange={(e) => setForm({ ...form, account_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>)}
          </Select>
        </Field>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="À partir de (optionnel)">
            <Input type="date" value={form.valid_from}
              onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </Field>
          <Field label="Jusqu'au (optionnel)">
            <Input type="date" value={form.valid_to}
              onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          </Field>
        </div>
        <p className="small muted">
          Utilise ces dates pour gérer un changement de salaire ou un revenu temporaire.
        </p>
        {error && <ErrorBox message={error} />}
        <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Créer')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
