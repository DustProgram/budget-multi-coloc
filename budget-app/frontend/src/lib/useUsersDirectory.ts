import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { UserPickerEntry } from '../types';

/** Cache long du dictionnaire id → user. Sert à afficher "Par <X>" sur les
 *  lignes de transactions sur compte joint. */
export function useUsersDirectory() {
  const q = useQuery({
    queryKey: ['available-users'],
    queryFn: async () => (await api.get<UserPickerEntry[]>('/accounts/available-users')).data,
    staleTime: 5 * 60_000,  // les users HA ne changent pas souvent
  });
  const byId = new Map((q.data ?? []).map((u) => [u.user_id, u]));
  function display(userId: number | null | undefined): string {
    if (!userId) return '—';
    const u = byId.get(userId);
    return u ? (u.display_name || u.ha_username) : `User #${userId}`;
  }
  return { ...q, byId, display };
}
