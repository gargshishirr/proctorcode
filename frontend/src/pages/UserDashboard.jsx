import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { languageLabel } from '../utils';

const rules = [
  { icon: 'camera', text: 'Your webcam stays on for AI face & gaze monitoring.' },
  { icon: 'monitor', text: 'Switching tabs, windows or leaving fullscreen is recorded.' },
  { icon: 'clipboard', text: 'Copy, cut and paste actions are flagged.' },
  { icon: 'gauge', text: 'Each flag lowers your live integrity score.' },
];

export default function UserDashboard() {
  const [tests, setTests] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [consentTest, setConsentTest] = useState(null);
  const [starting, setStarting] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get('/tests'), api.get('/attempts/mine')])
      .then(([t, m]) => {
        setTests(t.data.tests);
        setMine(m.data.attempts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const latestByTest = useMemo(() => {
    const map = {};
    for (const a of mine) {
      // attempts are newest-first; keep the first seen per test
      if (!map[a.test_id]) map[a.test_id] = a;
    }
    return map;
  }, [mine]);

  const begin = async () => {
    setStarting(true);
    try {
      const res = await api.post('/attempts', { test_id: consentTest.id });
      navigate(`/test/${res.data.attempt.id}`);
    } catch (e) {
      toast.error(e.message);
      setStarting(false);
      setConsentTest(null);
    }
  };

  if (loading) return <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Candidate</div>
        <h1>Available tests</h1>
        <div className="sub">Choose an assessment to begin. Each test is proctored in real time.</div>
      </div>

      {error && <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>}

      {tests.length === 0 ? (
        <div className="card empty"><div className="empty-icon">🗂️</div> No tests are available right now. Check back later.</div>
      ) : (
        <div className="grid-3">
          {tests.map((t) => {
            const prev = latestByTest[t.id];
            const inProgress = prev?.status === 'in_progress';
            return (
              <div className="card card-pad card-hover stack" key={t.id} style={{ gap: 14 }}>
                <div className="spread">
                  <span className="badge badge-indigo">{languageLabel(t.language)}</span>
                  <span className="muted" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={14} /> {t.duration_minutes} min
                  </span>
                </div>
                <div>
                  <h3 style={{ fontSize: '1.12rem' }}>{t.title}</h3>
                  <p className="muted" style={{ fontSize: '0.85rem', marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {(t.description || 'No description provided.').replace(/[#*`>]/g, '').slice(0, 120)}
                  </p>
                </div>
                {prev && (
                  <div className={`badge ${inProgress ? 'badge-amber' : 'badge-green'}`} style={{ alignSelf: 'flex-start' }}>
                    {inProgress ? 'In progress' : `Last score: ${prev.integrity_score}%`}
                  </div>
                )}
                <hr className="hr" />
                <div className="row" style={{ gap: 8 }}>
                  {inProgress ? (
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/test/${prev.id}`)}>
                      <Icon name="play" size={14} /> Resume
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => setConsentTest(t)}>
                      <Icon name="play" size={14} /> Start test
                    </button>
                  )}
                  {prev && prev.status !== 'in_progress' && (
                    <Link to={`/attempt/${prev.id}`} className="btn btn-ghost btn-sm">View result</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {consentTest && (
        <Modal
          title="Before you begin"
          subtitle={`${consentTest.title} · ${consentTest.duration_minutes} minutes`}
          onClose={() => !starting && setConsentTest(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConsentTest(null)} disabled={starting}>Cancel</button>
              <button className="btn btn-primary" onClick={begin} disabled={starting}>
                {starting ? <span className="spinner" /> : <Icon name="shield" size={16} />}
                I understand, start
              </button>
            </>
          }
        >
          <div className="stack" style={{ gap: 14 }}>
            <div className="alert alert-warn">
              <Icon name="alert" size={16} />
              This is a proctored assessment. Please ensure you are alone in a well-lit room with your camera enabled.
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {rules.map((r) => (
                <div key={r.text} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary-soft)', color: 'var(--primary-700)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name={r.icon} size={15} />
                  </span>
                  <span style={{ fontSize: '0.9rem' }}>{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
