import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';

const features = [
  { icon: 'eye', title: 'AI gaze tracking', text: 'Webcam-based eye & face monitoring detects when attention leaves the screen.' },
  { icon: 'monitor', title: 'Environment lockdown', text: 'Tab switches, window changes and fullscreen exits are flagged instantly.' },
  { icon: 'clipboard', title: 'Clipboard guard', text: 'Copy, cut and paste attempts are recorded against the integrity score.' },
];

export default function Login() {
  const [role, setRole] = useState('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const fillDemo = (r) => {
    setRole(r);
    if (r === 'admin') {
      setEmail('admin@proctorcode.dev');
      setPassword('admin123');
    } else {
      setEmail('candidate@proctorcode.dev');
      setPassword('test123');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      const dest = location.state?.from?.pathname;
      if (dest) navigate(dest, { replace: true });
      else navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <div className="brand">
          <span className="logo"><Icon name="shield" size={18} color="#fff" /></span>
          ProctorCode
        </div>
        <div>
          <h1 className="auth-headline">Coding assessments you can actually trust.</h1>
          <p style={{ opacity: 0.85, marginTop: 14, maxWidth: 440 }}>
            A complete proctored testing environment with real-time AI monitoring and
            tamper detection built in.
          </p>
          <div style={{ marginTop: 28 }}>
            {features.map((f) => (
              <div className="auth-feature" key={f.title}>
                <span className="fi"><Icon name={f.icon} size={16} color="#fff" /></span>
                <div>
                  <div style={{ fontWeight: 700 }}>{f.title}</div>
                  <div style={{ opacity: 0.82, fontSize: '0.85rem' }}>{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>© {new Date().getFullYear()} ProctorCode. Secure assessments.</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card stack">
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>Sign in</h2>
            <p className="muted" style={{ marginTop: 4 }}>Choose how you want to continue.</p>
          </div>

          <div className="role-toggle">
            <button type="button" className={role === 'user' ? 'on' : ''} onClick={() => setRole('user')}>
              <Icon name="user" size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Test taker
            </button>
            <button type="button" className={role === 'admin' ? 'on' : ''} onClick={() => setRole('admin')}>
              <Icon name="shield" size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Administrator
            </button>
          </div>

          {error && (
            <div className="alert alert-error">
              <Icon name="alert" size={16} /> {error}
            </div>
          )}

          <form className="stack" onSubmit={submit}>
            <div className="field">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                autoComplete="username"
                placeholder={role === 'admin' ? 'admin@company.com' : 'you@email.com'}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                autoComplete="current-password"
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name="arrowRight" size={16} />}
              {busy ? 'Signing in…' : `Continue as ${role === 'admin' ? 'Administrator' : 'Test taker'}`}
            </button>
          </form>

          <button type="button" className="btn btn-ghost btn-block btn-sm" onClick={() => fillDemo(role)}>
            Use demo {role === 'admin' ? 'admin' : 'candidate'} credentials
          </button>

          <div className="divider">new here?</div>
          <p className="center muted" style={{ fontSize: '0.9rem' }}>
            Don&apos;t have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
