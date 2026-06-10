import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import { formatDate, integrityBadge, integrityLabel, statusBadge, languageLabel } from '../utils';

export default function AdminSessions() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all | flagged | submitted | in_progress

  useEffect(() => {
    api.get('/admin/attempts')
      .then((res) => setAttempts(res.data.attempts))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return attempts.filter((a) => {
      if (filter === 'flagged' && a.violation_count === 0) return false;
      if (filter === 'submitted' && a.status !== 'submitted') return false;
      if (filter === 'in_progress' && a.status !== 'in_progress') return false;
      if (q) {
        const hay = `${a.candidate} ${a.candidate_email} ${a.test_title}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [attempts, q, filter]);

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'flagged', label: 'Flagged' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'in_progress', label: 'In progress' },
  ];

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Administrator</div>
        <h1>Sessions</h1>
        <div className="sub">Review every candidate session and its integrity report.</div>
      </div>

      <div className="spread wrap" style={{ gap: 12 }}>
        <div className="role-toggle" style={{ display: 'inline-flex', gridTemplateColumns: 'unset' }}>
          {filters.map((f) => (
            <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)} style={{ padding: '8px 16px' }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', minWidth: 260 }}>
          <input className="input" placeholder="Search candidate or test…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}>
            <Icon name="list" size={15} />
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>}

      {loading ? (
        <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty"><div className="empty-icon">🔍</div> No sessions match your filters.</div>
      ) : (
        <div className="table-wrap">
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
              {filtered.map((a) => {
                const sb = statusBadge(a.status);
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.candidate}</div>
                      <div className="faint" style={{ fontSize: '0.78rem' }}>{a.candidate_email}</div>
                    </td>
                    <td>
                      {a.test_title}
                      <div className="faint" style={{ fontSize: '0.76rem' }}>{languageLabel(a.language)}</div>
                    </td>
                    <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                    <td>
                      <span className={`badge ${integrityBadge(a.integrity_score)}`}>{a.integrity_score}% · {integrityLabel(a.integrity_score)}</span>
                    </td>
                    <td>{a.violation_count > 0 ? <span className="badge badge-red">{a.violation_count}</span> : <span className="muted">0</span>}</td>
                    <td className="muted" style={{ fontSize: '0.85rem' }}>{formatDate(a.started_at)}</td>
                    <td><Link to={`/admin/attempts/${a.id}`} className="btn btn-ghost btn-sm">Report <Icon name="arrowRight" size={13} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
