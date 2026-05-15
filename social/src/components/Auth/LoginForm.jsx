import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import styles from './Auth.module.css';

export default function LoginForm({ onSwitch }) {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // login | reset

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'reset') {
        await resetPassword(email);
        setInfo('E-Mail gesendet! Prüfe dein Postfach.');
        setMode('login');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message || 'Fehler beim Einloggen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.logo}>🏆</div>
      <h1 className={styles.title}>WM 2026</h1>
      <p className={styles.subtitle}>
        {mode === 'reset' ? 'Passwort zurücksetzen' : 'Einloggen'}
      </p>

      {error && <p className={styles.error}>{error}</p>}
      {info && <p className={styles.info}>{info}</p>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          E-Mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@example.com"
            required
            className={styles.input}
            autoComplete="email"
          />
        </label>

        {mode === 'login' && (
          <label className={styles.label}>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className={styles.input}
              autoComplete="current-password"
            />
          </label>
        )}

        <button type="submit" disabled={loading} className={styles.btnPrimary}>
          {loading ? '…' : mode === 'reset' ? 'Link senden' : 'Einloggen'}
        </button>
      </form>

      <div className={styles.links}>
        {mode === 'login' ? (
          <button className={styles.link} onClick={() => setMode('reset')}>
            Passwort vergessen?
          </button>
        ) : (
          <button className={styles.link} onClick={() => setMode('login')}>
            ← Zurück zum Login
          </button>
        )}
        <span className={styles.divider}>·</span>
        <button className={styles.link} onClick={onSwitch}>
          Neu hier? Registrieren
        </button>
      </div>
    </div>
  );
}
