import { useState } from 'react';
import api, { API_URL } from '../api.js';
import { useList, useFlash } from '../components/ui.jsx';

const EMPTY = { name: '', url: '', auto_post: 1, template_id: '', active: 1 };

export default function Websites() {
  const { rows, load } = useList('/websites');
  const { rows: templates } = useList('/templates?type=news');
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(null);
  const flash = useFlash();

  const save = async e => {
    e.preventDefault();
    try {
      f.id ? await api.put(`/websites/${f.id}`, f) : await api.post('/websites', f);
      setF(EMPTY);
      flash.ok('Saved');
      load();
    } catch (e) { flash.err(e); }
  };
  const check = async id => {
    setBusy(id);
    try {
      const { data } = await api.post(`/websites/${id}/check`);
      flash.ok(`Checked — ${data.published} new post(s) published`);
      load();
    } catch (e) { flash.err(e); } finally { setBusy(null); }
  };
  const del = async id => { if (confirm('Delete?')) { await api.delete(`/websites/${id}`); load(); } };

  return (
    <>
      <h2>Website add (WordPress)</h2>
      <p className="sub">ওয়ার্ডপ্রেস ওয়েবসাইটে যেকোন নতুন পোস্ট হলেই সাথে সাথে নির্দিষ্ট ফটোকার্ডে ছবি সহ সংযুক্ত সকল সোশ্যাল মিডিয়াতে নিউজ প্রকাশ হবে</p>
      {flash.node}
      <form className="card form" onSubmit={save}>
        <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></label>
        <label>WordPress URL<input value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://example.com" required /></label>
        <label>News template
          <select value={f.template_id || ''} onChange={e => setF({ ...f, template_id: e.target.value })}>
            <option value="">Default</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={!!f.auto_post} onChange={e => setF({ ...f, auto_post: e.target.checked ? 1 : 0 })} />Auto post (every 2 min)</label>
        <div className="row full">
          <span className="spacer" />
          {f.id && <button type="button" className="ghost" onClick={() => setF(EMPTY)}>Cancel</button>}
          <button>{f.id ? 'Update' : '+ Add website'}</button>
        </div>
      </form>
      {rows.map(s => (
        <div className="card" key={s.id}>
          <div className="row">
            <b>{s.name}</b> <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
            <span className={`badge ${s.auto_post ? 'published' : 'draft'}`}>{s.auto_post ? 'auto' : 'off'}</span>
            <span className="spacer" />
            <button className="sm ghost" disabled={busy === s.id} onClick={() => check(s.id)}>Check now</button>
            <button className="sm ghost" onClick={() => setF(s)}>Edit</button>
            <button className="sm danger" onClick={() => del(s.id)}>✕</button>
          </div>
          <p style={{ fontSize: 13, color: '#555', marginBottom: 0 }}>
            Last post ID: <b>{s.last_post_id}</b> · Instant webhook (optional, for publish-without-delay):<br />
            <code>POST {API_URL}/api/webhook/wordpress/{s.webhook_secret}</code>
          </p>
        </div>
      ))}
    </>
  );
}
