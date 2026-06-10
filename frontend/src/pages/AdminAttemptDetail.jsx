import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../api';
import Icon from '../components/Icon';
import {
  formatDate, formatTime, integrityColor, integrityLabel,
  statusBadge, violationMeta, languageLabel,
} from '../utils';

export default function AdminAttemptDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/admin/attempts/${id}`)
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>;
  if (error) return <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>;

  const { attempt, violations, breakdown } = data;
  const sb = statusBadge(attempt.status);
  const score = attempt.integrity_score;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <Link to="/admin/attempts" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.88rem' }}>
        <Icon name="arrowLeft" size={15} /> Back to sessions
      </Link>

      <div className="spread wrap" style={{ gap: 16 }}>
        <div>
          <div className="eyebrow">Integrity report</div>
          <h1 style={{ fontSize: '1.5rem' }}>{attempt.candidate}</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {attempt.test_title} · {languageLabel(attempt.language)} · {attempt.candidate_email}
          </div>
        </div>
        <span className={`badge ${sb.cls}`} style={{ fontSize: '0.85rem', padding: '7px 14px' }}>{sb.label}</span>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Integrity summary */}
        <div className="card card-pad stack" style={{ gap: 18 }}>
          <h3 style={{ fontSize: '1.05rem' }}>Integrity score</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: '3rem', fontWeight: 800, color: integrityColor(score), lineHeight: 1 }}>{score}</span>
            <span className="muted">/ 100 · {integrityLabel(score)}</span>
          </div>
          <div className="meter"><span style={{ width: `${score}%`, background: integrityColor(score) }} /></div>

          <div className="row wrap" style={{ gap: 8 }}>
            {breakdown.length === 0 ? (
              <span className="badge badge-green"><Icon name="check" size={13} /> No violations detected</span>
            ) : (
              breakdown.map((b) => {
                const m = violationMeta(b.type);
                return (
                  <span key={b.type} className={`badge badge-${m.color === 'gray' ? 'gray' : m.color === 'amber' ? 'amber' : 'red'}`}>
                    <Icon name={m.icon} size={12} /> {m.label} · {b.count}
                  </span>
                );
              })
            )}
          </div>

          <div className="row wrap" style={{ gap: 24, fontSize: '0.85rem', color: 'var(--text-soft)' }}>
            <div>
              <div className="faint" style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Started</div>
              <div style={{ marginTop: 2 }}>{formatDate(attempt.started_at)}</div>
            </div>
            <div>
              <div className="faint" style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submitted</div>
              <div style={{ marginTop: 2 }}>{formatDate(attempt.submitted_at)}</div>
            </div>
            <div>
              <div className="faint" style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total flags</div>
              <div style={{ marginTop: 2 }}>{violations.length}</div>
            </div>
          </div>
        </div>

        {/* Violation timeline */}
        <div className="card card-pad stack" style={{ gap: 14 }}>
          <h3 style={{ fontSize: '1.05rem' }}>Violation timeline</h3>
          {violations.length === 0 ? (
            <div className="empty" style={{ padding: '28px 0' }}>
              <div className="empty-icon">✅</div>
              Clean session — no suspicious activity recorded.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {violations.map((v) => {
                const m = violationMeta(v.type);
                const color = v.severity === 'high' ? 'var(--danger)' : v.severity === 'medium' ? 'var(--warning)' : 'var(--text-faint)';
                return (
                  <div key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid var(--border)', color }}>
                      <Icon name={m.icon} size={15} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="spread">
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.label}</span>
                        <span className="faint mono" style={{ fontSize: '0.76rem' }}>{formatTime(v.created_at)}</span>
                      </div>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>{v.details}</div>
                    </div>
                    <span className="badge" style={{ background: 'transparent', color, fontSize: '0.7rem', textTransform: 'uppercase' }}>{v.severity}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Submitted code */}
      <div className="card">
        <div className="spread" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.05rem' }}>Submitted solution</h3>
          <span className="badge badge-indigo">{languageLabel(attempt.language)}</span>
        </div>
        <pre className="mono" style={{ margin: 0, padding: 20, background: '#0f1117', color: '#e7e9f2', overflowX: 'auto', fontSize: '0.85rem', lineHeight: 1.6, borderRadius: '0 0 var(--radius) var(--radius)' }}>
          {attempt.code?.trim() ? attempt.code : '// (no code submitted)'}
        </pre>
      </div>

      {/* Problem reference */}
      <details className="card card-pad">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>View problem statement</summary>
        <div className="prose" style={{ marginTop: 14 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{attempt.test_description || '_No description_'}</ReactMarkdown>
        </div>
      </details>
    </div>
  );
}
