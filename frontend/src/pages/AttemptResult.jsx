import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import {
  formatDate, formatTime, integrityColor, integrityLabel,
  statusBadge, violationMeta, languageLabel,
} from '../utils';

export default function AttemptResult() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/attempts/${id}`)
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>;
  if (error) return <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>;

  const { attempt, test, violations } = data;
  const sb = statusBadge(attempt.status);
  const score = attempt.integrity_score;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <Link to="/results" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.88rem' }}>
        <Icon name="arrowLeft" size={15} /> Back to my results
      </Link>

      <div className="spread wrap" style={{ gap: 16 }}>
        <div>
          <div className="eyebrow">Result</div>
          <h1 style={{ fontSize: '1.5rem' }}>{test.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{languageLabel(test.language)} · Submitted {formatDate(attempt.submitted_at)}</div>
        </div>
        <span className={`badge ${sb.cls}`} style={{ fontSize: '0.85rem', padding: '7px 14px' }}>{sb.label}</span>
      </div>

      {attempt.status === 'terminated' && (
        <div className="alert alert-error">
          <Icon name="alert" size={16} />
          This session was automatically terminated due to repeated integrity violations.
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad stack" style={{ gap: 16 }}>
          <h3 style={{ fontSize: '1.05rem' }}>Your integrity score</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: '3rem', fontWeight: 800, color: integrityColor(score), lineHeight: 1 }}>{score}</span>
            <span className="muted">/ 100 · {integrityLabel(score)}</span>
          </div>
          <div className="meter"><span style={{ width: `${score}%`, background: integrityColor(score) }} /></div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {violations.length === 0
              ? 'Great — no suspicious activity was recorded during your session.'
              : `${violations.length} proctoring flag${violations.length > 1 ? 's were' : ' was'} recorded during your session.`}
          </p>
        </div>

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <h3 style={{ fontSize: '1.05rem' }}>Activity log</h3>
          {violations.length === 0 ? (
            <div className="empty" style={{ padding: '24px 0' }}><div className="empty-icon">✅</div> Clean session</div>
          ) : (
            <div className="stack" style={{ gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {violations.map((v) => {
                const m = violationMeta(v.type);
                const color = v.severity === 'high' ? 'var(--danger)' : v.severity === 'medium' ? 'var(--warning)' : 'var(--text-faint)';
                return (
                  <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 11px', background: 'var(--surface-2)', borderRadius: 9 }}>
                    <span style={{ color }}><Icon name={m.icon} size={15} /></span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.label}</span>
                    <span className="faint mono" style={{ fontSize: '0.74rem', marginLeft: 'auto' }}>{formatTime(v.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.05rem' }}>Your submission</h3>
          <span className="badge badge-indigo">{languageLabel(test.language)}</span>
        </div>
        <pre className="mono" style={{ margin: 0, padding: 20, background: '#0f1117', color: '#e7e9f2', overflowX: 'auto', fontSize: '0.85rem', lineHeight: 1.6, borderRadius: '0 0 var(--radius) var(--radius)' }}>
          {attempt.code?.trim() ? attempt.code : '// (no code submitted)'}
        </pre>
      </div>
    </div>
  );
}
