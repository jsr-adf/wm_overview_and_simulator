import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { supabase } from '../lib/supabase.js';
import styles from './Profil.module.css';

export default function Profil() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const initial = (user?.email?.[0] ?? '?').toUpperCase();
  const displayName = user?.email?.split('@')[0] ?? '—';

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <div className={styles.page}>
      {/* Avatar */}
      <div className={styles.avatarWrap}>
        <div className={styles.avatar}>{initial}</div>
      </div>

      <h2 className={styles.name}>{displayName}</h2>
      <p className={styles.email}>{user?.email}</p>

      {/* Stats placeholders (Phase 4) */}
      <div className={styles.statsGrid}>
        <div className={styles.stat}>
          <span className={styles.statValue}>—</span>
          <span className={styles.statLabel}>Tipps abgegeben</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>—</span>
          <span className={styles.statLabel}>Punkte</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>—</span>
          <span className={styles.statLabel}>Rang</span>
        </div>
      </div>

      {/* Account info */}
      <div className={styles.card}>
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>Registriert</span>
          <span className={styles.cardValue}>
            {user?.created_at
              ? new Date(user.created_at).toLocaleDateString('de-DE')
              : '—'}
          </span>
        </div>
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>E-Mail bestätigt</span>
          <span className={styles.cardValue}>
            {user?.email_confirmed_at ? '✅ Ja' : '⏳ Ausstehend'}
          </span>
        </div>
      </div>

      {/* Coming soon */}
      <div className={styles.soon}>
        <span>🚧</span>
        <span>Benutzername, Avatar und vollständige Statistiken kommen in den nächsten Phasen</span>
      </div>

      <button
        className={styles.signOutBtn}
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? '…' : '↪ Ausloggen'}
      </button>
    </div>
  );
}
