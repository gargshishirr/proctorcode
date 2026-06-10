import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import AdminOverview from './pages/AdminOverview';
import AdminTests from './pages/AdminTests';
import AdminSessions from './pages/AdminSessions';
import AdminAttemptDetail from './pages/AdminAttemptDetail';
import UserDashboard from './pages/UserDashboard';
import UserResults from './pages/UserResults';
import AttemptResult from './pages/AttemptResult';

const TakeTest = lazy(() => import('./pages/TakeTest'));

function AppLayout() {
  return (
    <div className="app-shell">
      <Navbar />
      <div className="page">
        <div className="container">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="loader-screen"><div className="spinner spinner-dark" style={{ width: 28, height: 28 }} /></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Proctored exam — standalone full-screen, no navbar */}
        <Route
          path="/test/:attemptId"
          element={
            <ProtectedRoute role="user">
              <TakeTest />
            </ProtectedRoute>
          }
        />

        {/* App pages with navbar */}
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminOverview /></ProtectedRoute>} />
          <Route path="/admin/tests" element={<ProtectedRoute role="admin"><AdminTests /></ProtectedRoute>} />
          <Route path="/admin/attempts" element={<ProtectedRoute role="admin"><AdminSessions /></ProtectedRoute>} />
          <Route path="/admin/attempts/:id" element={<ProtectedRoute role="admin"><AdminAttemptDetail /></ProtectedRoute>} />

          <Route path="/dashboard" element={<ProtectedRoute role="user"><UserDashboard /></ProtectedRoute>} />
          <Route path="/results" element={<ProtectedRoute role="user"><UserResults /></ProtectedRoute>} />
          <Route path="/attempt/:id" element={<ProtectedRoute role="user"><AttemptResult /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
