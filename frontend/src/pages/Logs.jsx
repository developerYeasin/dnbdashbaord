import { useEffect, useState } from 'react';
import api, { img } from '../api.js';
import { useApi, Btn, Field, Toggle, Status, LoadState, useToast, useAction, confirmAsk, PageHead, fmtDate, bn } from '../components/ui.jsx';

const AREA = { wordpress: 'WordPress', pipeline: 'সংবাদ → কার্ড', photocard: 'ফটোকার্ড', publish: 'প্রকাশনা', scheduler: 'শিডিউলার', settings: 'সেটিংস/অডিট', auth: 'লগইন', ads: 'বিজ্ঞাপন', staff: 'কর্মী', ai: 'AI', news: 'নিউজ সোর্স', 'bg-remove': 'ব্যাকগ্রাউন্ড রিমুভ', template: 'টেমপ্লেট' };

function Queue() {
  const toast = useToast();
  const [st, setSt] = useState('');
  const { data, load, loading, error } = useApi(`/channels/jobs${st ? `?status=${st}` : ''}`);
  const [busy, run] = useAction();
  const retry = j => run(j.id, async () => { try { await api.post(`/channels/jobs/${j.id}/retry`); toast.ok('আবার চেষ্টা করা হলো'); load(); } catch (e) { toast.err(e); } });
  return (
    <div className="card">
      <div className="card-h"><h3>প্রকাশনার সারি</h3>
        <select style={{ width: 'auto' }} value={st} onChange={e => setSt(e.target.value)}><option value="">সব</option><option value="failed">ব্যর্থ</option><option value="retry">পুনরায় চেষ্টা হবে</option><option value="queued">সারিতে</option><option value="ok">সফল</option><option value="unsupported">অসমর্থিত</option></select>
        <span className="spacer" /><Btn className="ghost sm" busy={busy === 'run'} onClick={() => run('run', async () => { await api.post('/channels/jobs/run'); load(); })}>সারি এখনই চালান</Btn>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={load} empty={data && !data.length ? 'সারি খালি' : null}>
        <div className="table-wrap"><table>
          <thead><tr><th>কার্ড</th><th>প্ল্যাটফর্ম</th><th>অবস্থা</th><th>চেষ্টা</th><th>ফলাফল / ত্রুটি</th><th></th></tr></thead>
          <tbody>{(data || []).map(j => (
            <tr key={j.id}>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}><img className="thumb" style={{ width: 44, height: 44 }} src={img(j.file)} alt="" /><span className="small" style={{ maxWidth: 260 }}>{j.title}</span></div></td>
              <td>{j.channel_name}<div className="small muted">{j.platform}</div></td>
              <td><Status s={j.status} /><div className="small muted">{fmtDate(j.updated_at)}</div></td>
              <td>{bn(j.attempts)}</td>
              <td className="small" style={{ maxWidth: 340 }}>{j.remote_id && <div className="mono">ID: {j.remote_id}</div>}{j.error && <div style={{ color: j.status === 'ok' ? 'var(--amber)' : 'var(--red)' }}>{j.error}</div>}</td>
              <td>{['failed', 'retry'].includes(j.status) && <Btn className="amber sm" busy={busy === j.id} onClick={() => retry(j)}>পুনরায় চেষ্টা</Btn>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </LoadState>
    </div>
  );
}

export default function Logs() {
  const toast = useToast();
  const [tab, setTab] = useState('logs');
  const [f, setF] = useState({ level: '', area: '', from: '', to: '', q: '' });
  const [qs, setQs] = useState('');
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(true);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQs(new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()); }, 300); return () => clearTimeout(t); }, [f]);
  const { data, error, loading, load } = useApi(`/logs?${qs}&page=${page}`);
  useEffect(() => { if (!live || tab !== 'logs') return; const t = setInterval(load, 10000); return () => clearInterval(t); }, [live, load, tab]);
  const [busy, run] = useAction();
  const clear = () => run('c', async () => {
    const days = prompt('কত দিনের পুরোনো লগ মুছবেন? (অডিট লগ — লগইন/সেটিংস — রাখা হবে)', '30');
    if (days === null) return;
    if (!confirmAsk(`${days} দিনের পুরোনো লগ মুছে যাবে।`)) return;
    try { const { data: r } = await api.post('/logs/clear', { olderThanDays: Number(days) }); toast.ok(`${bn(r.deleted)}টি লগ মুছে ফেলা হয়েছে`); load(); } catch (e) { toast.err(e); }
  });
  return (
    <>
      <PageHead title="লাইভ সিস্টেম লগস" desc="সিঙ্ক, শনাক্তকরণ, কার্ড তৈরি, শিডিউল, প্রকাশনা ও ত্রুটির প্রকৃত রেকর্ড। গোপন Token কখনো লগে লেখা হয় না।">
        {tab === 'logs' && <Toggle checked={live} onChange={setLive} label="লাইভ (১০ সেকেন্ড)" />}
        {tab === 'logs' && <Btn className="danger" busy={busy === 'c'} onClick={clear}>লগ পরিষ্কার</Btn>}
      </PageHead>
      <div className="tabs"><button className={tab === 'logs' ? 'on' : ''} onClick={() => setTab('logs')}>লগ</button><button className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>প্রকাশনার সারি</button></div>
      {tab === 'queue' ? <Queue /> : (
        <div className="card">
          <div className="form" style={{ marginBottom: 14 }}>
            <Field label="ধরন"><select value={f.level} onChange={e => setF({ ...f, level: e.target.value })}><option value="">সব</option><option value="error">ত্রুটি</option><option value="warn">সতর্কতা</option><option value="success">সফল</option><option value="info">তথ্য</option></select></Field>
            <Field label="এলাকা"><select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}><option value="">সব</option>{(data?.areas || []).map(a => <option key={a} value={a}>{AREA[a] || a}</option>)}</select></Field>
            <Field label="তারিখ থেকে"><input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field>
            <Field label="তারিখ পর্যন্ত"><input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
            <Field label="খুঁজুন"><input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} /></Field>
          </div>
          <LoadState loading={loading && !data} error={error} onRetry={load} empty={data && !data.rows.length ? 'কোনো লগ নেই' : null}>
            <div className="table-wrap"><table>
              <thead><tr><th>সময়</th><th>ধরন</th><th>এলাকা</th><th>বিবরণ</th></tr></thead>
              <tbody>{(data?.rows || []).map(l => (
                <tr key={l.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.created_at)}</td>
                  <td><Status s={l.level} /></td>
                  <td className="small">{AREA[l.area] || l.area}</td>
                  <td className="small">{l.message}{l.meta && <details><summary className="muted" style={{ cursor: 'pointer' }}>বিস্তারিত</summary><pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(l.meta, null, 1)}</pre></details>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </LoadState>
          {data && data.total > 100 && <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ আগের</button>
            <span className="small muted">পৃষ্ঠা {bn(page)} / {bn(Math.ceil(data.total / 100))}</span>
            <button className="btn ghost sm" disabled={page * 100 >= data.total} onClick={() => setPage(p => p + 1)}>পরের ›</button>
          </div>}
        </div>
      )}
    </>
  );
}
