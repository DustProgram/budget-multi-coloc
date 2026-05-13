import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileImage, Trash2, Undo2, Check, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader,
  Pill, Select,
} from '../components/ui';

type SourceType = 'ticket' | 'invoice' | 'statement';

interface ImportBatch {
  id: number;
  source_type: string;
  summary: string | null;
  status: 'committed' | 'undone';
  created_at: string;
  undone_at: string | null;
}

interface AnalyzeResult {
  source_type: string;
  parsed: Record<string, unknown>;
}

const SOURCE_LABEL: Record<SourceType, string> = {
  ticket: 'Ticket de caisse',
  invoice: 'Facture / quittance',
  statement: 'Relevé bancaire',
};

export function Import() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceType, setSourceType] = useState<SourceType>('ticket');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [preview, setPreview] = useState<AnalyzeResult | null>(null);
  const [edits, setEdits] = useState<Record<string, unknown>>({});

  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const batches = useQuery({
    queryKey: ['import', 'batches'],
    queryFn: async () => (await api.get<ImportBatch[]>('/import/batches')).data,
  });

  const analyze = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('source_type', sourceType);
      form.append('image', file);
      const { data } = await api.post<AnalyzeResult>('/import/analyze', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setEdits({});
    },
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      const { data } = await api.post<ImportBatch>('/import/commit', {
        source_type: preview.source_type,
        parsed: preview.parsed,
        edits,
        default_account_id: accountId,
      });
      return data;
    },
    onSuccess: () => {
      setPreview(null);
      setEdits({});
      qc.invalidateQueries({ queryKey: ['import', 'batches'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['charges'] });
    },
  });

  const undo = useMutation({
    mutationFn: async (id: number) => api.post(`/import/batches/${id}/undo`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import', 'batches'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['charges'] });
    },
  });

  const onPick = () => fileRef.current?.click();
  const onFile = (f: File | null) => {
    if (!f) return;
    analyze.mutate(f);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <>
      <PageHeader
        eyebrow="Import auto"
        title="Scanne un ticket ou une facture"
        subtitle="Photographie ton ticket, l'IA lit les infos et te propose l'achat à valider. Tu peux annuler tout un import si la lecture est foireuse."
      />

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <Card>
          <Field label="Type de document">
            <Select value={sourceType}
              onChange={(e) => { setSourceType(e.target.value as SourceType); setPreview(null); }}>
              <option value="ticket">Ticket de caisse</option>
              <option value="invoice">Facture / quittance</option>
              <option value="statement">Relevé bancaire</option>
            </Select>
          </Field>
          <Field label="Compte par défaut">
            <Select value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Aucun (modifiable au commit)</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>
              ))}
            </Select>
          </Field>
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={onPick}
            style={{
              marginTop: 12, padding: 32,
              border: '2px dashed var(--line-strong)', borderRadius: 14,
              textAlign: 'center', cursor: 'pointer',
              background: 'var(--bg-sunken)',
            }}
          >
            <Camera size={28} style={{ opacity: 0.6 }} />
            <p style={{ marginTop: 10, marginBottom: 4 }}>
              <strong>Glisse une image ici</strong> ou clique pour parcourir
            </p>
            <p className="small muted">JPEG, PNG, WEBP — max 8 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {analyze.isPending && (
            <div className="row gap-2" style={{ marginTop: 12, justifyContent: 'center' }}>
              <Loader /> <span className="small muted">L'IA analyse l'image…</span>
            </div>
          )}
          {analyze.isError && (
            <ErrorBox message={analyze.error instanceof Error ? analyze.error.message : 'Erreur'} />
          )}
        </Card>

        {preview && (
          <PreviewCard
            preview={preview}
            edits={edits}
            setEdits={setEdits}
            accounts={accounts.data ?? []}
            accountId={accountId}
            setAccountId={setAccountId}
            onCommit={() => commit.mutate()}
            onDiscard={() => { setPreview(null); setEdits({}); }}
            committing={commit.isPending}
            error={commit.error instanceof Error ? commit.error.message : null}
          />
        )}
      </div>

      <div className="card-title" style={{ marginBottom: 10 }}>Imports récents</div>
      {batches.isLoading && <Loader />}
      {batches.data && batches.data.length === 0 && (
        <EmptyState
          icon={<FileImage size={26} />}
          title="Aucun import"
          message="Tes imports apparaîtront ici avec un bouton 'Annuler' pour revenir en arrière."
        />
      )}
      {batches.data && batches.data.length > 0 && (
        <Card>
          <table className="t">
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Résumé</th><th>Statut</th><th></th>
              </tr>
            </thead>
            <tbody>
              {batches.data.map((b) => (
                <tr key={b.id}>
                  <td className="muted small">
                    {new Date(b.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td><Pill>{SOURCE_LABEL[b.source_type as SourceType] ?? b.source_type}</Pill></td>
                  <td><strong>{b.summary || '—'}</strong></td>
                  <td>
                    {b.status === 'committed'
                      ? <Pill tone="sage">Validé</Pill>
                      : <Pill tone="rose">Annulé</Pill>}
                  </td>
                  <td className="r">
                    {b.status === 'committed' && (
                      <Button
                        variant="sm"
                        onClick={() => {
                          if (confirm(`Annuler cet import et supprimer les éléments créés ?`)) {
                            undo.mutate(b.id);
                          }
                        }}
                      >
                        <Undo2 size={12} /> Annuler
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function PreviewCard({
  preview, edits, setEdits, accounts, accountId, setAccountId,
  onCommit, onDiscard, committing, error,
}: {
  preview: AnalyzeResult;
  edits: Record<string, unknown>;
  setEdits: (e: Record<string, unknown>) => void;
  accounts: Account[];
  accountId: number | null;
  setAccountId: (id: number | null) => void;
  onCommit: () => void;
  onDiscard: () => void;
  committing: boolean;
  error: string | null;
}) {
  const p = preview.parsed as Record<string, unknown>;
  const value = (key: string): string => {
    const e = edits[key];
    if (e !== undefined && e !== null) return String(e);
    const v = p[key];
    return v === undefined || v === null ? '' : String(v);
  };
  const setV = (key: string, v: string | number | boolean) =>
    setEdits({ ...edits, [key]: v });

  return (
    <Card>
      <div className="card-head">
        <div>
          <div className="card-title">L'IA a lu ça</div>
          <div className="card-sub">Vérifie et corrige si besoin avant de valider.</div>
        </div>
        <button
          className="btn sm"
          onClick={onDiscard}
          title="Jeter ce preview"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {preview.source_type === 'ticket' && (
        <>
          <Field label="Marchand">
            <Input value={value('marchand')} onChange={(e) => setV('marchand', e.target.value)} />
          </Field>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Date">
              <Input type="date" value={value('date')} onChange={(e) => setV('date', e.target.value)} />
            </Field>
            <Field label="Montant total">
              <Input type="number" step="0.01" value={value('total')}
                onChange={(e) => setV('total', e.target.value)} />
            </Field>
          </div>
          <Field label="Catégorie">
            <Input value={value('categorie')} onChange={(e) => setV('categorie', e.target.value)} />
          </Field>
          {Array.isArray(p.items) && (p.items as unknown[]).length > 0 && (
            <details style={{ marginTop: 4, marginBottom: 8 }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>
                Détail des articles ({(p.items as unknown[]).length})
              </summary>
              <ul className="small" style={{ marginTop: 6 }}>
                {(p.items as Array<{ label: string; amount: number }>).map((it, i) => (
                  <li key={i}>{it.label} — {eur(it.amount)}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {preview.source_type === 'invoice' && (
        <>
          <Field label="Fournisseur">
            <Input value={value('fournisseur')} onChange={(e) => setV('fournisseur', e.target.value)} />
          </Field>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Date">
              <Input type="date" value={value('date')} onChange={(e) => setV('date', e.target.value)} />
            </Field>
            <Field label="Montant">
              <Input type="number" step="0.01" value={value('total')}
                onChange={(e) => setV('total', e.target.value)} />
            </Field>
          </div>
          <label className="row gap-2" style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={!!(edits.is_recurring ?? p.is_recurring)}
              onChange={(e) => setV('is_recurring', e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Charge récurrente (créer une charge mensuelle)</span>
          </label>
          {(edits.is_recurring ?? p.is_recurring) ? (
            <Field label="Jour du mois">
              <Input type="number" min="1" max="31" value={value('day_of_month') || '5'}
                onChange={(e) => setV('day_of_month', e.target.value)} />
            </Field>
          ) : null}
        </>
      )}

      {preview.source_type === 'statement' && (
        <>
          <p className="small muted" style={{ marginBottom: 8 }}>
            {Array.isArray(p.transactions) ? (p.transactions as unknown[]).length : 0} transactions
            détectées (les entrées seront ignorées, les sorties créées comme achats).
          </p>
          <details style={{ marginBottom: 8 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              Voir le détail
            </summary>
            <ul className="small" style={{ marginTop: 6 }}>
              {(p.transactions as Array<{ date: string; label: string; amount: number }> ?? []).map((tx, i) => (
                <li key={i}>
                  {tx.date} — {tx.label} —
                  <span className={num(tx.amount) >= 0 ? 'pos' : 'neg'}>
                    {' '}{num(tx.amount) >= 0 ? '+' : ''}{eur(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      <Field label="Compte cible">
        <Select value={accountId ?? ''}
          onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— Aucun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>
          ))}
        </Select>
      </Field>

      <label className="row gap-2" style={{ marginTop: 6 }}>
        <input
          type="checkbox"
          checked={!!edits.force_duplicate}
          onChange={(e) => setV('force_duplicate', e.target.checked)}
        />
        <span className="small">Forcer même si doublon détecté</span>
      </label>

      {error && (
        <div className="row gap-2" style={{ marginTop: 10, color: 'var(--rose)' }}>
          <AlertCircle size={14} /> <span className="small">{error}</span>
        </div>
      )}

      <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <Button onClick={onDiscard}>Annuler</Button>
        <Button variant="primary" onClick={onCommit} disabled={committing}>
          <Check size={14} /> {committing ? 'Création…' : 'Valider l\'import'}
        </Button>
      </div>
    </Card>
  );
}
