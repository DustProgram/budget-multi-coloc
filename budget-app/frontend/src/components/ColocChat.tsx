import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import type { Message } from '../types';
import { Avatar } from './Avatar';

interface Props {
  accountId: number;
}

export function ColocChat({ accountId }: Props) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ['messages', accountId],
    queryFn: async () =>
      (await api.get<Message[]>(`/accounts/${accountId}/messages`)).data,
    refetchInterval: 5000,
  });

  const post = useMutation({
    mutationFn: async (text: string) =>
      api.post(`/accounts/${accountId}/messages`, { body: text }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['messages', accountId] });
    },
  });

  const markRead = useMutation({
    mutationFn: async () => api.post(`/accounts/${accountId}/messages/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unread', accountId] }),
  });

  // Auto-scroll en bas + mark-read à chaque arrivée de nouveaux messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    if (messages.data && messages.data.length > 0) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.data?.length]);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div className="card-title row gap-2" style={{ alignItems: 'center' }}>
          <MessageCircle size={14} />
          Discussion du compte joint
        </div>
        <div className="small muted">
          {(messages.data ?? []).length} message{(messages.data ?? []).length > 1 ? 's' : ''}
        </div>
      </div>

      <div ref={listRef} style={{
        flex: 1, overflowY: 'auto', padding: '8px 0',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.isLoading && <p className="muted small">Chargement…</p>}
        {messages.data && messages.data.length === 0 && (
          <div className="muted small" style={{ textAlign: 'center', padding: 20 }}>
            Aucun message — démarrez la discussion.
          </div>
        )}
        {(messages.data ?? []).map((m) => (
          <div key={m.id} className="row gap-2" style={{ alignItems: 'flex-start' }}>
            <Avatar user={{ display_name: m.user_name }} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row gap-2" style={{ alignItems: 'baseline' }}>
                <strong style={{ fontSize: 13 }}>{m.user_name || 'Inconnu'}</strong>
                <span className="small muted" style={{ fontSize: 11 }}>
                  {new Date(m.created_at).toLocaleString('fr-FR', {
                    day: '2-digit', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
              <div style={{
                marginTop: 4, padding: '8px 12px', borderRadius: 12,
                background: 'var(--bg-sunken)', fontSize: 14,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = body.trim();
          if (t) post.mutate(t);
        }}
        className="row gap-2"
        style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}
      >
        <input
          className="input"
          placeholder="Ton message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ flex: 1 }}
          maxLength={4000}
        />
        <button className="btn primary" disabled={!body.trim() || post.isPending}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
