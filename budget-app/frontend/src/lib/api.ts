import axios from 'axios';
import { getExternalToken, clearExternalToken, isExternalContext } from './external-auth';

// Detect HA ingress prefix on the live URL (eg /api/hassio_ingress/<token>/)
// so axios fires requests at the right base path.
const ingressPrefix = window.location.pathname.includes('/api/hassio_ingress/')
  ? window.location.pathname.split('/').slice(0, 4).join('/')
  : '';

export const api = axios.create({
  baseURL: `${ingressPrefix}/api`,
});

// Sur le port externe, on ajoute Authorization: Bearer <token> à chaque requête
api.interceptors.request.use((config) => {
  if (isExternalContext()) {
    const token = getExternalToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
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
      clearExternalToken();
      window.dispatchEvent(new CustomEvent('budget:external-auth-required'));
    }
    return Promise.reject(error);
  },
);
