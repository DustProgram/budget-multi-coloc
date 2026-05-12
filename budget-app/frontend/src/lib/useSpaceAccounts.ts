import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSpace } from './space';
import type { Account } from '../types';

/** Liste des comptes du space actif (Perso ou Pro). À utiliser dans toutes
 *  les pages qui veulent filtrer leurs données par space. */
export function useSpaceAccounts() {
  const { space } = useSpace();
  return useQuery({
    queryKey: ['accounts', space],
    queryFn: async () => (await api.get<Account[]>(`/accounts/?space=${space}`)).data,
  });
}

/** Set d'IDs des comptes du space actif (pratique pour `idsSet.has(x)`). */
export function useSpaceAccountIdsSet() {
  const accounts = useSpaceAccounts();
  return {
    ...accounts,
    idsSet: new Set((accounts.data ?? []).map((a) => a.id)),
  };
}
