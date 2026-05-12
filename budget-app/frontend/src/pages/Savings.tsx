import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import type { Account, Saving } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Select,
} from '../components/ui';

export function Savings() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const allRules = useQuery({
    queryKey: ['savings'],
    queryFn: async () => (await api.get<Saving[]>('/savings/')).data,
  });
  const spaceAccounts = useSpaceAccountIdsSet();
  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });
  // Filtre : règles dont source OU dest est dans le space actif
  const rules = {
    ...allRules,
    data: (allRules.data ?? []).filter(
      (r) => spaceAccounts.idsSet.has(r.source_account_id)
          || spaceAccounts.idsSet.has(r.dest_account_id),
    ),
  };

  const total = rules.data
    .filter((r) => r.is_active)
    .reduce((s, r) => s + num(r.amount), 0);
  const accById = new Map((accounts.data ?? []).map((a) => [a.id, a]));

  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`/savings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings'] }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Épargne"
        title="Épargne automatique"
        subtitle={`${eur(total)} mis de côté chaque mois automatiquement.`}
      >
        <Button variant="primary" onClick={() => setCreating(true)} disabled={(accounts.data?.length ?? 0) < 2}>
          <Plus size={14} /> Nouvelle règle
        </Button>
      </PageHeader>

      {rules.isLoading && <Loader />}
      {rules.data && rules.data.length === 0 && (
        <EmptyState
          icon={<PiggyBank size={26} />}
          title="Pas encore de règle"
          message="Programme une épargne mensuelle automatique entre deux comptes."
          action={<Button variant="primary" onClick={() => setCreating(true)} disabled={(accounts.data?.length ?? 0) < 2}>
            Créer une règle
          </Button>}
        />
      )}

      {rules.data && rules.data.length > 0 && (
        <Card>
          <table className="t">
            <thead>
              <tr>
                <th>Règle</th>
                <th>Flux</th>
                <th>Jour</th>
                <th className="r">Montant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.data.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.label}</strong></td>
                  <td>
                    {accById.get(r.source_account_id)?.name ?? '—'} → {accById.get(r.dest_account_id)?.name ?? '—'}
                  </td>
                  <td>Le {r.day_of_month}</td>
                  <td className="r num display" style={{ fontSize: 18, color: 'var(--plum)' }}>
                    {eur(r.amount)}
                  </td>
                  <td className="r">
                    <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${r.label}" ?`)) remove.mutate(r.id); }}>
                      <Trash2 size={12} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NewSavingModal
        open={creating} onClose={() => setCreating(false)}
        accounts={accounts.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ['savings'] })}
      />
    </>
  );
}

function NewSavingModal({
  open, onClose, accounts, onSaved,
}: { open: boolean; onClose: () => void; accounts: Account[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    label: '', amount: '0', day_of_month: 1,
    source_account_id: accounts[0]?.id ?? 0,
    dest_account_id: accounts[1]?.id ?? accounts[0]?.id ?? 0,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (form.source_account_id === form.dest_account_id) throw new Error('Source et destination doivent être différents.');
      await api.post('/savings/', { ...form, amount: form.amount || '0', is_active: true });
    },
    onSuccess: () => {
      onSaved();
      setForm({ label: '', amount: '0', day_of_month: 1,
        source_account_id: accounts[0]?.id ?? 0,
        dest_account_id: accounts[1]?.id ?? accounts[0]?.id ?? 0 });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle règle d'épargne">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Libellé"><Input required value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
        <Field label="Montant">
          <Input type="number" step="0.01" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="Jour du mois">
          <Input type="number" min="1" max="31" required value={form.day_of_month}
            onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })} />
        </Field>
        <Field label="Compte source">
          <Select value={form.source_account_id}
            onChange={(e) => setForm({ ...form, source_account_id: Number(e.target.value) })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Compte destination">
          <Select value={form.dest_account_id}
            onChange={(e) => setForm({ ...form, dest_account_id: Number(e.target.value) })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
