import { useState } from 'react';
import api from '../api.js';
import { useList, useFlash } from '../components/ui.jsx';

const HELP = {
  facebook: { target: 'Facebook Page ID', token: 'Page Access Token (long-lived)' },
  instagram: { target: 'Instagram Business Account ID', token: 'Access Token (PUBLIC_URL must be reachable)' },
  telegram: { target: 'Chat ID / @channelusername', token: 'Bot Token (from @BotFather)' },
  webhook: { target: 'Webhook URL (Zapier / Make / n8n)', token: 'Bearer token (optional)' },
};
const EMPTY = { platform: 'facebook', name: '', target_id: '', access_token: '', active: 1, use_for_news: 1, use_for_trigger: 1, use_for_schedule: 1 };

export default function SocialAccounts() {
  const { rows, load } = useList('/social');
  const [f, setF] = useState(EMPTY);
  const flash = useFlash();
  const h = HELP[f.platform];

  const save = async e => {
    e.preventDefault();
    try {
      f.id ? await api.put(`/social/${f.id}`, f) : await api.post('/social', f);
      setF(EMPTY);
      flash.ok('Saved');
      load();
    } catch (e) { flash.err(e); }
  };
  const test = async id => {
    const { data } = await api.post(`/social/${id}/test`);
    data.ok ? flash.ok(data.message) : flash.err(data.message);
  };
  const toggle = async (a, k) => { await api.put(`/social/${a.id}`, { [k]: a[k] ? 0 : 1 }); load(); };
  const del = async id => { if (confirm('Delete?')) { await api.delete(`/social/${id}`); load(); } };
  const chk = k => <label className="check"><input type="checkbox" checked={!!f[k]} onChange={e => setF({ ...f, [k]: e.target.checked ? 1 : 0 })} />{k.replace('use_for_', '')}</label>;

  return (
    <>
      <h2>Social Media add</h2>
      <p className="sub">এখানে সকল সোশ্যাল মিডিয়া যুক্ত হবে অটো পোস্টের জন্য — নির্দিষ্ট ফটোকার্ডে নিউজ প্রকাশের জন্য</p>
      {flash.node}
      <form className="card form" onSubmit={save}>
        <label>Platform
          <select value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })}>
            {Object.keys(HELP).map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="DNB Facebook Page" required /></label>
        <label>{h.target}<input value={f.target_id} onChange={e => setF({ ...f, target_id: e.target.value })} required /></label>
        <label>{h.token}<input value={f.access_token || ''} onChange={e => setF({ ...f, access_token: e.target.value })} /></label>
        <div className="row full">
          <span style={{ color: '#666', fontSize: 13 }}>পোস্ট করবে:</span>
          {chk('use_for_news')}{chk('use_for_trigger')}{chk('use_for_schedule')}
          <span className="spacer" />
          {f.id && <button type="button" className="ghost" onClick={() => setF(EMPTY)}>Cancel</button>}
          <button>{f.id ? 'Update' : '+ Add account'}</button>
        </div>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Platform</th><th>Name</th><th>Target</th><th>News</th><th>Trigger</th><th>Schedule</th><th>Active</th><th /></tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td><b>{a.platform}</b></td><td>{a.name}</td><td><code>{a.target_id}</code></td>
                {['use_for_news', 'use_for_trigger', 'use_for_schedule', 'active'].map(k => (
                  <td key={k}><input type="checkbox" style={{ width: 'auto' }} checked={!!a[k]} onChange={() => toggle(a, k)} /></td>
                ))}
                <td className="row">
                  <button className="sm ghost" onClick={() => test(a.id)}>Test</button>
                  <button className="sm ghost" onClick={() => setF(a)}>Edit</button>
                  <button className="sm danger" onClick={() => del(a.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
