import { useState } from 'react';
import api, { img } from '../api.js';
import { useApi, Btn, Field, Toggle, Status, LoadState, Modal, ImageModal, useToast, useAction, confirmAsk, PageHead, fmtDate, bn } from '../components/ui.jsx';
import { uploadFile } from '../components/cardkit.jsx';

const KIND = {
  good_morning: 'শুভ সকাল / অনুপ্রেরণা', weather: 'আবহাওয়ার আপডেট (Open-Meteo)', prayer: 'নামাজের সময় (Aladhan)', health: 'স্বাস্থ্য বুলেটিন (কনটেন্ট লাইব্রেরি)',
  history: 'ইতিহাসে আজকের দিন (Wikimedia/লাইব্রেরি)', birthday: 'জন্মবার্ষিকী (কর্মী ও লাইব্রেরি)', temperature: 'তাপমাত্রা ও আর্দ্রতা', weather_alert: 'আবহাওয়া ঝুঁকি ও সতর্কতা',
  top10: 'আজকের সেরা ১০ সংবাদ (WordPress)', ramadan: 'রমজান: সেহরি ও ইফতার', custom: 'কাস্টম (নিজের লেখা / API লিংক)',
};
const slot = t => (t < '12:00' ? 'সকালের বুলেটিন' : t < '18:00' ? 'দুপুর ও বিকালের বুলেটিন' : 'রাতের বুলেটিন');
const nowDhaka = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });

function Editor({ b, templates, channels, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ ...b, channels: b.channels || [] });
  const [busy, run] = useAction();
  const set = p => setF(x => ({ ...x, ...p }));
  const save = () => run('s', async () => {
    try {
      const body = { ...f, template_id: f.template_id || '', active: !!f.active, auto_publish: !!f.auto_publish };
      if (f.id) await api.put(`/bulletins/${f.id}`, body); else await api.post('/bulletins', body);
      toast.ok('শিডিউল সংরক্ষিত'); onSaved();
    } catch (e) { toast.err(e); }
  });
  return (
    <>
      <div className="card-h"><h3>{f.id ? 'শিডিউল সম্পাদনা' : 'নতুন শিডিউল'}</h3></div>
      <div className="form">
        <Field label="শিডিউলের নাম"><input value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
        <Field label="সময় (Asia/Dhaka)"><input type="time" value={f.run_time} onChange={e => set({ run_time: e.target.value })} /></Field>
        <Field label="ধরন / তথ্যের উৎস"><select value={f.kind} onChange={e => set({ kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="টেমপ্লেট"><select value={f.template_id || ''} onChange={e => set({ template_id: e.target.value })}><option value="">ডিফল্ট টেক্সট টেমপ্লেট</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="কার্ডের ধরন"><select value={f.card_type} onChange={e => set({ card_type: e.target.value })}><option value="text">টেক্সট ফটোকার্ড (গ্রেডিয়েন্ট)</option><option value="image">ছবি ফটোকার্ড (৩০% ব্লার ছবির ওপর লেখা)</option></select></Field>
        {f.card_type === 'image' && <Field label={f.bg_image ? 'ব্যাকগ্রাউন্ড ছবি (বদলাতে নতুন দিন)' : 'ব্যাকগ্রাউন্ড ছবি'}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { try { set({ bg_image: await uploadFile(e.target.files[0]) }); } catch (er) { toast.err(er); } }} /></Field>}
        <Field label="বার্তা / অতিরিক্ত লেখা" className="full" hint={f.kind === 'weather_alert' ? 'সরকারি সতর্কবার্তা (যেমন BMD) এখানে লিখলে কার্ডে যোগ হবে' : f.kind === 'custom' ? 'কাস্টম শিডিউলে এই লেখাই কার্ডে যাবে' : 'ঐচ্ছিক'}>
          <textarea value={f.message || ''} onChange={e => set({ message: e.target.value })} />
        </Field>
        <Field label="নির্দিষ্ট ওয়েবসাইট / API লিংক (ঐচ্ছিক, কাস্টম)" className="full" hint="JSON API হলে text বা message ফিল্ড পড়া হয়"><input value={f.source_url || ''} onChange={e => set({ source_url: e.target.value })} placeholder="https://…" /></Field>
      </div>
      <div className="card-h" style={{ marginTop: 14 }}><h3>প্রকাশ</h3></div>
      <div className="row" style={{ gap: 18, marginBottom: 10 }}>
        <Toggle checked={f.active} onChange={v => set({ active: v })} label="শিডিউল চালু" />
        <Toggle checked={f.auto_publish} onChange={v => set({ auto_publish: v })} label="সোশ্যালে অটো প্রকাশ" />
      </div>
      <div className="row">
        {channels.length ? channels.map(c => (
          <label key={c.id} className="switch small"><input type="checkbox" checked={f.channels.includes(c.id)} onChange={e => set({ channels: e.target.checked ? [...f.channels, c.id] : f.channels.filter(x => x !== c.id) })} /><i />{c.name} ({c.label})</label>
        )) : <span className="small muted">কোনো সোশ্যাল সংযোগ নেই</span>}
      </div>
      <p className="small muted">কোনো প্ল্যাটফর্ম না বাছলে “শিডিউল পোস্ট” চালু থাকা সব সংযোগে যাবে।</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>বাতিল</button>
        <Btn busy={busy === 's'} onClick={save}>সংরক্ষণ</Btn>
      </div>
    </>
  );
}

function Library() {
  const toast = useToast();
  const [kind, setKind] = useState('health');
  const { data, load, loading, error } = useApi(`/bulletins/content?kind=${kind}`);
  const [f, setF] = useState({ text: '', day_month: '' });
  const needDay = ['history', 'birthday'].includes(kind);
  const add = async () => {
    try { await api.post('/bulletins/content', { kind, ...f, day_month: needDay ? f.day_month : '' }); setF({ text: '', day_month: '' }); load(); toast.ok('যোগ হয়েছে'); } catch (e) { toast.err(e); }
  };
  return (
    <div className="card">
      <div className="card-h"><h3>কনটেন্ট লাইব্রেরি</h3><p>যাচাই করা স্বাস্থ্য টিপস, শুভ সকালের বাণী, দিনভিত্তিক ইতিহাস ও জন্মবার্ষিকী। শিডিউল এখান থেকেই নেয়; বানানো তথ্য প্রকাশ হয় না।</p></div>
      <div className="tabs">{[['health', 'স্বাস্থ্য'], ['good_morning', 'শুভ সকাল'], ['history', 'ইতিহাস'], ['birthday', 'জন্মবার্ষিকী']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div className="form">
        {needDay && <Field label="তারিখ (DD-MM)"><input value={f.day_month} placeholder="১৬ ডিসেম্বর = 16-12" onChange={e => setF({ ...f, day_month: e.target.value })} /></Field>}
        <Field label="লেখা" className="full"><textarea style={{ minHeight: 70 }} value={f.text} onChange={e => setF({ ...f, text: e.target.value })} /></Field>
        <div><button className="btn" disabled={!f.text.trim()} onClick={add}>যোগ করুন</button></div>
      </div>
      <LoadState loading={loading && !data} error={error} empty={data && !data.length ? 'এখনো কিছু নেই' : null}>
        <div className="table-wrap" style={{ marginTop: 12 }}><table><tbody>
          {(data || []).map(r => <tr key={r.id}><td style={{ width: 70 }} className="small muted">{r.day_month || ''}</td><td style={{ whiteSpace: 'pre-wrap' }}>{r.text}</td><td style={{ width: 70 }}><button className="btn danger sm" onClick={async () => { await api.delete(`/bulletins/content/${r.id}`); load(); }}>মুছুন</button></td></tr>)}
        </tbody></table></div>
      </LoadState>
    </div>
  );
}

export default function Scheduler() {
  const toast = useToast();
  const { data, error, loading, load } = useApi('/bulletins');
  const { data: templates } = useApi('/cards/templates?kind=text');
  const { data: channels } = useApi('/channels');
  const [edit, setEdit] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [tab, setTab] = useState('list');
  const [busy, run] = useAction();
  const list = data?.list || [];
  const now = nowDhaka();
  const groups = list.reduce((g, b) => ((g[slot(b.run_time)] ||= []).push(b), g), {});

  const runNow = (b, publish) => run(`${b.id}${publish}`, async () => {
    try {
      const { data: r } = await api.post(`/bulletins/${b.id}/run`, { publish });
      if (r.skipped) toast.warn(`${b.name}: ${r.reason}`);
      else { toast.ok(`${b.name}: কার্ড #${r.card.id} তৈরি${publish ? `, ${r.queued}টি প্ল্যাটফর্মে সারিতে` : ''}`); setZoom(r.card.file); }
      load();
    } catch (e) { toast.err(e); load(); }
  });
  const toggle = b => run('t', async () => { try { await api.put(`/bulletins/${b.id}`, { active: !b.active }); load(); } catch (e) { toast.err(e); } });
  const del = b => run('d', async () => { if (!confirmAsk(`“${b.name}” মুছবেন?`)) return; await api.delete(`/bulletins/${b.id}`); load(); });

  return (
    <>
      <PageHead title="দৈনিক অটো শিডিউলার" desc={`সার্ভারের নির্ধারিত কাজ (Cron) দিয়ে চলে, ব্রাউজার বন্ধ থাকলেও চলবে। সব সময় Asia/Dhaka — এখন ${bn(now)}। প্রতিটি শিডিউল দিনে একবারই প্রকাশ হয়।`}>
        <button className="btn" onClick={() => setEdit({ name: '', run_time: '09:00', kind: 'custom', card_type: 'text', active: true, auto_publish: false, channels: [] })}>+ নতুন শিডিউল</button>
      </PageHead>
      <div className="tabs"><button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>শিডিউল</button><button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>কনটেন্ট লাইব্রেরি</button></div>
      {tab === 'lib' ? <Library /> : (
        <LoadState loading={loading && !data} error={error} onRetry={load}>
          {Object.entries(groups).map(([g, items]) => (
            <div className="card" key={g}>
              <div className="card-h"><h3>{g}</h3></div>
              <div className="table-wrap"><table>
                <thead><tr><th>সময়</th><th>শিডিউল</th><th>চালু</th><th>পরবর্তী প্রকাশ</th><th>শেষবারের ফলাফল</th><th></th></tr></thead>
                <tbody>{items.map(b => (
                  <tr key={b.id}>
                    <td><b>{bn(b.run_time)}</b></td>
                    <td><b>{b.name}</b><div className="small muted">{KIND[b.kind] || b.kind} · {b.card_type === 'image' ? 'ছবি কার্ড' : 'টেক্সট কার্ড'} · {b.auto_publish ? 'অটো প্রকাশ' : 'শুধু কার্ড তৈরি'}</div></td>
                    <td><Toggle checked={!!b.active} onChange={() => toggle(b)} /></td>
                    <td className="small">{!b.active ? 'বন্ধ' : (b.last_run_at || '').slice(0, 10) === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) || b.run_time <= now ? `আগামীকাল ${bn(b.run_time)}` : `আজ ${bn(b.run_time)}`}</td>
                    <td className="small">{b.last_status ? <><Status s={b.last_status} /> <span className="muted">{fmtDate(b.last_run_at)}</span><div className="muted" style={{ maxWidth: 300 }}>{b.last_result}</div></> : <span className="muted">এখনো চালানো হয়নি</span>}</td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                      <Btn className="ghost sm" busy={busy === `${b.id}false`} onClick={() => runNow(b, false)}>প্রিভিউ</Btn>
                      <Btn className="amber sm" busy={busy === `${b.id}true`} onClick={() => runNow(b, true)}>{b.last_status === 'failed' ? 'পুনরায় চেষ্টা' : 'এখনই চালান'}</Btn>
                      {b.last_card_id && <button className="btn ghost sm" onClick={async () => { const { data: cards } = await api.get('/cards'); const c = cards.find(x => x.id === b.last_card_id); if (c) setZoom(c.file); }}>কার্ড</button>}
                      <button className="btn ghost sm" onClick={() => setEdit({ ...b, active: !!b.active, auto_publish: !!b.auto_publish })}>সম্পাদনা</button>
                      <button className="btn danger sm" onClick={() => del(b)}>মুছুন</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          ))}
        </LoadState>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)}>
        {edit && <Editor b={edit} templates={templates || []} channels={channels || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      </Modal>
      <ImageModal src={zoom && img(zoom)} onClose={() => setZoom(null)} />
    </>
  );
}
