import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Send, Plus, Trash2, Check, X, Undo2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { eur } from '../lib/format';
import type { ChatAction, ChatConversation, ChatMessage } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Loader, PageHeader,
} from '../components/ui';

interface ConversationDump {
  conversation: { id: number; title: string | null };
  messages: ChatMessage[];
  actions: ChatAction[];
}

export function Chat() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState('');

  const status = useQuery({
    queryKey: ['chat', 'status'],
    queryFn: async () => (await api.get<{ available: boolean }>('/chat/status')).data,
  });

  const conversations = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: async () => (await api.get<ChatConversation[]>('/chat/conversations')).data,
    enabled: status.data?.available === true,
  });

  // Sélectionner la première conversation au chargement
  useEffect(() => {
    if (activeId === null && conversations.data && conversations.data.length > 0) {
      setActiveId(conversations.data[0].id);
    }
  }, [activeId, conversations.data]);

  const conv = useQuery({
    queryKey: ['chat', 'conversation', activeId],
    queryFn: async () => (await api.get<ConversationDump>(`/chat/conversations/${activeId}/messages`)).data,
    enabled: activeId !== null,
  });

  const createConv = useMutation({
    mutationFn: async () => (await api.post<ChatConversation>('/chat/conversations')).data,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      setActiveId(c.id);
    },
  });

  const deleteConv = useMutation({
    mutationFn: async (id: number) => api.delete(`/chat/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      setActiveId(null);
    },
  });

  const send = useMutation({
    mutationFn: async (text: string) => {
      if (activeId === null) {
        const c = (await api.post<ChatConversation>('/chat/conversations')).data;
        setActiveId(c.id);
        await api.post(`/chat/conversations/${c.id}/messages`, { text });
        return c.id;
      }
      await api.post(`/chat/conversations/${activeId}/messages`, { text });
      return activeId;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversation', id] });
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      setInput('');
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  if (status.isLoading) return <Loader />;

  if (!status.data?.available) {
    return (
      <>
        <PageHeader
          eyebrow="Assistant"
          title="Assistant IA"
          subtitle="Discute avec Claude pour ajouter des dépenses, des courses, ou consulter ton budget."
        />
        <EmptyState
          icon={<AlertCircle size={26} />}
          title="Clé API non configurée"
          message="Renseigne ta clé Claude API dans Paramètres > Add-on Budget > Configuration (option 'claude_api_key') puis redémarre l'add-on."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Assistant"
        title="Assistant IA"
        subtitle="Pose des questions, ajoute des dépenses ou gère ta liste de courses en langage naturel."
      >
        <Button variant="primary" onClick={() => createConv.mutate()}>
          <Plus size={14} /> Nouvelle conversation
        </Button>
      </PageHeader>

      <div className="grid" style={{ gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <Card style={{ padding: 8, height: 'fit-content', maxHeight: '70vh', overflowY: 'auto' }}>
          {conversations.isLoading && <Loader />}
          {conversations.data && conversations.data.length === 0 && (
            <p className="small muted" style={{ padding: 12 }}>
              Aucune conversation. Commence en écrivant ci-contre.
            </p>
          )}
          {conversations.data?.map((c) => (
            <div
              key={c.id}
              className="row gap-2"
              style={{
                padding: '8px 10px', borderRadius: 8,
                background: c.id === activeId ? 'var(--bg-2)' : 'transparent',
                cursor: 'pointer',
                alignItems: 'center', justifyContent: 'space-between',
              }}
              onClick={() => setActiveId(c.id)}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.title || `Conv #${c.id}`}
                </div>
                <div className="small muted">
                  {new Date(c.updated_at).toLocaleDateString('fr-FR', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
              <button
                className="btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Supprimer cette conversation ?`)) deleteConv.mutate(c.id);
                }}
                aria-label="Supprimer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 4, marginBottom: 12 }}>
            {!activeId && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                <Sparkles size={28} style={{ opacity: 0.5 }} />
                <p style={{ marginTop: 12 }}>
                  Écris un message pour démarrer une conversation.<br />
                  Ex : <em>"Ajoute 12€ de courses Carrefour aujourd'hui"</em>
                </p>
              </div>
            )}
            {conv.data && (
              <MessageList
                dump={conv.data}
                onActionDone={() =>
                  qc.invalidateQueries({ queryKey: ['chat', 'conversation', activeId] })
                }
              />
            )}
            {send.isPending && (
              <p className="small muted" style={{ textAlign: 'center', marginTop: 8 }}>
                Claude réfléchit…
              </p>
            )}
            {send.isError && (
              <ErrorBox message={send.error instanceof Error ? send.error.message : 'Erreur'} />
            )}
          </div>

          <form onSubmit={onSubmit} className="row gap-2">
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Ex: 'combien je peux dépenser ce mois ?' ou 'ajoute 5€ de pain'"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={send.isPending}
              autoFocus
            />
            <Button variant="primary" type="submit" disabled={!input.trim() || send.isPending}>
              <Send size={14} />
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

function MessageList({
  dump, onActionDone,
}: {
  dump: ConversationDump;
  onActionDone: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsByMessageId = new Map<number, ChatAction[]>();
  for (const a of dump.actions) {
    const list = actionsByMessageId.get(a.message_id) ?? [];
    list.push(a);
    actionsByMessageId.set(a.message_id, list);
  }

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dump.messages.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {dump.messages.map((m) => {
        if (m.role === 'tool_result') return null; // détail interne — pas affiché
        const actions = actionsByMessageId.get(m.id) ?? [];
        return (
          <div key={m.id}>
            <MessageBubble msg={m} />
            {actions.map((a) => (
              <ActionCard key={a.id} action={a} onChanged={onActionDone} />
            ))}
          </div>
        );
      })}
      <div ref={scrollRef} />
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '78%',
        padding: '10px 14px', borderRadius: 14,
        background: isUser ? 'var(--terra)' : 'var(--bg-2)',
        color: isUser ? '#fff' : 'inherit',
        whiteSpace: 'pre-wrap',
        fontSize: 14, lineHeight: 1.45,
      }}>
        {msg.content || (msg.tool_calls && msg.tool_calls.length > 0
          ? <span className="muted small">[appel d'outil : {msg.tool_calls.map((t) => t.name).join(', ')}]</span>
          : null)}
      </div>
    </div>
  );
}

function ActionCard({
  action, onChanged,
}: {
  action: ChatAction;
  onChanged: () => void;
}) {
  const confirm = useMutation({
    mutationFn: async () => api.post(`/chat/actions/${action.id}/confirm`),
    onSuccess: onChanged,
  });
  const cancel = useMutation({
    mutationFn: async () => api.post(`/chat/actions/${action.id}/cancel`),
    onSuccess: onChanged,
  });
  const undo = useMutation({
    mutationFn: async () => api.post(`/chat/actions/${action.id}/undo`),
    onSuccess: onChanged,
  });

  const input = action.tool_input as Record<string, unknown>;
  const isPending = action.status === 'pending';
  const isExecuted = action.status === 'executed';
  const isCancelled = action.status === 'cancelled';
  const isUndone = action.status === 'undone';

  const label = describeAction(action.tool_name, input);
  const accent: Record<string, string> = {
    pending: 'var(--terra)',
    executed: 'var(--sage)',
    cancelled: 'var(--ink-3)',
    undone: 'var(--ink-3)',
  };

  return (
    <div style={{
      marginTop: 8, marginLeft: 6,
      padding: 12, borderRadius: 10,
      border: `1px solid ${accent[action.status] ?? 'var(--bg-3)'}`,
      background: 'var(--bg-1)',
      maxWidth: 480,
    }}>
      <div className="row gap-2" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: accent[action.status] ?? 'inherit', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {statusLabel(action.status)}
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>{label}</div>
        </div>
      </div>

      {isPending && (
        <div className="row gap-2" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <Button variant="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <X size={12} /> Annuler
          </Button>
          <Button variant="primary" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            <Check size={12} /> Confirmer
          </Button>
        </div>
      )}
      {isExecuted && (
        <div className="row gap-2" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          {canUndo(action) && (
            <Button variant="sm" onClick={() => undo.mutate()} disabled={undo.isPending}>
              <Undo2 size={12} /> Annuler l'action
            </Button>
          )}
        </div>
      )}
      {(isCancelled || isUndone) && (
        <div className="small muted" style={{ marginTop: 6 }}>
          {isCancelled ? 'Action annulée avant exécution.' : 'Action exécutée puis annulée.'}
        </div>
      )}
    </div>
  );
}

function statusLabel(s: ChatAction['status']): string {
  switch (s) {
    case 'pending': return 'En attente de confirmation';
    case 'executed': return 'Exécuté';
    case 'cancelled': return 'Annulé';
    case 'undone': return 'Annulé (undo)';
  }
}

function canUndo(a: ChatAction): boolean {
  return !!a.entity_type && !!a.entity_id && ['purchase', 'charge', 'income', 'shopping_item'].includes(a.entity_type);
}

function describeAction(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'add_purchase':
      return `Ajouter l'achat « ${input.description} » de ${eur((input.total_amount as number) ?? 0)} le ${input.date} (compte #${input.account_id})`;
    case 'add_charge':
      return `Créer la charge « ${input.label} » de ${eur((input.total_amount as number) ?? 0)} / mois (jour ${input.day_of_month}, compte #${input.account_id})`;
    case 'add_income':
      return `Ajouter le revenu « ${input.source} » de ${eur((input.amount as number) ?? 0)} / mois (jour ${input.day_of_month}, compte #${input.account_id})`;
    case 'add_shopping_item':
      return `Ajouter à la liste de courses : « ${input.label} »${input.quantity ? ` (${input.quantity})` : ''}`;
    case 'mark_shopping_bought':
      return `Marquer comme acheté : item #${input.item_id}${input.actual_price ? ` (${eur((input.actual_price as number) ?? 0)})` : ''}`;
    case 'delete_shopping_item':
      return `Supprimer item #${input.item_id} de la liste`;
    default:
      return `${name} — ${JSON.stringify(input)}`;
  }
}
