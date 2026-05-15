// Load WM 2026 matches from static data file
export async function fetchMatches() {
  try {
    const response = await fetch('/social/wm-matches.json');
    if (!response.ok) throw new Error('Failed to load matches');
    const data = await response.json();

    // Transform FIFA API format to our format
    return (data.Results || []).map(match => ({
      id: match.IdMatch,
      date: new Date(match.Date),
      localDate: new Date(match.LocalDate),
      group: match.GroupName?.[0]?.Description || 'Unknown',
      homeTeam: match.Home?.TeamName?.[0]?.Description || 'TBD',
      awayTeam: match.Away?.TeamName?.[0]?.Description || 'TBD',
      homeCountry: match.Home?.IdCountry || null,
      awayCountry: match.Away?.IdCountry || null,
      homeScore: match.Home?.Score ?? null,
      awayScore: match.Away?.Score ?? null,
      status: match.Home?.Score !== null && match.Home?.Score !== undefined ? 'finished' : 'upcoming',
      venue: match.Venue?.[0]?.Description || 'TBA',
    }));
  } catch (error) {
    console.error('Error loading matches:', error);
    return [];
  }
}

export function getMatchGroup(match) {
  return match.group;
}

export function getTimeWindow(match) {
  const hour = match.localDate.getHours();
  if (hour < 6) return 'Nacht';
  if (hour < 12) return 'Morgen';
  if (hour < 17) return 'Tagsüber';
  if (hour < 21) return 'Feierabend';
  return 'Spätabend';
}

export function formatMatchTime(date) {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function formatMatchDate(date) {
  return date.toLocaleDateString('de-DE', { weekday: 'short', month: 'short', day: 'numeric' });
}
