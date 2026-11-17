import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import DemoButtons from '../components/DemoButtons';

const features = [
  { icon: 'eye', title: 'AI gaze tracking', text: 'Webcam face & gaze checks run in the browser. No video is uploaded.' },
  { icon: 'monitor', title: 'Environment lockdown', text: 'Tab switches, window changes and fullscreen exits are flagged instantly.' },
  { icon: 'clipboard', title: 'Clipboard guard', text: 'Copy, cut and paste attempts are recorded against the integrity score.' },
];

export function AuthAside({ headline, text }) {
  return (
    <aside className="auth-aside">
      <div className="brand">
        <span className="logo"><Icon name="shield" size={18} color="#fff" /></span>
        ProctorCode
      </div>
      <div>
        <h1 className="auth-headline">{headline}</h1>
        <p style={{ opacity: 0.85, marginTop: 14, maxWidth: 440 }}>{text}</p>
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
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login, config } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      const dest = location.state?.from?.pathname;
      const home = user.role === 'admin' ? '/admin' : '/dashboard';
      // Only follow in-app paths we produced ourselves.
      navigate(typeof dest === 'string' && dest.startsWith('/') && !dest.startsWith('//') ? dest : home, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <AuthAside
        headline="Coding assessments you can actually trust."
        text="A complete proctored testing environment with real-time AI monitoring and tamper detection built in."
      />

      <main className="auth-main">
        <div className="auth-card stack">
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>Sign in</h2>
            <p className="muted" style={{ marginTop: 4 }}>For admins and invited candidates.</p>
          </div>

          {config.needsSetup && (
            <div className="alert alert-warn">
              <Icon name="alert" size={16} />
              <span>
                This site has no admin yet. The owner needs to set <code>ADMIN_EMAIL</code> and{' '}
                <code>ADMIN_PASSWORD</code> and restart it.
              </span>
            </div>
          )}

          {config.demo && <DemoButtons />}

          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={16} /> {error}
            </div>
          )}

          <form className="stack" onSubmit={submit}>
            <div className="field">
              <label className="label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="input"
                type="email"
                value={email}
                autoComplete="username"
                placeholder="you@email.com"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
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
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {config.signup !== 'off' && (
            <>
              <div className="divider">new here?</div>
              <p className="center muted" style={{ fontSize: '0.9rem' }}>
                {config.signup === 'open' ? "Don't have an account? " : 'Got an invite? '}
                <Link to="/register">Create your account</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
