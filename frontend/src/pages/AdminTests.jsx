import { useEffect, useState } from 'react';
import api from '../api';
import Icon from '../components/Icon';
import TestFormModal from '../components/TestFormModal';
import Modal from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { formatDate, languageLabel } from '../utils';

export default function AdminTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // test object or {} for new
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api.get('/tests')
      .then((res) => setTests(res.data.tests))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async (data) => {
    if (editing?.id) {
      const res = await api.put(`/tests/${editing.id}`, data);
      setTests((t) => t.map((x) => (x.id === editing.id ? { ...x, ...res.data.test } : x)));
      toast.success('Test updated');
    } else {
      const res = await api.post('/tests', data);
      setTests((t) => [{ ...res.data.test, attempt_count: 0 }, ...t]);
      toast.success('Test created');
    }
    setEditing(null);
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/tests/${deleting.id}`);
      setTests((t) => t.filter((x) => x.id !== deleting.id));
      toast.success('Test deleted');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const toggleActive = async (test) => {
    try {
      const res = await api.put(`/tests/${test.id}`, { is_active: !test.is_active });
      setTests((t) => t.map((x) => (x.id === test.id ? { ...x, is_active: res.data.test.is_active } : x)));
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="spread page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Administrator</div>
          <h1>Tests</h1>
          <div className="sub">Create and manage coding assessments.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={16} /> New test
        </button>
      </div>

      {error && <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>}

      {loading ? (
        <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>
      ) : tests.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">🧩</div>
          <p>No tests yet.</p>
          <button className="btn btn-primary" onClick={() => setEditing({})}><Icon name="plus" size={16} /> Create your first test</button>
        </div>
      ) : (
        <div className="grid-3">
          {tests.map((t) => (
            <div className="card card-pad card-hover stack" key={t.id} style={{ gap: 14 }}>
              <div className="spread">
                <span className="badge badge-indigo">{languageLabel(t.language)}</span>
                {t.is_active ? <span className="badge badge-green"><span className="dot" style={{ background: 'var(--success)' }} /> Active</span> : <span className="badge badge-gray">Inactive</span>}
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem' }}>{t.title}</h3>
                <p className="muted" style={{ fontSize: '0.85rem', marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {(t.description || 'No description').replace(/[#*`>]/g, '').slice(0, 120)}
                </p>
              </div>
              <div className="row" style={{ gap: 16, fontSize: '0.82rem', color: 'var(--text-soft)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={14} /> {t.duration_minutes} min</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="list" size={14} /> {t.attempt_count ?? 0} attempts</span>
              </div>
              <div className="faint" style={{ fontSize: '0.76rem' }}>Created {formatDate(t.created_at)}</div>
              <hr className="hr" />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}><Icon name="edit" size={14} /> Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(t)}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => setDeleting(t)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <TestFormModal initial={editing} onClose={() => setEditing(null)} onSave={save} />}

      {deleting && (
        <Modal
          title="Delete test?"
          subtitle={`"${deleting.title}" and all its sessions will be permanently removed.`}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}><Icon name="trash" size={15} /> Delete</button>
            </>
          }
        >
          <p className="muted">This action cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
