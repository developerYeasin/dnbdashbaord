import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { toForm } from '../api.js';
import { useList, useFlash } from '../components/ui.jsx';

const INFO = {
  news: ['News photocard template', 'নির্দিষ্ট সাইজের ও কালারের একাধিক ফটোকার্ড — ওয়েবসাইটের পোস্টের ছবি ও হেডলাইন দিয়ে নিউজ প্রকাশিত হবে। নিচে বিজ্ঞাপনের ব্যানার চক্রাকারে যুক্ত হবে।'],
  trigger: ['Trigger photocard template', 'কমিউনিটি বা টেলিগ্রাম চ্যাট থেকে শুধু লেখা দিয়ে ছবি ছাড়া ফটোকার্ড। নিচে বিজ্ঞাপনের ব্যানার চক্রাকারে যুক্ত হবে।'],
  schedule: ['Schedule photocard template', 'প্রতিদিনের সিডিউল পোস্টের (আবহাওয়া, নামাজ, টপটেন) ফটোকার্ড।'],
  idcard: ['ID card template', 'আইডি কার্ডের কাস্টম ডিজাইন।'],
};

export default function Templates() {
  const { type } = useParams();
  const { rows, load } = useList(`/templates?type=${type}`);
  const { rows: groups } = useList('/ads/groups');
  const empty = { type, name: '', width: 1080, height: 1080, bg_color: '#0b2545', text_color: '#ffffff', accent_color: '#e63946', ad_group_id: '', bg_image: null, overlay_image: null };
  const [f, setF] = useState(empty);
  const [ver, setVer] = useState(Date.now());
  const flash = useFlash();
  const [previews, setPreviews] = useState({});

  const loadPreview = async id => {
    const r = await api.get(`/templates/${id}/preview`, { responseType: 'blob' });
    setPreviews(p => ({ ...p, [id]: URL.createObjectURL(r.data) }));
  };

  const save = async e => {
    e.preventDefault();
    try {
      const data = { ...f, type };
      delete data.config; delete data.created_at;
      ['bg_image', 'overlay_image'].forEach(k => { if (!(data[k] instanceof File)) delete data[k]; });
      const fd = toForm(data);
      const { data: t } = f.id ? await api.put(`/templates/${f.id}`, fd) : await api.post('/templates', fd);
      setF({ ...empty, type });
      flash.ok('Saved');
      await load();
      loadPreview(t.id);
      setVer(Date.now());
    } catch (e) { flash.err(e); }
  };
  const makeDefault = async id => { await api.post(`/templates/${id}/default`); load(); };
  const del = async id => { if (confirm('Delete template?')) { await api.delete(`/templates/${id}`); load(); } };
  const clearImg = async (t, k) => { await api.put(`/templates/${t.id}`, { [k]: '' }); load(); loadPreview(t.id); };

  return (
    <>
      <h2>{INFO[type]?.[0]}</h2>
      <p className="sub">{INFO[type]?.[1]}</p>
      <div className="tabs">
        {Object.keys(INFO).map(k => <Link key={k} to={`/templates/${k}`}><button className={k === type ? 'on' : ''}>{k}</button></Link>)}
      </div>
      {flash.node}
      <form className="card form" onSubmit={save} key={type}>
        <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></label>
        <label>Width (px)<input type="number" value={f.width} onChange={e => setF({ ...f, width: e.target.value })} /></label>
        <label>Height (px)<input type="number" value={f.height} onChange={e => setF({ ...f, height: e.target.value })} /></label>
        <label>Background<input type="color" value={f.bg_color} onChange={e => setF({ ...f, bg_color: e.target.value })} /></label>
        <label>Text color<input type="color" value={f.text_color} onChange={e => setF({ ...f, text_color: e.target.value })} /></label>
        <label>Accent color<input type="color" value={f.accent_color} onChange={e => setF({ ...f, accent_color: e.target.value })} /></label>
        <label>Background image (custom)<input type="file" accept="image/*" onChange={e => setF({ ...f, bg_image: e.target.files[0] })} /></label>
        <label>Overlay frame PNG (transparent)<input type="file" accept="image/png" onChange={e => setF({ ...f, overlay_image: e.target.files[0] })} /></label>
        {type !== 'idcard' && (
          <label>Ad banner group
            <select value={f.ad_group_id || ''} onChange={e => setF({ ...f, ad_group_id: e.target.value })}>
              <option value="">Default (from Settings)</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
        <div className="row">
          {f.id && <button type="button" className="ghost" onClick={() => setF({ ...empty, type })}>Cancel</button>}
          <button>{f.id ? 'Update' : '+ Add template'}</button>
        </div>
      </form>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {rows.map(t => (
          <div className="card" key={`${t.id}-${ver}`}>
            <div className="row">
              <b>{t.name}</b>{t.is_default ? <span className="badge published">default</span> : null}
              <span className="spacer" /><small>{t.width}×{t.height}</small>
            </div>
            <div style={{ margin: '10px 0' }}>
              {previews[t.id] ? <img className="preview" src={previews[t.id]} alt="" /> : <button className="sm ghost" onClick={() => loadPreview(t.id)}>Show preview</button>}
            </div>
            <div className="row">
              {!t.is_default && <button className="sm ghost" onClick={() => makeDefault(t.id)}>Set default</button>}
              <button className="sm ghost" onClick={() => setF({ ...t, ad_group_id: t.ad_group_id || '' })}>Edit</button>
              {t.bg_image && <button className="sm ghost" onClick={() => clearImg(t, 'bg_image')}>Remove bg</button>}
              {t.overlay_image && <button className="sm ghost" onClick={() => clearImg(t, 'overlay_image')}>Remove overlay</button>}
              <button className="sm danger" onClick={() => del(t.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
