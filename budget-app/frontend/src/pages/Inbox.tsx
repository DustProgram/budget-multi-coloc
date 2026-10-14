import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Check, RotateCcw, Trash2, Wand2, Inbox as InboxIcon } from 'lucide-react';
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

interface ImportResult { imported: number; duplicates: number; matched: number; to_review: number }

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
  new_purchase: 'Achat (catégorie)',
};

const CATEGORIES = [
  'Alimentation', 'Restaurants', 'Transport', 'Loisirs', 'Maison', 'Santé',
  'Vêtements', 'Tech / Abonnements', 'Voyages', 'Sport', 'Cadeaux', 'Autre',
];

function errDetail(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
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

function ImportCard({ onDone }: { onDone: () => void }) {
  const accounts = useSpaceAccounts();
  const [accountId, setAccountId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accountId === '' && accounts.data?.length) setAccountId(accounts.data[0].id);
  }, [accounts.data, accountId]);

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('account_id', String(accountId));
      fd.append('file', file as File);
      return (await api.post<ImportResult>('/bank/import', fd)).data;
    },
    onSuccess: (r) => { setResult(r); setFile(null); onDone(); },
    onError: (e) => setError(errDetail(e)),
  });

  return (
    <Card>
      <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
        <Upload size={16} style={{ color: 'var(--ink-2)' }} />
        <p className="eyebrow" style={{ margin: 0 }}>Importer un relevé</p>
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>
        CSV ou OFX (export depuis l'espace client BRED, etc.), PDF (Sumeria…) ou photo.
        Le PDF et la photo passent par l'IA. Réimporter un relevé ne crée pas de doublon.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); setResult(null); upload.mutate(); }}>
        <Field label="Compte">
          <Select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} required>
            {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>)}
          </Select>
        </Field>
        <Field label="Fichier">
          <Input type="file" accept=".csv,.ofx,.qfx,.pdf,.txt,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </Field>
        {error && <ErrorBox message={error} />}
        {result && (
          <div className="small" style={{
            padding: '10px 12px', borderRadius: 10, background: 'var(--sage-bg)', marginBottom: 10,
          }}>
            ✓ {result.imported} opération(s) importée(s) · {result.matched} rapprochée(s) automatiquement
            · <strong>{result.to_review} à valider</strong>
            {result.duplicates > 0 && ` · ${result.duplicates} déjà connue(s)`}
          </div>
        )}
        <Button type="submit" variant="primary" disabled={!file || accountId === '' || upload.isPending}>
          <Upload size={14} /> {upload.isPending ? 'Analyse…' : 'Importer'}
        </Button>
      </form>
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
