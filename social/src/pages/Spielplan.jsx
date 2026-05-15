import styles from './ComingSoon.module.css';

export default function Spielplan() {
  return (
    <div className={styles.page}>
      <div className={styles.icon}>📅</div>
      <h2 className={styles.title}>Spielplan</h2>
      <p className={styles.sub}>Alle 104 WM-Spiele auf einen Blick</p>
      <ul className={styles.features}>
        <li>⭐ Favoriten-Teams markieren</li>
        <li>⏱ Filter nach Zeitfenster &amp; Gruppe</li>
        <li>📊 KI-Wahrscheinlichkeiten pro Spiel</li>
        <li>🔔 Push-Benachrichtigungen</li>
      </ul>
      <span className={styles.badge}>Kommt in Phase 2</span>
    </div>
  );
}
