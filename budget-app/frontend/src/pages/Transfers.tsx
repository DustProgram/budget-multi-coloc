import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus, Trash2, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { eur, fmtDate, todayISO } from '../lib/format';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import { useUsersDirectory } from '../lib/useUsersDirectory';
import {
  FREQUENCIES, type Account, type Frequency,
  type OneTimeTransfer, type RecurringTransfer,
} from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Pill, Select,
} from '../components/ui';

type EditingTarget =
  | { kind: 'recurring'; data: RecurringTransfer }
  | { kind: 'onetime'; data: OneTimeTransfer }
  | null;

export function Transfers() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'recurring' | 'onetime'>('recurring');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditingTarget>(null);

  const allRecurring = useQuery({
    queryKey: ['transfers', 'recurring'],
    queryFn: async () => (await api.get<RecurringTransfer[]>('/transfers/recurring/')).data,
  });
  const allOnetime = useQuery({
    queryKey: ['transfers', 'onetime'],
    queryFn: async () => (await api.get<OneTimeTransfer[]>('/transfers/onetime/')).data,
  });
  const spaceAccounts = useSpaceAccountIdsSet();
  const users = useUsersDirectory();
  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });
  const recurring = {
    ...allRecurring,
    data: (allRecurring.data ?? []).filter(
      (r) => spaceAccounts.idsSet.has(r.source_account_id)
          || spaceAccounts.idsSet.has(r.dest_account_id),
    ),
  };
  const onetime = {
    ...allOnetime,
    data: (allOnetime.data ?? []).filter(
      (o) => spaceAccounts.idsSet.has(o.source_account_id)
          || spaceAccounts.idsSet.has(o.dest_account_id),
    ),
  };

  const accById = new Map((accounts.data ?? []).map((a) => [a.id, a]));

  // Auto-ouvre la modal d'édition si query param ?edit=N&editKind=recurring|onetime
  const [searchParams, setSearchParams] = useSearchParams();
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current) return;
    const editId = Number(searchParams.get('edit'));
    const kind = searchParams.get('editKind') as 'recurring' | 'onetime' | null;
    if (!editId || !kind) return;
    const list = kind === 'recurring' ? allRecurring.data : allOnetime.data;
    if (!list) return;
    const found = list.find((x) => x.id === editId);
    if (found) {
      consumed.current = true;
      setEditing({ kind, data: found } as EditingTarget);
      setTab(kind);
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      next.delete('editKind');
      setSearchParams(next, { replace: true });
    }
  }, [allRecurring.data, allOnetime.data, searchParams, setSearchParams]);

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
                <tr><th>Libellé</th><th>Flux</th><th>Jour</th><th>Fréquence</th><th>Par</th><th className="r">Montant</th><th></th></tr>
              </thead>
              <tbody>
                {recurring.data.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.label}</strong></td>
                    <td>{accById.get(r.source_account_id)?.name ?? '—'} → {accById.get(r.dest_account_id)?.name ?? '—'}</td>
                    <td>Le {r.day_of_month}</td>
                    <td><Pill tone="plum">{r.frequency}</Pill></td>
                    <td className="muted small">{users.display(r.user_id)}</td>
                    <td className="r num">{eur(r.amount)}</td>
                    <td className="r">
                      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                        <Button variant="sm" onClick={() => setEditing({ kind: 'recurring', data: r })} title="Modifier">
                          <Pencil size={12} />
                        </Button>
                        <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${r.label}" ?`)) remove.mutate({ kind: 'recurring', id: r.id }); }} title="Supprimer">
                          <Trash2 size={12} />
                        </Button>
                      </div>
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
                <tr><th>Date</th><th>Libellé</th><th>Flux</th><th>Par</th><th className="r">Montant</th><th></th></tr>
              </thead>
              <tbody>
                {onetime.data.map((o) => (
                  <tr key={o.id}>
                    <td>{fmtDate(o.date)}</td>
                    <td><strong>{o.label}</strong></td>
                    <td>{accById.get(o.source_account_id)?.name ?? '—'} → {accById.get(o.dest_account_id)?.name ?? '—'}</td>
                    <td className="muted small">{users.display(o.user_id)}</td>
                    <td className="r num">{eur(o.amount)}</td>
                    <td className="r">
                      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                        <Button variant="sm" onClick={() => setEditing({ kind: 'onetime', data: o })} title="Modifier">
                          <Pencil size={12} />
                        </Button>
                        <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${o.label}" ?`)) remove.mutate({ kind: 'onetime', id: o.id }); }} title="Supprimer">
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      <TransferModal
        key={editing ? `${editing.kind}-${editing.data.id}` : 'new'}
        open={creating || !!editing}
        existing={editing}
        kind={editing?.kind ?? tab}
        onClose={() => { setCreating(false); setEditing(null); }}
        accounts={accounts.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ['transfers'] })}
      />
    </>
  );
}

function TransferModal({
  open, onClose, accounts, kind, existing, onSaved,
}: {
  open: boolean; onClose: () => void;
  accounts: Account[]; kind: 'recurring' | 'onetime';
  existing: EditingTarget; onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [form, setForm] = useState<{
    label: string;
    amount: string;
    source_account_id: number;
    dest_account_id: number;
    day_of_month: number;
    frequency: Frequency;
    date: string;
    valid_from: string;
    valid_to: string;
  }>(() => {
    if (existing?.kind === 'recurring') {
      const r = existing.data;
      return {
        label: r.label, amount: r.amount,
        source_account_id: r.source_account_id, dest_account_id: r.dest_account_id,
        day_of_month: r.day_of_month, frequency: r.frequency,
        date: todayISO(),
        valid_from: r.valid_from ?? '',
        valid_to: r.valid_to ?? '',
      };
    }
    if (existing?.kind === 'onetime') {
      const o = existing.data;
      return {
        label: o.label, amount: o.amount,
        source_account_id: o.source_account_id, dest_account_id: o.dest_account_id,
        day_of_month: 1, frequency: 'Mensuelle' as Frequency,
        date: o.date,
        valid_from: '', valid_to: '',
      };
    }
    return {
      label: '', amount: '0',
      source_account_id: accounts[0]?.id ?? 0,
      dest_account_id: accounts[1]?.id ?? accounts[0]?.id ?? 0,
      day_of_month: 1,
      frequency: 'Mensuelle' as Frequency,
      date: todayISO(),
      valid_from: '', valid_to: '',
    };
  });
  const [error, setError] = useState<string | null>(null);

  const effectiveKind = existing?.kind ?? kind;

  const submit = useMutation({
    mutationFn: async () => {
      if (form.source_account_id === form.dest_account_id) throw new Error('Source et destination doivent être différents.');
      if (effectiveKind === 'recurring') {
        const body = {
          label: form.label,
          amount: form.amount || '0',
          source_account_id: form.source_account_id,
          dest_account_id: form.dest_account_id,
          day_of_month: form.day_of_month,
          frequency: form.frequency,
          is_active: true,
          valid_from: form.valid_from || null,
          valid_to: form.valid_to || null,
        };
        if (isEdit && existing?.kind === 'recurring') {
          await api.patch(`/transfers/recurring/${existing.data.id}`, body);
        } else {
          await api.post('/transfers/recurring/', body);
        }
      } else {
        const body = {
          label: form.label,
          amount: form.amount || '0',
          date: form.date,
          source_account_id: form.source_account_id,
          dest_account_id: form.dest_account_id,
        };
        if (isEdit && existing?.kind === 'onetime') {
          await api.patch(`/transfers/onetime/${existing.data.id}`, body);
        } else {
          await api.post('/transfers/onetime/', body);
        }
      }
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const title = isEdit
    ? (effectiveKind === 'recurring' ? 'Modifier le virement récurrent' : 'Modifier le virement ponctuel')
    : (effectiveKind === 'recurring' ? 'Nouveau virement récurrent' : 'Nouveau virement ponctuel');

  return (
    <Modal open={open} onClose={onClose} title={title}>
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
        {effectiveKind === 'recurring' ? (
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
            {submit.isPending ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Créer')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
