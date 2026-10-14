import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Check, RotateCcw, Trash2, Wand2, Inbox as InboxIcon, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { eur, fmtDate } from '../lib/format';
import { useSpaceAccounts } from '../lib/useSpaceAccounts';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader, Select,
} from '../components/ui';

interface Option { key: string; label: string }

export interface BankTx {
  id: number;
  account_id: number;
  account_name: string;
  date: string;
  amount: string;
  label: string;
  source: string;
  status: 'to_review' | 'matched' | 'ignored';
  match_kind: string | null;
  match_id: number | null;
  contributor_user_id: number | null;
  rule_id: number | null;
  question: string | null;
  options: Option[];
  suggested_pattern: string | null;
}

interface ImportResult {
  imported: number; duplicates: number; matched: number; to_review: number;
  opening_balance?: string | null; closing_balance?: string | null;
  balance_verified?: boolean; warnings?: string[];
  account_name?: string | null; account_detected?: boolean;
}

interface FileResult extends ImportResult { name: string; error?: string }

interface Unassigned { file: File; accountId: number | '' }

const EMPTY_RESULT = { imported: 0, duplicates: 0, matched: 0, to_review: 0 };

interface Suggestion {
  id: string;
  kind: 'new_charge' | 'new_income' | 'new_purchase' | 'ignore' | 'contribution' | 'daily';
  label: string;
  pattern: string;
  contributor_user_id: number | null;
  contributor_name: string | null;
  tx_ids: number[];
  amount: string;
  day: number;
  months: number;
  count: number;
  total: string;
  category: string | null;
  reason: string;
  examples: string[];
}

interface Rule {
  id: number;
  account_id: number | null;
  pattern: string;
  amount_min: string | null;
  amount_max: string | null;
  match_kind: string;
  category: string | null;
  hits: number;
}

const KIND_LABEL: Record<string, string> = {
  charge: 'Charge', income: 'Revenu', recurring_transfer: 'Virement', onetime_transfer: 'Virement ponctuel',
  saving: 'Épargne', purchase: 'Achat', contribution: 'Abondement', ignore: 'Ignorée',
  new_purchase: 'Achat (catégorie)', daily: 'Quotidien',
};

const CATEGORIES = [
  'Alimentation', 'Restaurants', 'Transport', 'Loisirs', 'Maison', 'Santé',
  'Vêtements', 'Tech / Abonnements', 'Voyages', 'Sport', 'Cadeaux', 'Autre',
];

function errDetail(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  if (d && typeof d === 'object' && 'detail' in d) return String((d as { detail: unknown }).detail);
  return e instanceof Error ? e.message : 'Erreur';
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function Inbox() {
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['bank-inbox'],
    queryFn: async () => (await api.get<BankTx[]>('/bank/inbox')).data,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bank-inbox'] });
    qc.invalidateQueries({ queryKey: ['bank-inbox-count'] });
    qc.invalidateQueries({ queryKey: ['bank-recent'] });
    qc.invalidateQueries({ queryKey: ['bank-rules'] });
    qc.removeQueries({ queryKey: ['bank-onboarding'] });
  };

  return (
    <>
      <PageHeader
        eyebrow="Relevés bancaires"
        title="À valider"
        subtitle="Importe tes relevés : ce qui colle à tes déclarations est rapproché tout seul, le reste t'attend ici."
      />
      <div className="grid" style={{ gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <ImportCard onDone={refresh} />
        <RulesCard onChanged={refresh} />
      </div>

      {(inbox.data?.length ?? 0) >= 5 && <OnboardingPanel count={inbox.data!.length} onDone={refresh} />}

      <h2 style={{ fontFamily: 'var(--display)', fontSize: 24, margin: '28px 0 12px' }}>
        Opérations à valider {inbox.data && inbox.data.length > 0 && <span className="pill terra">{inbox.data.length}</span>}
      </h2>
      {inbox.isLoading && <Loader />}
      {inbox.isError && <ErrorBox message="Impossible de charger les opérations." />}
      {inbox.data?.length === 0 && (
        <EmptyState title="Rien à valider" message="Tout est rapproché. Importe un nouveau relevé quand tu veux." />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {inbox.data?.map((tx) => <ReviewItem key={tx.id} tx={tx} onDone={refresh} />)}
      </div>

      <RecentCard onChanged={refresh} />
    </>
  );
}

function errCode(e: unknown): string | undefined {
  const d = (e as { response?: { data?: { detail?: { code?: string } } } }).response?.data?.detail;
  return typeof d === 'object' && d ? d.code : undefined;
}

async function importOne(file: File, accountId: number | null): Promise<FileResult> {
  const fd = new FormData();
  if (accountId != null) fd.append('account_id', String(accountId));
  fd.append('file', file);
  return { name: file.name, ...(await api.post<ImportResult>('/bank/import', fd)).data };
}

function ImportCard({ onDone }: { onDone: () => void }) {
  const accounts = useSpaceAccounts();
  const [accountId, setAccountId] = useState<number | 'auto'>('auto');
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [unassigned, setUnassigned] = useState<Unassigned[]>([]);
  const [dragging, setDragging] = useState(false);

  const upload = useMutation({
    mutationFn: async (batch: { file: File; accountId: number | null }[]) => {
      const out: FileResult[] = [];
      const unknown: Unassigned[] = [];
      for (const { file, accountId: acc } of batch) {
        try {
          out.push(await importOne(file, acc));
        } catch (e) {
          if (errCode(e) === 'account_unknown') unknown.push({ file, accountId: '' });
          else out.push({ name: file.name, ...EMPTY_RESULT, error: errDetail(e) });
        }
      }
      return { out, unknown };
    },
    onSuccess: ({ out, unknown }) => {
      setResults((prev) => [...(prev ?? []), ...out]);
      setUnassigned(unknown);
      setFiles([]);
      onDone();
    },
  });

  const start = (picked: File[]) => {
    setResults(null);
    upload.mutate(picked.map((file) => ({ file, accountId: accountId === 'auto' ? null : accountId })));
  };

  // Les relevés choisis d'abord : leur IBAN est alors appris, et les autres du même compte sont reconnus
  const assignAll = () => upload.mutate([
    ...unassigned.filter((u) => u.accountId !== '').map((u) => ({ file: u.file, accountId: u.accountId as number })),
    ...unassigned.filter((u) => u.accountId === '').map((u) => ({ file: u.file, accountId: null })),
  ]);

  return (
    <Card>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const dropped = Array.from(e.dataTransfer.files);
          if (dropped.length) setFiles(dropped);
        }}
        style={dragging ? { outline: '2px dashed var(--terra)', outlineOffset: 6, borderRadius: 12 } : undefined}
      >
        <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
          <Upload size={16} style={{ color: 'var(--ink-2)' }} />
          <p className="eyebrow" style={{ margin: 0 }}>Importer des relevés</p>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          Dépose tous tes relevés d'un coup, tous comptes et tous mois confondus : chacun part sur son compte
          grâce à l'IBAN imprimé dessus. La première fois, l'app te demande à quel compte correspond chaque IBAN.
          Réimporter un relevé ne crée pas de doublon.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); start(files); }}>
          <Field label="Compte">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
              <option value="auto">Reconnaître automatiquement</option>
              {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>)}
            </Select>
          </Field>
          <Field label={files.length ? `${files.length} fichier(s) prêt(s)` : 'Fichiers (ou glisse-les ici)'}>
            <Input type="file" multiple accept=".csv,.ofx,.qfx,.pdf,.txt,image/*"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </Field>

          {unassigned.length > 0 && (
            <div style={{ padding: 12, borderRadius: 10, marginBottom: 12, background: 'var(--bg-2)' }}>
              <p className="small" style={{ marginTop: 0 }}>
                <strong>Compte non reconnu.</strong> Choisis le compte d'<em>un</em> relevé par compte :
                les autres relevés du même compte suivront, et les prochains seront reconnus tout seuls.
              </p>
              {unassigned.map((u, i) => (
                <div key={u.file.name + i} className="row gap-2" style={{ alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className="small" style={{ flex: '1 1 160px', wordBreak: 'break-all' }}>{u.file.name}</span>
                  <Select style={{ flex: '1 1 180px' }} value={u.accountId}
                    onChange={(e) => setUnassigned((prev) => prev.map((x, j) => j === i ? { ...x, accountId: Number(e.target.value) } : x))}>
                    <option value="">Choisir…</option>
                    {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>)}
                  </Select>
                </div>
              ))}
              <Button type="button" variant="primary" onClick={assignAll}
                disabled={upload.isPending || unassigned.every((u) => u.accountId === '')}>
                <Upload size={14} /> Importer sur ces comptes
              </Button>
            </div>
          )}

          {results?.map((r, i) => (
            <div key={r.name + i} className="small" style={{
              padding: '8px 12px', borderRadius: 10, marginBottom: 8,
              background: r.error ? 'var(--rose-bg)' : 'var(--sage-bg)',
              color: r.error ? 'var(--rose)' : undefined,
            }}>
              <strong>{r.name}</strong>{r.account_name && <> → {r.account_name}</>} — {r.error ?? (
                <>
                  {r.imported} importée(s) · {r.matched} rapprochée(s) · <strong>{r.to_review} à trier</strong>
                  {r.duplicates > 0 && ` · ${r.duplicates} déjà connue(s)`}
                  {r.closing_balance != null && (
                    <> · solde fin {eur(r.closing_balance)} {r.balance_verified ? '✓ vérifié' : '(non vérifié)'}</>
                  )}
                  {r.warnings?.map((w) => <div key={w} style={{ color: 'var(--amber, #b45309)' }}>⚠ {w}</div>)}
                </>
              )}
            </div>
          ))}
          <Button type="submit" variant="primary" disabled={!files.length || upload.isPending}>
            <Upload size={14} /> {upload.isPending ? 'Analyse…' : files.length > 1 ? `Importer ${files.length} fichiers` : 'Importer'}
          </Button>
        </form>
      </div>
    </Card>
  );
}

const KIND_CHOICES: { value: Suggestion['kind']; label: string }[] = [
  { value: 'new_income', label: 'Revenu mensuel' },
  { value: 'new_charge', label: 'Charge mensuelle' },
  { value: 'daily', label: 'Quotidien (enveloppe)' },
  { value: 'new_purchase', label: 'Achat exceptionnel' },
  { value: 'ignore', label: 'Ignorer' },
];

const SECTIONS: { kind: Suggestion['kind']; title: string; hint: string }[] = [
  { kind: 'contribution', title: 'Abondements du compte joint', hint: 'Comptés comme versés par chaque coloc (récap coloc).' },
  { kind: 'new_income', title: 'Revenus qui reviennent chaque mois', hint: 'Déclarés comme revenus mensuels.' },
  { kind: 'new_charge', title: 'Charges qui reviennent chaque mois', hint: 'Déclarées comme charges mensuelles (abonnements, prélèvements…).' },
  { kind: 'ignore', title: 'À ignorer', hint: 'Virements entre tes comptes, remboursements, entrées ponctuelles.' },
  { kind: 'daily', title: 'Dépenses du quotidien', hint: "Comptées dans ton enveloppe, sans catégorie ni détail. Règle son montant sur le tableau de bord." },
  { kind: 'new_purchase', title: 'Gros achats', hint: 'Au-dessus de ton seuil : achat exceptionnel (retiré de ta marge) ou quotidien ?' },
];

interface Draft { selected: boolean; kind: Suggestion['kind']; label: string; category: string }

function OnboardingPanel({ count, onDone }: { count: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [result, setResult] = useState<string | null>(null);
  const suggestions = useQuery({
    queryKey: ['bank-onboarding'],
    queryFn: async () => (await api.get<Suggestion[]>('/bank/onboarding')).data,
    enabled: open,
  });

  useEffect(() => {
    if (!suggestions.data) return;
    setDrafts(Object.fromEntries(suggestions.data.map((g) => [g.id, {
      selected: true, kind: g.kind, label: g.label, category: g.category ?? 'Autre',
    }])));
  }, [suggestions.data]);

  const apply = useMutation({
    mutationFn: async () => {
      const groups = (suggestions.data ?? []).filter((g) => drafts[g.id]?.selected).map((g) => {
        const d = drafts[g.id];
        return {
          tx_ids: g.tx_ids, kind: d.kind, label: d.label, category: d.kind === 'new_purchase' ? d.category : null,
          amount: g.amount, create_rule: remember, pattern: g.pattern,
          contributor_user_id: d.kind === 'contribution' ? g.contributor_user_id : null,
        };
      });
      return (await api.post<{ applied: number; errors: string[] }>('/bank/onboarding/apply', { groups })).data;
    },
    onSuccess: (r) => {
      setResult(`✓ ${r.applied} opération(s) triée(s).${r.errors.length ? ` ${r.errors.length} erreur(s) : ${r.errors.join(' · ')}` : ''}`);
      setOpen(false);
      onDone();
    },
  });

  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const selected = (suggestions.data ?? []).filter((g) => drafts[g.id]?.selected);
  const nbOps = selected.reduce((n, g) => n + g.count, 0);

  if (!open) {
    return (
      <Card style={{ marginTop: 16, background: 'var(--terra-bg, var(--bg-elev))' }}>
        <div className="row between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="row gap-2" style={{ alignItems: 'center' }}>
              <Zap size={16} />
              <strong>Démarrage rapide — {count} opérations à trier</strong>
            </div>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              Je les regroupe par commerçant, je repère ce qui revient chaque mois (salaire, loyer,
              abonnements) et je propose une catégorie pour le reste. Tu valides en une fois.
            </p>
            {result && <p className="small pos" style={{ margin: '6px 0 0' }}>{result}</p>}
          </div>
          <Button variant="primary" onClick={() => { setResult(null); setOpen(true); }}>
            <Zap size={14} /> Trier automatiquement
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <div className="row between" style={{ alignItems: 'center', marginBottom: 8 }}>
        <div className="row gap-2" style={{ alignItems: 'center' }}><Zap size={16} /><strong>Démarrage rapide</strong></div>
        <Button variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
      </div>
      {suggestions.isLoading && <Loader />}
      {suggestions.data && SECTIONS.map((sec) => {
        const items = suggestions.data.filter((g) => g.kind === sec.kind);
        if (!items.length) return null;
        return (
          <div key={sec.kind} style={{ marginTop: 14 }}>
            <p className="eyebrow" style={{ marginBottom: 2 }}>{sec.title} ({items.length})</p>
            <p className="small muted" style={{ marginTop: 0 }}>{sec.hint}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((g) => {
                const d = drafts[g.id];
                if (!d) return null;
                return (
                  <div key={g.id} className="row gap-2" style={{
                    alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10,
                    background: 'var(--bg-sunken)', opacity: d.selected ? 1 : 0.55,
                  }}>
                    <input type="checkbox" checked={d.selected} aria-label="Inclure"
                      onChange={(e) => set(g.id, { selected: e.target.checked })} />
                    <Input value={d.label} onChange={(e) => set(g.id, { label: e.target.value })}
                      style={{ flex: '2 1 160px', minWidth: 120 }} title={g.examples.join('\n')} />
                    <Select value={d.kind} onChange={(e) => set(g.id, { kind: e.target.value as Suggestion['kind'] })}
                      style={{ flex: '1 1 130px' }}>
                      {g.contributor_user_id != null && (
                        <option value="contribution">Abondement de {g.contributor_name}</option>
                      )}
                      {KIND_CHOICES.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </Select>
                    {d.kind === 'new_purchase' && (
                      <Input list="bank-categories" value={d.category} style={{ flex: '1 1 130px' }}
                        onChange={(e) => set(g.id, { category: e.target.value })} />
                    )}
                    <span className="small muted" style={{ flex: '1 1 180px', textAlign: 'right' }}>
                      {g.count}× · {g.kind === 'daily' ? `≈ ${eur(g.amount)}/mois` : g.kind === 'new_purchase' ? `total ${eur(g.total)}` : `${eur(g.amount)} vers le ${g.day}`}
                      <br />{g.reason}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <datalist id="bank-categories">
        {CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>
      {suggestions.data && (
        <div className="row between" style={{ marginTop: 16, alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <label className="row gap-2 small" style={{ alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <Wand2 size={12} /> Retenir pour les prochains relevés (règles)
          </label>
          <Button variant="primary" disabled={!selected.length || apply.isPending} onClick={() => apply.mutate()}>
            <Check size={14} /> {apply.isPending ? 'Application…' : `Valider ${selected.length} groupe(s) · ${nbOps} opération(s)`}
          </Button>
        </div>
      )}
      {apply.isError && <ErrorBox message={errDetail(apply.error)} />}
    </Card>
  );
}

function ReviewItem({ tx, onDone }: { tx: BankTx; onDone: () => void }) {
  const [option, setOption] = useState(tx.options[0]?.key ?? 'ignore');
  const [category, setCategory] = useState('Alimentation');
  const [label, setLabel] = useState(titleCase(tx.suggested_pattern || tx.label));
  const [remember, setRemember] = useState(false);
  const [pattern, setPattern] = useState(tx.suggested_pattern || '');
  const [error, setError] = useState<string | null>(null);
  const amount = Number(tx.amount);

  const resolve = useMutation({
    mutationFn: async () => (await api.post(`/bank/transactions/${tx.id}/resolve`, {
      option,
      category: option === 'new_purchase' ? category : null,
      label: option === 'new_charge' || option === 'new_income' ? label : null,
      create_rule: remember,
      rule_pattern: remember ? pattern : null,
    })).data,
    onSuccess: onDone,
    onError: (e) => setError(errDetail(e)),
  });

  return (
    <Card style={{ padding: '16px 18px' }}>
      <div className="row between" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{tx.label}</div>
          <div className="small muted">{fmtDate(tx.date)} · {tx.account_name} · {tx.source.toUpperCase()}</div>
        </div>
        <div className={`num ${amount < 0 ? 'neg' : 'pos'}`} style={{ fontSize: 18, fontWeight: 600 }}>
          {eur(tx.amount)}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); resolve.mutate(); }}
        style={{ marginTop: 12 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tx.options.map((o) => (
            <label key={o.key} className="row gap-2 small" style={{ alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name={`opt-${tx.id}`} checked={option === o.key}
                onChange={() => setOption(o.key)} />
              {o.label}
            </label>
          ))}
        </div>

        {option === 'new_purchase' && (
          <Field label="Catégorie">
            <Input list="bank-categories" value={category} onChange={(e) => setCategory(e.target.value)} required />
          </Field>
        )}
        {(option === 'new_charge' || option === 'new_income') && (
          <Field label={option === 'new_charge' ? 'Nom de la charge' : 'Nom du revenu'}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </Field>
        )}

        {option !== 'purchase' && !option.startsWith('purchase:') && (
          <label className="row gap-2 small" style={{ alignItems: 'center', margin: '10px 0 4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <Wand2 size={12} /> Retenir pour les prochaines fois
          </label>
        )}
        {remember && (
          <Field label="Mots du libellé à reconnaître">
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} required />
          </Field>
        )}

        {error && <ErrorBox message={error} />}
        <Button type="submit" variant="primary" disabled={resolve.isPending} style={{ marginTop: 8 }}>
          <Check size={14} /> Valider
        </Button>
      </form>
      <datalist id="bank-categories">
        {CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>
    </Card>
  );
}

function RulesCard({ onChanged }: { onChanged: () => void }) {
  const rules = useQuery({
    queryKey: ['bank-rules'],
    queryFn: async () => (await api.get<Rule[]>('/bank/rules')).data,
  });
  const del = useMutation({
    mutationFn: async (id: number) => api.delete(`/bank/rules/${id}`),
    onSuccess: onChanged,
  });
  return (
    <Card>
      <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
        <Wand2 size={16} style={{ color: 'var(--ink-2)' }} />
        <p className="eyebrow" style={{ margin: 0 }}>Règles apprises</p>
      </div>
      {rules.data?.length === 0 && (
        <p className="small muted">
          Aucune règle. Coche « Retenir » en validant une opération pour qu'elle soit
          reconnue automatiquement ensuite.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {rules.data?.map((r) => (
          <div key={r.id} className="row between small" style={{
            alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-sunken)', gap: 8,
          }}>
            <div style={{ minWidth: 0 }}>
              <code>{r.pattern}</code> → {KIND_LABEL[r.match_kind] ?? r.match_kind}
              {r.category && ` · ${r.category}`}
              <span className="muted"> · {r.hits}×</span>
            </div>
            <Button variant="ghost" onClick={() => del.mutate(r.id)} aria-label="Supprimer la règle">
              <Trash2 size={12} />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecentCard({ onChanged }: { onChanged: () => void }) {
  const recent = useQuery({
    queryKey: ['bank-recent'],
    queryFn: async () => (await api.get<BankTx[]>('/bank/transactions?status=matched')).data.slice(0, 30),
  });
  const reopen = useMutation({
    mutationFn: async (id: number) => api.post(`/bank/transactions/${id}/reopen`),
    onSuccess: onChanged,
  });
  if (!recent.data?.length) return null;
  return (
    <>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 24, margin: '28px 0 12px' }}>
        <InboxIcon size={18} /> Récemment rapprochées
      </h2>
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table className="t">
          <tbody>
            {recent.data.map((t) => (
              <tr key={t.id}>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                <td className="small" style={{ wordBreak: 'break-word' }}>{t.label}</td>
                <td className="small"><span className="pill sage">
                  {KIND_LABEL[t.match_kind ?? ''] ?? t.match_kind}{t.rule_id ? ' · règle' : ''}
                </span></td>
                <td className={`r num small ${Number(t.amount) < 0 ? 'neg' : 'pos'}`}>{eur(t.amount)}</td>
                <td className="r">
                  <Button variant="ghost" onClick={() => reopen.mutate(t.id)} title="Rouvrir">
                    <RotateCcw size={12} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
