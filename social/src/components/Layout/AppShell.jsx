import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import styles from './AppShell.module.css';

// Build version - update this timestamp on each deployment
const BUILD_VERSION = '2026-05-15T16:25:00Z';
const BUILD_NUMBER = 2; // Increment this for each build on the same date

export default function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/social/login');
    } catch (error) {
      console.error('Sign out error:', error);
      setSigningOut(false);
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.logo}>🏆 WM 2026</span>
          <nav className={styles.nav}>
            <NavLink to="/social/spielplan" className={({ isActive }) => isActive ? styles.navLinkActive : styles.navLink}>
              Spielplan
            </NavLink>
            <NavLink to="/social/tipps" className={({ isActive }) => isActive ? styles.navLinkActive : styles.navLink}>
              Tipps
            </NavLink>
            <NavLink to="/social/rangliste" className={({ isActive }) => isActive ? styles.navLinkActive : styles.navLink}>
              Rangliste
            </NavLink>
          </nav>
          <button
            className={styles.signOut}
            onClick={handleSignOut}
            disabled={signingOut}
            title="Klick zum Ausloggen"
          >
            {signingOut ? '…' : `Ausloggen`}
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <nav className={styles.bottomNav}>
        <NavLink to="/social/spielplan" className={({ isActive }) => isActive ? styles.tabActive : styles.tab}>
          <span>📅</span><span>Spielplan</span>
        </NavLink>
        <NavLink to="/social/tipps" className={({ isActive }) => isActive ? styles.tabActive : styles.tab}>
          <span>🎯</span><span>Tipps</span>
        </NavLink>
        <NavLink to="/social/rangliste" className={({ isActive }) => isActive ? styles.tabActive : styles.tab}>
          <span>🏅</span><span>Rangliste</span>
        </NavLink>
        <NavLink to="/social/profil" className={({ isActive }) => isActive ? styles.tabActive : styles.tab}>
          <span>👤</span><span>Profil</span>
        </NavLink>
      </nav>

      <div className={styles.versionInfo} title={`Build ${BUILD_NUMBER}: ${BUILD_VERSION}`}>
        v{BUILD_VERSION.split('T')[0]}.{BUILD_NUMBER}
      </div>
    </div>
  );
}
