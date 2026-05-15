import styles from './ComingSoon.module.css';

export default function Tipps() {
  return (
    <div className={styles.page}>
      <div className={styles.icon}>🎯</div>
      <h2 className={styles.title}>Tipp-Spiel</h2>
      <p className={styles.sub}>Tippe alle WM-Ergebnisse und sammle Punkte</p>
      <ul className={styles.features}>
        <li>3 Punkte für exaktes Ergebnis</li>
        <li>1 Punkt für richtige Tendenz</li>
        <li>Tipp-Deadline: Anstoß</li>
        <li>Live-Aktualisierung während der WM</li>
      </ul>
      <span className={styles.badge}>Kommt in Phase 4</span>
    </div>
  );
}
