import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound, RefreshCw, Trash2, AlertTriangle, Bell, BellRing,
  Briefcase, Home, Plus, User as UserIcon, Lock, Shield,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  Button, Card, ErrorBox, Field, Input, Loader, PageHeader, Select,
} from '../components/ui';
import { Avatar } from '../components/Avatar';

interface Me {
  user_id: number;
  ha_username: string;
  display_name: string | null;
  color_hex: string;
  is_admin: boolean;
  has_external_account: boolean;
  external_username: string | null;
  external_scope: 'coloc' | 'full' | null;
  pro_enabled: boolean;
}

interface NotifierStatus { ha_available: boolean; }

interface MemberOut {
  user_id: number;
  display_name: string;
  ha_username: string;
  color_hex: string;
  is_creator: boolean;
  joined_at: string;
}

interface HouseholdOut {
  id: number;
  name: string;
  created_by_user_id: number;
  members: MemberOut[];
}

interface UserPickerEntry {
  user_id: number;
  ha_username: string;
  display_name: string | null;
  color_hex: string;
}

export function Settings() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<Me>('/users/me')).data,
  });
  const notifier = useQuery({
    queryKey: ['notifier-status'],
    queryFn: async () => (await api.get<NotifierStatus>('/notifier/status')).data,
  });

  return (
    <>
      <PageHeader
        eyebrow="Réglages"
        title="Mon compte, mon foyer & accès"
        subtitle="Profil HA, foyer coloc, compte externe, mode pro, notifications."
      />

      {me.isLoading && <Loader />}
      {me.isError && <ErrorBox message="Impossible de charger ton profil." />}

      {me.data && (
        <div className="grid" style={{
          gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        }}>
          <ProfileCard me={me.data} />
          <HouseholdCard />
          <ExternalAccountCard me={me.data} onChanged={() => qc.invalidateQueries({ queryKey: ['me'] })} />
          <ProCard me={me.data} onChanged={() => qc.invalidateQueries({ queryKey: ['me'] })} />
          <NotifCard available={notifier.data?.ha_available ?? false} />
          {me.data.is_admin && <LLMSettingsCard />}
        </div>
      )}
    </>
  );
}

// ============================================================
// Profil
// ============================================================

function ProfileCard({ me }: { me: Me }) {
  return (
    <Card>
      <p className="eyebrow">Profil</p>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: 26, margin: '4px 0 8px' }}>
        {me.display_name || me.ha_username}
      </h3>
      <div className="small muted">
        ha_username · <code style={{
          background: 'var(--bg-sunken)', padding: '2px 6px', borderRadius: 6,
        }}>{me.ha_username}</code>
      </div>
      {me.is_admin && <div className="pill terra" style={{ marginTop: 10 }}>Administrateur</div>}
      <p className="small muted" style={{ marginTop: 14 }}>
        Ton identité provient de Home Assistant. Pour changer ton nom d'affichage,
        modifie-le dans HA → Paramètres → Personnes.
      </p>
    </Card>
  );
}

// ============================================================
// Foyer
// ============================================================

function HouseholdCard() {
  const qc = useQueryClient();
  const household = useQuery<HouseholdOut | null>({
    queryKey: ['household'],
    queryFn: async () => (await api.get<HouseholdOut | null>('/households/me')).data,
  });
  const available = useQuery({
    queryKey: ['available-users'],
    queryFn: async () => (await api.get<UserPickerEntry[]>('/accounts/available-users')).data,
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<Me>('/users/me')).data,
  });

  const [name, setName] = useState('Mon foyer');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [pickedUser, setPickedUser] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upsert = useMutation({
    mutationFn: async (newName: string) =>
      (await api.post<HouseholdOut>('/households/me', { name: newName })).data,
    onSuccess: () => {
      setRenaming(false);
      qc.invalidateQueries({ queryKey: ['household'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const addMember = useMutation({
    mutationFn: async (user_id: number) =>
      (await api.post<HouseholdOut>('/households/me/members', { user_id })).data,
    onSuccess: () => { setPickedUser(null); qc.invalidateQueries({ queryKey: ['household'] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const removeMember = useMutation({
    mutationFn: async (user_id: number) =>
      api.delete(`/households/me/members/${user_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['household'] }),
  });

  const remove = useMutation({
    mutationFn: async () => api.delete('/households/me'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['household'] }),
  });

  const h = household.data;
  const memberIds = new Set((h?.members ?? []).map((m) => m.user_id));
  const picker = (available.data ?? []).filter((u) => !memberIds.has(u.user_id));
  const isCreator = me.data?.user_id === h?.created_by_user_id;

  return (
    <Card>
      <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
        <Home size={16} style={{ color: 'var(--ink-2)' }} />
        <p className="eyebrow" style={{ margin: 0 }}>Mon foyer</p>
      </div>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '4px 0 8px' }}>
        Avec qui je vis
      </h3>
      <p className="small muted" style={{ marginBottom: 14 }}>
        Définis explicitement les membres de ta coloc / famille. La liste de
        courses partagée et le chat global suivent cette liste.
      </p>

      {h ? (
        <>
          <div className="row between" style={{ marginBottom: 10 }}>
            {renaming ? (
              <div className="row gap-2" style={{ flex: 1 }}>
                <Input value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  style={{ flex: 1 }} />
                <Button variant="primary" onClick={() => upsert.mutate(renameValue || h.name)}
                  disabled={upsert.isPending}>
                  OK
                </Button>
                <Button onClick={() => setRenaming(false)}>×</Button>
              </div>
            ) : (
              <>
                <strong style={{ fontSize: 14 }}>{h.name}</strong>
                <div className="row gap-2">
                  {isCreator && (
                    <Button variant="sm" onClick={() => {
                      setRenameValue(h.name);
                      setRenaming(true);
                    }}>
                      Renommer
                    </Button>
                  )}
                  <span className="small muted">
                    {h.members.length} membre{h.members.length > 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {h.members.map((m) => (
              <div key={m.user_id} className="row gap-2" style={{
                padding: '8px 10px', borderRadius: 10,
                background: 'var(--bg-sunken)',
              }}>
                <Avatar user={m} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{m.display_name}</div>
                  <div className="small muted">
                    {m.is_creator ? 'créateur' : 'membre'}
                  </div>
                </div>
                {!m.is_creator && isCreator && (
                  <Button variant="sm" onClick={() => removeMember.mutate(m.user_id)}>
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {isCreator && picker.length > 0 && (
            <div className="row gap-2" style={{ marginBottom: 10 }}>
              <Select
                value={pickedUser ?? ''}
                onChange={(e) => setPickedUser(e.target.value ? Number(e.target.value) : null)}
                style={{ flex: 1 }}
              >
                <option value="">+ Ajouter un membre…</option>
                {picker.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.display_name || u.ha_username}
                  </option>
                ))}
              </Select>
              <Button
                variant="primary"
                onClick={() => pickedUser && addMember.mutate(pickedUser)}
                disabled={!pickedUser || addMember.isPending}
              >
                <Plus size={12} />
              </Button>
            </div>
          )}

          {isCreator && (
            <Button
              onClick={() => {
                if (confirm(
                  `Supprimer le foyer "${h.name}" ? Tous les messages et les `
                  + 'liaisons membres seront effacés. Les comptes bancaires sont conservés.',
                )) {
                  remove.mutate();
                }
              }}
              style={{
                marginTop: 8, color: 'var(--rose)', borderColor: 'var(--rose)',
              }}
            >
              <Trash2 size={12} /> Supprimer le foyer
            </Button>
          )}
        </>
      ) : (
        <>
          <Field label="Nom du foyer">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Pixel St-Marc" />
          </Field>
          <Button variant="primary" onClick={() => upsert.mutate(name)} disabled={upsert.isPending}>
            <Plus size={14} /> Créer mon foyer
          </Button>
          <p className="small muted" style={{ marginTop: 10 }}>
            Tu pourras ajouter tes coloc une fois qu'ils auront ouvert l'app
            au moins une fois via Home Assistant.
          </p>
        </>
      )}

      {error && <ErrorBox message={error} />}
    </Card>
  );
}

// ============================================================
// Compte externe
// ============================================================

function ExternalAccountCard({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [username, setUsername] = useState(me.external_username ?? '');
  const [password, setPassword] = useState('');
  const [scope, setScope] = useState<'coloc' | 'full'>(me.external_scope ?? 'full');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async () =>
      (await api.put('/users/me/external-account', { username, password, scope })).data,
    onSuccess: () => {
      setPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onChanged();
    },
    onError: (e: unknown) => {
      const r = (e as { response?: { data?: { detail?: string } } }).response;
      setError(r?.data?.detail || (e instanceof Error ? e.message : 'Erreur'));
    },
  });

  const remove = useMutation({
    mutationFn: async () => api.delete('/users/me/external-account'),
    onSuccess: () => { setUsername(''); setPassword(''); onChanged(); },
  });

  return (
    <Card>
      <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
        <KeyRound size={16} style={{ color: 'var(--ink-2)' }} />
        <p className="eyebrow" style={{ margin: 0 }}>Compte externe — port 8765</p>
      </div>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '4px 0 8px' }}>
        Accès sans Home Assistant
      </h3>
      <p className="small muted">
        Crée un username + mot de passe pour te connecter directement sur
        le port 8765 (Tailscale, LAN ou reverse proxy). Choisis le scope :
      </p>

      <div className="row gap-2" style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 10,
        background: 'var(--amber-bg, oklch(0.94 0.04 80))',
        border: '1px solid var(--amber, oklch(0.78 0.12 80))',
        fontSize: 13, color: 'var(--ink-2)',
      }}>
        <AlertTriangle size={16} style={{ color: 'var(--amber, oklch(0.6 0.14 60))', flexShrink: 0 }} />
        <span>
          Garde ton mot de passe secret. <strong>Scope coloc</strong> = accès
          limité (courses + chat + récap). <strong>Scope full</strong> =
          accès complet à toute l'app.
        </span>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}
        style={{ marginTop: 14 }}
      >
        <Field label="Username">
          <Input value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ex : lucas-ext" required
            autoComplete="username"
            minLength={3} />
        </Field>
        <Field label={me.has_external_account ? 'Nouveau mot de passe' : 'Mot de passe'}>
          <Input type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 caractères" required={!me.has_external_account}
            autoComplete="new-password" minLength={8} />
        </Field>
        <Field label="Scope d'accès">
          <Select value={scope}
            onChange={(e) => setScope(e.target.value as 'coloc' | 'full')}>
            <option value="coloc">Coloc — courses, chat, récap uniquement</option>
            <option value="full">Full — accès complet</option>
          </Select>
        </Field>

        {error && <ErrorBox message={error} />}
        {saved && (
          <div className="small pos" style={{
            padding: '8px 12px', borderRadius: 8, background: 'var(--sage-bg)',
            border: '1px solid var(--sage)', marginBottom: 10,
          }}>
            ✓ Compte externe enregistré.
          </div>
        )}

        <div className="row gap-2" style={{ marginTop: 8 }}>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            <RefreshCw size={14} />
            {me.has_external_account ? 'Mettre à jour' : 'Créer le compte'}
          </Button>
          {me.has_external_account && (
            <Button onClick={() => { if (confirm('Supprimer le compte externe ?')) remove.mutate(); }}>
              <Trash2 size={14} /> Supprimer
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

// ============================================================
// Mode Pro
// ============================================================

function ProCard({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) =>
      (await api.post('/users/me/pro-enabled', { enabled })).data,
    onSuccess: () => onChanged(),
  });

  return (
    <Card>
      <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
        <Briefcase size={16} style={{ color: 'var(--ink-2)' }} />
        <p className="eyebrow" style={{ margin: 0 }}>Mode professionnel</p>
      </div>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '4px 0 8px' }}>
        Auto-entrepreneur · suivi séparé
      </h3>
      <p className="small muted">
        Active ce mode si tu factures en parallèle. Un switcher Perso/Pro
        apparaît dans la sidebar et la rubrique Compta-pro est accessible.
      </p>
      <label className="row between" style={{
        padding: '12px 14px', borderRadius: 12,
        background: 'var(--bg-sunken)', cursor: 'pointer', marginTop: 14,
      }}>
        <div>
          <div style={{ fontWeight: 500 }}>Activer le mode pro</div>
          <div className="small muted">
            {me.pro_enabled ? 'Actuellement activé.' : 'Désactivé par défaut.'}
          </div>
        </div>
        <input
          type="checkbox"
          checked={me.pro_enabled}
          onChange={(e) => toggle.mutate(e.target.checked)}
          style={{ width: 20, height: 20 }}
        />
      </label>
    </Card>
  );
}

// ============================================================
// Notifications HA
// ============================================================

function NotifCard({ available }: { available: boolean }) {
  const testNotif = useMutation({
    mutationFn: async () => api.post('/notifier/test', {
      title: 'Budget — test',
      message: "Notif test envoyée depuis l'add-on Budget.",
    }),
  });
  return (
    <Card>
      <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
        <Bell size={16} style={{ color: 'var(--ink-2)' }} />
        <p className="eyebrow" style={{ margin: 0 }}>Notifications Home Assistant</p>
      </div>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '4px 0 8px' }}>
        Alertes seuil dépassé
      </h3>
      <p className="small muted">
        Quand tu crées une charge ou un achat qui fait passer ta marge
        mensuelle sous le seuil, une notif persistante est créée dans HA.
      </p>
      <div className="small" style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 10,
        background: available ? 'var(--sage-bg)' : 'var(--bg-sunken)',
        color: available ? 'var(--sage)' : 'var(--ink-3)',
      }}>
        {available
          ? '✓ Home Assistant joignable.'
          : 'HA non détecté (mode dev ou homeassistant_api désactivé).'}
      </div>
      <div className="row gap-2" style={{ marginTop: 14 }}>
        <Button onClick={() => testNotif.mutate()} disabled={testNotif.isPending || !available}>
          <BellRing size={14} />
          {testNotif.isPending ? 'Envoi…' : 'Tester une notif'}
        </Button>
      </div>
    </Card>
  );
}

// Force keep unused imports used (for Shield/UserIcon/Lock references in modal-style future expansion)
void Shield; void UserIcon; void Lock;

// ============================================================
// LLM Settings — modifier le provider/clé depuis l'UI sans toucher au YAML
// ============================================================

interface Provider {
  key: string;
  label: string;
  default_model: string;
  default_base_url: string;
  needs_api_key: boolean;
}
interface LLMSettings {
  provider: string | null;
  has_api_key: boolean;
  model: string | null;
  base_url: string | null;
  rpm_limit: number | null;
  tpm_limit: number | null;
  rpd_limit: number | null;
  exclude_joint_charges_from_personal: boolean;
}

function LLMSettingsCard() {
  const qc = useQueryClient();
  const providers = useQuery({
    queryKey: ['chat', 'providers'],
    queryFn: async () => (await api.get<{ providers: Provider[] }>('/chat/providers')).data.providers,
  });
  const current = useQuery({
    queryKey: ['settings', 'llm'],
    queryFn: async () => (await api.get<LLMSettings>('/settings/llm')).data,
  });
  const [form, setForm] = useState<Partial<LLMSettings & { api_key: string }>>({});
  const [showKey, setShowKey] = useState(false);

  const save = useMutation({
    mutationFn: async () => api.patch('/settings/llm', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'llm'] });
      qc.invalidateQueries({ queryKey: ['chat', 'status'] });
      setForm({});
    },
  });

  if (current.isLoading || providers.isLoading) return <Card><Loader /></Card>;
  const cur = current.data;
  const provs = providers.data ?? [];
  const v = (k: keyof LLMSettings & string) => {
    const fv = (form as Record<string, unknown>)[k];
    if (fv !== undefined) return String(fv ?? '');
    return String((cur?.[k] ?? '') as string | number);
  };
  const selectedProvider = (form.provider ?? cur?.provider ?? '').toString();
  const preset = provs.find((p) => p.key === selectedProvider);

  return (
    <Card>
      <p className="eyebrow">Assistant IA (admin)</p>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 26, margin: '4px 0 12px', letterSpacing: '-.01em' }}>
        Provider LLM
      </h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Surcharge la config.yaml de l'add-on, prend effet immédiatement. Laisse vide pour utiliser la valeur de l'add-on.
      </p>

      <Field label="Provider">
        <Select
          value={selectedProvider}
          onChange={(e) => setForm({ ...form, provider: e.target.value })}
        >
          <option value="">— Utiliser la valeur de la config.yaml —</option>
          {provs.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </Select>
      </Field>

      {selectedProvider && preset?.needs_api_key && (
        <Field label={`Clé API ${cur?.has_api_key && form.api_key === undefined ? '(déjà configurée)' : ''}`}>
          <div className="row gap-2">
            <Input
              type={showKey ? 'text' : 'password'}
              value={form.api_key ?? ''}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder={cur?.has_api_key ? '••••••••••••' : 'sk-...'}
              style={{ flex: 1 }}
            />
            <Button type="button" variant="sm" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '🙈' : '👁'}
            </Button>
          </div>
        </Field>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={`Modèle (défaut : ${preset?.default_model || '—'})`}>
          <Input
            value={form.model ?? cur?.model ?? ''}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder={preset?.default_model}
          />
        </Field>
        <Field label="Base URL (custom OpenAI-compat)">
          <Input
            value={form.base_url ?? cur?.base_url ?? ''}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder={preset?.default_base_url || ''}
          />
        </Field>
      </div>

      <p className="eyebrow" style={{ marginTop: 14 }}>Limites de quota local (0 = illimité)</p>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="Req / minute">
          <Input type="number" min="0" value={v('rpm_limit')}
            onChange={(e) => setForm({ ...form, rpm_limit: e.target.value ? Number(e.target.value) : 0 })} />
        </Field>
        <Field label="Tokens / minute">
          <Input type="number" min="0" value={v('tpm_limit')}
            onChange={(e) => setForm({ ...form, tpm_limit: e.target.value ? Number(e.target.value) : 0 })} />
        </Field>
        <Field label="Req / jour">
          <Input type="number" min="0" value={v('rpd_limit')}
            onChange={(e) => setForm({ ...form, rpd_limit: e.target.value ? Number(e.target.value) : 0 })} />
        </Field>
      </div>

      <div className="divider" style={{ margin: '16px 0' }} />
      <p className="eyebrow">Vue perso</p>
      <label className="row gap-2" style={{ marginTop: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={
            form.exclude_joint_charges_from_personal ??
            cur?.exclude_joint_charges_from_personal ?? false
          }
          onChange={(e) => setForm({ ...form, exclude_joint_charges_from_personal: e.target.checked })}
        />
        <span>
          <strong>Exclure ma part des charges joint</strong> de ma marge perso.<br />
          <span className="small muted">
            Quand activé, ton dashboard ne montre plus de déficit causé par
            ta quote-part de charges sur compte joint (puisque tu assumes
            que les colocs abondent leur part). Utile si tu utilises des
            comptes joints partagés.
          </span>
        </span>
      </label>

      {save.isError && (
        <ErrorBox message={save.error instanceof Error ? save.error.message : 'Erreur'} />
      )}
      <div className="row gap-2" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <Button onClick={() => setForm({})}>Annuler</Button>
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || Object.keys(form).length === 0}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Card>
  );
}
