import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Trash2, Users as UsersIcon } from 'lucide-react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type {
  Account, CalendarEvent, CustomEvent, CustomEventKind, EventType,
  UpcomingResponse,
} from '../types';
import {
  Button, Card, ErrorBox, Field, Input, Loader, Modal,
  PageHeader, Pill, Select, Textarea,
} from '../components/ui';

const TYPE_DOT: Record<EventType, string> = {
  income: 'income',
  charge: 'charge',
  transfer_in: 'saving',
  transfer_out: 'saving',
  saving_in: 'saving',
  saving_out: 'saving',
  purchase: 'purchase',
};

const TYPE_LABEL: Record<EventType, string> = {
  income: 'Revenu',
  charge: 'Charge',
  transfer_in: 'Virement reçu',
  transfer_out: 'Virement envoyé',
  saving_in: 'Épargne reçue',
  saving_out: 'Épargne envoyée',
  purchase: 'Achat',
};

const TYPE_TONE: Record<EventType, 'sage' | 'rose' | 'plum' | 'amber'> = {
  income: 'sage',
  charge: 'rose',
  transfer_in: 'plum',
  transfer_out: 'plum',
  saving_in: 'plum',
  saving_out: 'plum',
  purchase: 'amber',
};

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type FilterKey = 'income' | 'charge' | 'transfer' | 'saving' | 'purchase' | 'custom';

const FILTER_LABELS: Record<FilterKey, string> = {
  income: 'Revenus',
  charge: 'Charges',
  transfer: 'Virements',
  saving: 'Épargne',
  purchase: 'Achats',
  custom: 'Événements perso',
};

function matchesFilter(eventType: EventType | 'custom', enabled: Set<FilterKey>): boolean {
  if (eventType === 'income') return enabled.has('income');
  if (eventType === 'charge') return enabled.has('charge');
  if (eventType === 'purchase') return enabled.has('purchase');
  if (eventType.startsWith('transfer_')) return enabled.has('transfer');
  if (eventType.startsWith('saving_')) return enabled.has('saving');
  if (eventType === 'custom') return enabled.has('custom');
  return true;
}

export function Calendar() {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [creating, setCreating] = useState(false);
  const [enabledFilters, setEnabledFilters] = useState<Set<FilterKey>>(
    () => new Set(['income', 'charge', 'transfer', 'saving', 'purchase', 'custom']),
  );

  function toggleFilter(k: FilterKey) {
    setEnabledFilters((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const query = useQuery({
    queryKey: ['calendar', 'upcoming', 180],
    queryFn: async () => {
      const { data } = await api.get<UpcomingResponse>('/calendar/upcoming', {
        params: { days: 180 },
      });
      return data;
    },
  });

  const custom = useQuery({
    queryKey: ['custom-events'],
    queryFn: async () => (await api.get<CustomEvent[]>('/custom-events/')).data,
  });

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: number) => api.delete(`/custom-events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-events'] }),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of query.data?.events ?? []) {
      if (!matchesFilter(e.type, enabledFilters)) continue;
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [query.data, enabledFilters]);

  const customByDate = useMemo(() => {
    const map = new Map<string, CustomEvent[]>();
    if (!enabledFilters.has('custom')) return map;
    for (const ev of custom.data ?? []) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [custom.data, enabledFilters]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const grid = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  const selectedKey = format(selected, 'yyyy-MM-dd');
  const selectedEvents = byDate.get(selectedKey) ?? [];
  const selectedCustom = customByDate.get(selectedKey) ?? [];

  const monthLabel = format(cursor, 'LLLL yyyy', { locale: fr });

  const monthEvents = (query.data?.events ?? []).filter((e) =>
    isSameMonth(new Date(e.date), cursor),
  );
  const totalIn = monthEvents.filter((e) => num(e.amount) > 0).reduce((s, e) => s + num(e.amount), 0);
  const totalOut = monthEvents.filter((e) => num(e.amount) < 0).reduce((s, e) => s + num(e.amount), 0);

  return (
    <>
      <PageHeader
        eyebrow="Calendrier"
        title={monthLabel}
        subtitle={
          <>
            <span className="pos">↗ {eur(totalIn)} entrants</span>
            {' · '}
            <span className="neg">↘ {eur(Math.abs(totalOut))} sortants</span>
            {' · '}{monthEvents.length} événements
          </>
        }
      >
        <Button onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft size={14} /></Button>
        <Button onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Aujourd'hui</Button>
        <Button onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight size={14} /></Button>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Événement
        </Button>
      </PageHeader>

      {/* Filtres par type d'événement */}
      <div
        className="row gap-2"
        style={{ marginBottom: 16, flexWrap: 'wrap' }}
        role="group"
        aria-label="Filtres d'événements"
      >
        {(['income', 'charge', 'transfer', 'saving', 'purchase', 'custom'] as FilterKey[]).map((k) => {
          const active = enabledFilters.has(k);
          const tone: Record<FilterKey, string> = {
            income: 'sage', charge: 'rose', transfer: 'plum',
            saving: 'plum', purchase: 'amber', custom: 'terra',
          };
          return (
            <button
              key={k}
              onClick={() => toggleFilter(k)}
              type="button"
              className={`pill ${active ? tone[k] : ''}`}
              style={{
                cursor: 'pointer',
                opacity: active ? 1 : 0.4,
                border: active ? '1px solid currentColor' : '1px solid var(--line)',
                fontWeight: 500,
                padding: '5px 12px',
              }}
            >
              {FILTER_LABELS[k]}
            </button>
          );
        })}
      </div>

      {query.isLoading && <Loader />}
      {query.isError && <ErrorBox message="Erreur de chargement des événements." />}

      {query.data && (
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <Card>
            <div className="cal-grid" style={{ marginBottom: 8 }}>
              {DAYS.map((d) => <div key={d} className="cal-head">{d}</div>)}
            </div>
            <div className="cal-grid">
              {grid.map((d) => {
                const dKey = format(d, 'yyyy-MM-dd');
                const events = byDate.get(dKey) ?? [];
                const customs = customByDate.get(dKey) ?? [];
                const isMuted = !isSameMonth(d, cursor);
                const isToday = isSameDay(d, today);
                const isSelected = isSameDay(d, selected);
                const types = [...new Set(events.map((e) => TYPE_DOT[e.type]))];
                const totalCount = events.length + customs.length;
                return (
                  <button
                    key={format(d, 'yyyy-MM-dd')}
                    onClick={() => setSelected(d)}
                    className={`cal-day ${isMuted ? 'muted' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  >
                    <span className="d">{format(d, 'd')}</span>
                    <div className="dots">
                      {types.map((t) => <span key={t} className={`dot ${t}`} />)}
                      {customs.length > 0 && (
                        <span className="dot" style={{ background: 'var(--ink-3)' }} title="Événement custom" />
                      )}
                      {totalCount > 0 && <span className="tiny" style={{ marginLeft: 2, opacity: .7 }}>{totalCount}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="row gap-3" style={{ marginTop: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-3)' }}>
              {(['income', 'charge', 'saving_out', 'purchase'] as EventType[]).map((t) => (
                <span key={t} className="row gap-2" style={{ alignItems: 'center' }}>
                  <span className={`dot ${TYPE_DOT[t]}`} /> {TYPE_LABEL[t].split(' ')[0]}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <div className="card-title" style={{ marginBottom: 4 }}>
              {format(selected, "EEEE d MMMM", { locale: fr })}
            </div>
            <div className="small muted" style={{ marginBottom: 14 }}>
              {selectedEvents.length + selectedCustom.length} événement{(selectedEvents.length + selectedCustom.length) !== 1 ? 's' : ''}
            </div>
            {selectedEvents.length === 0 && selectedCustom.length === 0 && (
              <div className="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>
                Rien de prévu ce jour-là.
              </div>
            )}
            {selectedCustom.map((ev) => (
              <div key={`c-${ev.id}`} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="row between">
                  <Pill tone={ev.is_shared ? 'sage' : undefined}>
                    {ev.is_shared && <UsersIcon size={11} style={{ marginRight: 4 }} />}
                    {ev.kind === 'pro' ? 'Pro' : ev.kind === 'coloc' ? 'Coloc' : ev.kind === 'famille' ? 'Famille' : 'Perso'}
                  </Pill>
                  <button
                    onClick={() => deleteEvent.mutate(ev.id)}
                    title="Supprimer" aria-label="Supprimer"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div style={{ fontWeight: 500, marginTop: 4 }}>{ev.label}</div>
                {ev.description && <div className="small muted" style={{ marginTop: 2 }}>{ev.description}</div>}
                <div className="small muted" style={{ marginTop: 2, fontSize: 11 }}>
                  Ajouté par {ev.user_name || '—'}
                </div>
              </div>
            ))}
            {selectedEvents.map((e, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="row between">
                  <Pill tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Pill>
                  <span className={`num display ${num(e.amount) >= 0 ? 'pos' : ''}`} style={{ fontSize: 18 }}>
                    {num(e.amount) >= 0 ? '+' : ''}{eur(e.amount)}
                  </span>
                </div>
                <div style={{ fontWeight: 500, marginTop: 4 }}>{e.label}</div>
                <div className="small muted">{e.account_name}</div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {query.data && query.data.accounts.length > 0 && (
        <div className="grid" style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          marginTop: 24,
        }}>
          {query.data.accounts.map((a) => {
            const start = num(a.starting_balance);
            const end = num(a.projected_end_balance);
            const delta = end - start;
            return (
              <Card key={a.account_id}>
                <p className="eyebrow" style={{ margin: 0 }}>{a.name}</p>
                <div className="num display" style={{ fontSize: 28 }}>{eur(end)}</div>
                <div className={`small ${delta >= 0 ? 'pos' : 'neg'}`}>
                  {delta >= 0 ? '+' : ''}{eur(delta)} sur la période
                </div>
                <div className="small muted">Départ : {eur(start)}</div>
              </Card>
            );
          })}
        </div>
      )}

      <NewCustomEventModal
        open={creating}
        onClose={() => setCreating(false)}
        accounts={accounts.data ?? []}
        defaultDate={format(selected, 'yyyy-MM-dd')}
        onSaved={() => qc.invalidateQueries({ queryKey: ['custom-events'] })}
      />
    </>
  );
}

function NewCustomEventModal({
  open, onClose, accounts, defaultDate, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  defaultDate: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<{
    date: string;
    label: string;
    kind: CustomEventKind;
    description: string;
    is_shared: boolean;
    account_id: number | null;
  }>({
    date: defaultDate,
    label: '',
    kind: 'perso',
    description: '',
    is_shared: false,
    account_id: null,
  });
  const [error, setError] = useState<string | null>(null);

  const sharedAccounts = accounts.filter((a) => a.type === 'Compte joint');

  const submit = useMutation({
    mutationFn: async () => {
      if (form.is_shared && !form.account_id) {
        throw new Error('Sélectionne un compte joint pour partager.');
      }
      await api.post('/custom-events/', {
        ...form,
        description: form.description || null,
        account_id: form.is_shared ? form.account_id : null,
      });
    },
    onSuccess: () => {
      onSaved();
      setForm({ ...form, label: '', description: '', is_shared: false, account_id: null });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nouvel événement">
      <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
        <Field label="Date">
          <Input type="date" required value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Libellé">
          <Input required value={form.label} placeholder="Ex : Apéro samedi, RDV médecin…"
            onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        <Field label="Type">
          <Select value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as CustomEventKind })}>
            <option value="perso">Perso</option>
            <option value="coloc">Coloc</option>
            <option value="famille">Famille</option>
            <option value="pro">Pro</option>
            <option value="autre">Autre</option>
          </Select>
        </Field>
        <Field label="Description (optionnel)">
          <Textarea rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {sharedAccounts.length > 0 && (
          <>
            <label className="row gap-2" style={{ alignItems: 'center', margin: '6px 0' }}>
              <input
                type="checkbox" checked={form.is_shared}
                onChange={(e) => setForm({ ...form, is_shared: e.target.checked })}
              />
              <UsersIcon size={14} />
              <span style={{ fontSize: 13 }}>Partager avec les co-titulaires d'un compte</span>
            </label>
            {form.is_shared && (
              <Field label="Compte joint">
                <Select value={form.account_id ?? ''}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— Sélectionne —</option>
                  {sharedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
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
