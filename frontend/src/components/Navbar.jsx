import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';

function initials(name = '') {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';
  const home = isAdmin ? '/admin' : '/dashboard';

  return (
    <nav className="navbar">
      <div className="container inner">
        <Link to={home} className="brand">
          <span className="logo">
            <Icon name="shield" size={17} color="#fff" />
          </span>
          ProctorCode
        </Link>

        {user && (
          <>
            <div className="nav-links">
              {isAdmin ? (
                <>
                  <NavLink to="/admin" end className="nav-link">Overview</NavLink>
                  <NavLink to="/admin/tests" className="nav-link">Tests</NavLink>
                  <NavLink to="/admin/attempts" className="nav-link">Sessions</NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/dashboard" end className="nav-link">Tests</NavLink>
                  <NavLink to="/results" className="nav-link">My Results</NavLink>
                </>
              )}
            </div>

            <div className="nav-user">
              <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user.name}</div>
                <div className="faint" style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}>
                  {user.role === 'admin' ? 'Administrator' : 'Candidate'}
                </div>
              </div>
              <div className="avatar" title={user.email}>{initials(user.name)}</div>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sign out">
                <Icon name="logout" size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
