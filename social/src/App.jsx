import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Login from './pages/Login';
import AppShell from './components/Layout/AppShell';
import Spielplan from './pages/Spielplan';
import Tipps from './pages/Tipps';
import Rangliste from './pages/Rangliste';
import Profil from './pages/Profil';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh', fontSize:'2rem' }}>⏳</div>;
  if (!user) return <Navigate to="/social/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/social/login" element={<Login />} />
          <Route path="/social/" element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/social/spielplan" replace />} />
            <Route path="spielplan" element={<Spielplan />} />
            <Route path="tipps" element={<Tipps />} />
            <Route path="rangliste" element={<Rangliste />} />
            <Route path="profil" element={<Profil />} />
          </Route>
          <Route path="*" element={<Navigate to="/social/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
