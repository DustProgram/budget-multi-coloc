import axios from 'axios';

const ingressPrefix = window.location.pathname.includes('/api/hassio_ingress/')
  ? window.location.pathname.split('/').slice(0, 4).join('/')
  : '';

export const api = axios.create({
  baseURL: `${ingressPrefix}/api`,
});
