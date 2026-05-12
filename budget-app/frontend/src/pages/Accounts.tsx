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
import { AccountDetailModal } from '../components/AccountDetailModal';
import { useSpace } from '../lib/space';
import { ACCOUNT_TYPES, type Account, type AccountMember, type Me, type UserPickerEntry } from '../types';

export function Accounts() {
  const qc = useQueryClient();
  const { space } = useSpace();
  const [creating, setCreating] = useState(false);
  const [membersFor, setMembersFor] = useState<Account | null>(null);
  const [detailFor, setDetailFor] = useState<Account | null>(null);

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
            <AccountCard
              key={a.id} account={a}
              onManageMembers={() => setMembersFor(a)}
              onShowDetail={() => setDetailFor(a)}
            />
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
      {detailFor && (
        <AccountDetailModal
          account={detailFor}
          onClose={() => setDetailFor(null)}
        />
      )}
    </>
  );
}

function AccountCard({
  account, onManageMembers, onShowDetail,
}: {
  account: Account;
  onManageMembers: () => void;
  onShowDetail: () => void;
}) {
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
        <Button variant="sm" onClick={onShowDetail}>Mouvements</Button>
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

interface HouseholdLite {
  id: number;
  name: string;
  members: { user_id: number; display_name: string }[];
}

function NewAccountModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { space } = useSpace();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', bank: '', type: ACCOUNT_TYPES[0] as string,
    initial_balance: '0', notes: '',
  });
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<Me>('/users/me')).data,
    enabled: open,
  });
  const rawAvailable = useQuery({
    queryKey: ['available-users'],
    queryFn: async () => (await api.get<UserPickerEntry[]>('/accounts/available-users')).data,
    enabled: open,
  });
  // Le créateur est owner implicite — on ne peut pas l'ajouter comme membre.
  const available = {
    ...rawAvailable,
    data: (rawAvailable.data ?? []).filter((u) => u.user_id !== me.data?.user_id),
  };
  const household = useQuery({
    queryKey: ['household'],
    queryFn: async () => (await api.get<HouseholdLite | null>('/households/me')).data,
    enabled: open,
  });

  // Reset selection si l'user repasse type ≠ Compte joint
  const isJoint = form.type === 'Compte joint';
  if (!isJoint && memberIds.length > 0) {
    // ne pas appeler setState pendant le render — on le fait via useEffect
  }

  const submit = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ id: number }>('/accounts/', {
        ...form,
        initial_balance: form.initial_balance || '0',
        space,
      });
      if (isJoint) {
        for (const uid of memberIds) {
          await api.post(`/accounts/${data.id}/members`, {
            user_id: uid, role: 'cotitulaire',
          });
        }
      }
    },
    onSuccess: () => {
      onSaved();
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setForm({ name: '', bank: '', type: ACCOUNT_TYPES[0], initial_balance: '0', notes: '' });
      setMemberIds([]);
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  function toggleMember(uid: number) {
    setMemberIds((cur) => cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]);
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouveau compte">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Nom"><Input required value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Banque"><Input required value={form.bank}
          onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => {
            const t = e.target.value;
            setForm({ ...form, type: t });
            if (t !== 'Compte joint') setMemberIds([]);
          }}>
            {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Solde initial">
          <Input type="number" step="0.01" required value={form.initial_balance}
            onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
        </Field>

        {isJoint && (
          <div style={{ marginTop: 6 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="eyebrow">Co-titulaires</span>
              {household.data && household.data.members.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    // Pré-coche tous les membres du foyer sauf moi (owner implicite)
                    const others = household.data!.members
                      .map((m) => m.user_id)
                      .filter((id) => id !== me.data?.user_id)
                      .filter((id) => available.data.some((u) => u.user_id === id));
                    setMemberIds(others);
                  }}
                  className="btn sm"
                >
                  + Tout mon foyer ({household.data.name})
                </button>
              )}
            </div>
            {rawAvailable.isLoading && <p className="muted small">Chargement…</p>}
            {available.data.length === 0 && (
              <p className="muted small">
                Aucun autre utilisateur HA n'a encore ouvert l'app. Demande-leur
                de se connecter une fois via HA pour apparaître ici. Tu peux
                créer le compte sans co-titulaires et les ajouter plus tard.
              </p>
            )}
            {available.data.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {available.data.map((u) => {
                  const checked = memberIds.includes(u.user_id);
                  return (
                    <label key={u.user_id} className="row gap-2" style={{
                      padding: '8px 10px', borderRadius: 10,
                      background: checked ? 'var(--bg-sunken)' : 'transparent',
                      border: '1px solid ' + (checked ? 'var(--ink)' : 'var(--line)'),
                      cursor: 'pointer',
                    }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => toggleMember(u.user_id)} />
                      <Avatar user={u} size={26} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {u.display_name || u.ha_username}
                        </div>
                        <div className="small muted">{u.ha_username}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="small muted">
              Les charges, transactions et la liste de courses créées sur ce compte
              seront visibles par tous les co-titulaires.
            </p>
          </div>
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
