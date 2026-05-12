import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { eur, fmtDate, todayISO } from '../lib/format';
import {
  FREQUENCIES, type Account, type Frequency,
  type OneTimeTransfer, type RecurringTransfer,
} from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Pill, Select,
} from '../components/ui';

export function Transfers() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'recurring' | 'onetime'>('recurring');
  const [creating, setCreating] = useState(false);

  const recurring = useQuery({
    queryKey: ['transfers', 'recurring'],
    queryFn: async () => (await api.get<RecurringTransfer[]>('/transfers/recurring/')).data,
  });
  const onetime = useQuery({
    queryKey: ['transfers', 'onetime'],
    queryFn: async () => (await api.get<OneTimeTransfer[]>('/transfers/onetime/')).data,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const accById = new Map((accounts.data ?? []).map((a) => [a.id, a]));

  const remove = useMutation({
    mutationFn: async ({ kind, id }: { kind: 'recurring' | 'onetime'; id: number }) =>
      api.delete(`/transfers/${kind}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Virements interbancaires"
        title="Virements"
        subtitle="Mouvements entre tes comptes — récurrents ou ponctuels."
      >
        <Button variant="primary" onClick={() => setCreating(true)} disabled={(accounts.data?.length ?? 0) < 2}>
          <Plus size={14} /> Nouveau virement
        </Button>
      </PageHeader>

      <div className="row gap-2" style={{ marginBottom: 16 }}>
        <Button variant={tab === 'recurring' ? 'primary' : 'default'} onClick={() => setTab('recurring')}>
          Récurrents
        </Button>
        <Button variant={tab === 'onetime' ? 'primary' : 'default'} onClick={() => setTab('onetime')}>
          Ponctuels
        </Button>
      </div>

      {(recurring.isLoading || onetime.isLoading) && <Loader />}

      {tab === 'recurring' && recurring.data && (
        recurring.data.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight size={26} />}
            title="Aucun virement récurrent"
            message="Programme un virement mensuel entre tes comptes."
          />
        ) : (
          <Card>
            <table className="t">
              <thead>
                <tr><th>Libellé</th><th>Flux</th><th>Jour</th><th>Fréquence</th><th className="r">Montant</th><th></th></tr>
              </thead>
              <tbody>
                {recurring.data.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.label}</strong></td>
                    <td>{accById.get(r.source_account_id)?.name ?? '—'} → {accById.get(r.dest_account_id)?.name ?? '—'}</td>
                    <td>Le {r.day_of_month}</td>
                    <td><Pill tone="plum">{r.frequency}</Pill></td>
                    <td className="r num">{eur(r.amount)}</td>
                    <td className="r">
                      <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${r.label}" ?`)) remove.mutate({ kind: 'recurring', id: r.id }); }}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'onetime' && onetime.data && (
        onetime.data.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight size={26} />}
            title="Aucun virement ponctuel"
            message="Saisie un transfert unique à une date donnée."
          />
        ) : (
          <Card>
            <table className="t">
              <thead>
                <tr><th>Date</th><th>Libellé</th><th>Flux</th><th className="r">Montant</th><th></th></tr>
              </thead>
              <tbody>
                {onetime.data.map((o) => (
                  <tr key={o.id}>
                    <td>{fmtDate(o.date)}</td>
                    <td><strong>{o.label}</strong></td>
                    <td>{accById.get(o.source_account_id)?.name ?? '—'} → {accById.get(o.dest_account_id)?.name ?? '—'}</td>
                    <td className="r num">{eur(o.amount)}</td>
                    <td className="r">
                      <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${o.label}" ?`)) remove.mutate({ kind: 'onetime', id: o.id }); }}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      <NewTransferModal
        open={creating} onClose={() => setCreating(false)}
        accounts={accounts.data ?? []}
        kind={tab}
        onSaved={() => qc.invalidateQueries({ queryKey: ['transfers'] })}
      />
    </>
  );
}

function NewTransferModal({
  open, onClose, accounts, kind, onSaved,
}: {
  open: boolean; onClose: () => void;
  accounts: Account[]; kind: 'recurring' | 'onetime';
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    label: '', amount: '0',
    source_account_id: accounts[0]?.id ?? 0,
    dest_account_id: accounts[1]?.id ?? accounts[0]?.id ?? 0,
    day_of_month: 1,
    frequency: 'Mensuelle' as Frequency,
    date: todayISO(),
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (form.source_account_id === form.dest_account_id) throw new Error('Source et destination doivent être différents.');
      const path = kind === 'recurring' ? '/transfers/recurring/' : '/transfers/onetime/';
      const body = kind === 'recurring'
        ? { ...form, amount: form.amount || '0', is_active: true }
        : { label: form.label, amount: form.amount || '0', date: form.date,
            source_account_id: form.source_account_id, dest_account_id: form.dest_account_id };
      await api.post(path, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title={kind === 'recurring' ? 'Nouveau virement récurrent' : 'Nouveau virement ponctuel'}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Libellé"><Input required value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
        <Field label="Montant">
          <Input type="number" step="0.01" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
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
        {kind === 'recurring' ? (
          <>
            <Field label="Jour du mois">
              <Input type="number" min="1" max="31" required value={form.day_of_month}
                onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })} />
            </Field>
            <Field label="Fréquence">
              <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
                {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
              </Select>
            </Field>
          </>
        ) : (
          <Field label="Date">
            <Input type="date" required value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
        )}
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
