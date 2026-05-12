/** Précharge les chunks de pages probables pendant que le navigateur idle.
 *
 *  Appelé une fois après le 1er render de l'app. Si l'utilisateur clique
 *  sur Incomes ou Charges 2 secondes après, le chunk est déjà téléchargé
 *  → navigation instantanée. Si la connexion est pourrie, on n'a rien
 *  bloqué — l'import normal se fera quand même au clic.
 */
export function prefetchProbableRoutes(): void {
  const schedule = (typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1500)) as (cb: () => void) => void;

  schedule(() => {
    void import('../pages/Incomes');
    void import('../pages/Charges');
  });
  schedule(() => {
    void import('../pages/Transfers');
    void import('../pages/Savings');
    void import('../pages/Purchases');
  });
}
