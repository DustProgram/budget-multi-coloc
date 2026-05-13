import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download, FileSpreadsheet, Upload, Check, AlertCircle, X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Account } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Loader, PageHeader, Pill, Select,
} from '../components/ui';

interface ParsedRow {
  idx: number;
  data: Record<string, string | number | null>;
  status: 'ready' | 'ambiguous' | 'error' | 'skipped';
  issues: string[];
  suggestions: Record<string, string[]>;
}

type ParsedImport = Record<string, ParsedRow[]>;

// resolutions = { sheetName: { rowIdx: { field: newValue } } }
type Resolutions = Record<string, Record<string, Record<string, string>>>;

const STATUS_TONE: Record<ParsedRow['status'], 'sage' | 'amber' | 'rose'> = {
  ready: 'sage',
  ambiguous: 'amber',
  error: 'rose',
  skipped: 'rose',
};

const STATUS_LABEL: Record<ParsedRow['status'], string> = {
  ready: 'Prêt',
  ambiguous: 'À vérifier',
  error: 'Erreur',
  skipped: 'Ignoré',
};

export function BulkImport() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [resolutions, setResolutions] = useState<Resolutions>({});

  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const downloadTemplate = async () => {
    const res = await api.get('/bulk-import/template', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budget_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<ParsedImport>('/bulk-import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (data) => {
      setParsed(data);
      setResolutions({});
    },
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!parsed) return;
      const { data } = await api.post('/bulk-import/commit', { parsed, resolutions });
      return data;
    },
    onSuccess: () => {
      setParsed(null);
      setResolutions({});
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['charges'] });
      qc.invalidateQueries({ queryKey: ['incomes'] });
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['savings'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['import', 'batches'] });
    },
  });

  const onFile = (f: File | null) => {
    if (!f) return;
    upload.mutate(f);
  };

  const patchRow = (sheet: string, idx: number, field: string, value: string) => {
    setResolutions((prev) => ({
      ...prev,
      [sheet]: {
        ...(prev[sheet] || {}),
        [String(idx)]: { ...((prev[sheet] || {})[String(idx)] || {}), [field]: value },
      },
    }));
  };

  const counts = parsed ? countByStatus(parsed) : null;

  return (
    <>
      <PageHeader
        eyebrow="Import en masse"
        title="Excel / CSV"
        subtitle="Télécharge le template, remplis-le (toi ou un LLM externe), uploade-le. 100% local, sans IA — sauf si tu veux corriger une ligne à la main."
      >
        <Button onClick={downloadTemplate}>
          <Download size={14} /> Télécharger le template
        </Button>
      </PageHeader>

      <Card style={{ marginBottom: 16 }}>
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null); }}
          onDragOver={(e) => e.preventDefault()}
          style={{
            padding: 32, textAlign: 'center', cursor: 'pointer',
            border: '2px dashed var(--line-strong)', borderRadius: 12,
            background: 'var(--bg-sunken)',
          }}
        >
          <FileSpreadsheet size={28} style={{ opacity: 0.6 }} />
          <p style={{ marginTop: 10, marginBottom: 4 }}>
            <strong>Dépose ton fichier ici</strong> ou clique pour parcourir
          </p>
          <p className="small muted">Excel (.xlsx) ou CSV — max 5 MB</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {upload.isPending && (
          <div className="row gap-2" style={{ marginTop: 12, justifyContent: 'center' }}>
            <Loader /> <span className="small muted">Analyse en cours…</span>
          </div>
        )}
        {upload.isError && (
          <ErrorBox message={upload.error instanceof Error ? upload.error.message : 'Erreur'} />
        )}
      </Card>

      {counts && (
        <div className="row gap-2" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <Pill tone="sage">
            <Check size={11} /> {counts.ready} prêts
          </Pill>
          {counts.ambiguous > 0 && (
            <Pill tone="amber">
              <AlertCircle size={11} /> {counts.ambiguous} à vérifier
            </Pill>
          )}
          {counts.error > 0 && (
            <Pill tone="rose">
              <X size={11} /> {counts.error} erreurs
            </Pill>
          )}
          <Button
            variant="primary"
            onClick={() => commit.mutate()}
            disabled={commit.isPending || counts.ready + counts.resolvedAmbiguous === 0}
          >
            <Upload size={14} /> Valider l'import ({counts.ready + counts.resolvedAmbiguous} lignes)
          </Button>
          <Button onClick={() => { setParsed(null); setResolutions({}); }}>
            Annuler
          </Button>
        </div>
      )}

      {commit.isError && (
        <ErrorBox message={commit.error instanceof Error ? commit.error.message : 'Erreur au commit'} />
      )}

      {!parsed && (
        <EmptyState
          icon={<FileSpreadsheet size={26} />}
          title="Aucun fichier"
          message="Le preview apparaîtra ici après upload, sheet par sheet."
        />
      )}

      {parsed && Object.entries(parsed).map(([sheet, rows]) => {
        if (rows.length === 0) return null;
        return (
          <SheetTable
            key={sheet}
            sheet={sheet}
            rows={rows}
            resolutions={resolutions[sheet] || {}}
            accounts={accounts.data ?? []}
            onPatch={(idx, field, value) => patchRow(sheet, idx, field, value)}
          />
        );
      })}
    </>
  );
}

function countByStatus(parsed: ParsedImport) {
  let ready = 0, ambiguous = 0, error = 0, resolvedAmbiguous = 0;
  for (const rows of Object.values(parsed)) {
    for (const r of rows) {
      if (r.status === 'ready') ready++;
      else if (r.status === 'ambiguous') ambiguous++;
      else if (r.status === 'error') error++;
    }
  }
  return { ready, ambiguous, error, resolvedAmbiguous };
}

function SheetTable({
  sheet, rows, resolutions, accounts, onPatch,
}: {
  sheet: string;
  rows: ParsedRow[];
  resolutions: Record<string, Record<string, string>>;
  accounts: Account[];
  onPatch: (idx: number, field: string, value: string) => void;
}) {
  const columns = Object.keys(rows[0]?.data ?? {});
  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 10 }}>
        {sheet} <span className="small muted">({rows.length} lignes)</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="t">
          <thead>
            <tr>
              <th>#</th>
              <th>Statut</th>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const patch = resolutions[String(r.idx)] || {};
              return (
                <tr key={r.idx}>
                  <td className="muted small">{r.idx}</td>
                  <td>
                    <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                    {r.issues.length > 0 && (
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {r.issues.join(' · ')}
                      </div>
                    )}
                  </td>
                  {columns.map((c) => {
                    const v = patch[c] !== undefined ? patch[c] : r.data[c];
                    const suggestions = r.suggestions[c];
                    if (suggestions && suggestions.length > 0) {
                      // Pour les champs compte, on liste les comptes existants
                      const isAccountField = c.toLowerCase().includes('account_name');
                      const opts = isAccountField
                        ? accounts.map((a) => a.name)
                        : suggestions;
                      return (
                        <td key={c}>
                          <Select
                            value={String(v ?? '')}
                            onChange={(e) => onPatch(r.idx, c, e.target.value)}
                            style={{ minWidth: 140 }}
                          >
                            <option value="">— Choisir —</option>
                            {opts.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </Select>
                        </td>
                      );
                    }
                    return (
                      <td key={c} className="small">
                        {v === null || v === undefined ? <span className="muted">—</span> : String(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
