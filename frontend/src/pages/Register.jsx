import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';

export default function Register() {
  const [role, setRole] = useState('user');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await register({ ...form, role });
      toast.success(`Account created. Welcome, ${user.name.split(' ')[0]}!`);
      navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
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
          <h1 className="auth-headline">Create your account in seconds.</h1>
          <p style={{ opacity: 0.85, marginTop: 14, maxWidth: 440 }}>
            Register as a candidate to take proctored assessments, or as an administrator
            to author tests and review integrity reports.
          </p>
          <div className="auth-feature" style={{ marginTop: 26 }}>
            <span className="fi"><Icon name="zap" size={16} color="#fff" /></span>
            <div>
              <div style={{ fontWeight: 700 }}>Real-time integrity scoring</div>
              <div style={{ opacity: 0.82, fontSize: '0.85rem' }}>Every session is scored live as it happens.</div>
            </div>
          </div>
        </div>
        <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>© {new Date().getFullYear()} ProctorCode.</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card stack">
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>Create account</h2>
            <p className="muted" style={{ marginTop: 4 }}>Pick the type of account you need.</p>
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
              <label className="label">Full name</label>
              <input className="input" value={form.name} onChange={set('name')} placeholder="Ada Lovelace" required />
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" autoComplete="username" required />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" autoComplete="new-password" required />
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={16} />}
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <p className="center muted" style={{ fontSize: '0.9rem' }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
