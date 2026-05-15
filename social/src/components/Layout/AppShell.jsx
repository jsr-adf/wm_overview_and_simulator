import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import styles from './AppShell.module.css';

export default function AppShell() {
  const { user, signOut } = useAuth();

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
          <button className={styles.signOut} onClick={signOut} title="Ausloggen">
            {user?.email?.split('@')[0]} ↪
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
    </div>
  );
}
