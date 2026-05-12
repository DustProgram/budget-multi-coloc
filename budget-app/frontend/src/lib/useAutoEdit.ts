import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Détecte un query param `?edit=N` au mount et ouvre la modal d'édition
 * de l'item correspondant (si trouvé). Nettoie le param après usage.
 *
 * Utilisé par la page Événements pour ouvrir directement la modale d'une
 * charge/revenu/etc. en cliquant sur "Modifier".
 */
export function useAutoEdit<T extends { id: number }>(
  items: T[] | undefined,
  setEditing: (t: T) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current || !items) return;
    const raw = searchParams.get('edit');
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const found = items.find((i) => i.id === id);
    if (found) {
      consumed.current = true;
      setEditing(found);
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
  }, [items, searchParams, setEditing, setSearchParams]);
}
