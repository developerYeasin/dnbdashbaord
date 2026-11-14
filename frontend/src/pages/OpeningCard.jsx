import { useEffect, useMemo, useRef, useState } from 'react';
import { drawOpeningCard, OPENING_DEFAULTS, GRADIENTS, alphaBBox, openingImageRect } from '@shared/cards.js';
import api, { toForm, loadCanvasImage, errMsg } from '../api.js';
import { Field, Toggle, ColorField, Range, Btn, Spin, Modal, useToast, useAction, PageHead } from '../components/ui.jsx';
import { useCardImages, useCardCanvas, downloadCanvas, Preview, Sec, TemplateBar, BrandSection, FooterSection, AdSection, useAdImage, SaveBar } from '../components/cardkit.jsx';

const CONTENT_KEYS = ['text', 'offsetX', 'offsetY', 'scale', 'rotation'];
const pick = s => Object.fromEntries(Object.entries(s).filter(([k]) => !CONTENT_KEYS.includes(k)));
const STYLES = [['red', 'DN Bangla Red Gradient'], ['slate', 'Deep Slate Night'], ['maroon', 'Maroon Classic Event'], ['dark', 'Dark Minimal'], ['custom', 'Custom Color']];
const mkCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// ---------- manual Erase / Restore brush ----------
function BrushEditor({ original, cutout, onDone, onClose }) {
  const ref = useRef(null);
  const maskRef = useRef(null);
  const [mode, setMode] = useState('erase');
  const [size, setSize] = useState(40);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const W = original.width, H = original.height;
  useEffect(() => {
    const m = mkCanvas(W, H), mc = m.getContext('2d');
    if (cutout) mc.drawImage(cutout, 0, 0, W, H); else { mc.fillStyle = '#000'; mc.fillRect(0, 0, W, H); }
    maskRef.current = m;
    paint();
  }, []); // eslint-disable-line
  function composite() {
    const out = mkCanvas(W, H), o = out.getContext('2d');
    o.drawImage(maskRef.current, 0, 0);
    o.globalCompositeOperation = 'source-in';
    o.drawImage(original, 0, 0);
    return out;
  }
  function paint() {
    const c = ref.current, x = c.getContext('2d');
    c.width = W; c.height = H;
    x.globalAlpha = 0.18; x.drawImage(original, 0, 0); x.globalAlpha = 1;
    x.drawImage(composite(), 0, 0);
  }
  const drawing = useRef(false);
  const at = e => { const r = ref.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, W / r.width]; };
  const stroke = e => {
    if (!drawing.current) return;
    const [x, y, k] = at(e), m = maskRef.current.getContext('2d');
    m.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
    m.fillStyle = '#000';
    m.beginPath(); m.arc(x, y, (size * k) / 2, 0, Math.PI * 2); m.fill();
    paint();
  };
  const finish = async () => {
    setSaving(true);
    try {
      const blob = await new Promise(r => composite().toBlob(r, 'image/png'));
      const { data } = await api.post('/cards/upload', toForm({ file: new File([blob], 'cutout.png', { type: 'image/png' }) }));
      onDone(data.url);
    } catch (e) { toast.err(e); } finally { setSaving(false); }
  };
  return (
    <>
      <div className="card-h"><h3>ম্যানুয়াল কাটআউট ঠিক করা</h3><span className="spacer" /><button className="btn ghost sm" onClick={onClose}>বন্ধ</button></div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={mode === 'erase' ? 'on' : ''} onClick={() => setMode('erase')}>Erase (মুছুন)</button>
          <button className={mode === 'restore' ? 'on' : ''} onClick={() => setMode('restore')}>Restore (ফেরত আনুন)</button>
        </div>
        <div style={{ width: 220 }}><Range label="ব্রাশ" value={size} min={5} max={150} onChange={setSize} /></div>
        <span className="spacer" />
        <Btn className="green" busy={saving} onClick={finish}>প্রয়োগ করুন</Btn>
      </div>
      <div className="preview-box"><canvas ref={ref} style={{ width: '100%', height: 'auto', touchAction: 'none', cursor: 'crosshair', aspectRatio: 'auto' }}
        onPointerDown={e => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); stroke(e); }}
        onPointerMove={stroke} onPointerUp={() => { drawing.current = false; }} /></div>
      <p className="small muted">হালকা অংশ = মুছে ফেলা ব্যাকগ্রাউন্ড। ভুল করে মুছে গেলে Restore দিয়ে ফেরত আনুন।</p>
    </>
  );
}

export default function OpeningCard() {
  const toast = useToast();
  const [s, setS] = useState({ ...OPENING_DEFAULTS, text: 'শুভ উদ্বোধন\nডিএন বাংলা পরিবারের পক্ষ থেকে আন্তরিক অভিনন্দন' });
  const [history, setHistory] = useState([]);
  const set = p => setS(x => { setHistory(h => [...h.slice(-40), x]); return { ...x, ...p }; });
  const undo = () => setHistory(h => { if (!h.length) return h; setS(h[h.length - 1]); return h.slice(0, -1); });
  const [orig, setOrig] = useState(null); // { file, url }
  const [cut, setCut] = useState('');     // transparent PNG url
  const [bgState, setBgState] = useState({ status: 'idle', error: '', provider: '' });
  const [brush, setBrush] = useState(null);
  const [adChoice, setAdChoice] = useState('auto');
  const [tplId, setTplId] = useState(null);
  const [busy, run] = useAction();

  const { ad } = useAdImage('opening', adChoice);
  const { images, loading } = useCardImages({ image: cut || orig?.url || '', logo: s.logoMode === 'image' ? s.logoUrl : '', ad: s.adOn ? ad?.image : '' });
  const bbox = useMemo(() => (images.image ? alphaBBox(images.image, mkCanvas) : null), [images.image]);
  const canvasRef = useCardCanvas(ctx => drawOpeningCard(ctx, s, { ...images, bbox }), [s, images, bbox]);

  const removeBg = async file => {
    setBgState({ status: 'working', error: '', provider: '' });
    try {
      const { data } = await api.post('/cards/remove-bg', toForm({ file }), { timeout: 120000 });
      setCut(data.url);
      setBgState({ status: 'done', error: '', provider: data.provider });
      toast.ok('ব্যাকগ্রাউন্ড সরানো হয়েছে');
    } catch (e) {
      setBgState({ status: 'failed', error: errMsg(e), provider: '' });
    }
  };
  const onFile = async f => {
    if (!f) return;
    if (!/image\/(jpeg|png|webp)/.test(f.type)) return toast.err('JPG, JPEG, PNG বা WebP ছবি দিন');
    try {
      const { data } = await api.post('/cards/upload', toForm({ file: f }));
      setOrig({ file: f, url: data.url });
      setCut('');
      removeBg(f); // starts automatically after upload
    } catch (e) { toast.err(e); }
  };
  const openBrush = async () => {
    try {
      const o = await loadCanvasImage(orig.url);
      const c = cut ? await loadCanvasImage(cut) : null;
      setBrush({ o, c });
    } catch (e) { toast.err(e); }
  };

  // drag the cut-out on the preview (mouse or touch)
  const drag = useRef(null);
  const onPointer = {
    onPointerDown: e => {
      if (!images.image) return;
      const r = e.currentTarget.getBoundingClientRect(), k = 1920 / r.width;
      const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
      const ir = openingImageRect(s, images.image, bbox);
      if (x < ir.x || x > ir.x + ir.w || y < ir.y || y > ir.y + ir.h) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, ox: s.offsetX, oy: s.offsetY, k, start: s };
    },
    onPointerMove: e => {
      const d = drag.current;
      if (!d) return;
      setS(x => ({ ...x, vAlign: x.vAlign, offsetX: Math.round(d.ox + (e.clientX - d.x) * d.k), offsetY: Math.round(d.oy + (e.clientY - d.y) * d.k) }));
    },
    onPointerUp: () => { if (drag.current) setHistory(h => [...h.slice(-40), drag.current.start]); drag.current = null; },
  };

  const save = publish => run(publish ? 'pub' : 'save', async () => {
    try {
      const { data } = await api.post('/cards', { kind: 'opening', settings: s, image: cut || orig?.url, adId: adChoice, title: s.text.split('\n')[0], templateId: tplId, publish });
      toast.ok(`কার্ড #${data.card.id} সংরক্ষিত${publish ? ` — ${data.queued}টি প্ল্যাটফর্মে সারিতে` : ''}`);
    } catch (e) { toast.err(e); }
  });

  return (
    <>
      <PageHead title="অপেনিং ফটোকার্ড" desc="ছবি আপলোড করলেই AI ব্যাকগ্রাউন্ড সরায়। কাটআউট এক পাশে আর লেখা উল্টো পাশে বসে। প্রিভিউতে ছবি টেনে সরানো যায়।">
        <button className="btn ghost" disabled={!history.length} onClick={undo}>↶ পূর্বাবস্থা</button>
        <button className="btn ghost" onClick={() => { set({ ...pick(OPENING_DEFAULTS), offsetX: 0, offsetY: 0, scale: 1, rotation: 0 }); }}>ডিফল্ট ডিজাইন</button>
      </PageHead>
      <div className="split">
        <div className="sticky">
          <Preview canvasRef={canvasRef} loading={loading} onPointer={onPointer} note={images.image ? 'ছবি টেনে সরান' : ''} />
          <SaveBar busy={busy} onDownload={() => run('dl', () => downloadCanvas(canvasRef.current, 'DN-Bangla-Opening-Photocard-1920x1920.jpg').catch(e => toast.err(e.message)))} onSave={() => save(false)} onPublish={() => save(true)} />
        </div>
        <div>
          <TemplateBar kind="opening" settings={s} pick={pick} onLoad={(t, row) => { setTplId(row.id); setS(x => ({ ...OPENING_DEFAULTS, ...t, text: x.text })); }} />
          <Sec title="ছবি ও ব্যাকগ্রাউন্ড রিমুভ" open>
            <Field label="ছবি আপলোড (JPG / JPEG / PNG / WebP)"><input type="file" accept="image/jpeg,image/png,image/webp" capture={undefined} onChange={e => onFile(e.target.files[0])} /></Field>
            {bgState.status === 'working' && <div className="notice info" style={{ marginTop: 10 }}><Spin /> AI ব্যাকগ্রাউন্ড সরাচ্ছে…</div>}
            {bgState.status === 'done' && <div className="notice ok" style={{ marginTop: 10 }}>স্বচ্ছ কাটআউট তৈরি ({bgState.provider})। কিনারা ঠিক করতে ম্যানুয়াল ব্রাশ ব্যবহার করুন।</div>}
            {bgState.status === 'failed' && <div className="notice err" style={{ marginTop: 10 }}><div>ব্যাকগ্রাউন্ড রিমুভ ব্যর্থ: {bgState.error}</div></div>}
            {orig && (
              <div className="row" style={{ marginTop: 10 }}>
                <Btn className="blue sm" busy={bgState.status === 'working'} onClick={() => removeBg(orig.file)}>{cut ? 'আবার Background Remove' : 'Background Remove'}</Btn>
                <button className="btn ghost sm" onClick={openBrush}>ম্যানুয়াল Erase / Restore</button>
                {cut && <a className="btn ghost sm" href={cut} target="_blank" rel="noreferrer">স্বচ্ছ PNG দেখুন</a>}
                {cut && <button className="btn ghost sm" onClick={() => setCut('')}>মূল ছবি ব্যবহার</button>}
              </div>
            )}
            <p className="small muted">স্বচ্ছতা (Alpha) শুধু PNG/WebP-তে থাকে; JPG-তে স্বচ্ছতা থাকে না, তাই কাটআউট PNG হিসেবে রাখা হয়। চূড়ান্ত কার্ড JPG — সেখানে কাটআউটের স্বচ্ছ অংশে গ্রেডিয়েন্ট দেখা যায়।</p>
          </Sec>
          <Sec title="ছবির অবস্থান ও মাপ" open>
            <div className="form">
              <Field label="ছবি কোন পাশে"><select value={s.imageSide} onChange={e => set({ imageSide: e.target.value, offsetX: 0 })}><option value="right">ডানে (লেখা বামে)</option><option value="left">বামে (লেখা ডানে)</option></select></Field>
              <Field label="উল্লম্ব অবস্থান"><select value={s.vAlign} onChange={e => set({ vAlign: e.target.value, offsetY: 0 })}><option value="top">উপরে</option><option value="center">মাঝখানে</option><option value="bottom">নিচে</option></select></Field>
              <Range label="সাইজ" value={Math.round(s.scale * 100)} min={30} max={200} unit="%" onChange={v => set({ scale: v / 100 })} />
              <Range label="X সরানো" value={s.offsetX} min={-900} max={900} onChange={v => set({ offsetX: v })} />
              <Range label="Y সরানো" value={s.offsetY} min={-900} max={900} onChange={v => set({ offsetY: v })} />
              <Range label="ঘোরানো" value={s.rotation} min={-45} max={45} unit="°" onChange={v => set({ rotation: v })} />
            </div>
            <div className="row" style={{ marginTop: 10, gap: 18 }}>
              <Toggle checked={s.clipToArea} onChange={v => set({ clipToArea: v })} label="কনটেন্ট এলাকার মধ্যে সীমাবদ্ধ" />
              <Toggle checked={s.textWrap} onChange={v => set({ textWrap: v })} label="Text wrap (ছবি সরলে লেখা জায়গা ছাড়বে)" />
              <button className="btn ghost sm" onClick={() => set({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0, vAlign: 'center' })}>অবস্থান রিসেট</button>
            </div>
          </Sec>
          <Sec title="মূল লেখা" open>
            <div className="form">
              <Field label="শিরোনাম / শুভেচ্ছা / বার্তা" className="full"><textarea value={s.text} onChange={e => set({ text: e.target.value })} /></Field>
              <Range label="ফন্ট সাইজ" value={s.textSize} min={40} max={120} onChange={v => set({ textSize: v })} />
              <Field label="অ্যালাইনমেন্ট"><select value={s.textAlign} onChange={e => set({ textAlign: e.target.value })}><option value="center">মাঝখানে</option><option value="left">বামে</option><option value="right">ডানে</option></select></Field>
              <ColorField label="লেখার রং" value={s.textColor} onChange={v => set({ textColor: v })} />
            </div>
          </Sec>
          <Sec title="ব্যাকগ্রাউন্ড গ্রেডিয়েন্ট">
            <div className="form">
              <Field label="স্টাইল"><select value={s.gradient} onChange={e => set({ gradient: e.target.value })}>{STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              {s.gradient === 'custom' ? <>
                <ColorField label="প্রথম রং" value={s.customA} onChange={v => set({ customA: v })} />
                <ColorField label="দ্বিতীয় রং" value={s.customB} onChange={v => set({ customB: v })} />
              </> : <p className="small muted">{GRADIENTS[s.gradient]?.join(' → ')}</p>}
            </div>
          </Sec>
          <BrandSection s={s} set={set} />
          <FooterSection s={s} set={set} />
          <AdSection kind="opening" s={s} set={set} adChoice={adChoice} setAdChoice={setAdChoice} />
        </div>
      </div>
      <Modal open={!!brush} onClose={() => setBrush(null)} size="lg">
        {brush && <BrushEditor original={brush.o} cutout={brush.c} onClose={() => setBrush(null)} onDone={url => { setCut(url); setBrush(null); toast.ok('কাটআউট আপডেট হয়েছে'); }} />}
      </Modal>
    </>
  );
}
