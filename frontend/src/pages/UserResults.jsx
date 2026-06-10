import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import { formatDate, integrityBadge, integrityLabel, statusBadge, languageLabel } from '../utils';

export default function UserResults() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/attempts/mine')
      .then((res) => setAttempts(res.data.attempts))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Candidate</div>
        <h1>My results</h1>
        <div className="sub">Your past and ongoing test sessions.</div>
      </div>

      {error && <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>}

      {attempts.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">📝</div>
          You haven&apos;t taken any tests yet.
          <div style={{ marginTop: 14 }}><Link to="/dashboard" className="btn btn-primary btn-sm">Browse tests</Link></div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Test</th>
                <th>Status</th>
                <th>Integrity</th>
                <th>Flags</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => {
                const sb = statusBadge(a.status);
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.test_title}</div>
                      <div className="faint" style={{ fontSize: '0.76rem' }}>{languageLabel(a.language)}</div>
                    </td>
                    <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                    <td><span className={`badge ${integrityBadge(a.integrity_score)}`}>{a.integrity_score}% · {integrityLabel(a.integrity_score)}</span></td>
                    <td>{a.violation_count > 0 ? <span className="badge badge-red">{a.violation_count}</span> : <span className="muted">0</span>}</td>
                    <td className="muted" style={{ fontSize: '0.85rem' }}>{formatDate(a.started_at)}</td>
                    <td>
                      {a.status === 'in_progress' ? (
                        <Link to={`/test/${a.id}`} className="btn btn-primary btn-sm"><Icon name="play" size={13} /> Resume</Link>
                      ) : (
                        <Link to={`/attempt/${a.id}`} className="btn btn-ghost btn-sm">View <Icon name="arrowRight" size={13} /></Link>
                      )}
                    </td>
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
