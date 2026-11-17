import { useAuth } from '../context/AuthContext';

/** A small strip that makes the public demo obvious. */
export default function DemoBanner() {
  const { config, user } = useAuth();
  if (!config.demo) return null;
  const readOnlyAdmin = user?.demo && user.role === 'admin';
  return (
    <div className="demo-banner" role="note">
      <strong>Public demo.</strong> Data is shared and resets every {config.demoResetHours || 6} hours. Please don&apos;t
      enter real personal data.
      {readOnlyAdmin && <> You are the <strong>read-only</strong> demo admin: you can look around, but changes are off.</>}
    </div>
  );
}
