import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api, { errMsg, img } from '../api.js';

// ---------- toasts ----------
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((type, text) => {
    const id = Math.random();
    setList(l => [...l.slice(-3), { id, type, text }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), type === 'err' ? 8000 : 4000);
  }, []);
  const api = { ok: t => push('ok', t), err: e => push('err', typeof e === 'string' ? e : errMsg(e)), warn: t => push('warn', t), info: t => push('info', t) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{list.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- data loading ----------
export function useApi(url, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData((await api.get(url)).data);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [url, ...deps]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, load, setData };
}

// Runs an async action with a busy flag; a second click while busy is ignored
export function useAction() {
  const [busy, setBusy] = useState(null);
  const ref = useRef(false);
  const run = useCallback(async (key, fn) => {
    if (ref.current) return;
    ref.current = true;
    setBusy(key);
    try { return await fn(); } finally { ref.current = false; setBusy(null); }
  }, []);
  return [busy, run];
}

export const Spin = () => <span className="spin" aria-hidden="true" />;
export function Btn({ busy, children, className = '', ...p }) {
  return <button className={`btn ${className}`} disabled={busy || p.disabled} {...p}>{busy && <Spin />}{children}</button>;
}
export function LoadState({ loading, error, onRetry, children, empty }) {
  if (loading && !error) return <div className="empty"><Spin /> লোড হচ্ছে…</div>;
  if (error) return <div className="notice err"><div style={{ flex: 1 }}>{error}</div>{onRetry && <button className="btn sm ghost" onClick={onRetry}>আবার চেষ্টা</button>}</div>;
  if (empty) return <div className="empty">{empty}</div>;
  return children;
}

// ---------- form fields ----------
export function Field({ label, value, children, className = '', hint }) {
  return (
    <label className={`f ${className}`}>
      <span>{label}{value !== undefined && <em>{value}</em>}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
export function Toggle({ checked, onChange, label, disabled }) {
  return <label className="switch"><input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><i />{label}</label>;
}
export function ColorField({ label, value, onChange }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000';
  return (
    <Field label={label}>
      <div className="color-row">
        <input type="color" value={hex} onChange={e => onChange(e.target.value)} />
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} />
      </div>
    </Field>
  );
}
export function Range({ label, value, min, max, step = 1, onChange, unit = 'px' }) {
  return (
    <Field label={label} value={`${value}${unit}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </Field>
  );
}

export function Modal({ open, onClose, children, size = '' }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose?.();
    if (open) window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose?.()}><div className={`modal ${size}`}>{children}</div></div>;
}
export function ImageModal({ src, onClose }) {
  if (!src) return null;
  return <div className="modal-bg img" onClick={onClose}><img src={img(src)} alt="" /></div>;
}

const ST = {
  ok: 'সফল', connected: 'সংযুক্ত', error: 'ত্রুটি', failed: 'ব্যর্থ', retry: 'পুনরায় চেষ্টা হবে', queued: 'সারিতে', running: 'চলছে', unsupported: 'অসমর্থিত',
  unchecked: 'যাচাই হয়নি', auth_failed: 'লগইন ব্যর্থ', published: 'প্রকাশিত', draft: 'ড্রাফট', pending: 'পেন্ডিং', review: 'রিভিউ', approved: 'অনুমোদিত', rejected: 'বাতিল',
  new: 'নতুন', written: 'লেখা হয়েছে', duplicate: 'ডুপ্লিকেট', ignored: 'উপেক্ষিত', skipped: 'বাদ', publishing: 'প্রকাশ হচ্ছে', verified: 'যাচাইকৃত', needs_review: 'যাচাই প্রয়োজন', insufficient: 'অপর্যাপ্ত তথ্য',
  info: 'তথ্য', warn: 'সতর্কতা', success: 'সফল',
};
export const Status = ({ s }) => <span className={`badge ${s}`}>{ST[s] || s || '—'}</span>;

export const bn = n => String(n ?? '').replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
export const fmtDate = (d, withTime = true) => {
  if (!d) return '—';
  const x = new Date(String(d).includes('T') || String(d).endsWith('Z') ? d : String(d).replace(' ', 'T') + '+06:00');
  if (isNaN(x)) return d;
  return new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}), timeZone: 'Asia/Dhaka' }).format(x);
};

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

export function confirmAsk(msg) { return window.confirm(msg); }

export function PageHead({ title, desc, children }) {
  return (
    <div className="page-head">
      <div style={{ flex: 1, minWidth: 240 }}><h2>{title}</h2>{desc && <p>{desc}</p>}</div>
      {children}
    </div>
  );
}
