import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useOnline, Spin } from './components/ui.jsx';
import Login from './pages/Login.jsx';

// Each page is its own chunk; switching menus never reloads the app
const Overview = lazy(() => import('./pages/Overview.jsx'));
const MainCard = lazy(() => import('./pages/MainCard.jsx'));
const TextCard = lazy(() => import('./pages/TextCard.jsx'));
const OpeningCard = lazy(() => import('./pages/OpeningCard.jsx'));
const Ads = lazy(() => import('./pages/Ads.jsx'));
const Scheduler = lazy(() => import('./pages/Scheduler.jsx'));
const Staff = lazy(() => import('./pages/Staff.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Logs = lazy(() => import('./pages/Logs.jsx'));
const AiNews = lazy(() => import('./pages/AiNews.jsx'));

const MENU = [
  ['মূল মেনু', [
    ['/', 'ওভারভিউ ড্যাশবোর্ড', Overview],
    ['/photocard', 'ফটোকার্ড জেনারেটর', MainCard],
    ['/text-card', 'টেক্সট ও ট্রিগার ফটোকার্ড', TextCard],
    ['/opening-card', 'অপেনিং ফটোকার্ড', OpeningCard],
    ['/ads', 'বিজ্ঞাপন ম্যানেজার', Ads],
    ['/scheduler', 'দৈনিক অটো শিডিউলার', Scheduler],
    ['/staff', 'কর্মী ও প্রেস আইডি কার্ড', Staff],
    ['/settings', 'WordPress ও সোশ্যাল API সেটিংস', Settings],
    ['/logs', 'লাইভ সিস্টেম লগস', Logs],
  ]],
  ['এআই নিউজ', [
    ['/ai-news', 'এআই নিউজ ও পাবলিশার হাব', AiNews],
  ]],
];
const ALL = MENU.flatMap(([, items]) => items);
const bnNum = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);

function useTheme() {
  const [t, setT] = useState(() => { try { return localStorage.getItem('dnb_theme') || 'dark'; } catch { return 'dark'; } });
  useEffect(() => { document.documentElement.dataset.theme = t; try { localStorage.setItem('dnb_theme', t); } catch { /* ignore */ } }, [t]);
  return [t, setT];
}

function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const online = useOnline();
  useEffect(() => setOpen(false), [loc.pathname]);
  const cur = ALL.find(([p]) => p === loc.pathname);
  useEffect(() => { document.title = `${cur?.[1] || 'ড্যাশবোর্ড'} · ডিএন বাংলা`; }, [cur]);
  let i = 0;
  return (
    <div className="layout">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><div className="mark"><b>ডিএন</b></div><div><strong>ডিএন বাংলা</strong><small>নিউজরুম কন্ট্রোল প্যানেল</small></div></div>
        <nav className="nav-scroll">
          {MENU.map(([g, items]) => (
            <div key={g}>
              <div className="nav-label">{g}</div>
              {items.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className="nav"><span className="num">{bnNum(++i)}</span>{label}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button className="btn ghost sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ লাইট থিম' : '☾ ডার্ক থিম'}</button>
          <button className="btn danger sm" onClick={() => { localStorage.removeItem('dnb_token'); nav('/login'); }}>লগআউট</button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <main className="main">
        {!online && <div className="offline">ইন্টারনেট সংযোগ বিচ্ছিন্ন — সংযোগ ফিরলে আবার চেষ্টা করুন</div>}
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setOpen(!open)} aria-label="মেনু">☰</button>
          <h1>{cur?.[1] || 'ড্যাশবোর্ড'}</h1>
          <span className="spacer" />
          <a className="btn ghost sm" href="https://www.dnbangla.com.bd" target="_blank" rel="noreferrer">ওয়েবসাইট ↗</a>
        </header>
        <div className="content">
          <Suspense fallback={<div className="empty"><Spin /> লোড হচ্ছে…</div>}>
            <Routes>
              {ALL.map(([p, , C]) => <Route key={p} path={p} element={<C />} />)}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  useTheme();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={localStorage.getItem('dnb_token') ? <Layout /> : <Navigate to="/login" />} />
    </Routes>
  );
}
