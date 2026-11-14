import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api.js';

export default function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const submit = async e => {
    e.preventDefault();
    try {
      const { data } = await api.post('/auth/login', f);
      localStorage.setItem('dnb_token', data.token);
      nav('/');
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <div className="login-wrap">
      <form className="card" onSubmit={submit}>
        <div className="logo">D</div>
        <h2>DashBord - dnb</h2>
        <p className="sub">লগইন করুন</p>
        {err && <div className="msg err">{err}</div>}
        <label>Email<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></label>
        <br />
        <label>Password<input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></label>
        <br />
        <button style={{ width: '100%' }}>Login</button>
      </form>
    </div>
  );
}
