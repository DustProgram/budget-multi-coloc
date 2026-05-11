import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Download, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { eur } from '../lib/format';
import type { ColocBreakdown } from '../types';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loader, PageHeader } from '../components/ui';

export function ColocSummary() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const breakdown = useQuery({
    queryKey: ['coloc', 'breakdown', year, month],
    queryFn: async () => {
      const { data } = await api.get<ColocBreakdown>('/coloc/breakdown', {
        params: { year, month },
      });
      return data;
    },
  });

  function downloadPdf(userId: number) {
    const url = `${api.defaults.baseURL}/coloc/pdf?year=${year}&month=${month}&user_id=${userId}`;
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader icon={<Users />} title="Récap colocation">
        <div className="flex items-center gap-3">
          <Field label="Année">
            <Input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24"
            />
          </Field>
          <Field label="Mois">
            <Input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-20"
            />
          </Field>
        </div>
      </PageHeader>

      {breakdown.isLoading && <Loader />}
      {breakdown.isError && <ErrorBox message="Erreur de chargement." />}

      {breakdown.data && breakdown.data.summaries.length === 0 && (
        <EmptyState message="Aucune charge partagée pour ce mois." />
      )}

      {breakdown.data && breakdown.data.summaries.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {breakdown.data.summaries.map((s) => (
              <Card key={s.user_id}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">{s.user_name}</h3>
                    <p className="text-sm text-slate-500">
                      Total dû ce mois :{' '}
                      <span className="font-semibold text-rose-600">{eur(s.total_due)}</span>
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => downloadPdf(s.user_id)}>
                    <Download size={14} /> PDF
                  </Button>
                </div>
                <ul className="space-y-1 text-sm">
                  {s.by_charge.map((c) => (
                    <li
                      key={c.charge_id}
                      className="flex justify-between border-b border-slate-100 last:border-0 pb-1"
                    >
                      <div>
                        <span className="text-slate-700">{c.label}</span>
                        <span className="text-xs text-slate-400 ml-2">({c.split_mode})</span>
                      </div>
                      <span className="tabular-nums">
                        {c.my_share !== null ? eur(c.my_share) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          {Object.keys(breakdown.data.debts).length > 0 && (
            <Card>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <ArrowRight className="text-brand" size={20} /> Qui doit quoi à qui
              </h3>
              <ul className="space-y-2 text-sm">
                {Object.entries(breakdown.data.debts).flatMap(([fromUser, debts]) =>
                  Object.entries(debts).map(([toUser, amount]) => (
                    <li
                      key={`${fromUser}-${toUser}`}
                      className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
                    >
                      <span>
                        <strong>{nameOf(breakdown.data, Number(fromUser))}</strong> doit à{' '}
                        <strong>{nameOf(breakdown.data, Number(toUser))}</strong>
                      </span>
                      <span className="font-semibold text-amber-700 tabular-nums">{eur(amount)}</span>
                    </li>
                  )),
                )}
              </ul>
            </Card>
          )}

          {breakdown.data.charges_lines.length > 0 && (
            <Card className="mt-4 p-0 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 text-xs uppercase text-slate-500 font-medium">
                Détail des charges partagées
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Charge</th>
                    <th className="text-right px-4 py-2">Total</th>
                    <th className="text-left px-4 py-2">Mode</th>
                    <th className="text-right px-4 py-2">Par personne</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.data.charges_lines.map((l) => (
                    <tr key={l.charge_id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium">{l.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{eur(l.total)}</td>
                      <td className="px-4 py-2 text-slate-600 text-xs">{l.split_mode}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs">
                        {Object.entries(l.per_person)
                          .map(([uid, amt]) => `${nameOf(breakdown.data, Number(uid))}: ${eur(amt)}`)
                          .join(' • ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function nameOf(data: ColocBreakdown, userId: number): string {
  const s = data.summaries.find((x) => x.user_id === userId);
  return s?.user_name ?? `#${userId}`;
}
