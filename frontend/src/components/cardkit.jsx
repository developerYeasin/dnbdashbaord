// Building blocks shared by the three photocard editors: live canvas, template bar,
// branding/footer/ad sections, JPG download and save/publish.
import { useEffect, useRef, useState } from 'react';
import { SIZE, SOCIALS } from '@shared/cards.js';
import api, { loadCanvasImage, toForm, errMsg } from '../api.js';
import { Field, Toggle, ColorField, Btn, useToast, useApi, useAction, confirmAsk } from './ui.jsx';

export async function fontsReady() {
  try {
    await Promise.all(['400', '600', '700'].map(w => document.fonts.load(`${w} 40px "Hind Siliguri"`, 'বাংলা')));
  } catch { /* fall back to system font */ }
}

// Loads the images a card needs; returns { images, loading, errors }
export function useCardImages(srcs) {
  const key = JSON.stringify(srcs);
  const [state, setState] = useState({ images: {}, loading: false, errors: {} });
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true }));
    (async () => {
      const images = {}, errors = {};
      await Promise.all(Object.entries(srcs).map(async ([k, src]) => {
        if (!src) return;
        try { images[k] = await loadCanvasImage(src); } catch (e) { errors[k] = errMsg(e); }
      }));
      if (live) setState({ images, loading: false, errors });
    })();
    return () => { live = false; };
  }, [key]); // eslint-disable-line
  return state;
}

// Full-resolution 1920x1920 canvas, shown scaled down by CSS. Download uses this same canvas.
export function useCardCanvas(draw, deps) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { fontsReady().then(() => setReady(true)); }, []);
  useEffect(() => {
    if (!ready || !ref.current) return;
    const c = ref.current;
    if (c.width !== SIZE) { c.width = SIZE; c.height = SIZE; }
    const id = requestAnimationFrame(() => draw(c.getContext('2d')));
    return () => cancelAnimationFrame(id);
  }, [ready, ...deps]); // eslint-disable-line
  return ref;
}

export function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(b => {
        if (!b) return reject(new Error('ছবি তৈরি করা যায়নি'));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        resolve();
      }, 'image/jpeg', 0.95);
    } catch (e) { reject(new Error('ক্যানভাস সুরক্ষিত (CORS) — ছবিটি আবার লোড করুন')); }
  });
}

export function Preview({ canvasRef, loading, note, onPointer }) {
  return (
    <div>
      <div className="preview-box">
        <canvas ref={canvasRef} width={SIZE} height={SIZE} {...(onPointer || {})} aria-label="ফটোকার্ড প্রিভিউ" />
      </div>
      <div className="preview-meta">
        <span>{loading ? 'ছবি লোড হচ্ছে…' : 'লাইভ প্রিভিউ'}</span>
        <span>আউটপুট: ১৯২০×১৯২০ px · JPG{note ? ` · ${note}` : ''}</span>
      </div>
    </div>
  );
}

export const Sec = ({ title, open, children }) => <details className="sec" open={open}><summary>{title}</summary><div>{children}</div></details>;

export async function uploadFile(file) {
  const { data } = await api.post('/cards/upload', toForm({ file }));
  return data.url;
}

// ---------- template bar ----------
// `pick` keeps only design keys (not per-card content such as the headline) when saving a template.
export function TemplateBar({ kind, settings, onLoad, pick }) {
  const toast = useToast();
  const { data: list, load } = useApi(`/cards/templates?kind=${kind}`);
  const [id, setId] = useState('');
  const [busy, run] = useAction();
  useEffect(() => {
    if (list && !id) {
      const d = list.find(t => t.is_default) || list[0];
      if (d) { setId(String(d.id)); onLoad(d.settings, d); }
    }
  }, [list]); // eslint-disable-line
  const cur = list?.find(t => String(t.id) === id);
  const choose = v => { setId(v); const t = list.find(x => String(x.id) === v); if (t) onLoad(t.settings, t); };
  const save = () => run('save', async () => {
    try { await api.put(`/cards/templates/${id}`, { settings: pick(settings) }); toast.ok(`“${cur?.name}” টেমপ্লেট সংরক্ষিত (শুধু এই টেমপ্লেট পরিবর্তন হয়েছে)`); load(); } catch (e) { toast.err(e); }
  });
  const saveAs = () => run('new', async () => {
    const name = prompt('নতুন টেমপ্লেটের নাম');
    if (!name) return;
    try { const { data } = await api.post('/cards/templates', { kind, name, settings: pick(settings) }); toast.ok('নতুন টেমপ্লেট তৈরি'); setId(String(data.id)); load(); } catch (e) { toast.err(e); }
  });
  const dup = () => run('dup', async () => { try { const { data } = await api.post(`/cards/templates/${id}/duplicate`); setId(String(data.id)); await load(); toast.ok('কপি তৈরি'); } catch (e) { toast.err(e); } });
  const del = () => run('del', async () => {
    if (!confirmAsk(`“${cur?.name}” টেমপ্লেট মুছে ফেলবেন?`)) return;
    try { await api.delete(`/cards/templates/${id}`); setId(''); load(); toast.ok('মুছে ফেলা হয়েছে'); } catch (e) { toast.err(e); }
  });
  const def = () => run('def', async () => { try { await api.post(`/cards/templates/${id}/default`); load(); toast.ok('ডিফল্ট টেমপ্লেট নির্ধারিত'); } catch (e) { toast.err(e); } });
  return (
    <div className="tpl-bar">
      <b className="small">টেমপ্লেট</b>
      <select value={id} onChange={e => choose(e.target.value)}>
        {(list || []).map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (ডিফল্ট)' : ''}</option>)}
      </select>
      <Btn className="sm green" busy={busy === 'save'} disabled={!id} onClick={save}>সংরক্ষণ</Btn>
      <Btn className="sm ghost" busy={busy === 'new'} onClick={saveAs}>নতুন হিসেবে</Btn>
      <Btn className="sm ghost" busy={busy === 'dup'} disabled={!id} onClick={dup}>ডুপ্লিকেট</Btn>
      <Btn className="sm ghost" busy={busy === 'def'} disabled={!id || cur?.is_default} onClick={def}>ডিফল্ট করুন</Btn>
      <Btn className="sm danger" busy={busy === 'del'} disabled={!id || cur?.is_default} onClick={del}>মুছুন</Btn>
    </div>
  );
}

// ---------- shared design sections ----------
export function BrandSection({ s, set }) {
  const toast = useToast();
  const [up, setUp] = useState(false);
  const onLogo = async f => {
    if (!f) return;
    setUp(true);
    try { set({ logoUrl: await uploadFile(f), logoMode: 'image' }); toast.ok('লোগো আপলোড হয়েছে'); } catch (e) { toast.err(e); } finally { setUp(false); }
  };
  return (
    <Sec title="হেডার, লোগো ও তারিখ">
      <div className="form">
        <Field label="লোগোর ধরন">
          <select value={s.logoMode} onChange={e => set({ logoMode: e.target.value })}>
            <option value="text">টেক্সট লোগো (ডিএন বাংলা)</option>
            <option value="image">আপলোড করা লোগো</option>
          </select>
        </Field>
        {s.logoMode === 'image' ? (
          <Field label={up ? 'আপলোড হচ্ছে…' : 'লোগো ফাইল (JPG/PNG/WebP)'}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onLogo(e.target.files[0])} /></Field>
        ) : (
          <>
            <Field label="প্রথম অংশ"><input value={s.brandA} onChange={e => set({ brandA: e.target.value })} /></Field>
            <Field label="দ্বিতীয় অংশ"><input value={s.brandB} onChange={e => set({ brandB: e.target.value })} /></Field>
            <ColorField label="“ডিএন” রং" value={s.brandAColor} onChange={v => set({ brandAColor: v })} />
            <ColorField label="“বাংলা” রং" value={s.brandBColor} onChange={v => set({ brandBColor: v })} />
          </>
        )}
        <ColorField label="হেডার ব্যাকগ্রাউন্ড" value={s.headerBg} onChange={v => set({ headerBg: v })} />
        <ColorField label="তারিখের রং" value={s.dateColor} onChange={v => set({ dateColor: v })} />
        <Field label="তারিখ">
          <select value={s.dateMode} onChange={e => set({ dateMode: e.target.value })}>
            <option value="auto">অটো (Asia/Dhaka)</option>
            <option value="manual">ম্যানুয়াল</option>
          </select>
        </Field>
        {s.dateMode === 'manual' && <Field label="নির্দিষ্ট তারিখ"><input type="date" value={/^\d{4}-/.test(s.manualDate) ? s.manualDate : ''} onChange={e => set({ manualDate: e.target.value })} /></Field>}
      </div>
    </Sec>
  );
}

const SOCIAL_LABEL = { facebook: 'Facebook', x: 'X', threads: 'Threads', instagram: 'Instagram', youtube: 'YouTube', linkedin: 'LinkedIn' };
export function FooterSection({ s, set }) {
  return (
    <Sec title="ওয়েবসাইট ও সোশ্যাল লিংক বার">
      <div className="row" style={{ marginBottom: 10 }}><Toggle checked={s.footerOn} onChange={v => set({ footerOn: v })} label="লিংক বার দেখান" /></div>
      <div className="form">
        <ColorField label="ব্যাকগ্রাউন্ড" value={s.footerBg} onChange={v => set({ footerBg: v })} />
        <ColorField label="লেখার রং" value={s.footerText} onChange={v => set({ footerText: v })} />
        <Field label="ওয়েবসাইটের ঠিকানা" className="full"><input value={s.website} onChange={e => set({ website: e.target.value })} placeholder="www.dnbangla.com.bd" /></Field>
        {SOCIALS.map(k => (
          <Field key={k} label={`${SOCIAL_LABEL[k]} URL`}><input value={s.social?.[k] || ''} placeholder="ফাঁকা = আইকন দেখাবে না" onChange={e => set({ social: { ...s.social, [k]: e.target.value } })} /></Field>
        ))}
      </div>
    </Sec>
  );
}

// adChoice: 'auto' (next in cycle) | ad id
export function AdSection({ kind, s, set, adChoice, setAdChoice }) {
  const { data } = useApi('/ads');
  const ads = data?.ads?.filter(a => data.activeIds.includes(a.id)) || [];
  const nextId = data?.next?.[kind];
  return (
    <Sec title="বিজ্ঞাপন ব্যানার">
      <div className="row" style={{ marginBottom: 10 }}><Toggle checked={s.adOn} onChange={v => set({ adOn: v })} label="বিজ্ঞাপন দেখান" /></div>
      <Field label="ব্যানার নির্বাচন">
        <select value={adChoice} disabled={!s.adOn} onChange={e => setAdChoice(e.target.value)}>
          <option value="auto">অটো সাইকেল (পরবর্তী: {ads.find(a => a.id === nextId)?.name || '—'})</option>
          {ads.map(a => <option key={a.id} value={a.id}>{a.name} — {a.organization}</option>)}
        </select>
      </Field>
      {!ads.length && data && <p className="small muted">কোনো সক্রিয় বিজ্ঞাপন নেই — কার্ডে প্লেসহোল্ডার দেখাবে।</p>}
    </Sec>
  );
}
export function useAdImage(kind, adChoice) {
  const { data } = useApi('/ads');
  if (!data) return { ad: null, list: [] };
  const id = adChoice === 'auto' ? data.next?.[kind] : Number(adChoice);
  return { ad: data.ads.find(a => a.id === id) || null, list: data.ads };
}

// Save on server (same renderer) + optional publish to social channels
export function SaveBar({ busy, onDownload, onSave, onPublish, extra }) {
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <Btn className="blue" busy={busy === 'dl'} onClick={onDownload}>HD JPG ডাউনলোড</Btn>
      <Btn className="green" busy={busy === 'save'} onClick={onSave}>সংরক্ষণ (রেকর্ড)</Btn>
      {onPublish && <Btn className="amber" busy={busy === 'pub'} onClick={onPublish}>সংরক্ষণ ও সোশ্যালে প্রকাশ</Btn>}
      {extra}
    </div>
  );
}
