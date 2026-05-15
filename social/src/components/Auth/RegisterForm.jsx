import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import styles from './Auth.module.css';

export default function RegisterForm({ onSwitch }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      setInfo('Fast fertig! Prüfe deine E-Mail und bestätige den Link.');
    } catch (err) {
      setError(err.message || 'Fehler bei der Registrierung');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.logo}>🏆</div>
      <h1 className={styles.title}>WM 2026</h1>
      <p className={styles.subtitle}>Konto erstellen</p>

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

        <label className={styles.label}>
          Passwort
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 Zeichen"
            required
            minLength={6}
            className={styles.input}
            autoComplete="new-password"
          />
        </label>

        <label className={styles.label}>
          Passwort bestätigen
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            className={styles.input}
            autoComplete="new-password"
          />
        </label>

        <button type="submit" disabled={loading} className={styles.btnPrimary}>
          {loading ? '…' : 'Registrieren'}
        </button>
      </form>

      <div className={styles.links}>
        <button className={styles.link} onClick={onSwitch}>
          Bereits ein Konto? Einloggen
        </button>
      </div>
    </div>
  );
}
