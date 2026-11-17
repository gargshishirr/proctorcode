import { useAuth } from '../context/AuthContext';
import Icon from './Icon';

export function useReadOnly() {
  const { user } = useAuth();
  return Boolean(user?.demo && user.role === 'admin');
}

/** Explains why buttons are disabled for the read-only demo admin. */
export default function ReadOnlyNote() {
  if (!useReadOnly()) return null;
  return (
    <div className="alert alert-info">
      <Icon name="lock" size={16} /> Read-only demo: buttons that change data are turned off.
    </div>
  );
}
