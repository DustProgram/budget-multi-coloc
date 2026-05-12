import axios from 'axios';
import { isExternalContext, clearLoggedFlag } from './external-auth';

// Detect HA ingress prefix on the live URL (eg /api/hassio_ingress/<token>/)
// so axios fires requests at the right base path.
const ingressPrefix = window.location.pathname.includes('/api/hassio_ingress/')
  ? window.location.pathname.split('/').slice(0, 4).join('/')
  : '';

export const api = axios.create({
  baseURL: `${ingressPrefix}/api`,
  // Le cookie session externe est HttpOnly — il est posé/lu automatiquement
  // par le navigateur. withCredentials assure qu'il soit bien envoyé même
  // en cross-origin (utile derrière Tailscale ou un reverse proxy).
  withCredentials: true,
});

// Si l'API renvoie 401 sur le port externe, on déclenche un événement
// que l'AuthGate écoute pour rediriger vers la page de login.
api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (
      error?.response?.status === 401
      && isExternalContext()
      && error?.config?.url
      && !String(error.config.url).startsWith('/auth/login/')
    ) {
      clearLoggedFlag();
      window.dispatchEvent(new CustomEvent('budget:external-auth-required'));
    }
    return Promise.reject(error);
  },
);
