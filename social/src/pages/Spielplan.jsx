import { useState, useEffect } from 'react';
import { fetchMatches, getTimeWindow, formatMatchTime, formatMatchDate, getMatchGroup } from '../services/matchesService';
import { useFavorites } from '../hooks/useFavorites';
import styles from './Spielplan.module.css';

export default function Spielplan() {
  const { favorites, toggleFavorite, loading: favLoading } = useFavorites();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [selectedTimeWindows, setSelectedTimeWindows] = useState(new Set());
  const [groups, setGroups] = useState([]);
  const [timeWindows, setTimeWindows] = useState([]);

  // Load matches
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchMatches();
        setMatches(data);

        // Extract unique groups and time windows
        const uniqueGroups = [...new Set(data.map(m => getMatchGroup(m)))].sort();
        const uniqueTimeWindows = [...new Set(data.map(m => getTimeWindow(m)))];
        const orderedWindows = ['Nacht', 'Morgen', 'Tagsüber', 'Feierabend', 'Spätabend'].filter(
          w => uniqueTimeWindows.includes(w)
        );

        setGroups(uniqueGroups);
        setTimeWindows(orderedWindows);
      } catch (error) {
        console.error('Error loading matches:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Filter matches
  const filteredMatches = matches.filter(match => {
    const groupMatch = selectedGroups.size === 0 || selectedGroups.has(getMatchGroup(match));
    const windowMatch = selectedTimeWindows.size === 0 || selectedTimeWindows.has(getTimeWindow(match));
    return groupMatch && windowMatch;
  });

  const toggleGroup = (group) => {
    const newSet = new Set(selectedGroups);
    if (newSet.has(group)) newSet.delete(group);
    else newSet.add(group);
    setSelectedGroups(newSet);
  };

  const toggleTimeWindow = (window) => {
    const newSet = new Set(selectedTimeWindows);
    if (newSet.has(window)) newSet.delete(window);
    else newSet.add(window);
    setSelectedTimeWindows(newSet);
  };

  const resetFilters = () => {
    setSelectedGroups(new Set());
    setSelectedTimeWindows(new Set());
  };

  if (loading) {
    return <div className={styles.container}>Laden...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Spielplan</h1>
        <p className={styles.subtitle}>Alle WM-Spiele auf einen Blick</p>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <h3>Gruppen</h3>
          <div className={styles.chips}>
            {groups.map(group => (
              <button
                key={group}
                className={`${styles.chip} ${selectedGroups.has(group) ? styles.active : ''}`}
                onClick={() => toggleGroup(group)}
              >
                {group}
              </button>
            ))}
            {selectedGroups.size > 0 && (
              <button className={styles.reset} onClick={() => setSelectedGroups(new Set())}>
                Alle
              </button>
            )}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <h3>Zeitfenster</h3>
          <div className={styles.chips}>
            {timeWindows.map(window => (
              <button
                key={window}
                className={`${styles.chip} ${selectedTimeWindows.has(window) ? styles.active : ''}`}
                onClick={() => toggleTimeWindow(window)}
              >
                {window}
              </button>
            ))}
            {selectedTimeWindows.size > 0 && (
              <button className={styles.reset} onClick={() => setSelectedTimeWindows(new Set())}>
                Alle
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.status}>
        {filteredMatches.length} Spiele
        {selectedGroups.size > 0 || selectedTimeWindows.size > 0 ? (
          <button className={styles.resetLink} onClick={resetFilters}>
            Filter löschen
          </button>
        ) : null}
      </div>

      <div className={styles.matches}>
        {filteredMatches.length === 0 ? (
          <div className={styles.empty}>Keine Spiele gefunden</div>
        ) : (
          filteredMatches.map(match => (
            <div key={match.id} className={styles.matchCard}>
              <div className={styles.matchHeader}>
                <div className={styles.matchInfo}>
                  <div className={styles.date}>{formatMatchDate(match.localDate)}</div>
                  <div className={styles.time}>{formatMatchTime(match.localDate)}</div>
                </div>
                <div className={styles.group}>{match.group}</div>
              </div>

              <div className={styles.matchBody}>
                <div className={styles.team}>
                  <span className={styles.flag}>{getCountryFlag(match.homeCountry)}</span>
                  <div className={styles.teamInfo}>
                    <div className={styles.teamName}>{match.homeTeam}</div>
                    {match.status === 'finished' && (
                      <div className={styles.score}>{match.homeScore}</div>
                    )}
                  </div>
                </div>

                <div className={styles.middleInfo}>
                  <div className={styles.timeWindow}>{getTimeWindow(match)}</div>
                  {match.status === 'finished' && (
                    <div className={styles.vs}>Ergebnis</div>
                  )}
                  {match.status === 'upcoming' && (
                    <div className={styles.vs}>vs</div>
                  )}
                </div>

                <div className={styles.team}>
                  <div className={styles.teamInfo}>
                    <div className={styles.teamName}>{match.awayTeam}</div>
                    {match.status === 'finished' && (
                      <div className={styles.score}>{match.awayScore}</div>
                    )}
                  </div>
                  <span className={styles.flag}>{getCountryFlag(match.awayCountry)}</span>
                </div>
              </div>

              <div className={styles.matchFooter}>
                <div className={styles.venue}>{match.venue}</div>
                <button
                  className={`${styles.favoriteBtn} ${
                    favorites.has(match.homeCountry) || favorites.has(match.awayCountry)
                      ? styles.favorited
                      : ''
                  }`}
                  onClick={() => {
                    if (favorites.has(match.homeCountry)) {
                      toggleFavorite(match.homeCountry);
                    } else if (favorites.has(match.awayCountry)) {
                      toggleFavorite(match.awayCountry);
                    } else {
                      // For upcoming matches, star the favorite team
                      toggleFavorite(match.homeCountry);
                    }
                  }}
                  disabled={favLoading}
                  title="Lieblingsteam hinzufügen"
                >
                  ⭐
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getCountryFlag(country) {
  const flags = {
    MEX: '🇲🇽',
    CAN: '🇨🇦',
    USA: '🇺🇸',
    ARG: '🇦🇷',
    PER: '🇵🇪',
    URY: '🇺🇾',
    BRA: '��🇷',
    COL: '🇨🇴',
    PAR: '🇵🇾',
    CHI: '🇨🇱',
    ECU: '🇪🇨',
    BOL: '🇧🇴',
    GER: '🇩🇪',
    NED: '🇳🇱',
    FRA: '🇫🇷',
    ESP: '🇪🇸',
    ITA: '🇮🇹',
    POR: '🇵🇹',
    BEL: '🇧🇪',
    SUI: '🇨🇭',
    POL: '🇵🇱',
    AUT: '🇦🇹',
    CZE: '🇨🇿',
    SRB: '🇷🇸',
    HRV: '🇭🇷',
    ROU: '🇷🇴',
    GRE: '🇬🇷',
    SVK: '🇸🇰',
    SVN: '🇸🇮',
    ENG: '🏴󐁧󐁢󐁥󐁮󐁧󐁿',
    SCO: '🏴󐁧󐁢󐁳󐁣󐁴󐁿',
    WAL: '🏴󐁧󐁢󐁷󐁬󐁳󐁿',
    NIR: '🇬🇧',
    CYP: '🇨🇾',
    ALB: '🇦🇱',
    BIH: '🇧🇦',
    MKD: '🇲🇰',
    NOR: '🇳🇴',
    SWE: '🇸🇪',
    DEN: '🇩🇰',
    FIN: '🇫🇮',
    ISL: '🇮🇸',
    RUS: '🇷🇺',
    UKR: '🇺🇦',
    TUR: '🇹🇷',
    ISR: '🇮🇱',
    IRN: '🇮🇷',
    SAU: '🇸🇦',
    AUS: '🇦🇺',
    JPN: '🇯🇵',
    KOR: '🇰🇷',
    THA: '🇹🇭',
    VIE: '🇻🇳',
    IRQ: '🇮🇶',
    UZB: '🇺🇿',
    CHN: '🇨🇳',
    IND: '🇮🇳',
  };
  return flags[country] || '🏴';
}
