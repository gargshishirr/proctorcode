import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import { formatDate, integrityBadge, integrityLabel, statusBadge } from '../utils';

const statCards = [
  { key: 'activeTests', label: 'Active tests', icon: 'file', bg: 'var(--primary-soft)', fg: 'var(--primary-700)' },
  { key: 'candidates', label: 'Candidates', icon: 'users', bg: 'var(--success-soft)', fg: 'var(--success)' },
  { key: 'attempts', label: 'Total sessions', icon: 'list', bg: '#eef0f4', fg: 'var(--text-soft)' },
  { key: 'flagged', label: 'Flagged sessions', icon: 'alert', bg: 'var(--danger-soft)', fg: 'var(--danger)' },
];

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/admin/stats'), api.get('/admin/attempts')])
      .then(([s, a]) => {
        setStats(s.data.stats);
        setRecent(a.data.attempts.slice(0, 6));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>;
  if (error) return <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div className="eyebrow">Administrator</div>
        <h1>Overview</h1>
        <div className="sub">Monitor assessment activity and candidate integrity at a glance.</div>
      </div>

      <div className="stat-grid">
        {statCards.map((c) => (
          <div className="card stat" key={c.key}>
            <div className="stat-label">
              <span className="stat-icon" style={{ background: c.bg, color: c.fg }}>
                <Icon name={c.icon} size={17} />
              </span>
              {c.label}
            </div>
            <div className="stat-value">{stats?.[c.key] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.05rem' }}>Recent sessions</h3>
          <Link to="/admin/attempts" className="btn btn-ghost btn-sm">
            View all <Icon name="arrowRight" size={14} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            No test sessions yet. Sessions appear here once candidates start tests.
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Test</th>
                  <th>Status</th>
                  <th>Integrity</th>
                  <th>Flags</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => {
                  const sb = statusBadge(a.status);
                  return (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.candidate}</div>
                        <div className="faint" style={{ fontSize: '0.78rem' }}>{a.candidate_email}</div>
                      </td>
                      <td>{a.test_title}</td>
                      <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                      <td>
                        <span className={`badge ${integrityBadge(a.integrity_score)}`}>
                          {a.integrity_score}% · {integrityLabel(a.integrity_score)}
                        </span>
                      </td>
                      <td>{a.violation_count > 0 ? <span className="badge badge-red">{a.violation_count}</span> : <span className="muted">0</span>}</td>
                      <td className="muted" style={{ fontSize: '0.85rem' }}>{formatDate(a.started_at)}</td>
                      <td>
                        <Link to={`/admin/attempts/${a.id}`} className="btn btn-ghost btn-sm">Report</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
