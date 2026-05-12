import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { eur, fmtDate, todayISO, num } from '../lib/format';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import { useUsersDirectory } from '../lib/useUsersDirectory';
import { PAYMENT_METHODS, type Account, type PaymentMethod, type Purchase } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Pill, Select,
} from '../components/ui';

export function Purchases() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const allPurchases = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => (await api.get<Purchase[]>('/purchases/')).data,
  });
  const spaceAccounts = useSpaceAccountIdsSet();
  const users = useUsersDirectory();
  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });
  const purchases = {
    ...allPurchases,
    data: (allPurchases.data ?? []).filter(
      (p) => p.account_id !== null && spaceAccounts.idsSet.has(p.account_id),
    ),
  };

  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`/purchases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchases'] }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Achats & étalements"
        title="Achats"
        subtitle="Comptant ou en plusieurs fois — répartis automatiquement sur les mois."
      >
        <Button variant="primary" onClick={() => setCreating(true)} disabled={(accounts.data?.length ?? 0) === 0}>
          <Plus size={14} /> Nouvel achat
        </Button>
      </PageHeader>

      {purchases.isLoading && <Loader />}
      {purchases.data && purchases.data.length === 0 && (
        <EmptyState
          icon={<ShoppingBag size={26} />}
          title="Aucun achat"
          message="Saisis un achat comptant ou en plusieurs fois pour le voir s'étaler."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Ajouter</Button>}
        />
      )}

      {purchases.data && purchases.data.length > 0 && (
        <Card>
          <table className="t">
            <thead>
              <tr>
                <th>Date</th><th>Achat</th><th>Catégorie</th><th>Étalement</th><th>Par</th>
                <th className="r">Total</th><th className="r">Mensualité</th><th></th>
              </tr>
            </thead>
            <tbody>
              {purchases.data.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.date)}</td>
                  <td><strong>{p.description}</strong></td>
                  <td>{p.category && <Pill>{p.category}</Pill>}</td>
                  <td>{p.nb_installments === 1 ? 'Comptant' : `${p.nb_installments}× ${eur(p.monthly_amount)}`}</td>
                  <td className="muted small">{users.display(p.user_id)}</td>
                  <td className="r num">{eur(p.total_amount)}</td>
                  <td className="r num neg display" style={{ fontSize: 17 }}>−{eur(p.monthly_amount)}</td>
                  <td className="r">
                    <Button variant="sm" onClick={() => { if (confirm(`Supprimer "${p.description}" ?`)) remove.mutate(p.id); }}>
                      <Trash2 size={12} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NewPurchaseModal
        open={creating} onClose={() => setCreating(false)}
        accounts={accounts.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ['purchases'] })}
      />
    </>
  );
}

function NewPurchaseModal({
  open, onClose, accounts, onSaved,
}: { open: boolean; onClose: () => void; accounts: Account[]; onSaved: () => void }) {
  const [form, setForm] = useState<{
    description: string;
    total_amount: string;
    nb_installments: number;
    date: string;
    category: string;
    payment_method: PaymentMethod;
    account_id: number | null;
  }>({
    description: '', total_amount: '0', nb_installments: 1,
    date: todayISO(), category: '',
    payment_method: 'CB',
    account_id: accounts[0]?.id ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      await api.post('/purchases/', { ...form, total_amount: form.total_amount || '0' });
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const monthly = num(form.total_amount) / Math.max(1, form.nb_installments);

  return (
    <Modal open={open} onClose={onClose} title="Nouvel achat">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Description"><Input required value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Montant total">
          <Input type="number" step="0.01" required value={form.total_amount}
            onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
        </Field>
        <Field label="Étalement (mensualités)">
          <Select value={form.nb_installments}
            onChange={(e) => setForm({ ...form, nb_installments: Number(e.target.value) })}>
            <option value={1}>Comptant</option>
            <option value={2}>2× sans frais</option>
            <option value={3}>3× sans frais</option>
            <option value={4}>4× sans frais</option>
            <option value={10}>10× (crédit)</option>
          </Select>
        </Field>
        {form.nb_installments > 1 && (
          <p className="small muted" style={{ marginTop: -8 }}>
            Mensualité : {eur(monthly)}
          </p>
        )}
        <Field label="Date">
          <Input type="date" required value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Catégorie">
          <Input value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Tech, Maison, Loisirs…" />
        </Field>
        <Field label="Moyen de paiement">
          <Select value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Compte">
          <Select value={form.account_id ?? ''}
            onChange={(e) => setForm({ ...form, account_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
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
