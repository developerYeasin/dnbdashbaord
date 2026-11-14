import { useEffect, useState, useCallback } from 'react';
import api, { errMsg, img } from '../api.js';

export function useList(url) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.get(url)).data);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { rows, load, loading };
}

export function useFlash() {
  const [m, setM] = useState(null);
  const ok = t => { setM({ t, ok: true }); setTimeout(() => setM(null), 4000); };
  const err = e => setM({ t: typeof e === 'string' ? e : errMsg(e), ok: false });
  const node = m && <div className={`msg ${m.ok ? 'ok' : 'err'}`}>{m.t}</div>;
  return { ok, err, node };
}

export const Status = ({ s }) => <span className={`badge ${s}`}>{s}</span>;

export function ImageModal({ src, onClose }) {
  if (!src) return null;
  return <div className="modal-bg" onClick={onClose}><img src={img(src)} alt="" /></div>;
}

export const fmt = d => (d ? String(d).replace('T', ' ').slice(0, 16) : '');

export function PostResults({ results }) {
  const list = typeof results === 'string' ? JSON.parse(results || '[]') : results || [];
  if (!list.length) return <small style={{ color: '#888' }}>—</small>;
  return (
    <div>
      {list.map((r, i) => (
        <div key={i} title={r.error || ''} style={{ fontSize: 12, color: r.ok ? '#15803d' : '#b91c1c' }}>
          {r.ok ? '✓' : '✗'} {r.platform}: {r.name}
        </div>
      ))}
    </div>
  );
}
