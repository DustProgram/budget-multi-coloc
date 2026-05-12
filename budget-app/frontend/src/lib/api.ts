import axios from 'axios';

// Detect HA ingress prefix on the live URL (eg /api/hassio_ingress/<token>/)
// so axios fires requests at the right base path.
const ingressPrefix = window.location.pathname.includes('/api/hassio_ingress/')
  ? window.location.pathname.split('/').slice(0, 4).join('/')
  : '';

export const api = axios.create({
  baseURL: `${ingressPrefix}/api`,
});
