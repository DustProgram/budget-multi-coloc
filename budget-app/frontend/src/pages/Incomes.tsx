import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import { INCOME_TYPES, type Account, type Income, type IncomeTypeName } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Select, Pill,
} from '../components/ui';

export function Incomes() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const allIncomes = useQuery({
    queryKey: ['incomes'],
    queryFn: async () => (await api.get<Income[]>('/incomes/')).data,
  });
  const spaceAccounts = useSpaceAccountIdsSet();
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
                  <td className="r num pos display" style={{ fontSize: 18 }}>+{eur(i.amount)}</td>
                  <td className="r">
                    <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${i.source}" ?`)) remove.mutate(i.id); }}>
                      <Trash2 size={12} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NewIncomeModal
        open={creating} onClose={() => setCreating(false)}
        accounts={accounts.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ['incomes'] })}
      />
    </>
  );
}

function NewIncomeModal({
  open, onClose, accounts, onSaved,
}: { open: boolean; onClose: () => void; accounts: Account[]; onSaved: () => void }) {
  const [form, setForm] = useState<{
    source: string;
    amount: string;
    day_of_month: number;
    type: IncomeTypeName;
    account_id: number | null;
  }>({
    source: '', amount: '0', day_of_month: 1,
    type: 'Régulier',
    account_id: accounts[0]?.id ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      await api.post('/incomes/', {
        ...form,
        amount: form.amount || '0',
        account_id: form.account_id,
      });
    },
    onSuccess: () => {
      onSaved();
      setForm({ source: '', amount: '0', day_of_month: 1, type: 'Régulier', account_id: accounts[0]?.id ?? null });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nouveau revenu">
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
        {error && <ErrorBox message={error} />}
        <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? 'Création…' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
