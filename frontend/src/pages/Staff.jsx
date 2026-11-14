import { useEffect, useRef, useState } from 'react';
import api, { toForm, img, loadCanvasImage } from '../api.js';
import { useApi, Btn, Field, ColorField, LoadState, Modal, useToast, useAction, confirmAsk, PageHead, fmtDate, bn } from '../components/ui.jsx';
import { fontsReady, uploadFile, downloadCanvas } from '../components/cardkit.jsx';

// CR80 card (54 x 85.6 mm) portrait at 600 dpi -> 1276 x 2022 px: print-ready HD
const W = 1276, H = 2022;
const ID_DEFAULTS = {
  org: 'ডিএন বাংলা', orgSub: 'DN Bangla · www.dnbangla.com.bd', press: 'PRESS', primary: '#B20710', secondary: '#0F172A', accent: '#16763D',
  logoUrl: '', signUrl: '', signLabel: 'সম্পাদক', address: 'ঢাকা, বাংলাদেশ', contact: 'info@dnbangla.com.bd',
  backNote: 'এই কার্ডটি ডিএন বাংলার সম্পত্তি। কার্ডটি কোথাও পাওয়া গেলে অনুগ্রহ করে নিচের ঠিকানায় ফেরত দিন।',
};
const F = (w, s) => `${w} ${s}px 'Hind Siliguri'`;
function fit(ctx, text, max, size, weight) { let s = size; ctx.font = F(weight, s); while (s > 20 && ctx.measureText(text).width > max) { s -= 2; ctx.font = F(weight, s); } }

function drawFront(ctx, d, st, im) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 520); g.addColorStop(0, d.primary); g.addColorStop(1, d.secondary);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 520);
  ctx.beginPath(); ctx.moveTo(0, 520); ctx.quadraticCurveTo(W / 2, 640, W, 520); ctx.lineTo(W, 470); ctx.lineTo(0, 470); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  if (im.logo) { const h = 150, w = Math.min(700, (im.logo.width / im.logo.height) * h); ctx.drawImage(im.logo, (W - w) / 2, 70, w, h); }
  else { fit(ctx, d.org, W - 120, 120, 700); ctx.fillText(d.org, W / 2, 190); }
  fit(ctx, d.orgSub, W - 120, 44, 500); ctx.fillText(d.orgSub, W / 2, 285);
  ctx.fillStyle = '#fff'; ctx.font = F(700, 70);
  ctx.fillText(d.press, W / 2, 400);
  // photo
  const pw = 520, ph = 620, px = (W - pw) / 2, py = 560;
  ctx.fillStyle = '#fff'; ctx.fillRect(px - 14, py - 14, pw + 28, ph + 28);
  ctx.strokeStyle = d.accent; ctx.lineWidth = 10; ctx.strokeRect(px - 14, py - 14, pw + 28, ph + 28);
  if (im.photo) {
    const s = Math.max(pw / im.photo.width, ph / im.photo.height), sw = pw / s, sh = ph / s;
    ctx.drawImage(im.photo, (im.photo.width - sw) / 2, (im.photo.height - sh) / 4, sw, sh, px, py, pw, ph);
  } else { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(px, py, pw, ph); ctx.fillStyle = '#9ca3af'; ctx.font = F(600, 48); ctx.fillText('ছবি নেই', W / 2, py + ph / 2); }
  ctx.fillStyle = '#111827'; fit(ctx, st.name || 'নাম', W - 120, 92, 700); ctx.fillText(st.name || 'নাম', W / 2, 1330);
  ctx.fillStyle = d.primary; fit(ctx, st.designation || '', W - 120, 60, 600); ctx.fillText(st.designation || '', W / 2, 1415);
  ctx.fillStyle = '#4b5563'; fit(ctx, st.department || '', W - 120, 50, 500); ctx.fillText(st.department || '', W / 2, 1485);
  const rows = [['আইডি', st.staff_code], ['রক্তের গ্রুপ', st.blood_group], ['মোবাইল', st.phone], ['মেয়াদ', st.expiry ? fmtDate(st.expiry, false) : '']];
  ctx.textAlign = 'left';
  rows.forEach(([k, v], i) => {
    const y = 1590 + i * 82;
    ctx.fillStyle = '#6b7280'; ctx.font = F(500, 46); ctx.fillText(k, 170, y);
    ctx.fillStyle = '#111827'; ctx.font = F(700, 50); ctx.fillText(': ' + bn(v || '—'), 520, y);
  });
  ctx.fillStyle = d.primary; ctx.fillRect(0, H - 60, W, 60);
}

function drawBack(ctx, d, st, im) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = d.secondary; ctx.fillRect(0, 0, W, 300);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; fit(ctx, d.org, W - 120, 100, 700); ctx.fillText(d.org, W / 2, 185);
  ctx.fillStyle = '#111827'; ctx.font = F(500, 50);
  const words = d.backNote.split(/\s+/); let line = '', y = 480;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > W - 200 && line) { ctx.fillText(line, W / 2, y); y += 78; line = w; } else line = t; }
  ctx.fillText(line, W / 2, y);
  ctx.fillStyle = '#4b5563'; ctx.font = F(500, 46);
  ctx.fillText(d.address, W / 2, y + 140); ctx.fillText(d.contact, W / 2, y + 210);
  if (im.sign) { const h = 160, w = Math.min(600, (im.sign.width / im.sign.height) * h); ctx.drawImage(im.sign, (W - w) / 2, 1380, w, h); }
  ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(380, 1570); ctx.lineTo(W - 380, 1570); ctx.stroke();
  ctx.fillStyle = '#111827'; ctx.font = F(600, 48); ctx.fillText(d.signLabel, W / 2, 1640);
  ctx.fillStyle = '#6b7280'; ctx.font = F(500, 40); ctx.fillText(`আইডি: ${bn(st.staff_code || '')}`, W / 2, 1800);
  ctx.fillStyle = d.primary; ctx.fillRect(0, H - 60, W, 60);
}

function IdCard({ staff, onClose }) {
  const toast = useToast();
  const front = useRef(null), back = useRef(null);
  const { data: tpls, load } = useApi('/cards/templates?kind=idcard');
  const tpl = tpls?.find(t => t.is_default) || tpls?.[0];
  const [d, setD] = useState(ID_DEFAULTS);
  const [im, setIm] = useState({});
  useEffect(() => { if (tpl) setD({ ...ID_DEFAULTS, ...tpl.settings }); }, [tpl?.id]); // eslint-disable-line
  useEffect(() => {
    let live = true;
    (async () => {
      const out = {};
      for (const [k, src] of [['photo', staff.photo], ['logo', d.logoUrl], ['sign', d.signUrl]]) if (src) out[k] = await loadCanvasImage(src).catch(() => null);
      if (live) setIm(out);
    })();
    return () => { live = false; };
  }, [staff.photo, d.logoUrl, d.signUrl]);
  useEffect(() => {
    fontsReady().then(() => {
      for (const [ref, fn] of [[front, drawFront], [back, drawBack]]) { const c = ref.current; if (!c) continue; c.width = W; c.height = H; fn(c.getContext('2d'), d, staff, im); }
    });
  }, [d, im, staff]);
  const set = p => setD(x => ({ ...x, ...p }));
  const saveDesign = async () => { try { await api.put(`/cards/templates/${tpl.id}`, { settings: d }); toast.ok('আইডি কার্ডের ডিজাইন সংরক্ষিত'); load(); } catch (e) { toast.err(e); } };
  const up = k => async e => { try { set({ [k]: await uploadFile(e.target.files[0]) }); } catch (er) { toast.err(er); } };
  return (
    <>
      <div className="card-h"><h3>ডিজিটাল প্রেস আইডি কার্ড — {staff.name}</h3><span className="spacer" /><button className="btn ghost sm" onClick={onClose}>বন্ধ</button></div>
      <div className="split">
        <div>
          <div className="idc-wrap"><canvas ref={front} /><canvas ref={back} /></div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn blue" onClick={() => downloadCanvas(front.current, `ID-${staff.staff_code}-front.jpg`)}>সামনের দিক (HD)</button>
            <button className="btn blue" onClick={() => downloadCanvas(back.current, `ID-${staff.staff_code}-back.jpg`)}>পেছনের দিক (HD)</button>
          </div>
          <p className="small muted">CR80 মাপ (৫৪×৮৫.৬ মিমি), ৬০০ DPI — ১২৭৬×২০২২ px, প্রিন্টের উপযোগী।</p>
        </div>
        <div className="form">
          <Field label="প্রতিষ্ঠানের নাম"><input value={d.org} onChange={e => set({ org: e.target.value })} /></Field>
          <Field label="উপশিরোনাম"><input value={d.orgSub} onChange={e => set({ orgSub: e.target.value })} /></Field>
          <Field label="ব্যাজ লেখা"><input value={d.press} onChange={e => set({ press: e.target.value })} /></Field>
          <ColorField label="প্রধান রং" value={d.primary} onChange={v => set({ primary: v })} />
          <ColorField label="দ্বিতীয় রং" value={d.secondary} onChange={v => set({ secondary: v })} />
          <ColorField label="ছবির বর্ডার" value={d.accent} onChange={v => set({ accent: v })} />
          <Field label="লোগো (ঐচ্ছিক)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={up('logoUrl')} /></Field>
          <Field label="স্বাক্ষর (ঐচ্ছিক)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={up('signUrl')} /></Field>
          <Field label="স্বাক্ষরকারীর পদ"><input value={d.signLabel} onChange={e => set({ signLabel: e.target.value })} /></Field>
          <Field label="ঠিকানা"><input value={d.address} onChange={e => set({ address: e.target.value })} /></Field>
          <Field label="যোগাযোগ"><input value={d.contact} onChange={e => set({ contact: e.target.value })} /></Field>
          <Field label="পেছনের বার্তা" className="full"><textarea style={{ minHeight: 70 }} value={d.backNote} onChange={e => set({ backNote: e.target.value })} /></Field>
          <div><button className="btn green" disabled={!tpl} onClick={saveDesign}>ডিজাইন সংরক্ষণ</button></div>
        </div>
      </div>
    </>
  );
}

const EMPTY = { staff_code: '', name: '', designation: '', department: '', blood_group: '', phone: '', expiry: '', dob: '' };
export default function Staff() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [qs, setQs] = useState('');
  useEffect(() => { const t = setTimeout(() => setQs(search), 300); return () => clearTimeout(t); }, [search]);
  const { data, error, loading, load } = useApi(`/staff?q=${encodeURIComponent(qs)}`);
  const [edit, setEdit] = useState(null);
  const [card, setCard] = useState(null);
  const [busy, run] = useAction();
  const save = () => run('s', async () => {
    const { id, photoFile, photo, created_at, ...f } = edit;
    try {
      const fd = toForm({ ...f, ...(photoFile ? { photo: photoFile } : {}) });
      if (id) await api.put(`/staff/${id}`, fd); else await api.post('/staff', fd);
      toast.ok('কর্মীর তথ্য সংরক্ষিত'); setEdit(null); load();
    } catch (e) { toast.err(e); }
  });
  const del = s => run('d', async () => { if (!confirmAsk(`${s.name}-এর তথ্য মুছে ফেলবেন?`)) return; try { await api.delete(`/staff/${s.id}`); load(); toast.ok('মুছে ফেলা হয়েছে'); } catch (e) { toast.err(e); } });
  return (
    <>
      <PageHead title="কর্মী ব্যবস্থাপনা ও প্রেস আইডি কার্ড" desc="সাংবাদিক, সম্পাদক ও কর্মীদের তথ্যভান্ডার। প্রতিটি কর্মীর আইডি নম্বর অনন্য।">
        <input style={{ width: 240 }} placeholder="নাম, পদবি বা আইডি দিয়ে খুঁজুন" value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn" onClick={() => setEdit({ ...EMPTY })}>+ নতুন কর্মী</button>
      </PageHead>
      <div className="card">
        <LoadState loading={loading && !data} error={error} onRetry={load} empty={data && !data.length ? (qs ? 'কিছু পাওয়া যায়নি' : 'এখনো কোনো কর্মী নিবন্ধিত নেই') : null}>
          <div className="table-wrap"><table>
            <thead><tr><th>ছবি</th><th>নাম</th><th>আইডি</th><th>বিভাগ</th><th>রক্ত</th><th>মোবাইল</th><th>মেয়াদ</th><th></th></tr></thead>
            <tbody>{(data || []).map(s => {
              const expired = s.expiry && s.expiry < new Date().toISOString().slice(0, 10);
              return (
                <tr key={s.id}>
                  <td>{s.photo ? <img className="thumb" style={{ width: 44, height: 52 }} src={img(s.photo)} alt="" /> : <div className="thumb" style={{ width: 44, height: 52 }} />}</td>
                  <td><b>{s.name}</b><div className="small muted">{s.designation}</div></td>
                  <td className="mono">{s.staff_code}</td><td>{s.department}</td><td>{s.blood_group}</td><td>{s.phone}</td>
                  <td>{s.expiry ? <span className={`badge ${expired ? 'err' : 'ok'}`}>{fmtDate(s.expiry, false)}</span> : '—'}</td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn blue sm" onClick={() => setCard(s)}>আইডি কার্ড</button>
                    <button className="btn ghost sm" onClick={() => setEdit({ ...EMPTY, ...s, expiry: s.expiry || '', dob: s.dob || '' })}>সম্পাদনা</button>
                    <button className="btn danger sm" onClick={() => del(s)}>মুছুন</button>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </LoadState>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)}>
        {edit && <>
          <div className="card-h"><h3>{edit.id ? 'তথ্য সম্পাদনা' : 'নতুন কর্মী'}</h3></div>
          <div className="form">
            <Field label="পূর্ণ নাম *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="আইডি নম্বর * (অনন্য)"><input value={edit.staff_code} onChange={e => setEdit({ ...edit, staff_code: e.target.value })} /></Field>
            <Field label="পদবি"><input value={edit.designation} onChange={e => setEdit({ ...edit, designation: e.target.value })} /></Field>
            <Field label="বিভাগ"><input value={edit.department} onChange={e => setEdit({ ...edit, department: e.target.value })} /></Field>
            <Field label="রক্তের গ্রুপ"><select value={edit.blood_group} onChange={e => setEdit({ ...edit, blood_group: e.target.value })}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}</select></Field>
            <Field label="মোবাইল"><input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="মেয়াদ শেষ"><input type="date" value={edit.expiry} onChange={e => setEdit({ ...edit, expiry: e.target.value })} /></Field>
            <Field label="জন্মতারিখ (শুভেচ্ছা কার্ডের জন্য)"><input type="date" value={edit.dob} onChange={e => setEdit({ ...edit, dob: e.target.value })} /></Field>
            <Field label="পাসপোর্ট সাইজ ছবি" className="full"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setEdit({ ...edit, photoFile: e.target.files[0] })} /></Field>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn ghost" onClick={() => setEdit(null)}>বাতিল</button><Btn busy={busy === 's'} onClick={save}>সংরক্ষণ</Btn></div>
        </>}
      </Modal>
      <Modal open={!!card} onClose={() => setCard(null)} size="lg">{card && <IdCard staff={card} onClose={() => setCard(null)} />}</Modal>
    </>
  );
}
