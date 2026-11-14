import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { drawMainCard, MAIN_DEFAULTS } from '@shared/cards.js';
import api from '../api.js';
import { Field, Toggle, ColorField, Range, Btn, useToast, useAction, PageHead, fmtDate } from '../components/ui.jsx';
import { useCardImages, useCardCanvas, downloadCanvas, Preview, Sec, TemplateBar, BrandSection, FooterSection, AdSection, useAdImage, SaveBar, uploadFile } from '../components/cardkit.jsx';

const CONTENT_KEYS = ['headline', 'category', 'imageZoom', 'imageFocusX', 'imageFocusY'];
const pick = s => Object.fromEntries(Object.entries(s).filter(([k]) => !CONTENT_KEYS.includes(k)));

export default function MainCard() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [s, setS] = useState({ ...MAIN_DEFAULTS });
  const set = p => setS(x => ({ ...x, ...p }));
  const [post, setPost] = useState(null); // selected WordPress post
  const [image, setImage] = useState('');
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [adChoice, setAdChoice] = useState('auto');
  const [busy, run] = useAction();
  const [tplId, setTplId] = useState(null);

  const { ad } = useAdImage('main', adChoice);
  const { images, loading, errors } = useCardImages({ image, logo: s.logoMode === 'image' ? s.logoUrl : '', ad: s.adOn ? ad?.image : '' });
  const canvasRef = useCardCanvas(ctx => drawMainCard(ctx, s, images), [s, images]);

  const applyPost = p => {
    setPost(p);
    setImage(p.image || '');
    set({ headline: p.title, category: p.category || '', imageZoom: 1, imageFocusX: 0.5, imageFocusY: 0.5 });
  };
  const loadPosts = async () => {
    setLoadingPosts(true);
    try {
      const { data } = await api.get('/wp/posts', { params: { per_page: 20 } });
      setPosts(data.posts);
      return data.posts;
    } catch (e) { toast.err(e); return []; } finally { setLoadingPosts(false); }
  };
  useEffect(() => {
    (async () => {
      const wpId = params.get('wp');
      if (wpId) {
        try { applyPost((await api.get(`/wp/posts/${wpId}`)).data); } catch (e) { toast.err(e); }
        loadPosts();
      } else {
        const list = await loadPosts();
        if (list[0]) applyPost(list[0]); // default: newest dnbangla.com.bd post
      }
      if (params.get('headline')) set({ headline: params.get('headline') }); // sent from the text card
    })();
  }, []); // eslint-disable-line

  // drag on the photo area to re-crop (pan the focus point)
  const drag = useRef(null);
  const onPointer = {
    onPointerDown: e => {
      const r = e.currentTarget.getBoundingClientRect(), y = ((e.clientY - r.top) / r.height) * 1920;
      if (!images.image || y < 80 || y > 1165) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, fx: s.imageFocusX, fy: s.imageFocusY, w: r.width };
    },
    onPointerMove: e => {
      if (!drag.current) return;
      const d = drag.current, k = 1.5 / d.w / Math.max(1, s.imageZoom);
      set({ imageFocusX: Math.min(1, Math.max(0, d.fx - (e.clientX - d.x) * k)), imageFocusY: Math.min(1, Math.max(0, d.fy - (e.clientY - d.y) * k)) });
    },
    onPointerUp: () => { drag.current = null; },
  };

  const onUpload = async f => {
    if (!f) return;
    try { setImage(await uploadFile(f)); toast.ok('ছবি আপলোড হয়েছে'); } catch (e) { toast.err(e); }
  };
  const name = () => `DN-Bangla-Photocard-${post?.id || 'custom'}-1920x1920.jpg`;
  const save = publish => run(publish ? 'pub' : 'save', async () => {
    try {
      const { data } = await api.post('/cards', { kind: 'main', settings: s, image, adId: adChoice, wpId: post?.id, title: s.headline, link: post?.link, templateId: tplId, publish });
      toast.ok(publish ? `কার্ড #${data.card.id} সংরক্ষিত — ${data.queued}টি প্ল্যাটফর্মে প্রকাশের সারিতে` : `কার্ড #${data.card.id} সংরক্ষিত`);
      if (publish && !data.queued) toast.warn('কোনো সক্রিয় সোশ্যাল সংযোগ নেই — সেটিংস থেকে যোগ করুন');
    } catch (e) { toast.err(e); }
  });

  return (
    <>
      <PageHead title="ফটোকার্ড জেনারেটর" desc="dnbangla.com.bd-এর সংবাদ থেকে ১৯২০×১৯২০ পিক্সেলের ফটোকার্ড। ছবির ওপর টেনে ক্রপ ঠিক করুন।" />
      <div className="split">
        <div className="sticky">
          <Preview canvasRef={canvasRef} loading={loading} onPointer={onPointer} note={errors.image ? 'ফিচার ছবি লোড হয়নি — প্লেসহোল্ডার দেখানো হচ্ছে' : ''} />
          <SaveBar busy={busy} onDownload={() => run('dl', () => downloadCanvas(canvasRef.current, name()).catch(e => toast.err(e.message)))} onSave={() => save(false)} onPublish={() => save(true)} />
        </div>
        <div>
          <TemplateBar kind="main" settings={s} pick={pick} onLoad={(t, row) => { setTplId(row.id); setS(x => ({ ...MAIN_DEFAULTS, ...t, headline: x.headline, category: x.category, imageZoom: x.imageZoom, imageFocusX: x.imageFocusX, imageFocusY: x.imageFocusY })); }} />
          <Sec title="সংবাদ নির্বাচন" open>
            <div className="row" style={{ marginBottom: 10 }}>
              <select style={{ flex: 1 }} value={post?.id || ''} onChange={e => { const p = posts.find(x => String(x.id) === e.target.value); if (p) applyPost(p); }}>
                {!post && <option value="">— সংবাদ বেছে নিন —</option>}
                {post && !posts.find(p => p.id === post.id) && <option value={post.id}>{post.title}</option>}
                {posts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <Btn className="ghost sm" busy={loadingPosts} onClick={loadPosts}>রিফ্রেশ</Btn>
            </div>
            {post && <p className="small muted" style={{ margin: 0 }}>{post.category} · {fmtDate(post.date)} · <a href={post.link} target="_blank" rel="noreferrer">মূল লিংক</a></p>}
          </Sec>
          <Sec title="শিরোনাম" open>
            <div className="form">
              <Field label="শিরোনাম" className="full"><textarea value={s.headline || ''} onChange={e => set({ headline: e.target.value })} /></Field>
              <Range label="ফন্ট সাইজ" value={s.headlineSize} min={40} max={120} onChange={v => set({ headlineSize: v })} />
              <Range label="ডানে-বামে মার্জিন" value={s.headlineMargin} min={40} max={450} onChange={v => set({ headlineMargin: v })} />
              <ColorField label="ব্যাকগ্রাউন্ড" value={s.headlineBg} onChange={v => set({ headlineBg: v })} />
              <ColorField label="লেখার রং" value={s.headlineColor} onChange={v => set({ headlineColor: v })} />
            </div>
            <p className="small muted">লেখার সর্বোচ্চ প্রস্থ = ১৯২০ − ২×{s.headlineMargin} = {1920 - 2 * s.headlineMargin}px। লম্বা শিরোনাম নিজে থেকেই একাধিক লাইনে ভাঙে এবং প্রয়োজনে ফন্ট ছোট হয়।</p>
          </Sec>
          <Sec title="ফিচার ছবি ও ক্রপ">
            <div className="form">
              <Field label="নিজের ছবি আপলোড (প্রস্তাবিত ১৯২০×১০৮৫)" className="full"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onUpload(e.target.files[0])} /></Field>
              <Range label="জুম" value={s.imageZoom} min={1} max={3} step={0.05} unit="×" onChange={v => set({ imageZoom: v })} />
              <Range label="অনুভূমিক ফোকাস" value={Math.round(s.imageFocusX * 100)} min={0} max={100} unit="%" onChange={v => set({ imageFocusX: v / 100 })} />
              <Range label="উল্লম্ব ফোকাস" value={Math.round(s.imageFocusY * 100)} min={0} max={100} unit="%" onChange={v => set({ imageFocusY: v / 100 })} />
              <div className="row"><button className="btn ghost sm" onClick={() => set({ imageZoom: 1, imageFocusX: 0.5, imageFocusY: 0.5 })}>ক্রপ রিসেট</button>{post?.image && image !== post.image && <button className="btn ghost sm" onClick={() => setImage(post.image)}>মূল ছবি</button>}</div>
            </div>
            <p className="small muted">ক্যানভাসে ছবির এলাকা ১৯২০×১০৮৫ px (Y ৮০–১১৬৫)। আপলোডের প্রস্তাবিত মাপ ১৯২০×১০৮০; বাকি ৫ px cover-ক্রপে পূরণ হয়।</p>
          </Sec>
          <Sec title="ক্যাটাগরি ও কমেন্ট ব্যাজ">
            <div className="row" style={{ marginBottom: 10, gap: 18 }}>
              <Toggle checked={s.categoryOn} onChange={v => set({ categoryOn: v })} label="ক্যাটাগরি ব্যাজ" />
              <Toggle checked={s.commentOn} onChange={v => set({ commentOn: v })} label="“বিস্তারিত কমেন্টে” ব্যাজ" />
            </div>
            <div className="form">
              <Field label="ক্যাটাগরি (সংবাদের প্রথম ক্যাটাগরি অটো)"><input value={s.category || ''} onChange={e => set({ category: e.target.value })} /></Field>
              <ColorField label="ক্যাটাগরি ব্যাকগ্রাউন্ড" value={s.categoryBg} onChange={v => set({ categoryBg: v })} />
              <Field label="কমেন্ট ব্যাজের লেখা"><input value={s.commentText} onChange={e => set({ commentText: e.target.value })} /></Field>
              <ColorField label="কমেন্ট ব্যাজের রং" value={s.commentBg} onChange={v => set({ commentBg: v })} />
            </div>
          </Sec>
          <BrandSection s={s} set={set} />
          <FooterSection s={s} set={set} />
          <AdSection kind="main" s={s} set={set} adChoice={adChoice} setAdChoice={setAdChoice} />
          <p className="small muted">“সংরক্ষণ” করলে সার্ভার একই ডিজাইনে কার্ডটি তৈরি করে রেকর্ড রাখে। অটো সাইকেল বেছে নিলে প্রতিটি নতুন কার্ডে পরের বিজ্ঞাপন বসে।</p>
        </div>
      </div>
    </>
  );
}
