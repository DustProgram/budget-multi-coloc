import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, Pencil, History } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { useAutoEdit } from '../lib/useAutoEdit';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import { useUsersDirectory } from '../lib/useUsersDirectory';
import {
  FREQUENCIES, SPLIT_MODES, type Account, type AccountMember, type Charge,
  type Frequency, type SplitMode,
} from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Pill, Select,
} from '../components/ui';

export function Charges() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Charge | null>(null);
  const [transitioning, setTransitioning] = useState<Charge | null>(null);

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
  useAutoEdit(allCharges.data, setEditing);
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
                    <td className="muted small">
                      {c.payer_user_id === null ? 'Compte joint' : users.display(c.payer_user_id)}
                    </td>
                    <td className="r num">{eur(c.total_amount)}</td>
                    <td className="r num neg display" style={{ fontSize: 17 }}>−{eur(c.my_share)}</td>
                    <td className="r">
                      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                        <Button variant="sm" onClick={() => setEditing(c)} title="Modifier">
                          <Pencil size={12} />
                        </Button>
                        <Button variant="sm" onClick={() => setTransitioning(c)} title="Évolution (fin / nouveau montant)">
                          <History size={12} />
                        </Button>
                        <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${c.label}" ?`)) remove.mutate(c.id); }} title="Supprimer">
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <ChargeModal
        key={editing?.id ?? 'new'}
        open={creating || !!editing}
        existing={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        accounts={accounts.data ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['charges'] });
          qc.invalidateQueries({ queryKey: ['coloc'] });
        }}
      />
      {transitioning && (
        <ChargeTransitionModal
          key={transitioning.id}
          charge={transitioning}
          onClose={() => setTransitioning(null)}
          onSaved={() => {
            setTransitioning(null);
            qc.invalidateQueries({ queryKey: ['charges'] });
            qc.invalidateQueries({ queryKey: ['coloc'] });
          }}
        />
      )}
    </>
  );
}

function ChargeTransitionModal({
  charge, onClose, onSaved,
}: { charge: Charge; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [yearMonth, setYearMonth] = useState(defaultMonth);
  const [mode, setMode] = useState<'replace' | 'terminate'>('replace');
  const [newTotal, setNewTotal] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const transition_date = `${yearMonth}-01`;
      const body: Record<string, unknown> = { transition_date, mode };
      if (mode === 'replace') {
        if (!newTotal || num(newTotal) <= 0) throw new Error('Saisis le nouveau montant total');
        body.new_total_amount = newTotal;
      }
      await api.post(`/charges/${charge.id}/transition`, body);
    },
    onSuccess: () => onSaved(),
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open onClose={onClose} title={`Évolution de "${charge.label}"`}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <p className="small muted" style={{ marginTop: 0 }}>
          La charge actuelle ({eur(charge.total_amount)}) sera conservée pour les mois passés.
          Choisis quand le changement prend effet (ex : augmentation de loyer, fin d'abonnement).
        </p>
        <Field label="À partir du mois">
          <Input type="month" required value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)} />
        </Field>
        <Field label="Que se passe-t-il ?">
          <div className="col" style={{ gap: 8 }}>
            <label className="row gap-2">
              <input type="radio" checked={mode === 'replace'}
                onChange={() => setMode('replace')} />
              <span><strong>Nouveau montant</strong> — création d'une charge successeur</span>
            </label>
            <label className="row gap-2">
              <input type="radio" checked={mode === 'terminate'}
                onChange={() => setMode('terminate')} />
              <span><strong>Mettre fin</strong> — n'apparaîtra plus dans les projections</span>
            </label>
          </div>
        </Field>
        {mode === 'replace' && (
          <Field label="Nouveau montant total (€)">
            <Input type="number" step="0.01" required value={newTotal}
              onChange={(e) => setNewTotal(e.target.value)}
              placeholder={charge.total_amount} />
          </Field>
        )}
        {error && <ErrorBox message={error} />}
        <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? 'En cours…' : 'Valider'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChargeModal({
  open, onClose, accounts, existing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  existing: Charge | null;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
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
    valid_from: string;
    valid_to: string;
  }>(() => existing ? {
    label: existing.label,
    total_amount: existing.total_amount,
    day_of_month: existing.day_of_month,
    frequency: existing.frequency,
    month: existing.month,
    split_mode: existing.split_mode,
    num_colocs: existing.num_colocs,
    split_value: existing.split_value ?? '',
    account_id: existing.account_id,
    valid_from: existing.valid_from ?? '',
    valid_to: existing.valid_to ?? '',
  } : {
    label: '', total_amount: '0', day_of_month: 1,
    frequency: 'Mensuelle' as Frequency,
    month: null,
    split_mode: 'Perso' as SplitMode,
    num_colocs: 1,
    split_value: '',
    account_id: accounts[0]?.id ?? null,
    valid_from: '',
    valid_to: '',
  });
  const [perUserSplits, setPerUserSplits] = useState<Record<number, string>>(
    () => Object.fromEntries((existing?.splits ?? []).map((s) => [s.user_id, s.amount])),
  );
  const [error, setError] = useState<string | null>(null);

  // Charge les membres du compte sélectionné (pour le mode Par utilisateur)
  const membersQ = useQuery({
    queryKey: ['account-members', form.account_id],
    queryFn: async () => (await api.get<AccountMember[]>(`/accounts/${form.account_id}/members`)).data,
    enabled: !!form.account_id && form.split_mode === 'Par utilisateur',
  });

  // Quand l'utilisateur passe en mode "Par utilisateur" ou change de compte,
  // pré-remplir les parts en répartition égale du total si pas encore configuré.
  const total = num(form.total_amount);
  const members = membersQ.data ?? [];
  const allMembersHaveSplit = members.length > 0
    && members.every((m) => perUserSplits[m.user_id] !== undefined);
  if (form.split_mode === 'Par utilisateur' && members.length > 0 && !allMembersHaveSplit) {
    // Pré-remplir une fois — useEffect serait plus propre mais ça marche
    setTimeout(() => {
      setPerUserSplits((prev) => {
        const next = { ...prev };
        let changed = false;
        const perPerson = total / members.length;
        for (const m of members) {
          if (next[m.user_id] === undefined) {
            next[m.user_id] = perPerson.toFixed(2);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 0);
  }

  const sumPerUser = members.reduce((s, m) => s + num(perUserSplits[m.user_id] || '0'), 0);
  const perUserDelta = total - sumPerUser;

  const submit = useMutation({
    mutationFn: async () => {
      const splitsOverride = form.split_mode === 'Par utilisateur'
        ? members
            .map((m) => ({
              user_id: m.user_id,
              amount: perUserSplits[m.user_id] || '0',
            }))
            .filter((x) => num(x.amount) > 0)
        : undefined;
      const body = {
        ...form,
        total_amount: form.total_amount || '0',
        split_value: form.split_value || null,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        ...(splitsOverride ? { splits_override: splitsOverride } : {}),
      };
      if (isEdit && existing) {
        await api.patch(`/charges/${existing.id}`, body);
      } else {
        await api.post('/charges/', body);
      }
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier la charge' : 'Nouvelle charge'}>
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
        {form.split_mode === 'Par utilisateur' && (
          <div style={{ marginTop: 8 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>
              Saisis la part de chaque membre du compte joint. La charge sera payée
              depuis ce compte, chacun abonde via virement.
            </div>
            {membersQ.isLoading && <Loader />}
            {!form.account_id && (
              <ErrorBox message="Sélectionne un compte d'abord." />
            )}
            {members.length === 0 && form.account_id && !membersQ.isLoading && (
              <ErrorBox message="Ce compte n'a pas de membre — ajoute des co-titulaires d'abord depuis la page Comptes." />
            )}
            {members.map((m) => (
              <Field key={m.user_id} label={m.display_name || m.ha_username}>
                <Input
                  type="number" step="0.01" min="0"
                  value={perUserSplits[m.user_id] ?? ''}
                  onChange={(e) =>
                    setPerUserSplits({ ...perUserSplits, [m.user_id]: e.target.value })
                  }
                />
              </Field>
            ))}
            {members.length > 0 && (
              <div className="small" style={{
                marginTop: 6, color: Math.abs(perUserDelta) < 0.01 ? 'var(--sage)' : 'var(--rose)',
              }}>
                Somme des parts : {eur(sumPerUser)} / Total : {eur(total)}
                {Math.abs(perUserDelta) >= 0.01 && (
                  <> · Écart : {perUserDelta > 0 ? '+' : ''}{eur(perUserDelta)}</>
                )}
              </div>
            )}
          </div>
        )}
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
          Laisse les dates vides pour une charge sans expiration.
          {form.split_mode !== 'Perso' && ' Si ce compte est joint, les splits seront créés automatiquement pour chaque membre.'}
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
