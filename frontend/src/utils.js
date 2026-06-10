// Shared formatting + proctoring metadata helpers.

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function integrityColor(score) {
  if (score >= 85) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--danger)';
}

export function integrityBadge(score) {
  if (score >= 85) return 'badge-green';
  if (score >= 60) return 'badge-amber';
  return 'badge-red';
}

export function integrityLabel(score) {
  if (score >= 85) return 'Clean';
  if (score >= 60) return 'Review';
  return 'High risk';
}

export const VIOLATION_META = {
  tab_switch: { label: 'Tab switch', icon: 'monitor', color: 'red' },
  window_switch: { label: 'Window switch', icon: 'monitor', color: 'amber' },
  looking_away: { label: 'Looking away', icon: 'eye', color: 'amber' },
  no_face: { label: 'No face detected', icon: 'camera', color: 'red' },
  multiple_faces: { label: 'Multiple faces', icon: 'users', color: 'red' },
  copy: { label: 'Copy', icon: 'copy', color: 'amber' },
  cut: { label: 'Cut', icon: 'copy', color: 'amber' },
  paste: { label: 'Paste', icon: 'clipboard', color: 'red' },
  right_click: { label: 'Right click', icon: 'alert', color: 'gray' },
  fullscreen_exit: { label: 'Exited fullscreen', icon: 'maximize', color: 'red' },
  devtools: { label: 'Dev tools', icon: 'code', color: 'red' },
  print: { label: 'Print attempt', icon: 'file', color: 'amber' },
  camera_blocked: { label: 'Camera blocked', icon: 'camera', color: 'red' },
};

export function violationMeta(type) {
  return VIOLATION_META[type] || { label: type, icon: 'alert', color: 'gray' };
}

export function statusBadge(status) {
  switch (status) {
    case 'submitted':
      return { cls: 'badge-green', label: 'Submitted' };
    case 'terminated':
      return { cls: 'badge-red', label: 'Terminated' };
    case 'in_progress':
      return { cls: 'badge-indigo', label: 'In progress' };
    default:
      return { cls: 'badge-gray', label: status };
  }
}

export function languageLabel(lang) {
  const map = { javascript: 'JavaScript', python: 'Python', typescript: 'TypeScript', java: 'Java', cpp: 'C++', c: 'C', go: 'Go', csharp: 'C#', ruby: 'Ruby', rust: 'Rust' };
  return map[lang] || lang;
}
