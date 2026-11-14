import { useState } from 'react';
import api, { img, toForm } from '../api.js';
import { useList, useFlash } from '../components/ui.jsx';

export default function Ads() {
  const { rows: groups, load: loadGroups } = useList('/ads/groups');
  const { rows: banners, load: loadBanners } = useList('/ads/banners');
  const [gname, setGname] = useState('');
  const [b, setB] = useState({ group_id: '', title: '', sort_order: 0, image: null });
  const flash = useFlash();

  const addGroup = async e => {
    e.preventDefault();
    await api.post('/ads/groups', { name: gname });
    setGname('');
    loadGroups();
  };
  const addBanner = async e => {
    e.preventDefault();
    if (!b.image) return flash.err('Banner image required');
    try {
      await api.post('/ads/banners', toForm(b));
      setB({ ...b, title: '', image: null });
      e.target.reset();
      flash.ok('Banner added');
      loadBanners();
    } catch (e) { flash.err(e); }
  };
  const upd = async (path, id, data, reload) => { await api.put(`/ads/${path}/${id}`, data); reload(); };
  const del = async (path, id, reload) => { if (confirm('Delete?')) { await api.delete(`/ads/${path}/${id}`); reload(); } };

  return (
    <>
      <h2>Photocard ads add</h2>
      <p className="sub">নিউজ ও টিগার ফটোকার্ডের নিচে বিজ্ঞাপনের অংশে গ্রুপের প্রতিটি ব্যানার চক্রের মতো পরিবর্তন হবে — একটির পর একটি, আবার পুনরায় সেই চক্র অনন্ত সময় চলতে থাকবে।</p>
      {flash.node}
      <div className="grid-2">
        <form className="card form" onSubmit={addGroup}>
          <label className="full">New ad group<input value={gname} onChange={e => setGname(e.target.value)} placeholder="e.g. Sponsor group A" required /></label>
          <button>+ Add group</button>
        </form>
        <form className="card form" onSubmit={addBanner}>
          <label>Group
            <select value={b.group_id} onChange={e => setB({ ...b, group_id: e.target.value })} required>
              <option value="">Select</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label>Title<input value={b.title} onChange={e => setB({ ...b, title: e.target.value })} /></label>
          <label>Order<input type="number" value={b.sort_order} onChange={e => setB({ ...b, sort_order: e.target.value })} /></label>
          <label>Banner image (wide, e.g. 1080×200)<input type="file" accept="image/*" onChange={e => setB({ ...b, image: e.target.files[0] })} /></label>
          <button>+ Add banner</button>
        </form>
      </div>
      {groups.map(g => {
        const list = banners.filter(x => x.group_id === g.id);
        const active = list.filter(x => x.active);
        const next = active.length ? active[g.current_index % active.length] : null;
        return (
          <div className="card" key={g.id}>
            <div className="row">
              <b>{g.name}</b> <small>(group #{g.id})</small>
              <label className="check"><input type="checkbox" checked={!!g.active} onChange={() => upd('groups', g.id, { active: g.active ? 0 : 1 }, loadGroups)} />active</label>
              <span className="spacer" />
              <small>{active.length} active banner · next: <b>{next?.title || next?.id || '—'}</b></small>
              <button className="sm ghost" onClick={() => upd('groups', g.id, { current_index: 0 }, loadGroups)}>Reset cycle</button>
              <button className="sm danger" onClick={() => del('groups', g.id, loadGroups)}>✕</button>
            </div>
            <div className="table-wrap">
              <table>
                <tbody>
                  {list.map(x => (
                    <tr key={x.id} style={{ background: next?.id === x.id ? '#fef9c3' : '' }}>
                      <td style={{ width: 340 }}><img src={img(x.image)} alt="" style={{ width: 320, borderRadius: 6 }} /></td>
                      <td>{x.title}</td>
                      <td>order {x.sort_order}</td>
                      <td>shown {x.shown_count}×</td>
                      <td><label className="check"><input type="checkbox" checked={!!x.active} onChange={() => upd('banners', x.id, { active: x.active ? 0 : 1 }, loadBanners)} />active</label></td>
                      <td><button className="sm danger" onClick={() => del('banners', x.id, loadBanners)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
