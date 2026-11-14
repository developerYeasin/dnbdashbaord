import { useState } from 'react';
import api from '../api.js';
import { useApi, Btn, Field, Toggle, Status, LoadState, Modal, useToast, useAction, confirmAsk, PageHead, fmtDate, bn } from '../components/ui.jsx';

const MODE = { review: 'শুধু রিভিউ সারিতে', draft: 'WordPress Draft', pending: 'Pending Review', publish: 'সরাসরি Publish (শুধু যাচাইকৃত)' };
const IMG = { none: 'উৎসের ছবি ব্যবহার নয় — নিজস্ব টেক্সট কার্ড', allowed: 'লাইসেন্স/অনুমতি আছে — উৎসের ছবি ব্যবহার' };
const EMPTY = { name: '', site_url: '', feed_url: '', type: '', wp_category_id: '', wp_category_name: '', language: 'bn', region: 'বাংলাদেশ', image_policy: 'none', image_license: '', interval_min: 30, daily_limit: 20, publish_mode: 'review', ai_instructions: '', active: true };

function Dash() {
  const toast = useToast();
  const { data: s, load, error } = useApi('/ai/stats');
  const [busy, run] = useAction();
  const setAuto = p => run('a', async () => { try { await api.put('/admin/automation', p); load(); } catch (e) { toast.err(e); } });
  if (error) return <div className="notice err">{error}</div>;
  if (!s) return <div className="empty">লোড হচ্ছে…</div>;
  const cost = s.usage.reduce((a, k) => a + Number(k.tokens_in) * 3e-6 + Number(k.tokens_out) * 15e-6, 0);
  return (
    <>
      <div className="card">
        <div className="row" style={{ gap: 20 }}>
          <Toggle checked={!!s.automation.news_enabled} onChange={v => setAuto({ news_enabled: v })} label="শিডিউলার (অটো সংগ্রহ ও লেখা)" />
          <span className="small muted">সর্বশেষ রান: {fmtDate(s.lastRun)} · পরবর্তী: {s.automation.news_enabled ? fmtDate(s.nextRun) : 'বন্ধ'}</span>
          <span className="spacer" />
          <Btn className="ghost" onClick={load}>রিফ্রেশ</Btn>
          <Btn className={s.automation.emergency_stop ? 'green' : 'danger'} busy={busy === 'a'} onClick={() => setAuto({ emergency_stop: !s.automation.emergency_stop })}>{s.automation.emergency_stop ? 'জরুরি স্টপ বন্ধ' : '⛔ Emergency Stop'}</Btn>
        </div>
      </div>
      <div className="stats">
        {[['আজ সংগৃহীত', s.collected, 'var(--blue)'], ['আজ Draft', s.drafts, 'var(--amber)'], ['আজ প্রকাশিত', s.published, 'var(--green)'], ['রিভিউ বাকি', s.review, '#8b5cf6'], ['আজ ডুপ্লিকেট', s.dups, 'var(--dim)'], ['আজ ব্যর্থ', s.failed, 'var(--red)']].map(([l, v, c]) => <div key={l} className="stat" style={{ '--c': c }}><b>{bn(v)}</b><span>{l}</span></div>)}
      </div>
      <div className="grid cols-2">
        <div className="card"><div className="card-h"><h3>ক্যাটাগরিভিত্তিক (আজ)</h3></div>
          {s.byCat.length ? <table><tbody>{s.byCat.map(c => <tr key={c.cat}><td>{c.cat}</td><td>{bn(c.items)} সংগৃহীত</td><td>{bn(c.published || 0)} প্রকাশিত</td></tr>)}</tbody></table> : <div className="empty">আজ কিছু সংগ্রহ হয়নি</div>}
        </div>
        <div className="card"><div className="card-h"><h3>API ব্যবহার ও আনুমানিক খরচ</h3><p>খরচ মোটামুটি হিসাব ($3/M ইনপুট, $15/M আউটপুট টোকেন ধরে); প্রকৃত বিল প্রোভাইডারের ড্যাশবোর্ডে দেখুন।</p></div>
          {s.usage.length ? <table><tbody>{s.usage.map((k, i) => <tr key={i}><td>{k.label}<div className="small muted">{k.model}</div></td><td>{bn(k.calls)} কল</td><td>{bn(Number(k.tokens_in) + Number(k.tokens_out))} টোকেন</td><td>{k.fails ? <span className="badge err">{bn(k.fails)} ব্যর্থ</span> : <span className="badge ok">ঠিক আছে</span>}</td></tr>)}<tr><td colSpan={4} className="small muted">মোট আনুমানিক: ${cost.toFixed(2)}</td></tr></tbody></table> : <div className="empty">AI Key নেই — সেটিংস → AI প্রোভাইডার</div>}
        </div>
      </div>
    </>
  );
}

function Sources() {
  const toast = useToast();
  const { data, error, loading, load } = useApi('/ai/sources');
  const { data: cats } = useApi('/wp/categories');
  const [edit, setEdit] = useState(null);
  const [busy, run] = useAction();
  const save = () => run('s', async () => {
    const cat = cats?.find(c => String(c.id) === String(edit.wp_category_id));
    const body = { ...edit, wp_category_name: cat?.name || '', interval_min: Number(edit.interval_min), daily_limit: Number(edit.daily_limit) };
    try { if (edit.id) await api.put(`/ai/sources/${edit.id}`, body); else await api.post('/ai/sources', body); toast.ok('সোর্স সংরক্ষিত'); setEdit(null); load(); } catch (e) { toast.err(e); }
  });
  const fetchNow = s => run('f' + s.id, async () => { try { const { data: r } = await api.post(`/ai/sources/${s.id}/fetch`); toast.ok(`${s.name}: ${bn(r.added)}টি নতুন, ${bn(r.duplicates)}টি ডুপ্লিকেট`); load(); } catch (e) { toast.err(e); load(); } });
  const del = s => run('d', async () => { if (!confirmAsk(`“${s.name}” মুছবেন?`)) return; await api.delete(`/ai/sources/${s.id}`); load(); });
  const toggle = s => run('t', async () => { await api.put(`/ai/sources/${s.id}`, { active: !s.active }); load(); });
  return (
    <div className="card">
      <div className="card-h"><h3>নিউজ সোর্স</h3><span className="spacer" /><button className="btn" onClick={() => setEdit({ ...EMPTY })}>+ নতুন সোর্স</button>
        <p>RSS/Atom ফিড, WordPress API, অথবা কোনো ওয়েবসাইটের ক্যাটাগরি পেজের লিংক পেস্ট করুন। ক্যাটাগরি পেজ শুধু robots.txt অনুমতি দিলে পড়া হয়; লগইন বা পেওয়াল-সুরক্ষিত কনটেন্ট কখনো নেওয়া হয় না।</p></div>
      <LoadState loading={loading && !data} error={error} onRetry={load} empty={data && !data.length ? 'কোনো সোর্স নেই' : null}>
        <div className="table-wrap"><table>
          <thead><tr><th>সোর্স</th><th>ধরন</th><th>WP ক্যাটাগরি</th><th>বিরতি / সীমা</th><th>প্রকাশ</th><th>সর্বশেষ</th><th>চালু</th><th></th></tr></thead>
          <tbody>{(data || []).map(s => (
            <tr key={s.id}>
              <td><b>{s.name}</b><div className="small muted mono" style={{ maxWidth: 260 }}>{s.feed_url || s.site_url}</div></td>
              <td><span className="badge info">{s.type}</span></td>
              <td>{s.wp_category_name || '—'}</td>
              <td className="small">{bn(s.interval_min)} মি · আজ {bn(s.today)}/{bn(s.daily_limit)}</td>
              <td className="small">{MODE[s.publish_mode]}</td>
              <td className="small">{s.last_success ? `সফল: ${fmtDate(s.last_success)}` : '—'}{s.last_error && <div style={{ color: 'var(--red)', maxWidth: 240 }}>{s.last_error}</div>}</td>
              <td><Toggle checked={!!s.active} onChange={() => toggle(s)} /></td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                <Btn className="blue sm" busy={busy === 'f' + s.id} onClick={() => fetchNow(s)}>Fetch Now</Btn>
                <button className="btn ghost sm" onClick={() => setEdit({ ...EMPTY, ...s, active: !!s.active, wp_category_id: s.wp_category_id || '' })}>সম্পাদনা</button>
                <button className="btn danger sm" onClick={() => del(s)}>মুছুন</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      </LoadState>
      <Modal open={!!edit} onClose={() => setEdit(null)}>
        {edit && <>
          <div className="card-h"><h3>{edit.id ? 'সোর্স সম্পাদনা' : 'নতুন সোর্স'}</h3></div>
          <div className="form">
            <Field label="সোর্সের নাম *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="ওয়েবসাইট URL"><input value={edit.site_url} onChange={e => setEdit({ ...edit, site_url: e.target.value })} placeholder="https://…" /></Field>
            <Field label="RSS / API / ক্যাটাগরি লিংক *" className="full"><input value={edit.feed_url} onChange={e => setEdit({ ...edit, feed_url: e.target.value })} placeholder="https://example.com/feed অথবা https://example.com/category/sports" /></Field>
            <Field label="ধরন"><select value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}><option value="">লিংক দেখে অটো</option><option value="rss">RSS / Atom</option><option value="wordpress">WordPress REST API</option><option value="page">ক্যাটাগরি পেজ</option></select></Field>
            <Field label="WordPress ক্যাটাগরি (dnbangla)"><select value={edit.wp_category_id} onChange={e => setEdit({ ...edit, wp_category_id: e.target.value })}><option value="">—</option>{(cats || []).map(c => <option key={c.id} value={c.id}>{c.name} ({bn(c.count)})</option>)}</select></Field>
            <Field label="ভাষা"><select value={edit.language} onChange={e => setEdit({ ...edit, language: e.target.value })}><option value="bn">বাংলা</option><option value="en">English</option></select></Field>
            <Field label="অঞ্চল"><input value={edit.region || ''} onChange={e => setEdit({ ...edit, region: e.target.value })} /></Field>
            <Field label="সংগ্রহের বিরতি"><select value={edit.interval_min} onChange={e => setEdit({ ...edit, interval_min: e.target.value })}>{[5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{bn(m)} মিনিট</option>)}</select></Field>
            <Field label="দৈনিক সর্বোচ্চ সংগ্রহ"><input type="number" min={1} value={edit.daily_limit} onChange={e => setEdit({ ...edit, daily_limit: e.target.value })} /></Field>
            <Field label="প্রকাশ পদ্ধতি"><select value={edit.publish_mode} onChange={e => setEdit({ ...edit, publish_mode: e.target.value })}>{Object.entries(MODE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="ছবি নীতি"><select value={edit.image_policy} onChange={e => setEdit({ ...edit, image_policy: e.target.value })}>{Object.entries(IMG).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            {edit.image_policy === 'allowed' && <Field label="লাইসেন্স / অনুমতির তথ্য" className="full"><input value={edit.image_license || ''} onChange={e => setEdit({ ...edit, image_license: e.target.value })} placeholder="যেমন: লিখিত চুক্তি, CC BY 4.0" /></Field>}
            <Field label="এই সোর্স/ক্যাটাগরির AI নির্দেশনা" className="full"><textarea style={{ minHeight: 70 }} value={edit.ai_instructions || ''} onChange={e => setEdit({ ...edit, ai_instructions: e.target.value })} placeholder="যেমন: খেলার স্কোর অবশ্যই শিরোনামে দিন" /></Field>
            <Toggle checked={edit.active} onChange={v => setEdit({ ...edit, active: v })} label="সক্রিয়" />
          </div>
          {edit.publish_mode === 'publish' && <div className="notice warn" style={{ marginTop: 12 }}>সরাসরি Publish শুধু AI “যাচাইকৃত” চিহ্নিত লেখার জন্য; অনিশ্চিত তথ্য থাকলে Draft হিসেবে যাবে। প্রথমে কিছুদিন Draft মোডে পরীক্ষা করুন।</div>}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn ghost" onClick={() => setEdit(null)}>বাতিল</button><Btn busy={busy === 's'} onClick={save}>সংরক্ষণ</Btn></div>
        </>}
      </Modal>
    </div>
  );
}

function Items({ onOpen }) {
  const toast = useToast();
  const [st, setSt] = useState('new');
  const { data, error, loading, load } = useApi(`/ai/items${st ? `?status=${st}` : ''}`);
  const [busy, run] = useAction();
  const write = i => run('w' + i.id, async () => {
    try { const { data: a } = await api.post(`/ai/items/${i.id}/write`, {}); toast.ok('AI প্রতিবেদন তৈরি হয়েছে'); load(); onOpen(a.id); } catch (e) { toast.err(e); }
  });
  return (
    <div className="card">
      <div className="card-h"><h3>সংগৃহীত সংবাদ</h3>
        <select style={{ width: 'auto' }} value={st} onChange={e => setSt(e.target.value)}><option value="">সব</option><option value="new">নতুন</option><option value="written">AI লেখা হয়েছে</option><option value="duplicate">ডুপ্লিকেট</option><option value="published">প্রকাশিত</option><option value="error">ত্রুটি</option><option value="ignored">উপেক্ষিত</option></select>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={load} empty={data && !data.length ? 'কিছু নেই' : null}>
        <div className="table-wrap"><table>
          <thead><tr><th>শিরোনাম (উৎস)</th><th>উৎস</th><th>সময়</th><th>অবস্থা</th><th></th></tr></thead>
          <tbody>{(data || []).map(i => (
            <tr key={i.id}>
              <td style={{ maxWidth: 480 }}><a href={i.url} target="_blank" rel="noreferrer">{i.title}</a>{i.error && <div className="small" style={{ color: 'var(--red)' }}>{i.error}</div>}{i.duplicate_of && <div className="small muted">#{i.duplicate_of}-এর সম্ভাব্য ডুপ্লিকেট / সম্পর্কিত সংবাদ</div>}</td>
              <td className="small">{i.source_name}</td>
              <td className="small">{fmtDate(i.published_at || i.created_at)}</td>
              <td><Status s={i.status} /></td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                {i.article_id ? <button className="btn ghost sm" onClick={() => onOpen(i.article_id)}>প্রতিবেদন দেখুন</button>
                  : <Btn className="blue sm" busy={busy === 'w' + i.id} onClick={() => write(i)}>এআই রি-রাইট করুন</Btn>}
                {i.status === 'new' && <button className="btn ghost sm" onClick={async () => { await api.post(`/ai/items/${i.id}/ignore`); load(); }}>উপেক্ষা</button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      </LoadState>
    </div>
  );
}

function ArticleView({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data: list, load } = useApi('/ai/articles');
  const { data: cats } = useApi('/wp/categories');
  const a = list?.find(x => x.id === id);
  const [edit, setEdit] = useState(null);
  const [instr, setInstr] = useState('');
  const [busy, run] = useAction();
  if (!a) return <div className="empty">লোড হচ্ছে…</div>;
  const f = edit || a;
  const saveEdit = () => run('e', async () => { try { await api.put(`/ai/articles/${id}`, { ...edit, tags: Array.isArray(edit.tags) ? edit.tags : String(edit.tags).split(',').map(s => s.trim()).filter(Boolean) }); setEdit(null); toast.ok('সংরক্ষিত'); load(); } catch (e) { toast.err(e); } });
  const rewrite = () => run('r', async () => { try { await api.post(`/ai/items/${a.item_id}/write`, { instructions: instr }); toast.ok('আবার লেখা হয়েছে'); load(); onChanged(); } catch (e) { toast.err(e); } });
  const wp = status => run('w' + status, async () => {
    if (status === 'publish' && !confirmAsk('dnbangla.com.bd-তে সরাসরি প্রকাশ হবে। নিশ্চিত?')) return;
    try { const { data: r } = await api.post(`/ai/articles/${id}/wordpress`, { status }); toast.ok(`WordPress-এ ${status} তৈরি (#${r.id})`); load(); onChanged(); } catch (e) { toast.err(e); load(); }
  });
  const act = (path, msg) => run(path, async () => { try { await api.post(`/ai/articles/${id}/${path}`); toast.ok(msg); load(); onChanged(); } catch (e) { toast.err(e); } });
  return (
    <>
      <div className="card-h">
        <h3>এআই প্রতিবেদন</h3><Status s={a.status} /><Status s={a.verification} /><span className="spacer" /><button className="btn ghost sm" onClick={onClose}>বন্ধ</button>
        <p>উৎস: <a href={a.source_url} target="_blank" rel="noreferrer">{a.source_name}</a> · {a.provider} · {fmtDate(a.updated_at)}{a.wp_link && <> · <a href={a.wp_link} target="_blank" rel="noreferrer">WordPress-এ দেখুন ↗</a></>}</p>
      </div>
      {a.uncertain?.filter(Boolean).length > 0 && <div className="notice warn"><div><b>অনিশ্চিত তথ্য — প্রকাশের আগে যাচাই করুন:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{a.uncertain.filter(Boolean).map((u, i) => <li key={i}>{u}</li>)}</ul></div></div>}
      {a.error && <div className="notice err">{a.error}</div>}
      {edit ? (
        <div className="form">
          <Field label="শিরোনাম" className="full"><input value={f.title} onChange={e => setEdit({ ...f, title: e.target.value })} /></Field>
          <Field label="সারাংশ" className="full"><textarea style={{ minHeight: 60 }} value={f.summary} onChange={e => setEdit({ ...f, summary: e.target.value })} /></Field>
          <Field label="বডি (HTML)" className="full"><textarea style={{ minHeight: 260 }} value={f.body} onChange={e => setEdit({ ...f, body: e.target.value })} /></Field>
          <Field label="SEO Title"><input value={f.seo_title} onChange={e => setEdit({ ...f, seo_title: e.target.value })} /></Field>
          <Field label="Meta Description"><input value={f.meta_description} onChange={e => setEdit({ ...f, meta_description: e.target.value })} /></Field>
          <Field label="ট্যাগ (কমা দিয়ে)"><input value={Array.isArray(f.tags) ? f.tags.join(', ') : f.tags} onChange={e => setEdit({ ...f, tags: e.target.value })} /></Field>
          <Field label="ছবির Alt Text"><input value={f.alt_text} onChange={e => setEdit({ ...f, alt_text: e.target.value })} /></Field>
          <Field label="WP ক্যাটাগরি"><select value={f.category_id || ''} onChange={e => setEdit({ ...f, category_id: e.target.value || null })}><option value="">—</option>{(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <div className="row full"><Btn className="green" busy={busy === 'e'} onClick={saveEdit}>সংরক্ষণ</Btn><button className="btn ghost" onClick={() => setEdit(null)}>বাতিল</button></div>
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: 22, marginBottom: 6 }}>{a.title}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{a.summary}</p>
          <div className="article-body" dangerouslySetInnerHTML={{ __html: a.body }} />
          <p className="small muted">SEO: {a.seo_title} · {a.meta_description}<br />ট্যাগ: {a.tags.join(', ')} · ক্যাটাগরি: {cats?.find(c => String(c.id) === String(a.category_id))?.name || '—'} · ছবি: {a.image && a.image_allowed ? 'উৎসের ছবি (অনুমোদিত)' : 'নিজস্ব টেক্সট ফটোকার্ড (১০০KB-এর নিচে)'}</p>
        </>
      )}
      {!a.wp_post_id && !edit && (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1, minWidth: 200 }} value={instr} onChange={e => setInstr(e.target.value)} placeholder="আবার লেখার জন্য বাড়তি নির্দেশনা (ঐচ্ছিক)" />
            <Btn className="blue" busy={busy === 'r'} onClick={rewrite}>এআই রি-রাইট করুন</Btn>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setEdit({ ...a })}>সম্পাদনা</button>
            <Btn className="ghost" busy={busy === 'approve'} onClick={() => act('approve', 'অনুমোদিত')}>অনুমোদন</Btn>
            <Btn className="danger" busy={busy === 'reject'} onClick={() => act('reject', 'বাতিল করা হয়েছে')}>বাতিল</Btn>
            <span className="spacer" />
            <Btn className="ghost" busy={busy === 'wdraft'} onClick={() => wp('draft')}>WP Draft</Btn>
            <Btn className="amber" busy={busy === 'wpending'} onClick={() => wp('pending')}>Pending Review</Btn>
            <Btn className="green" busy={busy === 'wpublish'} onClick={() => wp('publish')}>Publish</Btn>
          </div>
        </>
      )}
    </>
  );
}

function Articles({ onOpen }) {
  const [st, setSt] = useState('');
  const { data, error, loading, load } = useApi(`/ai/articles${st ? `?status=${st}` : ''}`);
  return (
    <div className="card">
      <div className="card-h"><h3>এআই প্রতিবেদন</h3>
        <select style={{ width: 'auto' }} value={st} onChange={e => setSt(e.target.value)}><option value="">সব</option><option value="review">রিভিউ</option><option value="approved">অনুমোদিত</option><option value="draft">ড্রাফট</option><option value="pending">পেন্ডিং</option><option value="published">প্রকাশিত</option><option value="failed">ব্যর্থ</option><option value="rejected">বাতিল</option></select>
        <span className="spacer" /><button className="btn ghost sm" onClick={load}>রিফ্রেশ</button>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={load} empty={data && !data.length ? 'কোনো প্রতিবেদন নেই' : null}>
        <div className="table-wrap"><table>
          <thead><tr><th>শিরোনাম</th><th>উৎস</th><th>যাচাই</th><th>অবস্থা</th><th>সময়</th><th></th></tr></thead>
          <tbody>{(data || []).map(a => (
            <tr key={a.id}>
              <td style={{ maxWidth: 460 }}><b>{a.title}</b><div className="small muted">{a.summary?.slice(0, 120)}</div></td>
              <td className="small">{a.source_name}</td>
              <td><Status s={a.verification} /></td>
              <td><Status s={a.status} />{a.wp_post_id && <div className="small muted">WP #{a.wp_post_id}</div>}</td>
              <td className="small">{fmtDate(a.updated_at)}</td>
              <td><button className="btn sm" onClick={() => onOpen(a.id)}>বিস্তারিত</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </LoadState>
    </div>
  );
}

export default function AiNews() {
  const [tab, setTab] = useState('dash');
  const [open, setOpen] = useState(null);
  const [k, setK] = useState(0);
  return (
    <>
      <PageHead title="এআই নিউজ রচনা ও ওয়ার্ডপ্রেস পাবলিশার হাব" desc="অনুমোদিত সোর্স থেকে সংবাদ সংগ্রহ → ডুপ্লিকেট যাচাই → AI দিয়ে মৌলিক বাংলা প্রতিবেদন → সম্পাদকের রিভিউ → dnbangla.com.bd-তে Draft / Pending / Publish।" />
      <div className="tabs">{[['dash', 'ড্যাশবোর্ড'], ['sources', 'সোর্স'], ['items', 'সংগৃহীত সংবাদ'], ['articles', 'এআই প্রতিবেদন']].map(([x, l]) => <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{l}</button>)}</div>
      {tab === 'dash' && <Dash />}
      {tab === 'sources' && <Sources />}
      {tab === 'items' && <Items key={k} onOpen={setOpen} />}
      {tab === 'articles' && <Articles key={k} onOpen={setOpen} />}
      <Modal open={!!open} onClose={() => setOpen(null)} size="lg">{open && <ArticleView id={open} onClose={() => setOpen(null)} onChanged={() => setK(x => x + 1)} />}</Modal>
    </>
  );
}
