import { useState } from 'react';
import api, { img, toForm } from '../api.js';
import { useList, useFlash, Status } from '../components/ui.jsx';

const KINDS = {
  good_morning: 'শুভ সকাল কার্ড', weather: 'আবহাওয়া (সকাল)', prayer: 'নামাজের সময়সূচি', health: 'স্বাস্থ্য বুলেটিন',
  history: 'ইতিহাসে আজকের দিন', birthday: 'জন্মদিনের শুভেচ্ছা', weather_noon: 'দুপুরের আবহাওয়া/তাপমাত্রা', top_news: 'রাতের টপটেন নিউজ',
};
const LIB_KINDS = ['good_morning', 'health', 'history', 'birthday', 'weather_alert'];
const SLOT = { morning: 'সকাল', noon: 'দুপুর', night: 'রাত' };

export default function Schedules() {
  const { rows, load } = useList('/schedules');
  const { rows: templates } = useList('/templates?type=schedule');
  const lib = useList('/schedules/content');
  const [s, setS] = useState({ slot: 'morning', kind: 'good_morning', title: '', run_time: '07:00', template_id: '' });
  const [c, setC] = useState({ kind: 'history', day_month: '', title: '', text: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const flash = useFlash();

  const addSchedule = async e => {
    e.preventDefault();
    await api.post('/schedules', s);
    load();
  };
  const upd = async (id, d) => { await api.put(`/schedules/${id}`, d); load(); };
  const run = async (id, publish) => {
    setBusy(id);
    try {
      const { data } = await api.post(`/schedules/${id}/run`, { publish });
      if (data.skipped) flash.err(data.reason);
      else { setPreview(data.card_path); flash.ok(publish ? `Posted — ${data.status}` : 'Preview generated'); }
    } catch (e) { flash.err(e); } finally { setBusy(null); }
  };
  const addContent = async e => {
    e.preventDefault();
    await api.post('/schedules/content', toForm(c));
    setC({ ...c, title: '', text: '' });
    lib.load();
  };

  return (
    <>
      <h2>Auto Schedule post every day</h2>
      <p className="sub">সকাল: শুভ সকাল, আবহাওয়া, নামাজের সময়সূচি, স্বাস্থ্য বুলেটিন, ইতিহাসে আজ, জন্মদিন · দুপুর: তাপমাত্রা ও আবহাওয়ার ঝুঁকি · রাত: টপটেন কার্ড</p>
      {flash.node}
      <div className="grid-2">
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Slot</th><th>Post</th><th>Time</th><th>Template</th><th>On</th><th>Last run</th><th /></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{SLOT[r.slot]}</td>
                  <td><b>{r.title}</b><br /><small>{KINDS[r.kind] || r.kind}</small></td>
                  <td><input type="time" style={{ width: 110 }} defaultValue={r.run_time} onBlur={e => e.target.value !== r.run_time && upd(r.id, { run_time: e.target.value })} /></td>
                  <td>
                    <select value={r.template_id || ''} onChange={e => upd(r.id, { template_id: e.target.value })}>
                      <option value="">Default</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" style={{ width: 'auto' }} checked={!!r.active} onChange={() => upd(r.id, { active: r.active ? 0 : 1 })} /></td>
                  <td>{r.last_run || '—'}</td>
                  <td className="row">
                    <button className="sm ghost" disabled={busy === r.id} onClick={() => run(r.id, false)}>Preview</button>
                    <button className="sm" disabled={busy === r.id} onClick={() => confirm('Post now to all social?') && run(r.id, true)}>Post now</button>
                    <button className="sm danger" onClick={async () => { if (confirm('Delete?')) { await api.delete(`/schedules/${r.id}`); load(); } }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="form" onSubmit={addSchedule} style={{ marginTop: 14 }}>
            <label>Slot<select value={s.slot} onChange={e => setS({ ...s, slot: e.target.value })}>{Object.entries(SLOT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Type<select value={s.kind} onChange={e => setS({ ...s, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Title<input value={s.title} onChange={e => setS({ ...s, title: e.target.value })} required /></label>
            <label>Time<input type="time" value={s.run_time} onChange={e => setS({ ...s, run_time: e.target.value })} /></label>
            <button>+ Add schedule</button>
          </form>
        </div>
        <div className="card">
          <b>Preview</b>
          {preview ? <img className="preview" src={img(preview)} alt="" /> : <p className="sub">Preview বাটনে ক্লিক করুন</p>}
        </div>
      </div>

      <div className="card">
        <b>কন্টেন্ট লাইব্রেরি</b>
        <p className="sub">স্বাস্থ্য টিপস, ইতিহাসে আজ, জন্মদিন (তারিখ MM-DD সহ), শুভ সকাল বার্তা, এবং দিনের সরকারি আবহাওয়া সতর্কবার্তা (weather_alert) এখানে যোগ করুন। তারিখ ফাঁকা রাখলে যেকোন দিন র‍্যান্ডমভাবে ব্যবহার হবে।</p>
        <form className="form" onSubmit={addContent}>
          <label>Kind<select value={c.kind} onChange={e => setC({ ...c, kind: e.target.value })}>{LIB_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
          <label>Date (MM-DD)<input value={c.day_month} onChange={e => setC({ ...c, day_month: e.target.value })} placeholder="10-19" pattern="\d{2}-\d{2}" /></label>
          <label>Title<input value={c.title} onChange={e => setC({ ...c, title: e.target.value })} placeholder="১৯৭১ / নাম" /></label>
          <label className="full">Text<textarea value={c.text} onChange={e => setC({ ...c, text: e.target.value })} required /></label>
          <button>+ Add content</button>
        </form>
        <div className="table-wrap">
          <table>
            <tbody>
              {lib.rows.map(x => (
                <tr key={x.id}>
                  <td><Status s={x.kind} /></td><td>{x.day_month || 'any'}</td><td>{x.title}</td><td>{x.text}</td>
                  <td><button className="sm danger" onClick={async () => { await api.delete(`/schedules/content/${x.id}`); lib.load(); }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
