import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';

/** "Try as candidate" / "Try as admin (read-only)" — shown only on the public demo. */
export default function DemoButtons() {
  const { tryDemo, config } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');

  const start = async (kind) => {
    setBusy(kind);
    try {
      const user = await tryDemo(kind);
      navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    } catch (e) {
      toast.error(e.message);
      setBusy('');
    }
  };

  return (
    <div className="demo-box stack" style={{ gap: 10 }}>
      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="zap" size={16} /> Try the public demo
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={() => start('candidate')} disabled={!!busy}>
        {busy === 'candidate' ? <span className="spinner" /> : <Icon name="user" size={16} />} Try as candidate
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={() => start('admin')} disabled={!!busy}>
        {busy === 'admin' ? <span className="spinner spinner-dark" /> : <Icon name="shield" size={16} />} Try as admin (read-only)
      </button>
      <p className="faint" style={{ fontSize: '0.8rem', margin: 0 }}>
        No sign-up needed. Demo data is shared and resets every {config.demoResetHours || 6} hours, so please don&apos;t
        enter real personal data.
      </p>
    </div>
  );
}
