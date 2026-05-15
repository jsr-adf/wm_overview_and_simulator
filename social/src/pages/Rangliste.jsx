import styles from './ComingSoon.module.css';

export default function Rangliste() {
  return (
    <div className={styles.page}>
      <div className={styles.icon}>🏅</div>
      <h2 className={styles.title}>Rangliste</h2>
      <p className={styles.sub}>Wer tippt am besten in deiner Gruppe?</p>
      <ul className={styles.features}>
        <li>Globale Rangliste aller Teilnehmer</li>
        <li>Live-Punkte nach Spielende</li>
        <li>Direktvergleich mit Freunden</li>
        <li>Wöchentliche Mini-Rangliste</li>
      </ul>
      <span className={styles.badge}>Kommt in Phase 4</span>
    </div>
  );
}
