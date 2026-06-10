import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../api';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import WebcamProctor from '../components/WebcamProctor';
import useProctoring, { enterFullscreen, exitFullscreen } from '../hooks/useProctoring';
import { useToast } from '../context/ToastContext';
import { integrityColor, violationMeta, languageLabel } from '../utils';

const MONACO_LANG = {
  javascript: 'javascript', typescript: 'typescript', python: 'python', java: 'java',
  cpp: 'cpp', c: 'c', csharp: 'csharp', go: 'go', ruby: 'ruby', rust: 'rust',
};

function fmtClock(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function TakeTest() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [test, setTest] = useState(null);
  const [entered, setEntered] = useState(false);
  const [code, setCode] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const [log, setLog] = useState([]);
  const [camStatus, setCamStatus] = useState('loading');
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [runOutput, setRunOutput] = useState(null);
  const [running, setRunning] = useState(false);

  const codeRef = useRef('');
  const endRef = useRef(0);
  const autosaveRef = useRef(null);
  const finishedRef = useRef(false);

  // ---- Load attempt ----
  useEffect(() => {
    api.get(`/attempts/${attemptId}`)
      .then((res) => {
        const { attempt, test } = res.data;
        if (attempt.status !== 'in_progress') {
          navigate(`/attempt/${attempt.id}`, { replace: true });
          return;
        }
        setTest(test);
        setCode(attempt.code || '');
        codeRef.current = attempt.code || '';
        setIntegrity(attempt.integrity_score);
        const end = new Date(attempt.started_at).getTime() + test.duration_minutes * 60000;
        endRef.current = end;
        setRemaining(Math.max(0, Math.round((end - Date.now()) / 1000)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [attemptId, navigate]);

  // ---- Finalize (submit or terminate) ----
  const finalize = useCallback(
    async (terminated, reason) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setSubmitting(true);
      try {
        await api.post(`/attempts/${attemptId}/submit`, { code: codeRef.current, terminated });
      } catch {
        /* best effort */
      }
      await exitFullscreen();
      if (terminated) toast.error(reason || 'Session terminated');
      else toast.success('Test submitted successfully');
      navigate(`/attempt/${attemptId}`, { replace: true });
    },
    [attemptId, navigate, toast]
  );

  // ---- Violation handler (shared by behavioural + webcam proctors) ----
  const handleViolation = useCallback(
    (type, severity, details) => {
      if (finishedRef.current) return;
      const meta = violationMeta(type);
      setLog((l) => [{ id: Date.now() + Math.random(), type, severity, details, time: new Date(), label: meta.label, icon: meta.icon }, ...l].slice(0, 60));
      api.post(`/attempts/${attemptId}/violations`, { type, severity, details })
        .then((res) => {
          const score = res.data.integrity_score;
          setIntegrity(score);
          if (score <= 0) finalize(true, 'Terminated: integrity score reached zero');
        })
        .catch(() => {});
      if (type !== 'looking_away' && type !== 'right_click') {
        toast.warn(`${meta.label} detected`, 2500);
      }
    },
    [attemptId, finalize, toast]
  );

  useProctoring(entered && !finishedRef.current, handleViolation);

  // ---- Timer ----
  useEffect(() => {
    if (!entered) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        finalize(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [entered, finalize]);

  // ---- Warn on accidental close ----
  useEffect(() => {
    if (!entered) return;
    const handler = (e) => {
      if (finishedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [entered]);

  // ---- Code autosave (debounced) ----
  const onChangeCode = (value) => {
    const v = value ?? '';
    setCode(v);
    codeRef.current = v;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      api.put(`/attempts/${attemptId}/code`, { code: codeRef.current }).catch(() => {});
    }, 1500);
  };

  // ---- Begin (user gesture: fullscreen + camera) ----
  const begin = async () => {
    await enterFullscreen();
    setEntered(true);
    setLog([{ id: 'start', type: 'info', severity: 'low', details: 'Proctoring active — stay in fullscreen and keep your face visible.', time: new Date(), label: 'Session started', icon: 'shield' }]);
  };

  // ---- Run JavaScript in a sandboxed worker ----
  const runCode = () => {
    const lang = test.language;
    if (lang !== 'javascript' && lang !== 'typescript') {
      setRunOutput([{ kind: 'warn', text: `Running ${languageLabel(lang)} is not available in this environment. Your code will be reviewed after submission.` }]);
      return;
    }
    setRunning(true);
    setRunOutput([]);
    const src = `
      const logs = [];
      const send = (kind) => (...args) => self.postMessage({ kind, text: args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return String(a); } }).join(' ') });
      console.log = send('log'); console.info = send('log'); console.warn = send('warn'); console.error = send('error');
      try { ${codeRef.current}\n self.postMessage({ kind: 'done' }); }
      catch (e) { self.postMessage({ kind: 'error', text: e.message }); self.postMessage({ kind: 'done' }); }
    `;
    let worker;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    } catch {
      setRunOutput([{ kind: 'error', text: 'Unable to start the sandbox.' }]);
      setRunning(false);
      return;
    }
    const out = [];
    const timeout = setTimeout(() => {
      worker.terminate();
      setRunOutput([...out, { kind: 'error', text: 'Execution timed out (3s).' }]);
      setRunning(false);
    }, 3000);
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.kind === 'done') {
        clearTimeout(timeout);
        worker.terminate();
        setRunOutput(out.length ? [...out] : [{ kind: 'log', text: '✓ Ran with no output. Call console.log(...) to print.' }]);
        setRunning(false);
      } else {
        out.push(d);
        setRunOutput([...out]);
      }
    };
  };

  if (loading) return <div className="exam" style={{ display: 'grid', placeItems: 'center' }}><div className="spinner" style={{ width: 30, height: 30 }} /></div>;
  if (error) return (
    <div className="exam" style={{ display: 'grid', placeItems: 'center' }}>
      <div className="card card-pad" style={{ maxWidth: 420, textAlign: 'center' }}>
        <Icon name="alert" size={28} style={{ color: 'var(--danger)' }} />
        <h3 style={{ margin: '12px 0' }}>Could not load test</h3>
        <p className="muted">{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
      </div>
    </div>
  );

  // ---- Lobby (pre-entry) ----
  if (!entered) {
    return (
      <div className="exam" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card card-pad" style={{ maxWidth: 480, textAlign: 'center', background: '#171a23', border: '1px solid #262a38', color: '#e7e9f2' }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--primary), var(--violet))' }}>
            <Icon name="shield" size={28} color="#fff" />
          </span>
          <h2 style={{ color: '#fff' }}>{test.title}</h2>
          <p style={{ color: '#9aa0b4', marginTop: 8 }}>
            {languageLabel(test.language)} · {test.duration_minutes} minutes
          </p>
          <div style={{ textAlign: 'left', background: '#12141c', border: '1px solid #262a38', borderRadius: 12, padding: 16, margin: '18px 0', fontSize: '0.88rem', color: '#cdd2e1' }}>
            <div style={{ display: 'flex', gap: 9, marginBottom: 9 }}><Icon name="camera" size={16} color="#a5b4fc" /> Camera turns on for AI face &amp; gaze tracking.</div>
            <div style={{ display: 'flex', gap: 9, marginBottom: 9 }}><Icon name="maximize" size={16} color="#a5b4fc" /> The test runs in fullscreen. Leaving it is flagged.</div>
            <div style={{ display: 'flex', gap: 9 }}><Icon name="gauge" size={16} color="#a5b4fc" /> Tab switches, copy/paste &amp; more lower your score.</div>
          </div>
          <button className="btn btn-primary btn-lg btn-block" onClick={begin}>
            <Icon name="play" size={17} /> Begin test in fullscreen
          </button>
          <button className="btn btn-block btn-sm" style={{ marginTop: 10, color: '#9aa0b4', background: 'transparent' }} onClick={() => navigate('/dashboard')}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const timerCls = remaining <= 30 ? 'crit' : remaining <= 120 ? 'warn' : '';
  const canRun = test.language === 'javascript' || test.language === 'typescript';

  return (
    <div className="exam">
      {/* Top bar */}
      <div className="exam-bar">
        <div className="title">
          <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--primary), var(--violet))' }}>
            <Icon name="shield" size={15} color="#fff" />
          </span>
          {test.title}
          <span className="chip chip-gray" style={{ marginLeft: 4 }}>{languageLabel(test.language)}</span>
        </div>
        <div className="exam-meta">
          <div className="integrity-ring" title="Live integrity score">
            <Icon name="gauge" size={16} color={integrityColor(integrity)} />
            <div style={{ width: 120 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#9aa0b4', marginBottom: 3 }}>
                <span>Integrity</span><span style={{ color: integrityColor(integrity), fontWeight: 700 }}>{integrity}%</span>
              </div>
              <div className="meter" style={{ background: '#262a38' }}><span style={{ width: `${integrity}%`, background: integrityColor(integrity) }} /></div>
            </div>
          </div>
          <div className={`timer ${timerCls}`}>
            <Icon name="clock" size={16} /> {fmtClock(remaining)}
          </div>
          <button className="btn btn-success btn-sm" onClick={() => setConfirmSubmit(true)} disabled={submitting}>
            <Icon name="send" size={14} /> Submit
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="exam-body">
        {/* Left: proctor + problem */}
        <div className="exam-left">
          <div style={{ padding: 16, borderBottom: '1px solid #262a38' }}>
            <div className="proctor">
              <WebcamProctor active={entered} onViolation={handleViolation} onStatusChange={setCamStatus} />
            </div>
          </div>
          <div className="scroll">
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{test.description || '_No problem statement provided._'}</ReactMarkdown>
            </div>

            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9aa0b4', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                <Icon name="list" size={14} /> Activity monitor
              </div>
              <div className="proctor-log">
                {log.map((l) => {
                  const color = l.severity === 'high' ? '#fca5a5' : l.severity === 'medium' ? '#fcd34d' : '#9aa0b4';
                  return (
                    <div className="log-item" key={l.id}>
                      <span style={{ color }}><Icon name={l.icon} size={14} /></span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#cdd2e1', fontWeight: 600 }}>{l.label}</div>
                        <div style={{ color: '#7d8395' }}>{l.details}</div>
                      </div>
                      <span className="lt">{l.time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: editor */}
        <div className="exam-right">
          <div className="editor-head">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="code" size={14} /> solution.{({ javascript: 'js', typescript: 'ts', python: 'py', java: 'java', cpp: 'cpp', c: 'c', csharp: 'cs', go: 'go', ruby: 'rb', rust: 'rs' }[test.language]) || 'txt'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rec-dot" /> Recording
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <Editor
              height="100%"
              language={MONACO_LANG[test.language] || 'plaintext'}
              theme="vs-dark"
              value={code}
              onChange={onChangeCode}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                contextmenu: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 14 },
                smoothScrolling: true,
                tabSize: 2,
              }}
            />
          </div>

          {runOutput !== null && (
            <div style={{ flexShrink: 0, maxHeight: 180, overflowY: 'auto', background: '#0b0d13', borderTop: '1px solid #262a38', padding: '10px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7180', marginBottom: 6 }}>
                <span>CONSOLE</span>
                <button onClick={() => setRunOutput(null)} style={{ background: 'none', border: 'none', color: '#6b7180', cursor: 'pointer' }}><Icon name="x" size={13} /></button>
              </div>
              {running && <div style={{ color: '#9aa0b4' }}>Running…</div>}
              {runOutput.map((o, i) => (
                <div key={i} style={{ color: o.kind === 'error' ? '#fca5a5' : o.kind === 'warn' ? '#fcd34d' : '#cdd2e1', whiteSpace: 'pre-wrap' }}>{o.text}</div>
              ))}
            </div>
          )}

          <div className="editor-foot">
            <span style={{ fontSize: '0.78rem', color: camStatus === 'ok' ? '#86efac' : '#9aa0b4', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="dot" style={{ background: camStatus === 'ok' ? '#22c55e' : '#9aa0b4' }} />
              {camStatus === 'ok' ? 'Proctoring nominal' : 'Proctoring attention'}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={runCode} disabled={running} title={canRun ? 'Run code' : 'Run not available for this language'}>
                <Icon name="play" size={14} /> Run
              </button>
              <button className="btn btn-success btn-sm" onClick={() => setConfirmSubmit(true)} disabled={submitting}>
                <Icon name="send" size={14} /> Submit test
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmSubmit && (
        <Modal
          title="Submit your test?"
          subtitle="You won't be able to make changes after submitting."
          onClose={() => !submitting && setConfirmSubmit(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)} disabled={submitting}>Keep working</button>
              <button className="btn btn-success" onClick={() => finalize(false)} disabled={submitting}>
                {submitting ? <span className="spinner" /> : <Icon name="check" size={16} />} Submit now
              </button>
            </>
          }
        >
          <div className="stack" style={{ gap: 10 }}>
            <div className="spread"><span className="muted">Final integrity score</span><span className="badge" style={{ background: 'transparent', color: integrityColor(integrity), border: `1px solid ${integrityColor(integrity)}` }}>{integrity}%</span></div>
            <div className="spread"><span className="muted">Flags recorded</span><strong>{log.filter((l) => l.type !== 'info').length}</strong></div>
            <div className="spread"><span className="muted">Time remaining</span><strong className="mono">{fmtClock(remaining)}</strong></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
