import { useEffect, useState } from 'react';
import api, { img } from '../api.js';
import { Status, ImageModal, fmt, PostResults, useFlash } from '../components/ui.jsx';

const SOURCES = ['', 'wordpress', 'community', 'manual', 'schedule'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [posts, setPosts] = useState({ rows: [], pages: 1 });
  const [filter, setFilter] = useState({ source: '', status: '', page: 1 });
  const [view, setView] = useState(null);
  const flash = useFlash();

  const loadPosts = () => api.get('/posts', { params: filter }).then(r => setPosts(r.data));
  useEffect(() => { api.get('/dashboard').then(r => setStats(r.data)); }, []);
  useEffect(() => { loadPosts(); }, [filter]);

  const republish = async id => {
    try {
      const { data } = await api.post(`/posts/${id}/republish`);
      flash.ok(`Status: ${data.status}`);
      loadPosts();
    } catch (e) { flash.err(e); }
  };
  const del = async id => {
    if (!confirm('Delete this post record?')) return;
    await api.delete(`/posts/${id}`);
    loadPosts();
  };

  const max = Math.max(1, ...(stats?.last7 || []).map(d => d.c));

  return (
    <>
      <h2>DashBord</h2>
      <p className="sub">সোশ্যাল মিডিয়া ও ওয়েবসাইটের পোস্টের তালিকা বা ওভার ভিউ</p>
      {stats && (
        <div className="grid stats">
          <div className="stat"><b>{stats.totals.total || 0}</b><span>মোট পোস্ট</span></div>
          <div className="stat"><b>{stats.totals.today || 0}</b><span>আজকের পোস্ট</span></div>
          <div className="stat"><b>{stats.totals.published || 0}</b><span>সফল প্রকাশিত</span></div>
          <div className="stat"><b>{stats.totals.failed || 0}</b><span>ব্যর্থ / আংশিক</span></div>
          <div className="stat"><b>{stats.accounts}</b><span>সোশ্যাল অ্যাকাউন্ট</span></div>
          <div className="stat"><b>{stats.websites}</b><span>ওয়েবসাইট</span></div>
        </div>
      )}
      {stats && (
        <div className="grid-2">
          <div className="card">
            <b>গত ৭ দিন</b>
            {!stats.last7.length && <div className="empty">এখনো কোন পোস্ট নেই</div>}
            <div className="bars" style={{ marginTop: 16, marginBottom: 24, display: stats.last7.length ? "flex" : "none" }}>
              {stats.last7.map(d => (
                <div key={d.d} style={{ height: `${(d.c / max) * 100}%` }} title={`${d.d}: ${d.c}`}><small>{String(d.d).slice(5)}</small></div>
              ))}
            </div>
          </div>
          <div className="card">
            <b>সোর্স অনুযায়ী</b>
            {!stats.bySource.length && <div className="empty">কোন ডাটা নেই</div>}
            <table><tbody>{stats.bySource.map(s => <tr key={s.source}><td>{s.source}</td><td><b>{s.c}</b></td></tr>)}</tbody></table>
          </div>
        </div>
      )}

      <div className="card">
        {flash.node}
        <div className="row" style={{ marginBottom: 12 }}>
          <b>সকল পোস্ট</b>
          <span className="spacer" />
          <select style={{ width: 160 }} value={filter.source} onChange={e => setFilter({ ...filter, source: e.target.value, page: 1 })}>
            {SOURCES.map(s => <option key={s} value={s}>{s || 'All sources'}</option>)}
          </select>
          <select style={{ width: 160 }} value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value, page: 1 })}>
            {['', 'published', 'partial', 'failed', 'no_accounts', 'draft'].map(s => <option key={s} value={s}>{s || 'All status'}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Card</th><th>Title</th><th>Source</th><th>Status</th><th>Social</th><th>Time</th><th /></tr></thead>
            <tbody>
              {posts.rows.map(p => (
                <tr key={p.id}>
                  <td><img className="thumb" src={img(p.card_path)} onClick={() => setView(p.card_path)} alt="" /></td>
                  <td style={{ maxWidth: 360 }}>{p.title}{p.link && <div><a href={p.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#2563eb' }}>link</a></div>}</td>
                  <td>{p.source}</td>
                  <td><Status s={p.status} /></td>
                  <td><PostResults results={p.results} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt(p.created_at)}</td>
                  <td className="row">
                    <button className="sm ghost" onClick={() => republish(p.id)}>Re-post</button>
                    <a className="btn sm ghost" href={img(p.card_path)} download>⬇</a>
                    <button className="sm danger" onClick={() => del(p.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!posts.rows.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888' }}>কোন পোস্ট নেই</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="sm ghost" disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>‹ Prev</button>
          <span>{filter.page} / {posts.pages || 1}</span>
          <button className="sm ghost" disabled={filter.page >= posts.pages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next ›</button>
        </div>
      </div>
      <ImageModal src={view} onClose={() => setView(null)} />
    </>
  );
}
