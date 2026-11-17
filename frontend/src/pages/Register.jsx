import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import DemoButtons from '../components/DemoButtons';
import { AuthAside } from './Login';

// Invite links look like /register#invite=CODE (the code after # never reaches server logs).
function inviteFromLocation(location) {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('invite');
  const fromQuery = new URLSearchParams(location.search).get('invite');
  return (fromHash || fromQuery || '').trim();
}

export default function Register() {
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '', invite: inviteFromLocation(location) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { register, config } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.password };
      if (form.invite.trim()) payload.invite = form.invite.trim();
      const user = await register(payload);
      toast.success(`Account created. Welcome, ${user.name.split(' ')[0]}!`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const off = config.signup === 'off';
  const inviteOnly = config.signup === 'invite';

  return (
    <div className="auth-wrap">
      <AuthAside
        headline="Create your candidate account."
        text="Sign up with the invite you received, then take your proctored test in the browser."
      />

      <main className="auth-main">
        <div className="auth-card stack">
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>Create account</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              {off ? 'Sign-up is turned off here.' : inviteOnly ? 'You need an invite from the test admin.' : 'Anyone can sign up as a candidate.'}
            </p>
          </div>

          {off ? (
            <>
              {config.demo ? (
                <DemoButtons />
              ) : (
                <div className="alert alert-warn"><Icon name="alert" size={16} /> Sign-up is turned off.</div>
              )}
            </>
          ) : (
            <>
              {error && (
                <div className="alert alert-error" role="alert">
                  <Icon name="alert" size={16} /> {error}
                </div>
              )}
              <form className="stack" onSubmit={submit}>
                <div className="field">
                  <label className="label" htmlFor="reg-invite">Invite code{inviteOnly ? '' : ' (optional)'}</label>
                  <input
                    id="reg-invite"
                    className="input mono"
                    value={form.invite}
                    onChange={set('invite')}
                    placeholder="Paste the code from your invite link"
                    autoComplete="off"
                    required={inviteOnly}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="reg-name">Full name</label>
                  <input id="reg-name" className="input" value={form.name} onChange={set('name')} placeholder="Ada Lovelace" maxLength={80} required />
                </div>
                <div className="field">
                  <label className="label" htmlFor="reg-email">Email</label>
                  <input id="reg-email" className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" autoComplete="username" required />
                </div>
                <div className="field">
                  <label className="label" htmlFor="reg-password">Password</label>
                  <input id="reg-password" className="input" type="password" value={form.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required />
                </div>
                <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
                  {busy ? <span className="spinner" /> : <Icon name="check" size={16} />}
                  {busy ? 'Creating…' : 'Create account'}
                </button>
              </form>
            </>
          )}

          <p className="center muted" style={{ fontSize: '0.9rem' }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
