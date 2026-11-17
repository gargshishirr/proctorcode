import { useEffect, useState } from 'react';
import api from '../api';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import ReadOnlyNote, { useReadOnly } from '../components/ReadOnlyNote';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils';

function inviteStatus(inv) {
  if (inv.revoked) return { cls: 'badge-gray', label: 'Revoked' };
  if (inv.uses >= inv.max_uses) return { cls: 'badge-gray', label: 'Used' };
  if (new Date(inv.expires_at) < new Date()) return { cls: 'badge-amber', label: 'Expired' };
  return { cls: 'badge-green', label: 'Active' };
}

export default function AdminAccess() {
  const readOnly = useReadOnly();
  const { config } = useAuth();
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ note: '', email: '', max_uses: 1, expires_in_days: 7 });
  const [created, setCreated] = useState(null); // { link, code }
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = () =>
    Promise.all([api.get('/admin/settings'), api.get('/admin/invites'), api.get('/admin/users')])
      .then(([s, i, u]) => {
        setSettings(s.data.settings);
        setInvites(i.data.invites);
        setUsers(u.data.users);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleOpen = async () => {
    try {
      const res = await api.put('/admin/settings', { open_signup: !settings.open_signup });
      setSettings(res.data.settings);
      toast.success(res.data.settings.open_signup ? 'Anyone can now sign up' : 'Sign-up is invite-only again');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const createInvite = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        note: form.note,
        max_uses: Number(form.max_uses) || 1,
        expires_in_days: Number(form.expires_in_days) || 7,
      };
      if (form.email.trim()) payload.email = form.email.trim();
      const res = await api.post('/admin/invites', payload);
      setCreated({ code: res.data.code, link: `${window.location.origin}/register#invite=${res.data.code}` });
      setForm({ note: '', email: '', max_uses: 1, expires_in_days: 7 });
      setInvites((list) => [res.data.invite, ...list]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv) => {
    try {
      await api.delete(`/admin/invites/${inv.id}`);
      setInvites((list) => list.map((x) => (x.id === inv.id ? { ...x, revoked: 1 } : x)));
      toast.success('Invite revoked');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const removeUser = async () => {
    try {
      await api.delete(`/admin/users/${removing.id}`);
      setUsers((list) => list.filter((u) => u.id !== removing.id));
      toast.success('Candidate and their sessions removed');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRemoving(null);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed. Select the text and copy it by hand.');
    }
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Administrator</div>
        <h1>Invites &amp; candidates</h1>
        <div className="sub">Decide who can sign up, and manage candidate accounts.</div>
      </div>

      <ReadOnlyNote />
      {error && <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>}
      {config.demo && (
        <div className="alert alert-warn">
          <Icon name="alert" size={16} /> Sign-up is always off in the public demo. Invites work when DEMO_MODE is off.
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form className="card card-pad stack" onSubmit={createInvite}>
          <h3 style={{ fontSize: '1.05rem' }}>Create an invite link</h3>
          <div className="field">
            <label className="label" htmlFor="inv-note">Note (only you see it)</label>
            <input id="inv-note" className="input" value={form.note} onChange={set('note')} placeholder="e.g. Frontend hiring, batch 3" maxLength={120} />
          </div>
          <div className="field">
            <label className="label" htmlFor="inv-email">Candidate email (optional)</label>
            <input id="inv-email" className="input" type="email" value={form.email} onChange={set('email')} placeholder="Leave empty for a shareable link" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="inv-uses">How many sign-ups</label>
              <input id="inv-uses" className="input" type="number" min="1" max="1000" value={form.max_uses} onChange={set('max_uses')} disabled={!!form.email.trim()} />
            </div>
            <div className="field">
              <label className="label" htmlFor="inv-days">Valid for (days)</label>
              <input id="inv-days" className="input" type="number" min="1" max="90" value={form.expires_in_days} onChange={set('expires_in_days')} />
            </div>
          </div>
          <div>
            <button className="btn btn-primary" disabled={busy || readOnly} title={readOnly ? 'Read-only demo' : undefined}>
              {busy ? <span className="spinner" /> : <Icon name="plus" size={15} />} Create invite
            </button>
          </div>
        </form>

        <div className="card card-pad stack">
          <h3 style={{ fontSize: '1.05rem' }}>Who can sign up?</h3>
          {settings && (
            <>
              <p className="muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                {settings.open_signup
                  ? 'Anyone with the link to this site can create a candidate account.'
                  : 'Only people with a valid invite can create a candidate account. (Recommended)'}
              </p>
              <label className="check-row">
                <input type="checkbox" checked={settings.open_signup} onChange={toggleOpen} disabled={readOnly} />
                <span>Allow open sign-up (no invite needed)</span>
              </label>
            </>
          )}
          <p className="faint" style={{ fontSize: '0.82rem', margin: 0 }}>
            Admin accounts are never created by sign-up. The admin comes from ADMIN_EMAIL and ADMIN_PASSWORD.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.05rem' }}>Invites</h3>
          <span className="faint" style={{ fontSize: '0.82rem' }}>Codes are shown once, when created.</span>
        </div>
        {invites.length === 0 ? (
          <div className="empty" style={{ padding: 32 }}>No invites yet.</div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="tbl">
              <thead>
                <tr><th>Code</th><th>Note</th><th>For</th><th>Used</th><th>Expires</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const st = inviteStatus(inv);
                  return (
                    <tr key={inv.id}>
                      <td className="mono">…{inv.hint}</td>
                      <td>{inv.note || <span className="faint">—</span>}</td>
                      <td>{inv.email || <span className="faint">Anyone</span>}</td>
                      <td>{inv.uses} / {inv.max_uses}</td>
                      <td className="muted" style={{ fontSize: '0.85rem' }}>{formatDate(inv.expires_at)}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>
                        {st.label === 'Active' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => revoke(inv)} disabled={readOnly}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.05rem' }}>Candidates</h3>
          <span className="faint" style={{ fontSize: '0.82rem' }}>Removing a candidate deletes their sessions too.</span>
        </div>
        {users.length === 0 ? (
          <div className="empty" style={{ padding: 32 }}>No candidates yet.</div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="tbl">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Sessions</th><th>Joined</th><th></th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="muted">{u.email}</td>
                    <td>{u.attempt_count}</td>
                    <td className="muted" style={{ fontSize: '0.85rem' }}>{formatDate(u.created_at)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setRemoving(u)} disabled={readOnly} aria-label={`Remove ${u.name}`}>
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {created && (
        <Modal
          title="Invite created"
          subtitle="Copy it now. For safety, the code is not shown again."
          onClose={() => setCreated(null)}
          footer={<button className="btn btn-primary" onClick={() => setCreated(null)}>Done</button>}
        >
          <div className="stack" style={{ gap: 12 }}>
            <div className="field">
              <span className="label">Invite link</span>
              <div className="copy-box">
                <input className="input" readOnly value={created.link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                <button className="btn btn-ghost btn-sm" onClick={() => copy(created.link)}><Icon name="copy" size={14} /> Copy</button>
              </div>
            </div>
            <div className="field">
              <span className="label">Code only</span>
              <div className="copy-box">
                <input className="input" readOnly value={created.code} onFocus={(e) => e.target.select()} aria-label="Invite code" />
                <button className="btn btn-ghost btn-sm" onClick={() => copy(created.code)}><Icon name="copy" size={14} /> Copy</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {removing && (
        <Modal
          title="Remove candidate?"
          subtitle={`${removing.name} (${removing.email}) and all their sessions will be deleted.`}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRemoving(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={removeUser}><Icon name="trash" size={15} /> Remove</button>
            </>
          }
        >
          <p className="muted">This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
