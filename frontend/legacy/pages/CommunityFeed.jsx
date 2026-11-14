import { useEffect, useState } from 'react';
import api, { img } from '../api.js';
import { useList, useFlash, Status, PostResults, ImageModal, fmt } from '../components/ui.jsx';

export default function CommunityFeed() {
  const { rows: templates } = useList('/templates?type=trigger');
  const [f, setF] = useState({ text: '', heading: '', template_id: '' });
  const [news, setNews] = useState({ title: '', link: '', image: null, template_id: '' });
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [list, setList] = useState([]);
  const [view, setView] = useState(null);
  const flash = useFlash();
  const { rows: newsTemplates } = useList('/templates?type=news');

  const load = () => api.get('/posts', { params: { source: 'community' } }).then(r => setList(r.data.rows));
  useEffect(() => { load(); }, []);

  const send = async publish => {
    setBusy(true);
    try {
      const { data } = await api.post('/posts/community', { ...f, publish });
      setLast(data);
      flash.ok(publish ? `Posted — ${data.status}` : 'Preview ready (draft)');
      if (publish) setF({ ...f, text: '' });
      load();
    } catch (e) { flash.err(e); } finally { setBusy(false); }
  };

  const sendNews = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(news).forEach(([k, v]) => v && fd.append(k, v));
      const { data } = await api.post('/posts/news', fd);
      setLast(data);
      flash.ok(`News posted — ${data.status}`);
      setNews({ ...news, title: '', link: '', image: null });
    } catch (e) { flash.err(e); } finally { setBusy(false); }
  };

  return (
    <>
      <h2>Community Feed</h2>
      <p className="sub">ওয়েবসাইট ব্যতিত এখানে আপডেট কোন টেক্সট টিগার বা লেখা প্রদান করলে নির্দিষ্ট ফটোকার্ডে শুধু লেখা ফটোকার্ড সকল সোশ্যাল মিডিয়াতে প্রকাশ হবে</p>
      {flash.node}
      <div className="grid-2">
        <div>
          <div className="card">
            <b>টেক্সট টিগার পোস্ট</b>
            <div className="form" style={{ marginTop: 10 }}>
              <label className="full">লেখা / আপডেট<textarea value={f.text} onChange={e => setF({ ...f, text: e.target.value })} placeholder="এখানে সংবাদ বা আপডেট লিখুন..." /></label>
              <label>Heading (optional)<input value={f.heading} onChange={e => setF({ ...f, heading: e.target.value })} placeholder="ব্রেকিং নিউজ" /></label>
              <label>Template
                <select value={f.template_id} onChange={e => setF({ ...f, template_id: e.target.value })}>
                  <option value="">Default</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div className="row full">
                <button className="ghost" disabled={busy || !f.text} onClick={() => send(false)}>Preview</button>
                <button disabled={busy || !f.text} onClick={() => send(true)}>Publish to all social</button>
              </div>
            </div>
          </div>
          <form className="card form" onSubmit={sendNews}>
            <b className="full">ম্যানুয়াল নিউজ ফটোকার্ড (ছবি + হেডলাইন)</b>
            <label className="full">Headline<input value={news.title} onChange={e => setNews({ ...news, title: e.target.value })} required /></label>
            <label>Link<input value={news.link} onChange={e => setNews({ ...news, link: e.target.value })} /></label>
            <label>Image<input type="file" accept="image/*" onChange={e => setNews({ ...news, image: e.target.files[0] })} /></label>
            <label>Template
              <select value={news.template_id} onChange={e => setNews({ ...news, template_id: e.target.value })}>
                <option value="">Default</option>
                {newsTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button disabled={busy}>Publish news</button>
          </form>
        </div>
        <div className="card">
          <b>সর্বশেষ ফটোকার্ড</b>
          {last ? <><img className="preview" src={img(last.card_path)} alt="" /><PostResults results={last.results} /></> : <p className="sub">Preview এখানে দেখাবে</p>}
        </div>
      </div>
      <div className="card table-wrap">
        <b>কমিউনিটি পোস্টসমূহ</b>
        <table>
          <tbody>
            {list.map(p => (
              <tr key={p.id}>
                <td><img className="thumb" src={img(p.card_path)} onClick={() => setView(p.card_path)} alt="" /></td>
                <td>{p.title}</td><td><Status s={p.status} /></td><td><PostResults results={p.results} /></td><td>{fmt(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ImageModal src={view} onClose={() => setView(null)} />
    </>
  );
}
