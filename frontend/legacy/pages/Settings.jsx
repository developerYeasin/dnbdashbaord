import { useEffect, useState } from 'react';
import api from '../api.js';
import { useList, useFlash } from '../components/ui.jsx';

export default function Settings() {
  const [s, setS] = useState({});
  const [pw, setPw] = useState('');
  const { rows: groups } = useList('/ads/groups');
  const flash = useFlash();
  useEffect(() => { api.get('/settings').then(r => setS(r.data)); }, []);

  const save = async e => {
    e.preventDefault();
    try { setS((await api.put('/settings', s)).data); flash.ok('Saved'); } catch (e) { flash.err(e); }
  };
  const field = (k, l, p) => <label>{l}<input value={s[k] || ''} placeholder={p} onChange={e => setS({ ...s, [k]: e.target.value })} /></label>;
  const groupSel = (k, l) => (
    <label>{l}
      <select value={s[k] || ''} onChange={e => setS({ ...s, [k]: e.target.value })}>
        <option value="">None</option>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <h2>Settings</h2>
      <p className="sub">ব্র্যান্ড, লোকেশন (আবহাওয়া ও নামাজের সময়ের জন্য) ও ডিফল্ট বিজ্ঞাপন গ্রুপ</p>
      {flash.node}
      <form className="card form" onSubmit={save}>
        {field('brand_name', 'Brand name (on cards)')}
        {field('city', 'City', 'Dhaka')}
        {field('country', 'Country', 'Bangladesh')}
        {field('latitude', 'Latitude', '23.8103')}
        {field('longitude', 'Longitude', '90.4125')}
        {groupSel('ad_group_default', 'Default ad group (all cards)')}
        {groupSel('ad_group_news', 'Ad group — news cards')}
        {groupSel('ad_group_trigger', 'Ad group — trigger cards')}
        {groupSel('ad_group_schedule', 'Ad group — schedule cards')}
        <button>Save settings</button>
      </form>
      <form className="card form" onSubmit={async e => { e.preventDefault(); await api.post('/auth/password', { password: pw }); setPw(''); flash.ok('Password changed'); }}>
        <label>New admin password<input type="password" minLength={6} value={pw} onChange={e => setPw(e.target.value)} required /></label>
        <button>Change password</button>
      </form>
    </>
  );
}
