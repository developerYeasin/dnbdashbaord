import { useState } from 'react';
import api, { img, toForm } from '../api.js';
import { useList, useFlash } from '../components/ui.jsx';

const FIELDS = [
  ['employee_id', 'Employee ID'], ['name', 'Name (English)'], ['name_bn', 'নাম (বাংলা)'], ['designation', 'Designation'],
  ['department', 'Department'], ['phone', 'Phone'], ['email', 'Email'], ['blood_group', 'Blood group'],
  ['nid', 'NID'], ['dob', 'Date of birth', 'date'], ['join_date', 'Join date', 'date'],
];
const EMPTY = Object.fromEntries([...FIELDS.map(f => [f[0], '']), ['address', ''], ['photo', null]]);

export default function Members() {
  const { rows, load } = useList('/members');
  const { rows: tpls } = useList('/templates?type=idcard');
  const [f, setF] = useState(EMPTY);
  const [tpl, setTpl] = useState('');
  const [card, setCard] = useState(null);
  const [search, setSearch] = useState('');
  const flash = useFlash();

  const save = async e => {
    e.preventDefault();
    try {
      const data = { ...f };
      if (!(data.photo instanceof File)) delete data.photo;
      delete data.created_at;
      f.id ? await api.put(`/members/${f.id}`, toForm(data)) : await api.post('/members', toForm(data));
      setF(EMPTY);
      e.target.reset();
      flash.ok('Saved');
      load();
    } catch (e) { flash.err(e); }
  };
  const showCard = async (m, download) => {
    const r = await api.get(`/members/${m.id}/idcard`, { params: { template_id: tpl || undefined }, responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    if (download) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `idcard-${m.employee_id || m.id}.png`;
      a.click();
    } else setCard(url);
  };
  const del = async id => { if (confirm('Delete member?')) { await api.delete(`/members/${id}`); load(); } };
  const list = rows.filter(m => !search || JSON.stringify(m).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <h2>ID card / members list</h2>
      <p className="sub">প্রতিষ্ঠানে কর্মরত সকলের বিস্তারিত তথ্য ভান্ডার ও প্রত্যেকের অটো আইডি কার্ড তৈরির অপশন — কাস্টম ডিজাইনের (Templates → idcard)</p>
      {flash.node}
      <form className="card form" onSubmit={save}>
        {FIELDS.map(([k, l, t]) => (
          <label key={k}>{l}<input type={t || 'text'} value={f[k] ? String(f[k]).slice(0, t === 'date' ? 10 : undefined) : ''} onChange={e => setF({ ...f, [k]: e.target.value })} required={k === 'name'} /></label>
        ))}
        <label>Photo<input type="file" accept="image/*" onChange={e => setF({ ...f, photo: e.target.files[0] })} /></label>
        <label className="full">Address<input value={f.address || ''} onChange={e => setF({ ...f, address: e.target.value })} /></label>
        <div className="row full">
          <span className="spacer" />
          {f.id && <button type="button" className="ghost" onClick={() => setF(EMPTY)}>Cancel</button>}
          <button>{f.id ? 'Update member' : '+ Add member'}</button>
        </div>
      </form>
      <div className="grid-2">
        <div className="card table-wrap">
          <div className="row" style={{ marginBottom: 10 }}>
            <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
            <span className="spacer" />
            <select value={tpl} onChange={e => setTpl(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Default ID design</option>
              {tpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <table>
            <thead><tr><th /><th>ID</th><th>Name</th><th>Designation</th><th>Phone</th><th>Blood</th><th /></tr></thead>
            <tbody>
              {list.map(m => (
                <tr key={m.id}>
                  <td>{m.photo ? <img className="thumb" style={{ width: 44, height: 44, borderRadius: '50%' }} src={img(m.photo)} alt="" /> : null}</td>
                  <td>{m.employee_id}</td>
                  <td><b>{m.name}</b><br /><small>{m.name_bn}</small></td>
                  <td>{m.designation}<br /><small>{m.department}</small></td>
                  <td>{m.phone}</td><td>{m.blood_group}</td>
                  <td className="row">
                    <button className="sm ghost" onClick={() => showCard(m)}>ID card</button>
                    <button className="sm ghost" onClick={() => showCard(m, true)}>⬇</button>
                    <button className="sm ghost" onClick={() => setF({ ...EMPTY, ...m, photo: null })}>Edit</button>
                    <button className="sm danger" onClick={() => del(m.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <b>ID card preview</b>
          {card ? <img className="preview" style={{ maxWidth: 320, display: 'block', marginTop: 10 }} src={card} alt="" /> : <p className="sub">ID card বাটনে ক্লিক করুন</p>}
        </div>
      </div>
    </>
  );
}
