import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Calculator, Check, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account, SimulationResult } from '../types';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select } from '../components/ui';

export function Simulator() {
  const today = new Date();
  const [amount, setAmount] = useState('100');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const accounts = useQuery({
    queryKey: ['accounts', { includeInactive: false }],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const sim = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SimulationResult>('/simulator/', {
        amount,
        account_id: accountId,
        year,
        month,
      });
      return data;
    },
  });

  const result = sim.data;
  const ok = result?.can_afford_global && (accountId === null || result?.can_afford_account);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader icon={<Calculator />} title="Est-ce que je peux acheter ?" />

      <Card className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sim.mutate();
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <Field label="Montant de l'achat envisagé">
            <Input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Compte (optionnel)">
            <Select
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Vue globale —</option>
              {accounts.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Année">
            <Input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </Field>
          <Field label="Mois">
            <Input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </Field>
          <div className="md:col-span-2 flex justify-end pt-2">
            <Button type="submit" disabled={sim.isPending}>
              <Calculator size={16} /> Simuler
            </Button>
          </div>
        </form>
        {sim.isError && <ErrorBox message="Erreur lors de la simulation." />}
      </Card>

      {result && (
        <Card>
          <div
            className={`flex items-start gap-3 p-4 rounded-lg ${
              ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'
            }`}
          >
            <span
              className={`p-2 rounded-full ${
                ok ? 'bg-emerald-500' : 'bg-rose-500'
              } text-white flex-shrink-0`}
            >
              {ok ? <ThumbsUp size={20} /> : <ThumbsDown size={20} />}
            </span>
            <div className="flex-1">
              <p className={`text-lg font-semibold ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                {ok ? 'Oui, tu peux te le permettre.' : 'Attention, ça passe difficilement.'}
              </p>
              <p className={`text-sm mt-1 ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                {result.verdict_message}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <Verdict
              ok={result.can_afford_global}
              label="Verdict global"
              detail={`Dispo avant : ${eur(result.available_before)} → après : ${eur(result.available_after)}`}
            />
            {accountId !== null && (
              <Verdict
                ok={result.can_afford_account}
                label="Verdict sur le compte"
                detail={
                  result.account_balance_after !== null
                    ? `Solde du compte après : ${eur(result.account_balance_after)}`
                    : 'Compte non sélectionné'
                }
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm">
            <div className="bg-slate-50 rounded-md p-3">
              <p className="text-xs uppercase text-slate-500">Avant achat</p>
              <p className="text-lg font-semibold mt-1 tabular-nums">{eur(result.final_balance_before)}</p>
            </div>
            <div className="bg-slate-50 rounded-md p-3">
              <p className="text-xs uppercase text-slate-500">Après achat</p>
              <p
                className={`text-lg font-semibold mt-1 tabular-nums ${
                  num(result.final_balance_after) >= num(result.final_balance_before)
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {eur(result.final_balance_after)}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Verdict({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-md ${ok ? 'bg-emerald-50' : 'bg-rose-50'}`}>
      {ok ? <Check className="text-emerald-600" size={18} /> : <X className="text-rose-600" size={18} />}
      <div>
        <p className={`text-sm font-medium ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}
