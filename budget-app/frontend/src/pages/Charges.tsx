import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import { useUsersDirectory } from '../lib/useUsersDirectory';
import {
  FREQUENCIES, SPLIT_MODES, type Account, type Charge,
  type Frequency, type SplitMode,
} from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Pill, Select,
} from '../components/ui';

export function Charges() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const allCharges = useQuery({
    queryKey: ['charges'],
    queryFn: async () => (await api.get<Charge[]>('/charges/')).data,
  });
  const spaceAccounts = useSpaceAccountIdsSet();
  const users = useUsersDirectory();
  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  // Filtre par space : charges sur un compte du space actif uniquement
  const charges = {
    ...allCharges,
    data: (allCharges.data ?? []).filter(
      (c) => c.account_id !== null && spaceAccounts.idsSet.has(c.account_id),
    ),
  };
  const myTotal = charges.data.reduce((s, c) => s + num(c.my_share), 0);

  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`/charges/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charges'] });
      qc.invalidateQueries({ queryKey: ['coloc'] });
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Charges"
        title="Charges"
        subtitle={`${eur(myTotal)} de charges ce mois (perso + ma part coloc).`}
      >
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nouvelle charge
        </Button>
      </PageHeader>

      {charges.isLoading && <Loader />}
      {charges.data && charges.data.length === 0 && (
        <EmptyState
          icon={<FileText size={26} />}
          title="Aucune charge"
          message="Crée le loyer, l'internet, les abonnements…"
          action={<Button variant="primary" onClick={() => setCreating(true)}>Ajouter</Button>}
        />
      )}

      {charges.data && charges.data.length > 0 && (
        <Card>
          <table className="t">
            <thead>
              <tr>
                <th>Charge</th>
                <th>Partage</th>
                <th>Mode</th>
                <th>Jour</th>
                <th>Payeur</th>
                <th className="r">Total</th>
                <th className="r">Ma part</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {charges.data.map((c) => {
                const shared = c.splits.length > 0;
                return (
                  <tr key={c.id}>
                    <td><strong>{c.label}</strong></td>
                    <td><Pill tone={shared ? 'sage' : undefined}>{shared ? 'Coloc' : 'Perso'}</Pill></td>
                    <td>{c.split_mode}</td>
                    <td>Le {c.day_of_month}</td>
                    <td className="muted small">{users.display(c.payer_user_id)}</td>
                    <td className="r num">{eur(c.total_amount)}</td>
                    <td className="r num neg display" style={{ fontSize: 17 }}>−{eur(c.my_share)}</td>
                    <td className="r">
                      <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${c.label}" ?`)) remove.mutate(c.id); }}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <NewChargeModal
        open={creating} onClose={() => setCreating(false)}
        accounts={accounts.data ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['charges'] });
          qc.invalidateQueries({ queryKey: ['coloc'] });
        }}
      />
    </>
  );
}

function NewChargeModal({
  open, onClose, accounts, onSaved,
}: { open: boolean; onClose: () => void; accounts: Account[]; onSaved: () => void }) {
  const [form, setForm] = useState<{
    label: string;
    total_amount: string;
    day_of_month: number;
    frequency: Frequency;
    month: number | null;
    split_mode: SplitMode;
    num_colocs: number;
    split_value: string;
    account_id: number | null;
  }>({
    label: '', total_amount: '0', day_of_month: 1,
    frequency: 'Mensuelle',
    month: null,
    split_mode: 'Perso',
    num_colocs: 1,
    split_value: '',
    account_id: accounts[0]?.id ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      await api.post('/charges/', {
        ...form,
        total_amount: form.total_amount || '0',
        split_value: form.split_value || null,
      });
    },
    onSuccess: () => {
      onSaved();
      setForm({
        label: '', total_amount: '0', day_of_month: 1,
        frequency: 'Mensuelle', month: null, split_mode: 'Perso',
        num_colocs: 1, split_value: '',
        account_id: accounts[0]?.id ?? null,
      });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle charge">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Libellé"><Input required value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
        <Field label="Montant total">
          <Input type="number" step="0.01" required value={form.total_amount}
            onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
        </Field>
        <Field label="Jour du mois">
          <Input type="number" min="1" max="31" required value={form.day_of_month}
            onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })} />
        </Field>
        <Field label="Fréquence">
          <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
            {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </Field>
        {form.frequency !== 'Mensuelle' && (
          <Field label="Mois (1-12)">
            <Input type="number" min="1" max="12" value={form.month ?? ''}
              onChange={(e) => setForm({ ...form, month: e.target.value ? Number(e.target.value) : null })} />
          </Field>
        )}
        <Field label="Mode de partage">
          <Select value={form.split_mode} onChange={(e) => setForm({ ...form, split_mode: e.target.value as SplitMode })}>
            {SPLIT_MODES.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        {form.split_mode === 'Égal' && (
          <Field label="Nombre de colocs">
            <Input type="number" min="1" value={form.num_colocs}
              onChange={(e) => setForm({ ...form, num_colocs: Number(e.target.value) })} />
          </Field>
        )}
        {(form.split_mode === 'Pourcentage' || form.split_mode === 'Montant fixe') && (
          <Field label={form.split_mode === 'Pourcentage' ? 'Pourcentage (%)' : 'Montant fixe (ma part)'}>
            <Input type="number" step="0.01" value={form.split_value}
              onChange={(e) => setForm({ ...form, split_value: e.target.value })} />
          </Field>
        )}
        <Field label="Compte">
          <Select value={form.account_id ?? ''}
            onChange={(e) => setForm({ ...form, account_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>)}
          </Select>
        </Field>
        <p className="small muted">
          {form.split_mode !== 'Perso' && 'Si ce compte est joint, les splits seront créés automatiquement pour chaque membre.'}
        </p>
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
