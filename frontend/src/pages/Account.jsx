import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';

export default function Account() {
  const { user, changePassword, logoutEverywhere } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) {
      setError('The new passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Other devices were signed out.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signOutAll = async () => {
    try {
      await logoutEverywhere();
      toast.success('Signed out on every device');
      navigate('/login');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 560 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Account</div>
        <h1>{user.name}</h1>
        <div className="sub">{user.email}</div>
      </div>

      {user.demo ? (
        <div className="alert alert-info"><Icon name="lock" size={16} /> Demo accounts have no password to change.</div>
      ) : (
        <>
          <form className="card card-pad stack" onSubmit={submit}>
            <h3 style={{ fontSize: '1.05rem' }}>Change password</h3>
            {error && <div className="alert alert-error" role="alert"><Icon name="alert" size={16} /> {error}</div>}
            <div className="field">
              <label className="label" htmlFor="pw-current">Current password</label>
              <input id="pw-current" className="input" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="pw-new">New password</label>
              <input id="pw-new" className="input" type="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" value={form.next} onChange={set('next')} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="pw-confirm">Repeat new password</label>
              <input id="pw-confirm" className="input" type="password" autoComplete="new-password" minLength={8} value={form.confirm} onChange={set('confirm')} required />
            </div>
            <div>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="lock" size={15} />} Change password
              </button>
            </div>
            <p className="faint" style={{ fontSize: '0.82rem', margin: 0 }}>Changing it signs you out on every other device.</p>
          </form>

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <h3 style={{ fontSize: '1.05rem' }}>Sign out everywhere</h3>
            <p className="muted" style={{ fontSize: '0.9rem', margin: 0 }}>Ends every session of this account, including this one.</p>
            <div>
              <button className="btn btn-ghost" onClick={signOutAll}><Icon name="logout" size={15} /> Sign out everywhere</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
