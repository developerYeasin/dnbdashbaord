import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { drawTextCard, TEXT_DEFAULTS, GRADIENTS } from '@shared/cards.js';
import api from '../api.js';
import { Field, Toggle, ColorField, Range, Btn, useToast, useAction, PageHead } from '../components/ui.jsx';
import { useCardImages, useCardCanvas, downloadCanvas, Preview, Sec, TemplateBar, BrandSection, FooterSection, AdSection, useAdImage, SaveBar, uploadFile } from '../components/cardkit.jsx';

const CONTENT_KEYS = ['text', 'category'];
const pick = s => Object.fromEntries(Object.entries(s).filter(([k]) => !CONTENT_KEYS.includes(k)));
const STYLES = [['red', 'DN Bangla Red Gradient'], ['slate', 'Deep Slate Night'], ['maroon', 'Maroon Classic Event'], ['dark', 'Dark Minimal'], ['custom', 'Custom Color']];
const PRESETS = ['বিশেষ ঘোষণা', 'ব্রেকিং নিউজ', 'জরুরি নোটিশ', 'শোক সংবাদ', 'শুভেচ্ছা'];

export default function TextCard() {
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [s, setS] = useState({ ...TEXT_DEFAULTS, text: params.get('text') || 'আপনার মূল বার্তা এখানে লিখুন' });
  const set = p => setS(x => ({ ...x, ...p }));
  const [bg, setBg] = useState('');
  const [adChoice, setAdChoice] = useState('auto');
  const [tplId, setTplId] = useState(null);
  const [busy, run] = useAction();
  useEffect(() => { if (params.get('category')) set({ category: params.get('category') }); }, []); // eslint-disable-line

  const { ad } = useAdImage('text', adChoice);
  const { images, loading } = useCardImages({ logo: s.logoMode === 'image' ? s.logoUrl : '', ad: s.adOn ? ad?.image : '', bg });
  const canvasRef = useCardCanvas(ctx => drawTextCard(ctx, s, images), [s, images]);
  const margin = s.textMargin;

  const save = publish => run(publish ? 'pub' : 'save', async () => {
    try {
      const { data } = await api.post('/cards', { kind: 'text', settings: s, bg, adId: adChoice, title: [s.category, s.text].filter(Boolean).join(' — '), templateId: tplId, publish });
      toast.ok(publish ? `কার্ড #${data.card.id} সংরক্ষিত — ${data.queued}টি প্ল্যাটফর্মে প্রকাশের সারিতে` : `কার্ড #${data.card.id} সংরক্ষিত`);
      if (publish && !data.queued) toast.warn('“টেক্সট কার্ড” গ্রহণ করে এমন কোনো সক্রিয় সোশ্যাল সংযোগ নেই');
    } catch (e) { toast.err(e); }
  });

  return (
    <>
      <PageHead title="টেক্সট ও ট্রিগার ফটোকার্ড" desc="ছবি ছাড়া শুধু লেখা দিয়ে ১৯২০×১৯২০ কার্ড — ঘোষণা, ব্রেকিং, নোটিশ। চাইলে সম্পর্কিত ছবি ঝাপসা ব্যাকগ্রাউন্ড হিসেবে দিন।" />
      <div className="split">
        <div className="sticky">
          <Preview canvasRef={canvasRef} loading={loading} />
          <SaveBar busy={busy} onDownload={() => run('dl', () => downloadCanvas(canvasRef.current, 'DN-Bangla-Text-Photocard-1920x1920.jpg').catch(e => toast.err(e.message)))} onSave={() => save(false)} onPublish={() => save(true)}
            extra={<button className="btn ghost" onClick={() => nav(`/photocard?headline=${encodeURIComponent(s.text)}`)}>প্রধান কার্ডের শিরোনামে পাঠান</button>} />
        </div>
        <div>
          <TemplateBar kind="text" settings={s} pick={pick} onLoad={(t, row) => { setTplId(row.id); setS(x => ({ ...TEXT_DEFAULTS, ...t, text: x.text, category: x.category })); }} />
          <Sec title="মূল বার্তা" open>
            <div className="form">
              <Field label="মূল বার্তা / ঘোষণা" className="full"><textarea value={s.text} onChange={e => set({ text: e.target.value })} /></Field>
              <Range label="ফন্ট সাইজ" value={s.textSize} min={40} max={120} onChange={v => set({ textSize: v })} />
              <Range label="ডানে-বামে মার্জিন" value={margin} min={80} max={450} onChange={v => set({ textMargin: v })} />
              <ColorField label="লেখার রং" value={s.textColor} onChange={v => set({ textColor: v })} />
              <Field label="অ্যালাইনমেন্ট"><select value={s.textAlign || 'center'} onChange={e => set({ textAlign: e.target.value })}><option value="center">মাঝখানে</option><option value="left">বামে</option><option value="right">ডানে</option></select></Field>
            </div>
            <p className="small muted">লেখার প্রস্থ = ১৯২০ − ২×{margin} = {1920 - 2 * margin}px। বড় লেখা কাটা পড়বে না: লাইন ভাঙবে ও ফন্ট ধাপে ধাপে ছোট হবে।</p>
          </Sec>
          <Sec title="ক্যাটাগরি / ঘোষণা ব্যাজ" open>
            <div className="row" style={{ marginBottom: 10 }}><Toggle checked={s.categoryOn} onChange={v => set({ categoryOn: v })} label="ব্যাজ দেখান" /></div>
            <div className="row" style={{ marginBottom: 10 }}>{PRESETS.map(p => <button key={p} className="btn ghost sm" onClick={() => set({ category: p, categoryOn: true })}>{p}</button>)}</div>
            <div className="form">
              <Field label="লেখা"><input value={s.category} onChange={e => set({ category: e.target.value })} /></Field>
              <ColorField label="লেখার রং" value={s.catColor} onChange={v => set({ catColor: v })} />
              <Field label="বক্সের রং (rgba সমর্থিত)"><input value={s.catBoxBg} onChange={e => set({ catBoxBg: e.target.value })} /></Field>
              <ColorField label="বর্ডার (ফাঁকা = নেই)" value={s.catBoxBorder} onChange={v => set({ catBoxBorder: v })} />
            </div>
          </Sec>
          <Sec title="ব্যাকগ্রাউন্ড">
            <div className="form">
              <Field label="স্টাইল"><select value={s.gradient} onChange={e => set({ gradient: e.target.value })}>{STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              {s.gradient === 'custom' ? (
                <>
                  <ColorField label="প্রথম রং" value={s.customA} onChange={v => set({ customA: v })} />
                  <ColorField label="দ্বিতীয় রং" value={s.customB} onChange={v => set({ customB: v })} />
                </>
              ) : <p className="small muted full">{GRADIENTS[s.gradient]?.join(' → ')}</p>}
              <Field label="ঝাপসা ছবি ব্যাকগ্রাউন্ড (ঐচ্ছিক)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { try { setBg(await uploadFile(e.target.files[0])); } catch (er) { toast.err(er); } }} /></Field>
              {bg && <>
                <Range label="ব্লার" value={s.bgBlur ?? 30} min={0} max={100} unit="%" onChange={v => set({ bgBlur: v })} />
                <button className="btn ghost sm" onClick={() => setBg('')}>ছবি সরান</button>
              </>}
            </div>
          </Sec>
          <BrandSection s={s} set={set} />
          <FooterSection s={s} set={set} />
          <AdSection kind="text" s={s} set={set} adChoice={adChoice} setAdChoice={setAdChoice} />
        </div>
      </div>
    </>
  );
}
