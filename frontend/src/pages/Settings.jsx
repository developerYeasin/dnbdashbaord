import { useEffect, useState } from 'react';
import api from '../api.js';
import { useApi, Btn, Field, Toggle, Status, LoadState, Modal, useToast, useAction, confirmAsk, PageHead, fmtDate, bn } from '../components/ui.jsx';

const isAdmin = () => { try { return JSON.parse(atob(localStorage.getItem('dnb_token').split('.')[1])).role === 'admin'; } catch { return false; } };

function WordPress() {
  const toast = useToast();
  const { data, load } = useApi('/wp/settings');
  const [f, setF] = useState(null);
  const [test, setTest] = useState(null);
  const [busy, run] = useAction();
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <div className="empty">লোড হচ্ছে…</div>;
  const set = p => setF(x => ({ ...x, ...p }));
  const save = () => run('s', async () => { try { await api.put('/wp/settings', f); toast.ok('WordPress সেটিংস সংরক্ষিত'); load(); } catch (e) { toast.err(e); } });
  const doTest = () => run('t', async () => { try { const { data: r } = await api.post('/wp/test'); setTest(r); load(); } catch (e) { toast.err(e); } });
  const sync = () => run('y', async () => { try { const { data: r } = await api.post('/wp/sync'); toast.ok(`সিঙ্ক সম্পন্ন — নতুন ${bn(r.newCount)}টি`); load(); } catch (e) { toast.err(e); } });
  const hook = f.webhook_url ? `${location.origin}${f.webhook_url}` : '';
  return (
    <div className="card">
      <div className="card-h"><h3>WordPress REST API</h3><Status s={f.last_status} /><span className="small muted">সর্বশেষ সিঙ্ক: {fmtDate(f.last_sync)}</span><p>Username ও Application Password দিলে AI নিউজ WordPress-এ ড্রাফট/প্রকাশ করা যাবে। সংবাদ পড়ার জন্য শুধু URL যথেষ্ট।</p></div>
      <div className="form">
        <Field label="ওয়েবসাইট URL"><input value={f.url || ''} onChange={e => set({ url: e.target.value })} /></Field>
        <Field label="Username"><input value={f.username || ''} autoComplete="off" onChange={e => set({ username: e.target.value })} /></Field>
        <Field label="Application Password" hint="WP Admin → Users → Profile → Application Passwords"><input type="password" autoComplete="new-password" value={f.app_password || ''} onChange={e => set({ app_password: e.target.value })} /></Field>
        <Field label="চেক করার বিরতি (মিনিট)"><input type="number" min={1} max={60} value={f.poll_minutes || 2} onChange={e => set({ poll_minutes: e.target.value })} /></Field>
        <Toggle checked={f.auto_detect} onChange={v => set({ auto_detect: v })} label="স্বয়ংক্রিয় সংবাদ সিঙ্ক ও ফটোকার্ড" />
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <Btn className="green" busy={busy === 's'} onClick={save}>সংরক্ষণ</Btn>
        <Btn className="blue" busy={busy === 't'} onClick={doTest}>সংযোগ যাচাই</Btn>
        <Btn className="ghost" busy={busy === 'y'} onClick={sync}>ম্যানুয়াল সিঙ্ক / পুনরায় চেষ্টা</Btn>
      </div>
      {test && <div className={`notice ${test.site && test.auth?.ok !== false ? 'ok' : 'err'}`} style={{ marginTop: 12 }}>{test.message}{test.auth?.ok && !test.auth.canPublish ? ' — এই ব্যবহারকারী পোস্ট প্রকাশ করতে পারবেন না (Author/Editor রোল প্রয়োজন)' : ''}</div>}
      {f.last_error && <div className="notice err" style={{ marginTop: 12 }}>সর্বশেষ ত্রুটি: {f.last_error}</div>}
      <div className="card-h" style={{ marginTop: 18 }}><h3>তাৎক্ষণিক শনাক্তকরণ (Webhook)</h3><p>নির্ধারিত বিরতির পাশাপাশি, প্রকাশের সঙ্গে সঙ্গে জানাতে থিমের functions.php বা Code Snippets প্লাগইনে নিচের কোড যোগ করুন। আগে একবার “সংরক্ষণ” চাপুন।</p></div>
      {hook ? <pre className="mono" style={{ background: 'var(--panel-2)', padding: 12, borderRadius: 8, overflow: 'auto', whiteSpace: 'pre' }}>{`add_action('transition_post_status', function ($new, $old, $post) {
  if ($new !== 'publish' || $old === 'publish' || $post->post_type !== 'post') return;
  wp_remote_post('${hook}', [
    'headers' => ['Content-Type' => 'application/json'], 'timeout' => 5, 'blocking' => false,
    'body' => wp_json_encode(['id' => $post->ID]),
  ]);
}, 10, 3);`}</pre> : <p className="small muted">সংরক্ষণের পর Webhook URL তৈরি হবে।</p>}
    </div>
  );
}

function Channels() {
  const toast = useToast();
  const { data: plats } = useApi('/channels/platforms');
  const { data: list, error, loading, load } = useApi('/channels');
  const [edit, setEdit] = useState(null);
  const [busy, run] = useAction();
  const save = () => run('s', async () => {
    try {
      const body = { platform: edit.platform, name: edit.name, cfg: edit.cfg, active: edit.active, use_news: edit.use_news, use_text: edit.use_text, use_schedule: edit.use_schedule, link_in_comment: edit.link_in_comment };
      if (edit.id) await api.put(`/channels/${edit.id}`, body); else await api.post('/channels', body);
      toast.ok('সংরক্ষিত — এখন “সংযোগ পরীক্ষা” করুন'); setEdit(null); load();
    } catch (e) { toast.err(e); }
  });
  const test = c => run('t' + c.id, async () => { try { const { data: r } = await api.post(`/channels/${c.id}/test`); r.ok ? toast.ok(`সংযোগ সফল: ${r.info}`) : toast.err(r.error); load(); } catch (e) { toast.err(e); } });
  const testPost = c => run('p' + c.id, async () => {
    if (!confirmAsk(`“${c.name}”-এ একটি বাস্তব পরীক্ষামূলক পোস্ট প্রকাশ হবে। চালিয়ে যাবেন?`)) return;
    try { const { data: r } = await api.post(`/channels/${c.id}/test-post`); r.status === 'ok' ? toast.ok(`পোস্ট সফল (ID: ${r.remote_id})`) : toast.err(`${r.status}: ${r.error}`); } catch (e) { toast.err(e); }
  });
  const del = c => run('d', async () => { if (!confirmAsk(`“${c.name}” সংযোগ বিচ্ছিন্ন করবেন?`)) return; await api.delete(`/channels/${c.id}`); load(); });
  const toggle = (c, k) => run('x', async () => { try { await api.put(`/channels/${c.id}`, { [k]: !c[k] }); load(); } catch (e) { toast.err(e); } });
  const newCh = p => setEdit({ platform: p, name: plats[p].label, cfg: {}, active: true, use_news: true, use_text: true, use_schedule: true, link_in_comment: true });
  return (
    <div className="card">
      <div className="card-h"><h3>সোশ্যাল মিডিয়া সংযোগ</h3><p>শুধু ফর্মে Token বসালে সংযোগ সফল ধরা হয় না — “সংযোগ পরীক্ষা” বাস্তব API কল করে অবস্থা দেখায়। Token কখনো ব্রাউজারে ফেরত পাঠানো হয় না।</p></div>
      <div className="row" style={{ marginBottom: 14 }}>{plats && Object.entries(plats).map(([k, p]) => <button key={k} className="btn ghost sm" onClick={() => newCh(k)}>+ {p.label}</button>)}</div>
      <LoadState loading={loading && !list} error={error} onRetry={load} empty={list && !list.length ? 'কোনো সংযোগ নেই' : null}>
        <div className="table-wrap"><table>
          <thead><tr><th>প্ল্যাটফর্ম</th><th>অবস্থা</th><th>সংবাদ</th><th>টেক্সট</th><th>শিডিউল</th><th>চালু</th><th></th></tr></thead>
          <tbody>{(list || []).map(c => (
            <tr key={c.id}>
              <td><b>{c.name}</b><div className="small muted">{c.label}</div></td>
              <td><Status s={c.status} />{c.last_check && <div className="small muted">{fmtDate(c.last_check)}</div>}{c.last_error && <div className="small" style={{ color: 'var(--red)', maxWidth: 280 }}>{c.last_error}</div>}</td>
              {['use_news', 'use_text', 'use_schedule', 'active'].map(k => <td key={k}><Toggle checked={!!c[k]} onChange={() => toggle(c, k)} /></td>)}
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                <Btn className="blue sm" busy={busy === 't' + c.id} onClick={() => test(c)}>সংযোগ পরীক্ষা</Btn>
                <Btn className="ghost sm" busy={busy === 'p' + c.id} disabled={c.status !== 'connected'} onClick={() => testPost(c)}>টেস্ট পোস্ট</Btn>
                <button className="btn ghost sm" onClick={() => setEdit({ ...c, active: !!c.active, use_news: !!c.use_news, use_text: !!c.use_text, use_schedule: !!c.use_schedule, link_in_comment: !!c.link_in_comment })}>সম্পাদনা</button>
                <button className="btn danger sm" onClick={() => del(c)}>বিচ্ছিন্ন</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      </LoadState>
      <Modal open={!!edit} onClose={() => setEdit(null)}>
        {edit && plats && <>
          <div className="card-h"><h3>{plats[edit.platform].label}</h3></div>
          <div className="form">
            <Field label="নাম (নিজের বোঝার জন্য)" className="full"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            {plats[edit.platform].fields.map(([k, l, secret]) => (
              <Field key={k} label={l} hint={secret && edit.id ? 'পরিবর্তন না করলে আগের মান থাকবে' : ''}>
                <input type={secret ? 'password' : 'text'} autoComplete="new-password" value={edit.cfg?.[k] || ''} onChange={e => setEdit({ ...edit, cfg: { ...edit.cfg, [k]: e.target.value } })} />
              </Field>
            ))}
          </div>
          <div className="row" style={{ gap: 16, marginTop: 12 }}>
            <Toggle checked={edit.use_news} onChange={v => setEdit({ ...edit, use_news: v })} label="সংবাদ কার্ড" />
            <Toggle checked={edit.use_text} onChange={v => setEdit({ ...edit, use_text: v })} label="টেক্সট/অপেনিং কার্ড" />
            <Toggle checked={edit.use_schedule} onChange={v => setEdit({ ...edit, use_schedule: v })} label="শিডিউল বুলেটিন" />
            {edit.platform === 'facebook' && <Toggle checked={edit.link_in_comment} onChange={v => setEdit({ ...edit, link_in_comment: v })} label="প্রথম কমেন্টে মূল লিংক" />}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn ghost" onClick={() => setEdit(null)}>বাতিল</button><Btn busy={busy === 's'} onClick={save}>সংরক্ষণ</Btn></div>
        </>}
      </Modal>
    </div>
  );
}

function AiKeys() {
  const toast = useToast();
  const { data: providers } = useApi('/ai/providers');
  const { data: keys, load, loading, error } = useApi('/ai/keys');
  const [f, setF] = useState({ provider: 'anthropic', label: '', key: '', model: '', base_url: '', priority: 10 });
  const [busy, run] = useAction();
  const add = () => run('a', async () => { try { await api.post('/ai/keys', f); toast.ok('Key যোগ হয়েছে'); setF({ ...f, key: '', label: '' }); load(); } catch (e) { toast.err(e); } });
  const test = k => run('t' + k.id, async () => { const { data: r } = await api.post(`/ai/keys/${k.id}/test`); r.ok ? toast.ok(r.info) : toast.err(r.error); load(); });
  const upd = (k, p) => run('u', async () => { try { await api.put(`/ai/keys/${k.id}`, p); load(); } catch (e) { toast.err(e); } });
  const del = k => run('d', async () => { if (!confirmAsk('এই Key মুছবেন?')) return; await api.delete(`/ai/keys/${k.id}`); load(); });
  return (
    <div className="card">
      <div className="card-h"><h3>AI প্রোভাইডার ও API Key</h3><p>একাধিক প্রোভাইডার ও একাধিক Key রাখা যায়। অগ্রাধিকার (ছোট সংখ্যা আগে) অনুযায়ী চেষ্টা হয়; একটি ব্যর্থ হলে পরেরটি। ব্যাকগ্রাউন্ড রিমুভের জন্য remove.bg / Photoroom / Clipdrop Key দিন।</p></div>
      <div className="form">
        <Field label="প্রোভাইডার"><select value={f.provider} onChange={e => setF({ ...f, provider: e.target.value, model: '' })}>{providers && Object.entries(providers).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></Field>
        <Field label="নাম"><input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="যেমন: Claude প্রধান" /></Field>
        <Field label="API Key"><input type="password" autoComplete="new-password" value={f.key} onChange={e => setF({ ...f, key: e.target.value })} /></Field>
        {!['removebg', 'photoroom', 'clipdrop'].includes(f.provider) && <Field label="মডেল"><input value={f.model} placeholder={providers?.[f.provider]?.model} onChange={e => setF({ ...f, model: e.target.value })} /></Field>}
        {f.provider === 'custom' && <Field label="Base URL (OpenAI-compatible)"><input value={f.base_url} placeholder="https://…/v1" onChange={e => setF({ ...f, base_url: e.target.value })} /></Field>}
        <Field label="অগ্রাধিকার"><input type="number" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })} /></Field>
        <div><Btn busy={busy === 'a'} disabled={!f.key} onClick={add}>যোগ করুন</Btn></div>
      </div>
      <LoadState loading={loading && !keys} error={error} empty={keys && !keys.length ? 'কোনো Key নেই' : null}>
        <div className="table-wrap" style={{ marginTop: 14 }}><table>
          <thead><tr><th>অগ্রাধিকার</th><th>প্রোভাইডার</th><th>Key</th><th>মডেল</th><th>ব্যবহার</th><th>চালু</th><th></th></tr></thead>
          <tbody>{(keys || []).map(k => (
            <tr key={k.id}>
              <td style={{ width: 90 }}><input type="number" defaultValue={k.priority} onBlur={e => +e.target.value !== k.priority && upd(k, { priority: e.target.value })} /></td>
              <td><b>{k.label}</b><div className="small muted">{providers?.[k.provider]?.label}</div></td>
              <td className="mono">{k.key}</td>
              <td style={{ minWidth: 170 }}>{['removebg', 'photoroom', 'clipdrop'].includes(k.provider) ? '—' : <input defaultValue={k.model} onBlur={e => e.target.value !== k.model && upd(k, { model: e.target.value })} />}</td>
              <td className="small">{bn(k.calls)} কল · {bn(Number(k.tokens_in) + Number(k.tokens_out))} টোকেন{k.fails ? <div style={{ color: 'var(--red)' }}>{bn(k.fails)} ব্যর্থ{k.last_error ? `: ${k.last_error.slice(0, 80)}` : ''}</div> : null}</td>
              <td><Toggle checked={!!k.active} onChange={v => upd(k, { active: v })} /></td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}><Btn className="blue sm" busy={busy === 't' + k.id} onClick={() => test(k)}>পরীক্ষা</Btn><button className="btn danger sm" onClick={() => del(k)}>মুছুন</button></div></td>
            </tr>
          ))}</tbody>
        </table></div>
      </LoadState>
    </div>
  );
}

function System() {
  const toast = useToast();
  const { data, load } = useApi('/admin/settings');
  const [loc, setLoc] = useState(null);
  const [busy, run] = useAction();
  useEffect(() => { if (data) setLoc(data.location); }, [data]);
  const auto = data?.automation || {};
  const setAuto = p => run('a', async () => { try { await api.put('/admin/automation', p); load(); toast.ok('পরিবর্তন সংরক্ষিত'); } catch (e) { toast.err(e); } });
  const saveLoc = () => run('l', async () => { try { await api.put('/admin/location', loc); toast.ok('অবস্থান সংরক্ষিত'); } catch (e) { toast.err(e); } });
  const tick = () => run('k', async () => { try { const { data: r } = await api.post('/admin/tick'); toast.ok(r.skipped ? 'আরেকটি কাজ চলছে' : `সম্পন্ন — প্রকাশিত ${bn(r.published || 0)}টি`); } catch (e) { toast.err(e); } });
  return (
    <>
      <div className="card">
        <div className="card-h"><h3>অটোমেশন নিয়ন্ত্রণ</h3></div>
        {auto.emergency_stop && <div className="notice err"><b>জরুরি স্টপ চালু:</b> কোনো স্বয়ংক্রিয় প্রকাশ হবে না।</div>}
        <div className="row" style={{ gap: 22 }}>
          <Toggle checked={auto.enabled !== false} onChange={v => setAuto({ enabled: v })} label="সব অটোমেশন (সিঙ্ক, শিডিউল, প্রকাশ)" />
          <Toggle checked={!!auto.news_enabled} onChange={v => setAuto({ news_enabled: v })} label="AI নিউজ সংগ্রহ ও লেখা" />
          <span className="spacer" />
          <Btn className="ghost" busy={busy === 'k'} onClick={tick}>এখনই একবার চালান</Btn>
          <Btn className={auto.emergency_stop ? 'green' : 'danger'} busy={busy === 'a'} onClick={() => setAuto({ emergency_stop: !auto.emergency_stop })}>{auto.emergency_stop ? 'জরুরি স্টপ বন্ধ করুন' : '⛔ জরুরি স্টপ'}</Btn>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>cPanel → Cron Jobs-এ প্রতি মিনিটে চালান: <code>curl -fsS {location.origin}/api/cron/&lt;CRON_KEY&gt; &gt;/dev/null</code> (CRON_KEY থাকে সার্ভারের backend/.env-এ)। PUBLIC_URL: <code>{data?.public_url || 'সেট করা নেই'}</code></p>
      </div>
      {loc && <div className="card">
        <div className="card-h"><h3>অবস্থান (আবহাওয়া ও নামাজের সময়)</h3></div>
        <div className="form">
          <Field label="শহর (ইংরেজি, API-এর জন্য)"><input value={loc.city} onChange={e => setLoc({ ...loc, city: e.target.value })} /></Field>
          <Field label="শহর (বাংলা, কার্ডে)"><input value={loc.city_bn || ''} onChange={e => setLoc({ ...loc, city_bn: e.target.value })} /></Field>
          <Field label="দেশ"><input value={loc.country} onChange={e => setLoc({ ...loc, country: e.target.value })} /></Field>
          <Field label="Latitude"><input value={loc.lat} onChange={e => setLoc({ ...loc, lat: e.target.value })} /></Field>
          <Field label="Longitude"><input value={loc.lon} onChange={e => setLoc({ ...loc, lon: e.target.value })} /></Field>
          <Field label="নামাজের হিসাব পদ্ধতি"><select value={loc.prayer_method} onChange={e => setLoc({ ...loc, prayer_method: e.target.value })}><option value={1}>University of Islamic Sciences, Karachi (বাংলাদেশে প্রচলিত)</option><option value={3}>Muslim World League</option><option value={2}>ISNA</option><option value={4}>Umm Al-Qura</option></select></Field>
          <Field label="আসরের মাযহাব"><select value={loc.prayer_school} onChange={e => setLoc({ ...loc, prayer_school: e.target.value })}><option value={1}>হানাফি</option><option value={0}>শাফেয়ি</option></select></Field>
          <div><Btn className="green" busy={busy === 'l'} onClick={saveLoc}>সংরক্ষণ</Btn></div>
        </div>
      </div>}
    </>
  );
}

function Users() {
  const toast = useToast();
  const admin = isAdmin();
  const { data: users, load } = useApi(admin ? '/auth/users' : null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [nu, setNu] = useState({ name: '', email: '', password: '', role: 'editor' });
  const [busy, run] = useAction();
  const download = () => run('b', async () => {
    try {
      const { data } = await api.get('/admin/backup');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = `dnb-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    } catch (e) { toast.err(e); }
  });
  const restore = file => run('r', async () => {
    if (!file || !confirmAsk('ব্যাকআপ থেকে রিস্টোর করলে বর্তমান সেটিংস, টেমপ্লেট, বিজ্ঞাপন, কর্মী ইত্যাদি প্রতিস্থাপিত হবে। চালিয়ে যাবেন?')) return;
    try { await api.post('/admin/restore', JSON.parse(await file.text())); toast.ok('রিস্টোর সম্পন্ন'); } catch (e) { toast.err(e); }
  });
  return (
    <>
      <div className="card">
        <div className="card-h"><h3>পাসওয়ার্ড পরিবর্তন</h3></div>
        <div className="form">
          <Field label="বর্তমান পাসওয়ার্ড"><input type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)"><input type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></Field>
          <div><Btn busy={busy === 'p'} onClick={() => run('p', async () => { try { await api.post('/auth/password', pw); toast.ok('পাসওয়ার্ড পরিবর্তিত'); setPw({ current: '', next: '' }); } catch (e) { toast.err(e); } })}>পরিবর্তন</Btn></div>
        </div>
      </div>
      {admin && <div className="card">
        <div className="card-h"><h3>ব্যবহারকারী</h3><p>Editor: কার্ড, বিজ্ঞাপন, শিডিউল, কর্মী সম্পাদনা। Admin: এর পাশাপাশি API সেটিংস, কর্মী মোছা, লগ পরিষ্কার, ব্যাকআপ।</p></div>
        <div className="table-wrap"><table><tbody>{(users || []).map(u => <tr key={u.id}><td><b>{u.name}</b></td><td>{u.email}</td><td><span className="badge info">{u.role}</span></td><td><button className="btn danger sm" onClick={async () => { if (confirmAsk('মুছবেন?')) { try { await api.delete(`/auth/users/${u.id}`); load(); } catch (e) { toast.err(e); } } }}>মুছুন</button></td></tr>)}</tbody></table></div>
        <div className="form" style={{ marginTop: 12 }}>
          <Field label="নাম"><input value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} /></Field>
          <Field label="ইমেইল"><input value={nu.email} onChange={e => setNu({ ...nu, email: e.target.value })} /></Field>
          <Field label="পাসওয়ার্ড"><input type="password" autoComplete="new-password" value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} /></Field>
          <Field label="রোল"><select value={nu.role} onChange={e => setNu({ ...nu, role: e.target.value })}><option value="editor">Editor</option><option value="admin">Admin</option></select></Field>
          <div><Btn busy={busy === 'u'} onClick={() => run('u', async () => { try { await api.post('/auth/users', nu); toast.ok('ব্যবহারকারী যোগ হয়েছে'); setNu({ name: '', email: '', password: '', role: 'editor' }); load(); } catch (e) { toast.err(e); } })}>যোগ করুন</Btn></div>
        </div>
      </div>}
      {admin && <div className="card">
        <div className="card-h"><h3>ব্যাকআপ ও রিস্টোর</h3><p>গোপন Token ব্যাকআপে এনক্রিপ্টেড থাকে; রিস্টোরের জন্য একই APP_KEY লাগবে। আপলোড করা ছবি (backend/uploads) আলাদাভাবে কপি রাখুন।</p></div>
        <div className="row"><Btn className="blue" busy={busy === 'b'} onClick={download}>ব্যাকআপ ডাউনলোড</Btn><label className="btn ghost">{busy === 'r' ? 'রিস্টোর হচ্ছে…' : 'ব্যাকআপ থেকে রিস্টোর'}<input type="file" accept="application/json" hidden onChange={e => restore(e.target.files[0])} /></label></div>
      </div>}
    </>
  );
}

const TABS = [['wp', 'WordPress'], ['social', 'সোশ্যাল মিডিয়া'], ['ai', 'AI প্রোভাইডার'], ['system', 'অটোমেশন ও অবস্থান'], ['users', 'ব্যবহারকারী ও ব্যাকআপ']];
export default function Settings() {
  const [tab, setTab] = useState('wp');
  return (
    <>
      <PageHead title="WordPress ও সোশ্যাল মিডিয়া API সেটিংস" desc="সব তথ্য সার্ভারের ডেটাবেজে সংরক্ষিত; Token/Password AES-256 এনক্রিপ্টেড থাকে এবং পাবলিক পেজ, লগ বা ব্রাউজারে দেখা যায় না।" />
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'wp' && <WordPress />}
      {tab === 'social' && <Channels />}
      {tab === 'ai' && <AiKeys />}
      {tab === 'system' && <System />}
      {tab === 'users' && <Users />}
    </>
  );
}
