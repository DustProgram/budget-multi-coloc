import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBasket, Pencil, Check } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { Button, Card, ErrorBox, Field, Input } from './ui';

interface EnvelopeStatus {
  id: number | null;
  scope: 'perso' | 'commune';
  account_id: number | null;
  label: string;
  configured: boolean;
  monthly_amount: string;
  threshold: string;
  spent: string;
  remaining: string;
  count: number;
  last_operation: string | null;
  days_left: number;
  per_day: string;
  suggestion: string | null;
}

function errDetail(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return 'Erreur';
}

export function EnvelopesCard({ year, month }: { year: number; month: number }) {
  const envelopes = useQuery({
    queryKey: ['envelopes', year, month],
    queryFn: async () => (await api.get<EnvelopeStatus[]>('/envelopes/', { params: { year, month } })).data,
  });
  if (!envelopes.data?.length) return null;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
      {envelopes.data.map((e) => <EnvelopeTile key={`${e.scope}-${e.account_id ?? 'me'}`} env={e} />)}
    </div>
  );
}

function EnvelopeTile({ env }: { env: EnvelopeStatus }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!env.configured);
  const [amount, setAmount] = useState(env.configured ? env.monthly_amount : (env.suggestion ?? ''));
  const [threshold, setThreshold] = useState(env.threshold);
  const save = useMutation({
    mutationFn: async () => api.put(
      env.scope === 'perso' ? '/envelopes/perso' : `/envelopes/account/${env.account_id}`,
      { monthly_amount: amount || 0, threshold },
    ),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['envelopes'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const budget = num(env.monthly_amount);
  const spent = num(env.spent);
  const ratio = budget > 0 ? spent / budget : 0;
  const color = ratio > 1 ? 'var(--rose)' : ratio > 0.8 ? 'var(--amber, #b45309)' : 'var(--sage)';

  return (
    <Card>
      <div className="row between" style={{ alignItems: 'center', marginBottom: 6 }}>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <ShoppingBasket size={16} style={{ color: 'var(--ink-2)' }} />
          <div className="card-title">{env.label}</div>
        </div>
        {env.configured && !editing && (
          <Button variant="ghost" onClick={() => setEditing(true)} aria-label="Modifier l'enveloppe"><Pencil size={12} /></Button>
        )}
      </div>

      {env.configured && !editing && (
        <>
          <div style={{ fontSize: 28, fontFamily: 'var(--display)' }} className={num(env.remaining) < 0 ? 'neg' : undefined}>
            {num(env.remaining) < 0 ? `Dépassée de ${eur(-num(env.remaining))}` : `Reste ${eur(env.remaining)}`}
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--bg-sunken)', margin: '10px 0 8px', overflow: 'hidden' }}
            role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: '100%', background: color }} />
          </div>
          <div className="small muted">
            {eur(spent)} dépensés sur {eur(budget)}
            {env.days_left > 0 && num(env.per_day) > 0 && <> · ≈ <strong>{eur(env.per_day)}/jour</strong> pendant {env.days_left} j</>}
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {env.count} opération(s) sous {eur(env.threshold)} comptées automatiquement
            {env.last_operation ? ` · relevé à jour au ${new Date(env.last_operation).toLocaleDateString('fr-FR')}` : ' · importe un relevé pour suivre'}
          </div>
        </>
      )}

      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <p className="small muted" style={{ marginTop: 0 }}>
            {env.scope === 'perso'
              ? 'Ton budget pour les petites dépenses (courses, restos, sorties…). Il est retiré de ta marge projets.'
              : 'Budget commun (courses, repas…), partagé à parts égales et ajouté à ce que chacun doit abonder.'}
            {env.suggestion && <> D'après tes relevés : <strong>≈ {eur(env.suggestion)}/mois</strong>.</>}
          </p>
          <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 120px' }}>
              <Field label="Montant par mois (€)">
                <Input type="number" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </Field>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <Field label="Gros achat à partir de (€)">
                <Input type="number" min={1} step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
              </Field>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>
            En dessous de ce seuil, les dépenses du relevé vont dans l'enveloppe sans question.
            Au-dessus, l'app te demande : achat exceptionnel ou quotidien ?
          </p>
          {save.isError && <ErrorBox message={errDetail(save.error)} />}
          <div className="row gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending}><Check size={14} /> Enregistrer</Button>
            {env.configured && <Button type="button" onClick={() => setEditing(false)}>Annuler</Button>}
          </div>
        </form>
      )}
    </Card>
  );
}
