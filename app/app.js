const CITY_COORDS = {
  "Atlanta": [33.755, -84.401],
  "Boston": [42.091, -71.264],
  "Dallas": [32.748, -97.093],
  "Guadalajara": [20.681, -103.462],
  "Houston": [29.684, -95.411],
  "Kansas City": [39.049, -94.484],
  "Los Angeles": [33.953, -118.339],
  "Mexico City": [19.303, -99.151],
  "Miami": [25.958, -80.239],
  "Monterrey": [25.670, -100.244],
  "New York": [40.813, -74.074],
  "Philadelphia": [39.901, -75.168],
  "San Francisco Bay Area": [37.403, -121.970],
  "Seattle": [47.595, -122.331],
  "Toronto": [43.643, -79.379],
  "Vancouver": [49.276, -123.111],
};

const UEFA_CODES = new Set([
  "ALB", "AND", "ARM", "AUT", "AZE", "BEL", "BIH", "BLR", "BUL", "CRO",
  "CYP", "CZE", "DEN", "ENG", "ESP", "EST", "FRO", "FIN", "FRA", "GEO",
  "GER", "GIB", "GRE", "HUN", "IRL", "ISL", "ISR", "ITA", "KAZ", "KOS",
  "LIE", "LTU", "LUX", "LVA", "MDA", "MKD", "MLT", "MNE", "NED", "NIR",
  "NOR", "POL", "POR", "ROU", "RUS", "SCO", "SMR", "SRB", "SUI", "SVK",
  "SVN", "SWE", "TUR", "UKR", "WAL",
]);

const state = {
  matches: [],
  rankings: new Map(),
  groups: new Set(),
  activeGroups: new Set(),
  teams: new Map(),
  activeTeam: "",
  activeTimeWindows: new Set(),
  sortField: null,
  sortOrder: "asc",
  map: null,
  markers: [],
  lockedCity: null,
};

const els = {
  gamesBody: document.querySelector("#gamesBody"),
  groupFilters: document.querySelector("#groupFilters"),
  mapFilterText: document.querySelector("#mapFilterText"),
  metricMatches: document.querySelector("#metricMatches"),
  metricCities: document.querySelector("#metricCities"),
  metricLate: document.querySelector("#metricLate"),
  resetGroups: document.querySelector("#resetGroups"),
  resetMap: document.querySelector("#resetMap"),
  resetTeam: document.querySelector("#resetTeam"),
  resetTimeWindows: document.querySelector("#resetTimeWindows"),
  tableStatus: document.querySelector("#tableStatus"),
  teamFilter: document.querySelector("#teamFilter"),
  timeWindowFilters: document.querySelector("#timeWindowFilters"),
  dateFrom: document.querySelector("#dateFrom"),
  dateTo: document.querySelector("#dateTo"),
  timeFrom: document.querySelector("#timeFrom"),
  timeTo: document.querySelector("#timeTo"),
  timeFromDisplay: document.querySelector("#timeFromDisplay"),
  timeToDisplay: document.querySelector("#timeToDisplay"),
  dateRangeLabel: document.querySelector("#dateRangeLabel"),
  get quickButtons() {
    return document.querySelectorAll(".quick-btn");
  },
};

function localized(items, fallback = "") {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  return items.find((item) => String(item.Locale || "").toLowerCase().startsWith("en"))?.Description
    || items[0].Description
    || fallback;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function minutesToLabel(minutes) {
  if (minutes >= 1439) return "23:59";
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function addMinutes(minutes, add) {
  const next = (minutes + add) % 1440;
  return minutesToLabel(next);
}

function berlinParts(iso) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    weekday: get("weekday"),
    date: `${get("day")}.${get("month")}.${get("year")}`,
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${pad(hour)}:${pad(minute)}`,
    minutes: hour * 60 + minute,
  };
}

function timeWindow(minutes) {
  if (minutes >= 22 * 60 + 15) return "Spätabend";
  if (minutes >= 8 * 60) return "Abend";
  if (minutes >= 5 * 60) return "Morgen";
  return "Nacht";
}

function endsAfterMidnight(minutes) {
  return minutes < 8 * 60 || minutes >= 22 * 60 + 15;
}

function team(match, side) {
  const item = match[side];
  if (!item) {
    return {
      name: match[side === "Home" ? "PlaceHolderA" : "PlaceHolderB"] || "",
      code: "",
      rank: "",
      points: "",
    };
  }
  const code = item.IdCountry || "";
  const ranking = state.rankings.get(code) || {};
  return {
    name: localized(item.TeamName, item.ShortClubName || code),
    code,
    rank: ranking.rank || "",
    points: ranking.points || "",
  };
}

function favorite(home, away) {
  if (!home.rank || !away.rank) return "";
  if (home.rank === away.rank) return "offen";
  return home.rank < away.rank ? `${home.name} (RK ${home.rank})` : `${away.name} (RK ${away.rank})`;
}

function formatDateRange(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const formatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
  const fromStr = formatter.format(from);
  const toStr = formatter.format(to);
  // Always use consistent format with dash
  return `${fromStr} – ${toStr}`;
}

function getQuickDateRange(type, allDates) {
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];

  if (type === "all") {
    return { from: minDate, to: maxDate };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (type === "today") {
    const dateStr = today.toISOString().split("T")[0];
    if (dateStr >= minDate && dateStr <= maxDate) {
      return { from: dateStr, to: dateStr };
    }
    // If today is before tournament, find first date with matches
    const firstMatchDate = allDates.find(d => d >= dateStr) || minDate;
    return { from: firstMatchDate, to: firstMatchDate };
  }

  if (type === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];
    if (dateStr >= minDate && dateStr <= maxDate) {
      return { from: dateStr, to: dateStr };
    }
    // If tomorrow is before tournament, find second available date if exists
    const idx = allDates.findIndex(d => d > minDate);
    if (idx >= 0 && idx < allDates.length) {
      return { from: allDates[idx], to: allDates[idx] };
    }
    return { from: minDate, to: minDate };
  }

  return null;
}

function updateDateRangeLabel() {
  const from = els.dateFrom.value;
  const to = els.dateTo.value;
  els.dateRangeLabel.textContent = formatDateRange(from, to);
}

function updateQuickButtonState(allDates) {
  const from = els.dateFrom.value;
  const to = els.dateTo.value;

  let active = "all";
  els.quickButtons.forEach((btn) => {
    const type = btn.dataset.quick;
    const range = getQuickDateRange(type, allDates);
    if (range && range.from === from && range.to === to) {
      active = type;
    }
  });

  els.quickButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.quick === active);
  });
}

function normalizeMatch(match) {
  const stadium = match.Stadium || {};
  const city = localized(stadium.CityName);
  const coords = CITY_COORDS[city] || null;
  const time = berlinParts(match.Date);
  const home = team(match, "Home");
  const away = team(match, "Away");
  const group = localized(match.GroupName);
  const stage = localized(match.StageName);
  const uefaCount = Number(UEFA_CODES.has(home.code)) + Number(UEFA_CODES.has(away.code));

  return {
    number: Number(match.MatchNumber),
    city,
    coords,
    stadium: localized(stadium.Name),
    date: time.date,
    isoDate: time.isoDate,
    weekday: time.weekday,
    kickoff: time.time,
    kickoffMinutes: time.minutes,
    group,
    stage,
    home,
    away,
    favorite: favorite(home, away),
    finalWhistle: addMinutes(time.minutes, 105),
    timeWindow: timeWindow(time.minutes),
    endsAfterMidnight: endsAfterMidnight(time.minutes),
    uefaCategory: !home.code || !away.code
      ? "Offen"
      : uefaCount === 2
        ? "EU team (both)"
        : uefaCount === 1
          ? "EU team (one)"
          : "No EU team",
  };
}

function initMap() {
  state.map = L.map("map", {
    scrollWheelZoom: true,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: "&copy; OpenStreetMap",
  }).addTo(state.map);

  Object.entries(CITY_COORDS).forEach(([city, coords]) => {
    const marker = L.marker(coords, {
      title: city,
      icon: L.divIcon({
        className: "",
        html: `<span class="city-marker">0</span>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
    });

    marker.on("popupopen", () => bindCityPopupAction(city, coords));

    state.markers.push({ city, marker });
  });

  state.map.fitBounds(Object.values(CITY_COORDS), { padding: [32, 32] });
  window.setTimeout(() => state.map.invalidateSize(), 0);
  window.addEventListener("resize", () => { state.map.invalidateSize(); syncTimeSliders(); });

  state.map.on("moveend zoomend", () => {
    if (!state.lockedCity) render();
  });
}

function bindCityPopupAction(city, coords) {
  // Use a small delay to ensure the popup DOM is fully rendered
  setTimeout(() => {
    const button = document.querySelector(`.city-action[data-city="${CSS.escape(city)}"]`);
    if (button && !button.dataset.bound) {
      button.dataset.bound = "true";
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.lockedCity = city;
        state.map.setView(coords, 8);
        render();
      });
    }
  }, 50);
}

function popupHtml(city, count) {
  return `
    <p class="popup-title">${city}</p>
    <p class="popup-meta">${count} Spiele im aktuellen Filter</p>
    <button class="city-action" data-city="${city}">Nur diese Stadt</button>
  `;
}

function markerIcon(count) {
  return L.divIcon({
    className: "",
    html: `<span class="city-marker">${count}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function updateMarkers(matches) {
  const counts = new Map();
  matches.forEach((match) => counts.set(match.city, (counts.get(match.city) || 0) + 1));

  state.markers.forEach(({ city, marker }) => {
    const count = counts.get(city) || 0;
    if (count > 0) {
      marker.setIcon(markerIcon(count));
      marker.bindPopup(popupHtml(city, count));
      if (!state.map.hasLayer(marker)) marker.addTo(state.map);
    } else if (state.map.hasLayer(marker)) {
      marker.removeFrom(state.map);
    }
  });
}

function visibleCities() {
  if (state.lockedCity) return new Set([state.lockedCity]);
  const bounds = state.map.getBounds();
  return new Set(
    Object.entries(CITY_COORDS)
      .filter(([, coords]) => bounds.contains(L.latLng(coords[0], coords[1])))
      .map(([city]) => city)
  );
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function positionBubble(slider, bubble) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const val = Number(slider.value);
  const pct = (val - min) / (max - min);
  // Offset for thumb width (~14px) so bubble centres over thumb
  const thumbW = 14;
  const trackW = slider.offsetWidth;
  const left = pct * (trackW - thumbW) + thumbW / 2;
  bubble.style.left = `${left}px`;
}

function syncTimeSliders() {
  let from = Number(els.timeFrom.value);
  let to = Number(els.timeTo.value);
  if (from > to) {
    [from, to] = [to, from];
    els.timeFrom.value = String(from);
    els.timeTo.value = String(to);
  }
  if (els.timeFromDisplay) {
    els.timeFromDisplay.textContent = minutesToTime(from);
    positionBubble(els.timeFrom, els.timeFromDisplay);
  }
  if (els.timeToDisplay) {
    els.timeToDisplay.textContent = to >= 1439 ? "23:59" : minutesToTime(to);
    positionBubble(els.timeTo, els.timeToDisplay);
  }
  return { from, to };
}

function syncDatePickers() {
  if (els.dateFrom.value && els.dateTo.value && els.dateFrom.value > els.dateTo.value) {
    const from = els.dateFrom.value;
    els.dateFrom.value = els.dateTo.value;
    els.dateTo.value = from;
  }
  return {
    fromDate: els.dateFrom.value,
    toDate: els.dateTo.value,
  };
}

function filteredMatches({ useMap }) {
  const { from, to } = syncTimeSliders();
  const { fromDate, toDate } = syncDatePickers();
  const cities = useMap ? visibleCities() : null;
  return state.matches.filter((match) => {
    const cityMatch = !cities || cities.has(match.city);
    const timeMatch = match.kickoffMinutes >= from && match.kickoffMinutes <= to;
    const dateMatch = (!fromDate || match.isoDate >= fromDate) && (!toDate || match.isoDate <= toDate);
    const groupMatch = state.activeGroups.size === 0 || state.activeGroups.has(match.group);
    const teamMatch = !state.activeTeam || match.home.code === state.activeTeam || match.away.code === state.activeTeam;
    const timeWindowMatch = state.activeTimeWindows.size === 0 || state.activeTimeWindows.has(match.timeWindow);
    return cityMatch && timeMatch && dateMatch && groupMatch && teamMatch && timeWindowMatch;
  });
}

function tagClass(value) {
  if (value === "Nacht") return "night";
  if (value === "Morgen") return "morning";
  if (value === "Abend") return "prime";
  if (value === "Spätabend") return "late";
  return "";
}

function teamLine(team) {
  const flag = team.code ? `<img class="flag" src="../assets/flags/${team.code}.png" alt="">` : `<span class="flag"></span>`;
  return `<span class="team-line">${flag}<span>${team.name}</span></span>`;
}

function renderTable(matches) {
  // Apply sorting if needed
  let displayMatches = matches;
  if (state.sortField === "kickoff") {
    displayMatches = matches.slice().sort((a, b) =>
      state.sortOrder === "asc"
        ? a.kickoffMinutes - b.kickoffMinutes
        : b.kickoffMinutes - a.kickoffMinutes
    );
  }

  if (displayMatches.length === 0) {
    els.gamesBody.innerHTML = `<tr><td colspan="7" class="muted">Keine Spiele im aktuellen Filter.</td></tr>`;
    return;
  }

  els.gamesBody.innerHTML = displayMatches.map((match) => `
    <tr>
      <td>${match.weekday}<br><span class="muted">${match.date}</span></td>
      <td><strong>${match.kickoff}</strong><br><span class="muted">Abpfiff ca. ${match.finalWhistle}</span></td>
      <td><span class="tag ${tagClass(match.timeWindow)}">${match.timeWindow}</span></td>
      <td>${match.group || match.stage}</td>
      <td class="teams">${teamLine(match.home)}${teamLine(match.away)}</td>
      <td>${match.city}<br><span class="muted">${match.stadium}</span></td>
      <td>${match.favorite || '<span class="muted">offen</span>'}</td>
    </tr>
  `).join("");

  // Update sort indicator on header
  const headers = document.querySelectorAll("th[data-sortable]");
  headers.forEach((th) => {
    th.removeAttribute("data-sort");
    if (state.sortField === th.dataset.sortable) {
      th.setAttribute("data-sort", state.sortOrder);
    }
  });
}

function renderMetrics(matches) {
  const cities = new Set(matches.map((match) => match.city));
  const late = matches.filter((match) => match.endsAfterMidnight).length;
  els.metricMatches.textContent = String(matches.length);
  els.metricCities.textContent = String(cities.size);
  els.metricLate.textContent = String(late);
}

function renderMapText(cities) {
  if (state.lockedCity) {
    els.mapFilterText.textContent = `Fixiert auf ${state.lockedCity}. Zurücksetzen zeigt wieder alle sichtbaren Kartenorte.`;
    return;
  }
  const names = [...cities].sort();
  els.mapFilterText.textContent = names.length === 16
    ? "Alle Austragungsorte im sichtbaren Kartenausschnitt."
    : `${names.length} sichtbare Orte: ${names.join(", ")}`;
}

function render() {
  const cities = visibleCities();
  const nonMapMatches = filteredMatches({ useMap: false });
  updateMarkers(nonMapMatches);
  const matches = filteredMatches({ useMap: true });
  renderMapText(cities);
  renderMetrics(matches);
  renderTable(matches);

  let status = `${matches.length} Spiele`;
  if (state.sortField === "kickoff") {
    status += `, nach Anstoß ${state.sortOrder === "asc" ? "aufsteigend" : "absteigend"}`;
  } else {
    status += ", nach Spielnummer sortiert";
  }
  els.tableStatus.textContent = status;
}

function initGroupFilters() {
  const values = [...state.groups].sort((a, b) => {
    const numberA = Number(a.match(/\d+/)?.[0] || 999);
    const numberB = Number(b.match(/\d+/)?.[0] || 999);
    return a.localeCompare(b, "de", { numeric: true }) || numberA - numberB;
  });

  els.groupFilters.innerHTML = values.map((value) => `<button class="chip" type="button" data-group="${value}">${value}</button>`).join("");
  els.groupFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-group]");
    if (!button) return;
    const value = button.dataset.group;
    if (state.activeGroups.has(value)) {
      state.activeGroups.delete(value);
      button.classList.remove("active");
    } else {
      state.activeGroups.add(value);
      button.classList.add("active");
    }
    render();
  });
}

function initTimeWindowFilters() {
  // Time windows in chronological order
  const allTimeWindows = ["Nacht", "Morgen", "Abend", "Spätabend"];

  els.timeWindowFilters.innerHTML = allTimeWindows.map((value) => `<button class="chip time-window-chip" type="button" data-timewindow="${value}">${value}</button>`).join("");
  els.timeWindowFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-timewindow]");
    if (!button) return;
    const value = button.dataset.timewindow;
    if (state.activeTimeWindows.has(value)) {
      state.activeTimeWindows.delete(value);
      button.classList.remove("active");
    } else {
      state.activeTimeWindows.add(value);
      button.classList.add("active");
    }
    render();
  });
}

function initTeamFilter() {
  const options = [...state.teams.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "de"))
    .map(([code, name]) => `<option value="${code}">${name}</option>`)
    .join("");
  els.teamFilter.insertAdjacentHTML("beforeend", options);
  els.teamFilter.addEventListener("change", () => {
    state.activeTeam = els.teamFilter.value;
    render();
  });
}

function handleTableSort(sortField) {
  if (state.sortField === sortField) {
    // Toggle sort order if same field clicked
    state.sortOrder = state.sortOrder === "asc" ? "desc" : "asc";
  } else {
    // Set new sort field and reset to ascending
    state.sortField = sortField;
    state.sortOrder = "asc";
  }
  render();
}

function initDatePickers() {
  const dates = state.matches.map((match) => match.isoDate).sort();
  const min = dates[0];
  const max = dates[dates.length - 1];
  [els.dateFrom, els.dateTo].forEach((input) => {
    input.min = min;
    input.max = max;
  });
  els.dateFrom.value = min;
  els.dateTo.value = max;

  updateDateRangeLabel();
  updateQuickButtonState(dates);

  // Quick button listeners
  els.quickButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const type = btn.dataset.quick;
      const range = getQuickDateRange(type, dates);

      if (range) {
        console.log(`Clicked ${type}: setting dates from ${range.from} to ${range.to}`);
        els.dateFrom.value = range.from;
        els.dateTo.value = range.to;
        updateDateRangeLabel();
        updateQuickButtonState(dates);
        render();
      } else {
        console.warn(`No valid range found for ${type}`);
      }
    });
  });

  // Date input listeners
  [els.dateFrom, els.dateTo].forEach((input) => {
    input.addEventListener("change", () => {
      updateDateRangeLabel();
      updateQuickButtonState(dates);
      render();
    });
  });
}

async function init() {
  const [matchesPayload, rankingsPayload] = await Promise.all([
    fetch("../data/wm_2026_matches_fifa.json").then((response) => response.json()),
    fetch("../data/fifa_mens_ranking_latest.json").then((response) => response.json()),
  ]);

  rankingsPayload.Results.forEach((item) => {
    state.rankings.set(item.IdCountry, {
      rank: item.Rank,
      points: item.DecimalTotalPoints,
      team: localized(item.TeamName, item.IdCountry),
    });
  });

  state.matches = matchesPayload.Results
    .filter((match) => localized(match.StageName) === "First Stage")
    .map(normalizeMatch)
    .sort((a, b) => a.number - b.number);

  state.matches.forEach((match) => {
    state.groups.add(match.group);
    if (match.home.code) state.teams.set(match.home.code, match.home.name);
    if (match.away.code) state.teams.set(match.away.code, match.away.name);
  });

  initGroupFilters();
  initTeamFilter();
  initTimeWindowFilters();
  initDatePickers();
  initMap();
  syncTimeSliders();
  render();

  // Add sortable header click listeners
  document.querySelectorAll("th[data-sortable]").forEach((th) => {
    th.addEventListener("click", () => {
      handleTableSort(th.dataset.sortable);
    });
  });

  els.timeFrom.addEventListener("input", () => {
    syncTimeSliders();
    render();
  });
  els.timeTo.addEventListener("input", () => {
    syncTimeSliders();
    render();
  });
  els.resetGroups.addEventListener("click", () => {
    state.activeGroups.clear();
    document.querySelectorAll(".chip.active").forEach((chip) => chip.classList.remove("active"));
    render();
  });
  els.resetMap.addEventListener("click", () => {
    state.lockedCity = null;
    state.map.setView([39, -98], 4);
    render();
  });
  els.resetTeam.addEventListener("click", () => {
    state.activeTeam = "";
    els.teamFilter.value = "";
    render();
  });
  els.resetTimeWindows.addEventListener("click", () => {
    state.activeTimeWindows.clear();
    document.querySelectorAll(".time-window-chip.active").forEach((chip) => chip.classList.remove("active"));
    render();
  });
}

init().catch((error) => {
  console.error(error);
  els.gamesBody.innerHTML = `<tr><td colspan="7">Die Daten konnten nicht geladen werden.</td></tr>`;
});

// Register service worker for PWA / offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })
      .then(() => console.log('[SW] Registered'))
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}
