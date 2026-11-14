import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useApi, Btn, Toggle, Status, LoadState, useToast, useAction, bn, fmtDate, PageHead } from '../components/ui.jsx';

const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const DOW = ['শনি', 'রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র'];
const pad = n => String(n).padStart(2, '0');
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

function Calendar({ selected, onSelect }) {
  const t = todayStr();
  const [ym, setYm] = useState({ y: +t.slice(0, 4), m: +t.slice(5, 7) });
  const [state, setState] = useState({ loading: true, counts: {}, first: null, error: '' });
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    api.get('/wp/calendar', { params: { year: ym.y, month: ym.m } })
      .then(r => live && setState({ loading: false, counts: r.data.counts, first: r.data.first, error: '' }))
      .catch(e => live && setState(s => ({ ...s, loading: false, error: errMsg(e) })));
    return () => { live = false; };
  }, [ym]);
  const first = state.first ? { y: +state.first.slice(0, 4), m: +state.first.slice(5, 7) } : null;
  const canPrev = !first || ym.y > first.y || (ym.y === first.y && ym.m > first.m);
  const canNext = ym.y < +t.slice(0, 4) || (ym.y === +t.slice(0, 4) && ym.m < +t.slice(5, 7));
  const move = d => setYm(({ y, m }) => { const n = m + d; return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n }; });
  const days = new Date(ym.y, ym.m, 0).getDate();
  const lead = (new Date(ym.y, ym.m - 1, 1).getDay() + 1) % 7; // week starts Saturday
  const total = Object.values(state.counts).reduce((a, b) => a + b, 0);
  return (
    <div className="cal">
      <div className="cal-head">
        <button className="btn ghost sm" disabled={!canPrev} onClick={() => move(-1)} aria-label="আগের মাস">‹</button>
        <b>{MONTHS[ym.m - 1]} {bn(ym.y)}</b>
        <button className="btn ghost sm" disabled={!canNext} onClick={() => move(1)} aria-label="পরের মাস">›</button>
      </div>
      <div className="row small" style={{ marginBottom: 8 }}>
        <select value={ym.y} onChange={e => setYm(x => ({ ...x, y: +e.target.value }))} style={{ width: 'auto' }}>
          {Array.from({ length: +t.slice(0, 4) - (first?.y || 2019) + 1 }, (_, i) => (first?.y || 2019) + i).reverse().map(y => <option key={y} value={y}>{bn(y)}</option>)}
        </select>
        <select value={ym.m} onChange={e => setYm(x => ({ ...x, m: +e.target.value }))} style={{ width: 'auto' }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <span className="spacer" />
        <span className="muted">{state.loading ? 'লোড হচ্ছে…' : `এ মাসে ${bn(total)}টি সংবাদ`}</span>
      </div>
      {state.error ? <div className="notice err">{state.error}</div> : (
        <div className="cal-grid" style={{ opacity: state.loading ? 0.5 : 1 }}>
          {DOW.map(d => <div key={d} className="dow">{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={'e' + i} />)}
          {Array.from({ length: days }, (_, i) => {
            const d = `${ym.y}-${pad(ym.m)}-${pad(i + 1)}`, c = state.counts[d] || 0, future = d > t;
            const before = state.first && d < state.first.slice(0, 10);
            return (
              <button key={d} disabled={!c} title={c ? `${bn(c)}টি সংবাদ` : 'কোনো সংবাদ প্রকাশ হয়নি'}
                className={`${c ? 'has' : future || before || state.loading ? '' : 'none'} ${selected === d ? 'sel' : ''} ${d === t ? 'today' : ''}`}
                onClick={() => onSelect(selected === d ? null : d)}>
                {bn(i + 1)}{c ? <small>{bn(c)}</small> : null}
              </button>
            );
          })}
        </div>
      )}
      <div className="legend"><span><i style={{ background: 'var(--green)' }} />সংবাদ প্রকাশিত</span><span><i style={{ background: 'var(--red)' }} />প্রকাশ হয়নি</span><span><i style={{ border: '1px solid var(--amber)' }} />আজ</span></div>
    </div>
  );
}

function NewsList({ date, onClearDate }) {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  useEffect(() => setPage(1), [date]);
  const load = () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    api.get('/wp/posts', { params: { page, per_page: 6, date: date || undefined } })
      .then(r => setState({ loading: false, error: '', data: r.data }))
      .catch(e => setState(s => ({ ...s, loading: false, error: errMsg(e) })));
  };
  useEffect(load, [page, date]); // eslint-disable-line
  const d = state.data;
  return (
    <div className="card">
      <div className="card-h">
        <h3>{date ? `${fmtDate(date, false)} তারিখের সংবাদ` : 'সর্বশেষ প্রকাশিত সংবাদ'}</h3>
        {date && <button className="btn ghost sm" onClick={onClearDate}>সব সংবাদ</button>}
        <span className="spacer" />
        {d && <span className="small muted">মোট {bn(d.total)} · পৃষ্ঠা {bn(page)}/{bn(d.pages || 1)}</span>}
      </div>
      <LoadState loading={state.loading && !d} error={state.error} onRetry={load} empty={d && !d.posts.length ? 'এই সময়ে কোনো সংবাদ নেই' : null}>
        {d && (
          <div className="news-grid" style={{ opacity: state.loading ? 0.5 : 1 }}>
            {d.posts.map(p => (
              <div key={p.id} className="news">
                <div className="img">{p.image && <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} />}{p.category && <span className="badge">{p.category}</span>}</div>
                <div className="body">
                  <h4 title={p.title}>{p.title}</h4>
                  <div className="meta"><span>{fmtDate(p.date)}</span><a href={p.link} target="_blank" rel="noreferrer">মূল লিংক ↗</a></div>
                  <button className="btn sm" onClick={() => nav(`/photocard?wp=${p.id}`)}>ফটোকার্ড তৈরি</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </LoadState>
      {d && d.pages > 1 && (
        <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
          <button className="btn ghost sm" disabled={page <= 1 || state.loading} onClick={() => setPage(p => p - 1)}>‹ নতুনগুলো</button>
          <button className="btn ghost sm" disabled={page >= d.pages || state.loading} onClick={() => setPage(p => p + 1)}>পরবর্তী (পুরোনো) ›</button>
        </div>
      )}
    </div>
  );
}

export default function Overview() {
  const toast = useToast();
  const { data: o, error, load } = useApi('/wp/overview');
  const [busy, run] = useAction();
  const [date, setDate] = useState(null);
  const [listKey, setListKey] = useState(0);
  const sync = () => run('sync', async () => {
    try {
      const { data } = await api.post('/wp/sync');
      toast.ok(data.newCount ? `${bn(data.newCount)}টি নতুন সংবাদ শনাক্ত ও প্রসেস করা হয়েছে` : 'সিঙ্ক সম্পন্ন — নতুন সংবাদ নেই');
      load(); setListKey(k => k + 1);
    } catch (e) { toast.err(e); load(); }
  });
  const toggleAuto = v => run('auto', async () => {
    try { await api.post('/wp/auto-detect', { on: v }); toast.ok(`স্বয়ংক্রিয় শনাক্তকরণ ${v ? 'চালু' : 'বন্ধ'}`); load(); } catch (e) { toast.err(e); }
  });
  const S = ({ c, v, l, sub }) => <div className="stat" style={{ '--c': c }}><b>{v === null || v === undefined ? '—' : bn(v)}</b><span>{l}</span>{sub && <small>{sub}</small>}</div>;
  return (
    <>
      <PageHead title="ওভারভিউ ড্যাশবোর্ড" desc="dnbangla.com.bd-এর প্রকৃত সংবাদ ও সিস্টেমের বর্তমান অবস্থা">
        <Toggle checked={o?.wp.autoDetect} disabled={!o || busy === 'auto'} onChange={toggleAuto} label="স্বয়ংক্রিয় সংবাদ শনাক্তকরণ" />
        <Btn className="blue" busy={busy === 'sync'} onClick={sync}>এখনই সিঙ্ক করুন</Btn>
      </PageHead>
      {error && <div className="notice err">{error}</div>}
      <div className="stats">
        <S c="var(--red)" v={o?.cardsToday} l="আজ তৈরি ফটোকার্ড" />
        <S c="var(--blue)" v={o?.wp.total} l="WordPress-এ মোট সংবাদ" sub={o ? `আজ শনাক্ত: ${bn(o.detectedToday)}` : ''} />
        <S c="var(--amber)" v={o?.activeAds} l="সক্রিয় বিজ্ঞাপন" />
        <S c="var(--green)" v={o?.staff} l="নিবন্ধিত কর্মী" />
        <S c="#8b5cf6" v={o?.queue} l="প্রকাশের সারিতে" sub={o?.failedToday ? `আজ ব্যর্থ: ${bn(o.failedToday)}` : ''} />
      </div>
      <div className="card">
        <div className="row">
          <b>WordPress সংযোগ:</b>
          <Status s={o?.wp.status} />
          <span className="muted small">{o?.wp.url}</span>
          <span className="spacer" />
          <span className="small muted">সর্বশেষ সফল সিঙ্ক: {fmtDate(o?.wp.lastSync)}</span>
        </div>
        {o?.wp.error && <div className="notice err" style={{ marginTop: 10, marginBottom: 0 }}>{o.wp.error}</div>}
      </div>
      <div className="split wide-left">
        <NewsList key={listKey} date={date} onClearDate={() => setDate(null)} />
        <div className="card"><div className="card-h"><h3>প্রকাশনার ক্যালেন্ডার</h3><p>কোন তারিখে সংবাদ প্রকাশ হয়েছে বা হয়নি। তারিখে ক্লিক করলে সেদিনের সব সংবাদ।</p></div><Calendar selected={date} onSelect={setDate} /></div>
      </div>
    </>
  );
}
