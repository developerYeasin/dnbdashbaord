import { useState } from 'react';
import api, { toForm, img } from '../api.js';
import { useApi, Btn, Field, Toggle, LoadState, Modal, ImageModal, useToast, useAction, confirmAsk, PageHead, bn } from '../components/ui.jsx';

const EMPTY = { name: '', organization: '', description: '', contact: '', link: '', image_url: '', start_date: '', end_date: '', active: true };
const KIND_LABEL = { main: 'প্রধান কার্ড', text: 'টেক্সট কার্ড', opening: 'অপেনিং কার্ড' };

export default function Ads() {
  const toast = useToast();
  const { data, error, loading, load } = useApi('/ads');
  const [edit, setEdit] = useState(null); // {id?, ...fields, file}
  const [zoom, setZoom] = useState(null);
  const [busy, run] = useAction();
  const ads = data?.ads || [];
  const active = new Set(data?.activeIds || []);

  const save = () => run('save', async () => {
    const { id, file, ...f } = edit;
    if (!f.name?.trim()) return toast.err('বিজ্ঞাপনের নাম দিন');
    if (!id && !file && !f.image_url) return toast.err('ব্যানার আপলোড করুন বা ছবির URL দিন');
    try {
      const fd = toForm({ ...f, active: f.active ? 1 : 0, ...(file ? { file } : {}) });
      if (id) await api.put(`/ads/${id}`, fd); else await api.post('/ads', fd);
      toast.ok('বিজ্ঞাপন সংরক্ষিত'); setEdit(null); load();
    } catch (e) { toast.err(e); }
  });
  const toggle = a => run('t' + a.id, async () => { try { await api.put(`/ads/${a.id}`, toForm({ active: a.active ? 0 : 1 })); load(); } catch (e) { toast.err(e); } });
  const del = a => run('d' + a.id, async () => { if (!confirmAsk(`“${a.name}” মুছে ফেলবেন?`)) return; try { await api.delete(`/ads/${a.id}`); toast.ok('মুছে ফেলা হয়েছে'); load(); } catch (e) { toast.err(e); } });
  const move = (i, d) => run('m', async () => {
    const ids = ads.map(a => a.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.post('/ads/reorder', { ids }); load(); } catch (e) { toast.err(e); }
  });
  const setNext = (kind, adId) => run('c', async () => { try { await api.post('/ads/cycle', { kind, adId }); toast.ok(`${KIND_LABEL[kind]}-এ পরবর্তী বিজ্ঞাপন নির্ধারিত`); load(); } catch (e) { toast.err(e); } });
  const skip = kind => run('c', async () => { try { await api.post('/ads/cycle', { kind, step: 1 }); load(); } catch (e) { toast.err(e); } });
  const def = a => run('df', async () => { try { await api.post(`/ads/${a.id}/default`); load(); } catch (e) { toast.err(e); } });

  return (
    <>
      <PageHead title="বিজ্ঞাপন ম্যানেজার" desc="ফটোকার্ডের নিচে ১৯২০×২৮০ ব্যানার। প্রতিটি নতুন কার্ডে তালিকার পরের সক্রিয় বিজ্ঞাপন বসে (১→২→…→শেষ→১), প্রতিটি কার্ডের ধরনে আলাদাভাবে।">
        <button className="btn" onClick={() => setEdit({ ...EMPTY })}>+ নতুন বিজ্ঞাপন</button>
      </PageHead>
      <div className="card">
        <div className="card-h"><h3>বিজ্ঞাপন সাইকেল — পরবর্তী ব্যানার</h3></div>
        <div className="grid cols-3">
          {Object.entries(KIND_LABEL).map(([k, l]) => {
            const n = ads.find(a => a.id === data?.next?.[k]);
            return (
              <div key={k} className="stat" style={{ '--c': 'var(--amber)' }}>
                <span>{l}</span>
                <b style={{ fontSize: 18 }}>{n ? n.name : 'সক্রিয় বিজ্ঞাপন নেই'}</b>
                <div className="row" style={{ marginTop: 8 }}>
                  <select value={n?.id || ''} onChange={e => setNext(k, e.target.value)} style={{ flex: 1 }}>
                    {ads.filter(a => active.has(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button className="btn ghost sm" onClick={() => skip(k)} disabled={!n}>পরেরটি ›</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card">
        <LoadState loading={loading && !data} error={error} onRetry={load} empty={data && !ads.length ? 'কোনো বিজ্ঞাপন নেই' : null}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ক্রম</th><th>ব্যানার</th><th>নাম / প্রতিষ্ঠান</th><th>মেয়াদ</th><th>প্রদর্শন</th><th>অবস্থা</th><th></th></tr></thead>
              <tbody>
                {ads.map((a, i) => (
                  <tr key={a.id}>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="btn ghost sm icon" onClick={() => move(i, -1)} disabled={!i} aria-label="উপরে">↑</button><button className="btn ghost sm icon" onClick={() => move(i, 1)} disabled={i === ads.length - 1} aria-label="নিচে">↓</button>{bn(i + 1)}</div></td>
                    <td><img className="thumb wide" style={{ width: 220, height: 32, cursor: 'zoom-in' }} src={img(a.image)} alt="" onClick={() => setZoom(a.image)} /></td>
                    <td><b>{a.name}</b>{a.is_default ? <span className="badge info" style={{ marginLeft: 6 }}>ডিফল্ট</span> : null}<div className="small muted">{a.organization}{a.contact ? ` · ${a.contact}` : ''}</div></td>
                    <td className="small">{a.start_date || a.end_date ? `${a.start_date || '…'} → ${a.end_date || '…'}` : 'সীমাহীন'}</td>
                    <td>{bn(a.shown_count)}</td>
                    <td><Toggle checked={!!a.active} onChange={() => toggle(a)} label={a.active ? (active.has(a.id) ? 'সক্রিয়' : 'মেয়াদের বাইরে') : 'নিষ্ক্রিয়'} /></td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn ghost sm" onClick={() => setEdit({ ...EMPTY, ...a, start_date: a.start_date || '', end_date: a.end_date || '', image_url: '', active: !!a.active })}>সম্পাদনা</button>
                      <button className="btn ghost sm" onClick={() => def(a)} disabled={!!a.is_default}>ডিফল্ট</button>
                      <Btn className="danger sm" busy={busy === 'd' + a.id} onClick={() => del(a)}>মুছুন</Btn>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LoadState>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)}>
        {edit && (
          <>
            <div className="card-h"><h3>{edit.id ? 'বিজ্ঞাপন সম্পাদনা' : 'নতুন বিজ্ঞাপন'}</h3></div>
            <div className="form">
              <Field label="বিজ্ঞাপনের নাম *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="প্রতিষ্ঠান"><input value={edit.organization || ''} onChange={e => setEdit({ ...edit, organization: e.target.value })} /></Field>
              <Field label="যোগাযোগ"><input value={edit.contact || ''} onChange={e => setEdit({ ...edit, contact: e.target.value })} /></Field>
              <Field label="লিংক"><input value={edit.link || ''} onChange={e => setEdit({ ...edit, link: e.target.value })} /></Field>
              <Field label="বিবরণ" className="full"><textarea style={{ minHeight: 70 }} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field>
              <Field label="ব্যানার আপলোড (১৯২০×২৮০ প্রস্তাবিত)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setEdit({ ...edit, file: e.target.files[0] })} /></Field>
              <Field label="অথবা ছবির URL"><input value={edit.image_url} placeholder="https://…" onChange={e => setEdit({ ...edit, image_url: e.target.value })} /></Field>
              <Field label="শুরুর তারিখ"><input type="date" value={edit.start_date} onChange={e => setEdit({ ...edit, start_date: e.target.value })} /></Field>
              <Field label="শেষ তারিখ"><input type="date" value={edit.end_date} onChange={e => setEdit({ ...edit, end_date: e.target.value })} /></Field>
              <Toggle checked={edit.active} onChange={v => setEdit({ ...edit, active: v })} label="সক্রিয়" />
            </div>
            {(edit.file || edit.image_url || edit.image) && <img src={edit.file ? URL.createObjectURL(edit.file) : img(edit.image_url || edit.image)} alt="" style={{ width: '100%', aspectRatio: '1920/280', objectFit: 'cover', borderRadius: 8, marginTop: 12 }} />}
            <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>বাতিল</button>
              <Btn busy={busy === 'save'} onClick={save}>সংরক্ষণ</Btn>
            </div>
          </>
        )}
      </Modal>
      <ImageModal src={zoom} onClose={() => setZoom(null)} />
    </>
  );
}
