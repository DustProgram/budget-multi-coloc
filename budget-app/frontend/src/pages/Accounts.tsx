import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import {
  Button, Card, ErrorBox, Field, Input, Loader, Modal, PageHeader,
  Select, EmptyState, Pill,
} from '../components/ui';
import { Sparkline } from '../components/charts/Sparkline';
import { Avatar, AvatarStack } from '../components/Avatar';
import { useSpace } from '../lib/space';
import { ACCOUNT_TYPES, type Account, type AccountMember, type UserPickerEntry } from '../types';

export function Accounts() {
  const qc = useQueryClient();
  const { space } = useSpace();
  const [creating, setCreating] = useState(false);
  const [membersFor, setMembersFor] = useState<Account | null>(null);

  const accounts = useQuery({
    queryKey: ['accounts', space],
    queryFn: async () => (await api.get<Account[]>(`/accounts/?space=${space}`)).data,
  });

  const total = (accounts.data ?? []).reduce((s, a) => s + num(a.initial_balance), 0);

  return (
    <>
      <PageHeader
        eyebrow="Comptes"
        title={eur(total)}
        subtitle={accounts.data
          ? `${accounts.data.length} compte${accounts.data.length > 1 ? 's' : ''} actif${accounts.data.length > 1 ? 's' : ''}.`
          : 'Chargement…'}
      >
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nouveau compte
        </Button>
      </PageHeader>

      {accounts.isLoading && <Loader />}
      {accounts.isError && <ErrorBox message="Erreur de chargement." />}

      {accounts.data && accounts.data.length === 0 && (
        <EmptyState
          icon={<CreditCard size={26} />}
          title="Aucun compte"
          message="Ajoute ton premier compte courant, livret ou compte joint pour commencer."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Créer un compte</Button>}
        />
      )}

      {accounts.data && accounts.data.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {accounts.data.map((a) => (
            <AccountCard key={a.id} account={a} onManageMembers={() => setMembersFor(a)} />
          ))}
        </div>
      )}

      <NewAccountModal open={creating} onClose={() => setCreating(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['accounts'] })} />
      {membersFor && (
        <MembersModal
          account={membersFor}
          onClose={() => setMembersFor(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['accounts', membersFor.id, 'members'] })}
        />
      )}
    </>
  );
}

function AccountCard({ account, onManageMembers }: { account: Account; onManageMembers: () => void }) {
  const qc = useQueryClient();

  const members = useQuery({
    queryKey: ['accounts', account.id, 'members'],
    queryFn: async () => (await api.get<AccountMember[]>(`/accounts/${account.id}/members`)).data,
  });

  const deleteIt = useMutation({
    mutationFn: async () => api.delete(`/accounts/${account.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const memberList = members.data ?? [];
  const isJoint = memberList.length > 1;

  return (
    <Card>
      <div className="row between" style={{ marginBottom: 12 }}>
        <Pill>{account.type}</Pill>
        <span className="small muted">{account.bank}</span>
      </div>
      <div className="display num" style={{ fontSize: 32 }}>{eur(account.initial_balance)}</div>
      <div className="small muted" style={{ marginTop: 4 }}>{account.name}</div>
      <div style={{ marginTop: 10 }}>
        <Sparkline
          data={[0.92, 0.95, 0.97, 1, 1.03, 1.04].map((m) => num(account.initial_balance) * m)}
          color="var(--terra)" width={240} height={48} fill
        />
      </div>
      <div className="divider" style={{ margin: '12px 0' }} />
      <div className="row between">
        <div className="small muted">
          {isJoint ? `${memberList.length} co-titulaires` : 'Titulaire unique'}
        </div>
        {memberList.length > 0 && <AvatarStack users={memberList} />}
      </div>
      <div className="row gap-2" style={{ marginTop: 12 }}>
        <Button variant="sm" onClick={onManageMembers}>
          <Users size={12} /> Membres
        </Button>
        <Button variant="sm" onClick={() => {
          if (confirm(`Supprimer le compte "${account.name}" ?`)) deleteIt.mutate();
        }}>
          <Trash2 size={12} />
        </Button>
      </div>
    </Card>
  );
}

function NewAccountModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { space } = useSpace();
  const [form, setForm] = useState({
    name: '', bank: '', type: ACCOUNT_TYPES[0] as string,
    initial_balance: '0', notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      await api.post('/accounts/', {
        ...form,
        initial_balance: form.initial_balance || '0',
        space,
      });
    },
    onSuccess: () => {
      onSaved();
      setForm({ name: '', bank: '', type: ACCOUNT_TYPES[0], initial_balance: '0', notes: '' });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nouveau compte">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Nom"><Input required value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Banque"><Input required value={form.bank}
          onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Solde initial">
          <Input type="number" step="0.01" required value={form.initial_balance}
            onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
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

function MembersModal({
  account, onClose, onChanged,
}: { account: Account; onClose: () => void; onChanged: () => void }) {
  const members = useQuery({
    queryKey: ['accounts', account.id, 'members'],
    queryFn: async () => (await api.get<AccountMember[]>(`/accounts/${account.id}/members`)).data,
  });

  const available = useQuery({
    queryKey: ['available-users'],
    queryFn: async () => (await api.get<UserPickerEntry[]>('/accounts/available-users')).data,
  });

  const [pick, setPick] = useState<number | null>(null);
  const [role, setRole] = useState<'cotitulaire' | 'viewer'>('cotitulaire');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      if (!pick) return;
      await api.post(`/accounts/${account.id}/members`, { user_id: pick, role });
    },
    onSuccess: () => { setPick(null); onChanged(); members.refetch(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const remove = useMutation({
    mutationFn: async (userId: number) => api.delete(`/accounts/${account.id}/members/${userId}`),
    onSuccess: () => { onChanged(); members.refetch(); },
  });

  const memberIds = new Set((members.data ?? []).map((m) => m.user_id));
  const picker = (available.data ?? []).filter((u) => !memberIds.has(u.user_id));

  return (
    <Modal open onClose={onClose} title={`Membres de "${account.name}"`}>
      <div className="col gap-3">
        {(members.data ?? []).map((m) => (
          <div key={m.user_id} className="row gap-3" style={{
            padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 10,
          }}>
            <Avatar user={m} size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{m.display_name || m.ha_username}</div>
              <div className="small muted">{m.role}</div>
            </div>
            {m.role !== 'owner' && (
              <Button variant="sm" onClick={() => remove.mutate(m.user_id)}>
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        ))}

        {picker.length > 0 && (
          <div className="card" style={{ background: 'var(--bg-sunken)' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Ajouter un membre</div>
            <Field label="Utilisateur HA">
              <Select value={pick ?? ''} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Sélectionne —</option>
                {picker.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.display_name || u.ha_username}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rôle">
              <Select value={role} onChange={(e) => setRole(e.target.value as 'cotitulaire' | 'viewer')}>
                <option value="cotitulaire">Cotitulaire (peut écrire)</option>
                <option value="viewer">Viewer (lecture seule)</option>
              </Select>
            </Field>
            {error && <ErrorBox message={error} />}
            <Button variant="primary" onClick={() => add.mutate()} disabled={!pick || add.isPending}>
              {add.isPending ? 'Ajout…' : 'Ajouter'}
            </Button>
          </div>
        )}

        <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}
