import axios from 'axios';

// Empty = same origin (production: backend serves the app; dev: Vite proxies /api)
export const API_URL = import.meta.env.VITE_API_URL || '';
export const img = p => (!p ? '' : /^(https?:|blob:|data:)/.test(p) ? p : `${API_URL}${p}`);

const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 120000 });

// The token is only a session convenience; all data lives in the server database.
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('dnb_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(
  r => r,
  e => {
    if (e.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('dnb_token');
      location.href = '/login';
    }
    return Promise.reject(e);
  },
);

export const errMsg = e => {
  if (!e?.response) return e?.code === 'ECONNABORTED' ? 'সার্ভার সাড়া দিচ্ছে না (সময় শেষ)' : 'সার্ভারের সঙ্গে সংযোগ বিচ্ছিন্ন — ইন্টারনেট দেখুন';
  return e.response.data?.error || e.message;
};

export function toForm(obj) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    fd.append(k, v instanceof Blob ? v : typeof v === 'object' ? JSON.stringify(v) : v);
  }
  return fd;
}

// Loads any image (remote or /uploads) through the backend proxy -> object URL that is safe for canvas
const blobCache = new Map();
export async function loadCanvasImage(src) {
  if (!src) return null;
  let url = src;
  if (!/^(blob:|data:)/.test(src)) {
    if (!blobCache.has(src)) {
      blobCache.set(src, api.get('/cards/proxy', { params: { url: src }, responseType: 'blob', timeout: 30000 })
        .then(r => URL.createObjectURL(r.data))
        .catch(e => { blobCache.delete(src); throw e; }));
    }
    url = await blobCache.get(src);
  }
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('ছবি লোড হয়নি'));
    im.src = url;
  });
}

export default api;
