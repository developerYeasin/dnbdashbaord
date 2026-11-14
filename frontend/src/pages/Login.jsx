import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { Btn, Field } from '../components/ui.jsx';

export default function Login() {
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/login', f);
      localStorage.setItem('dnb_token', data.token);
      nav('/');
    } catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand" style={{ padding: '0 0 18px', color: 'var(--text)' }}><div className="mark" style={{ boxShadow: '0 0 0 1px var(--line)' }}><b>ডিএন</b></div><div><strong>ডিএন বাংলা</strong><small>অ্যাডমিন ড্যাশবোর্ড</small></div></div>
        {err && <div className="notice err">{err}</div>}
        <div className="grid">
          <Field label="ইমেইল"><input type="email" autoComplete="username" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="পাসওয়ার্ড"><input type="password" autoComplete="current-password" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
          <Btn busy={busy} type="submit" style={{ width: '100%', padding: 11 }}>লগইন</Btn>
        </div>
      </form>
    </div>
  );
}
