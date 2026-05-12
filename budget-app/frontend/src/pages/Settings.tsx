import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound, Copy, Check, RefreshCw, Trash2,
  AlertTriangle, Bell, BellRing, Briefcase,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  Button, Card, ErrorBox, Loader, PageHeader,
} from '../components/ui';

interface Me {
  user_id: number;
  ha_username: string;
  display_name: string | null;
  color_hex: string;
  is_admin: boolean;
  has_external_token: boolean;
  pro_enabled: boolean;
}

interface NotifierStatus {
  ha_available: boolean;
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

  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useMutation({
    mutationFn: async () => (await api.post<{ token: string }>('/users/me/external-token')).data,
    onSuccess: (data) => {
      setFreshToken(data.token);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const revoke = useMutation({
    mutationFn: async () => api.delete('/users/me/external-token'),
    onSuccess: () => {
      setFreshToken(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const testNotif = useMutation({
    mutationFn: async () => api.post('/notifier/test', {
      title: 'Budget — test',
      message: 'Notif test envoyée depuis l\'add-on Budget.',
    }),
  });

  const togglePro = useMutation({
    mutationFn: async (enabled: boolean) =>
      (await api.post('/users/me/pro-enabled', { enabled })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const externalUrl = freshToken
    ? `${window.location.protocol}//${window.location.hostname}:8765/?token=${freshToken}`
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Réglages"
        title="Mon compte & accès"
        subtitle="Identité Home Assistant, token d'accès externe, notifications."
      />

      {me.isLoading && <Loader />}
      {me.isError && <ErrorBox message="Impossible de charger ton profil." />}

      {me.data && (
        <div className="grid" style={{ gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
          <Card>
            <p className="eyebrow">Profil</p>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 26, margin: '4px 0 8px' }}>
              {me.data.display_name || me.data.ha_username}
            </h3>
            <div className="small muted">
              ha_username · <code style={{ background: 'var(--bg-sunken)', padding: '2px 6px', borderRadius: 6 }}>{me.data.ha_username}</code>
            </div>
            {me.data.is_admin && (
              <div className="pill terra" style={{ marginTop: 10 }}>Administrateur</div>
            )}
            <p className="small muted" style={{ marginTop: 14 }}>
              Ton identité provient de Home Assistant via l'ingress. Pour changer ton nom
              d'affichage, modifie-le dans HA → Paramètres → Personnes.
            </p>
          </Card>

          <Card>
            <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
              <KeyRound size={16} style={{ color: 'var(--ink-2)' }} />
              <p className="eyebrow" style={{ margin: 0 }}>Token d'accès externe</p>
            </div>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '4px 0 8px' }}>
              Port 8765 — sans Home Assistant
            </h3>
            <p className="small muted">
              Avec ton token, tu peux accéder à l'app complète depuis n'importe quel
              navigateur sans passer par l'ingress HA. Pratique pour ton conjoint·e
              à distance ou un usage rapide hors LAN avec un reverse proxy.
            </p>

            <div className="row gap-2" style={{
              marginTop: 14, padding: '10px 12px',
              background: 'var(--amber-bg, oklch(0.94 0.04 80))',
              border: '1px solid var(--amber, oklch(0.78 0.12 80))',
              borderRadius: 10, fontSize: 13,
              color: 'var(--ink-2)',
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--amber, oklch(0.6 0.14 60))', flexShrink: 0 }} />
              <span>
                <strong>Garde-le secret.</strong> Quiconque possède ce token peut piloter
                ton compte (créer charges, comptes, etc.). À tes risques et périls.
              </span>
            </div>

            {freshToken ? (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Ton nouveau token (copie-le)</div>
                <div className="row gap-2">
                  <code style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10,
                    background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                    fontFamily: 'var(--mono, ui-monospace)', fontSize: 12,
                    overflowX: 'auto', whiteSpace: 'nowrap',
                  }}>{freshToken}</code>
                  <Button onClick={() => {
                    navigator.clipboard.writeText(freshToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>
                {externalUrl && (
                  <>
                    <div className="eyebrow" style={{ marginTop: 12, marginBottom: 6 }}>URL prête à l'emploi</div>
                    <div className="row gap-2">
                      <code style={{
                        flex: 1, padding: '10px 12px', borderRadius: 10,
                        background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                        fontFamily: 'var(--mono, ui-monospace)', fontSize: 11,
                        overflowX: 'auto', whiteSpace: 'nowrap',
                      }}>{externalUrl}</code>
                      <Button onClick={() => navigator.clipboard.writeText(externalUrl)}>
                        <Copy size={14} />
                      </Button>
                    </div>
                    <p className="small muted" style={{ marginTop: 8 }}>
                      Ce token n'est affiché qu'une fois — note-le maintenant ou régénère plus tard.
                    </p>
                  </>
                )}
              </div>
            ) : me.data.has_external_token ? (
              <div className="small" style={{
                marginTop: 14, padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-sunken)',
              }}>
                Un token est déjà actif. Régénère-le pour invalider l'ancien et en obtenir un nouveau.
              </div>
            ) : (
              <div className="small muted" style={{ marginTop: 14 }}>
                Aucun token actif. Génère-en un pour activer l'accès externe.
              </div>
            )}

            <div className="row gap-2" style={{ marginTop: 14 }}>
              <Button variant="primary" onClick={() => generate.mutate()} disabled={generate.isPending}>
                <RefreshCw size={14} />
                {me.data.has_external_token ? 'Régénérer le token' : 'Générer un token'}
              </Button>
              {me.data.has_external_token && (
                <Button onClick={() => { if (confirm('Révoquer ton token ? L\'accès externe sera coupé.')) revoke.mutate(); }}
                  disabled={revoke.isPending}>
                  <Trash2 size={14} /> Révoquer
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
              <Briefcase size={16} style={{ color: 'var(--ink-2)' }} />
              <p className="eyebrow" style={{ margin: 0 }}>Mode professionnel</p>
            </div>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '4px 0 8px' }}>
              Auto-entrepreneur · suivi séparé
            </h3>
            <p className="small muted">
              Active ce mode si tu factures en parallèle de tes revenus salariés.
              Un switcher Perso/Pro apparaîtra dans la sidebar, et la rubrique
              Compta-pro (CA, provision URSSAF, seuil TVA) sera visible.
              Les comptes que tu marques "pro" sont isolés des soldes perso.
            </p>
            <label className="row between" style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--bg-sunken)', cursor: 'pointer', marginTop: 14,
            }}>
              <div>
                <div style={{ fontWeight: 500 }}>Activer le mode pro</div>
                <div className="small muted">
                  {me.data.pro_enabled ? 'Actuellement activé.' : 'Désactivé par défaut.'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={me.data.pro_enabled}
                onChange={(e) => togglePro.mutate(e.target.checked)}
                style={{ width: 20, height: 20 }}
              />
            </label>
          </Card>

          <Card>
            <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
              <Bell size={16} style={{ color: 'var(--ink-2)' }} />
              <p className="eyebrow" style={{ margin: 0 }}>Notifications Home Assistant</p>
            </div>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '4px 0 8px' }}>
              Alertes seuil dépassé
            </h3>
            <p className="small muted">
              Quand tu crées une charge ou un achat qui fait passer ta marge mensuelle
              sous le seuil configuré dans Settings (table interne), une notification
              persistante est créée dans HA.
            </p>
            <div className="small" style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 10,
              background: notifier.data?.ha_available ? 'var(--sage-bg)' : 'var(--bg-sunken)',
              color: notifier.data?.ha_available ? 'var(--sage)' : 'var(--ink-3)',
            }}>
              {notifier.isLoading ? 'Vérification…' :
               notifier.data?.ha_available
                 ? '✓ Home Assistant joignable.'
                 : 'HA non détecté (mode dev ou config homeassistant_api désactivée).'}
            </div>
            <div className="row gap-2" style={{ marginTop: 14 }}>
              <Button onClick={() => testNotif.mutate()} disabled={testNotif.isPending || !notifier.data?.ha_available}>
                <BellRing size={14} />
                {testNotif.isPending ? 'Envoi…' : 'Tester une notification'}
              </Button>
            </div>
            {testNotif.isSuccess && (
              <p className="small pos" style={{ marginTop: 8 }}>
                ✓ Notification envoyée — vérifie ton panneau HA.
              </p>
            )}
            {testNotif.isError && (
              <ErrorBox message="L'envoi a échoué — vérifie que homeassistant_api est activé." />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
