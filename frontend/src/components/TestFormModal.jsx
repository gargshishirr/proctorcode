import { useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';

const LANGS = ['javascript', 'python', 'typescript', 'java', 'cpp', 'c', 'csharp', 'go', 'ruby', 'rust'];

export default function TestFormModal({ initial, onClose, onSave }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    title: initial?.title || '',
    language: initial?.language || 'javascript',
    duration_minutes: initial?.duration_minutes || 30,
    description: initial?.description || '',
    starter_code: initial?.starter_code || '',
    is_active: initial?.is_active === undefined ? true : Boolean(initial.is_active),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({
        ...form,
        duration_minutes: Number(form.duration_minutes) || 30,
        is_active: Boolean(form.is_active),
      });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit test' : 'Create a new test'}
      subtitle={editing ? 'Update the assessment details below.' : 'Define a coding challenge for your candidates.'}
      width={640}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={16} />}
            {editing ? 'Save changes' : 'Create test'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert alert-error"><Icon name="alert" size={16} /> {error}</div>}

        <div className="field">
          <label className="label">Test title</label>
          <input className="input" value={form.title} onChange={set('title')} placeholder="e.g. Two Sum" />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label">Language</label>
            <select className="select" value={form.language} onChange={set('language')}>
              {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Duration (minutes)</label>
            <input className="input" type="number" min="1" value={form.duration_minutes} onChange={set('duration_minutes')} />
          </div>
        </div>

        <div className="field">
          <label className="label">Problem statement (Markdown supported)</label>
          <textarea className="textarea" value={form.description} onChange={set('description')} placeholder="Describe the problem, examples and constraints…" />
        </div>

        <div className="field">
          <label className="label">Starter code</label>
          <textarea className="textarea mono" value={form.starter_code} onChange={set('starter_code')} placeholder="function solve() {}" style={{ minHeight: 140 }} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            style={{ width: 16, height: 16 }}
          />
          <span>
            <span style={{ fontWeight: 600 }}>Active</span>
            <span className="muted" style={{ marginLeft: 8, fontSize: '0.85rem' }}>Visible to candidates and available to start.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
