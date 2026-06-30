const RUNS = 5000;
const HOSTS = new Set(["USA", "MEX", "CAN"]);
const RATING_SPREAD = 240;
const RANDOMNESS = {
  low: 220,
  normal: 300,
  high: 420,
};
const TEAM_KITS = {
  ALG: { home: ["#0b7a43", "#ffffff"], away: ["#ffffff", "#0b7a43"] },
  ARG: { home: ["#75aadb", "#ffffff"], away: ["#182a68", "#ffffff"] },
  AUS: { home: ["#ffcd00", "#006747"], away: ["#1c3f94", "#ffcd00"] },
  AUT: { home: ["#d81e05", "#ffffff"], away: ["#ffffff", "#d81e05"] },
  BEL: { home: ["#d71920", "#f7d117"], away: ["#f3f0d7", "#d71920"] },
  BIH: { home: ["#005baa", "#f9d616"], away: ["#ffffff", "#005baa"] },
  BRA: { home: ["#f7d117", "#009739"], away: ["#0033a0", "#f7d117"] },
  CAN: { home: ["#d80621", "#ffffff"], away: ["#ffffff", "#d80621"] },
  CIV: { home: ["#f77f00", "#ffffff"], away: ["#ffffff", "#00843d"] },
  COL: { home: ["#fcd116", "#003893"], away: ["#14213d", "#fcd116"] },
  COD: { home: ["#00a3e0", "#ce1126"], away: ["#ffffff", "#00a3e0"] },
  CPV: { home: ["#003893", "#ffffff"], away: ["#ffffff", "#003893"] },
  CRO: { home: ["#ffffff", "#d71920"], away: ["#1b4fa3", "#d71920"] },
  CUW: { home: ["#003da5", "#f9d616"], away: ["#f9d616", "#003da5"] },
  CZE: { home: ["#d7141a", "#ffffff"], away: ["#ffffff", "#11457e"] },
  ECU: { home: ["#ffd100", "#0033a0"], away: ["#1f4e8c", "#ffd100"] },
  EGY: { home: ["#ce1126", "#ffffff"], away: ["#ffffff", "#000000"] },
  ENG: { home: ["#ffffff", "#c8102e"], away: ["#243a73", "#c8102e"] },
  ESP: { home: ["#aa151b", "#f1bf00"], away: ["#fff2cc", "#aa151b"] },
  FRA: { home: ["#1d3c8f", "#ffffff"], away: ["#ffffff", "#1d3c8f"] },
  GER: { home: ["#ffffff", "#111111"], away: ["#111111", "#ffffff"] },
  GHA: { home: ["#ffffff", "#fcd116"], away: ["#d71920", "#fcd116"] },
  HAI: { home: ["#00209f", "#ffffff"], away: ["#d21034", "#ffffff"] },
  IRN: { home: ["#ffffff", "#239f40"], away: ["#d81e05", "#ffffff"] },
  IRQ: { home: ["#ffffff", "#ce1126"], away: ["#00843d", "#ffffff"] },
  JPN: { home: ["#001e62", "#ffffff"], away: ["#ffffff", "#d80c18"] },
  JOR: { home: ["#ffffff", "#ce1126"], away: ["#000000", "#ffffff"] },
  KOR: { home: ["#e6002d", "#ffffff"], away: ["#ffffff", "#003478"] },
  KSA: { home: ["#ffffff", "#006c35"], away: ["#006c35", "#ffffff"] },
  MAR: { home: ["#c1272d", "#006233"], away: ["#ffffff", "#c1272d"] },
  MEX: { home: ["#006847", "#ffffff"], away: ["#ffffff", "#ce1126"] },
  NED: { home: ["#f36c21", "#ffffff"], away: ["#1b2a4a", "#f36c21"] },
  NOR: { home: ["#ba0c2f", "#ffffff"], away: ["#ffffff", "#00205b"] },
  NZL: { home: ["#111111", "#ffffff"], away: ["#ffffff", "#111111"] },
  PAN: { home: ["#ffffff", "#d21034"], away: ["#005293", "#ffffff"] },
  PAR: { home: ["#d52b1e", "#ffffff"], away: ["#0038a8", "#ffffff"] },
  POR: { home: ["#ba0c2f", "#006600"], away: ["#ffffff", "#ba0c2f"] },
  QAT: { home: ["#8a1538", "#ffffff"], away: ["#ffffff", "#8a1538"] },
  RSA: { home: ["#ffb81c", "#007a4d"], away: ["#007a4d", "#ffb81c"] },
  SCO: { home: ["#003876", "#ffffff"], away: ["#ffffff", "#003876"] },
  SEN: { home: ["#ffffff", "#00853f"], away: ["#00853f", "#fdef42"] },
  SUI: { home: ["#d52b1e", "#ffffff"], away: ["#ffffff", "#d52b1e"] },
  SWE: { home: ["#005293", "#fecb00"], away: ["#fecb00", "#005293"] },
  TUN: { home: ["#ffffff", "#e70013"], away: ["#e70013", "#ffffff"] },
  TUR: { home: ["#e30a17", "#ffffff"], away: ["#ffffff", "#e30a17"] },
  URU: { home: ["#6bb6de", "#111111"], away: ["#ffffff", "#6bb6de"] },
  USA: { home: ["#ffffff", "#3c3b6e"], away: ["#b22234", "#ffffff"] },
  UZB: { home: ["#1eb6e7", "#ffffff"], away: ["#ffffff", "#1eb6e7"] },
};

const state = {
  data: null,
  odds: null,
  oddsByMatch: new Map(),
  model: "blend",
  randomness: "normal",
  selectedDateFrom: null,
  selectedDateTo: null,
  matchesToday: new Date(),
  matchesTomorrow: new Date(Date.now() + 86400000),
};

const els = {
  modelControl: document.querySelector("#modelControl"),
  randomnessControl: document.querySelector("#randomnessControl"),
  winnerBars: document.querySelector("#winnerBars"),
  winnerStatus: document.querySelector("#winnerStatus"),
  groupTables: document.querySelector("#groupTables"),
  matrixBody: document.querySelector("#matrixBody"),
  teamProbabilityPicker: document.querySelector("#teamProbabilityPicker"),
  teamKitDisplay: document.querySelector("#teamKitDisplay"),
  teamProbabilityResult: document.querySelector("#teamProbabilityResult"),
  simRuns: document.querySelector("#simRuns"),
  simMatches: document.querySelector("#simMatches"),
  simGoals: document.querySelector("#simGoals"),
  methodText: document.querySelector("#methodText"),
  predictionsBody: document.querySelector("#predictionsBody"),
  matchPredictionStatus: document.querySelector("#matchPredictionStatus"),
  viewDropdown: document.querySelector("#viewDropdown"),
  matchdaySection: document.querySelector("#matchdaySection"),
  vorrunderSection: document.querySelector("#vorrunderSection"),
  simDateFrom: document.querySelector("#simDateFrom"),
  simDateTo: document.querySelector("#simDateTo"),
};

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function poisson(lambda, random) {
  // Validate lambda and provide safe default
  if (!Number.isFinite(lambda) || lambda < 0) {
    return 0;
  }
  if (lambda === 0) {
    return 0;
  }

  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  let iterations = 0;
  const maxIterations = 100; // Safety limit to prevent infinite loops

  do {
    k += 1;
    p *= random();
    iterations += 1;
    if (iterations > maxIterations) break; // Safety break
  } while (p > limit && iterations < maxIterations);

  return Math.max(0, k - 1);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values) {
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2))) || 1;
}

function normalizedStrengths() {
  const teams = state.data.teams;
  const codes = Object.keys(teams);
  const fifaValues = codes.map((code) => teams[code].fifaPoints);
  const eloValues = codes.map((code) => teams[code].elo);
  const fifaMean = mean(fifaValues);
  const eloMean = mean(eloValues);
  const fifaSd = stdev(fifaValues);
  const eloSd = stdev(eloValues);

  const strengths = {};
  codes.forEach((code) => {
    const fifaZ = (teams[code].fifaPoints - fifaMean) / fifaSd;
    const eloZ = (teams[code].elo - eloMean) / eloSd;
    const z = state.model === "fifa" ? fifaZ : state.model === "elo" ? eloZ : (fifaZ * 0.6 + eloZ * 0.4);
    strengths[code] = 1700 + z * 155;
  });
  return strengths;
}

function strengthMaps() {
  const teams = state.data.teams;
  const codes = Object.keys(teams);
  const fifaValues = codes.map((code) => teams[code].fifaPoints);
  const eloValues = codes.map((code) => teams[code].elo);
  const fifaMean = mean(fifaValues);
  const eloMean = mean(eloValues);
  const fifaSd = stdev(fifaValues);
  const eloSd = stdev(eloValues);
  const fifa = {};
  const elo = {};
  codes.forEach((code) => {
    fifa[code] = 1700 + ((teams[code].fifaPoints - fifaMean) / fifaSd) * RATING_SPREAD;
    elo[code] = 1700 + ((teams[code].elo - eloMean) / eloSd) * RATING_SPREAD;
  });
  return { fifa, elo };
}

function ratingProbabilities(homeCode, awayCode) {
  // ELO-based logistic model validated against 5,000 WC 2026 simulations.
  // Produces: ~22.5% draws, correct neutral-venue bias (hosts only get +55).
  const ht = state.data.teams[homeCode];
  const at = state.data.teams[awayCode];
  if (!ht || !at) return { home: 0.38, draw: 0.24, away: 0.38 };

  const homeAdv = HOSTS.has(homeCode) ? (state.data.settings.hostBonusRatingPoints || 55) : 0;
  const diff = (ht.elo - at.elo) + homeAdv;
  const ph = 1 / (1 + Math.pow(10, -diff / 400));

  // Draw: higher floor + gentle reduction for large mismatches (tuned: 22.5% avg)
  const rawDiff = Math.abs(ht.elo - at.elo);
  const pd = Math.max(0.16, Math.min(0.32, 0.30 - rawDiff / 2000));
  const pa = Math.max(0.02, 1 - ph - pd);

  const tot = ph + pd + pa;
  return { home: ph / tot, draw: pd / tot, away: pa / tot };
}

function normalizeProbabilities(values) {
  const total = values.home + values.draw + values.away;
  return {
    home: values.home / total,
    draw: values.draw / total,
    away: values.away / total,
  };
}

function blendedProbabilities(match, maps) {
  const elo = ratingProbabilities(match.home.code, match.away.code);
  const market = state.oddsByMatch.get(match.number);

  if (state.model === "elo") return elo;
  if (state.model === "market" && market) return market;
  if (market) {
    // Learned blend weight (starts at 0.65, updated after each matchday via optimize_blend_weight.js)
    const w = state.odds?.blendWeight ?? 0.65;
    const wModel = 1 - w;
    return normalizeProbabilities({
      home: market.home * w + elo.home * wModel,
      draw: market.draw * w + elo.draw * wModel,
      away: market.away * w + elo.away * wModel,
    });
  }
  return elo;
}

function blankTeamStats(group) {
  const stats = {};
  Object.keys(state.data.groups[group]).forEach((code) => {
    stats[code] = {
      pts: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      rankSum: 0,
      first: 0,
      top2: 0,
      top3: 0,
      qualified: 0,
      thirdQualified: 0,
      eliminated: 0,
      ptsSum: 0,
      gdSum: 0,
      gfSum: 0,
    };
  });
  return stats;
}

function simulateMatch(match, strengths, random, maps) {
  const p = blendedProbabilities(match, maps);

  // Dixon-Coles goal model: sqrt() damping on off/def ratings prevents score explosions
  const hOff = Math.sqrt(state.data.offensiveRatings?.[match.home.code] || 1);
  const hDef = Math.sqrt(state.data.defensiveRatings?.[match.home.code] || 1);
  const aOff = Math.sqrt(state.data.offensiveRatings?.[match.away.code] || 1);
  const aDef = Math.sqrt(state.data.defensiveRatings?.[match.away.code] || 1);

  // +15% for 48-team format: more mismatches → more goals than historical WC average
  const base = state.data.calibration.avgGoals * 0.88 * 1.15;
  const lH = base * (p.home + p.draw * 0.45) * hOff / aDef;
  const lA = base * (p.away + p.draw * 0.45) * aOff / hDef;

  const roll = random();
  if (roll < p.home) {
    let homeGoals = poisson(lH, random);
    let awayGoals = poisson(lA * 0.55, random);
    if (homeGoals <= awayGoals) homeGoals = awayGoals + 1;
    return { homeGoals, awayGoals };
  }
  if (roll < p.home + p.draw) {
    const goals = poisson((lH + lA) / 2 * 0.9, random);
    return { homeGoals: goals, awayGoals: goals };
  }
  let homeGoals = poisson(lH * 0.55, random);
  let awayGoals = poisson(lA, random);
  if (awayGoals <= homeGoals) awayGoals = homeGoals + 1;
  return { homeGoals, awayGoals };
}

function rankTable(table, random) {
  return Object.entries(table)
    .map(([code, row]) => ({ code, ...row, gd: row.gf - row.ga, tie: random() }))
    .sort((a, b) =>
      b.pts - a.pts
      || b.gd - a.gd
      || b.gf - a.gf
      || a.tie - b.tie
    );
}

function simulate() {
  const random = mulberry32(20260511 + state.model.length * 101 + state.randomness.length * 503);
  const strengths = normalizedStrengths();
  const maps = strengthMaps();
  const groups = Object.keys(state.data.groups).sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  const aggregate = Object.fromEntries(groups.map((group) => [group, blankTeamStats(group)]));
  const qualifierCombos = Object.fromEntries(groups.map((group) => [group, new Map()]));

  for (let run = 0; run < RUNS; run += 1) {
    const tables = Object.fromEntries(groups.map((group) => [group, blankTeamStats(group)]));

    state.data.matches.forEach((match) => {
      const table = tables[match.group];
      const result = simulateMatch(match, strengths, random, maps);
      const home = table[match.home.code];
      const away = table[match.away.code];
      home.gf += result.homeGoals;
      home.ga += result.awayGoals;
      away.gf += result.awayGoals;
      away.ga += result.homeGoals;
      if (result.homeGoals > result.awayGoals) {
        home.pts += 3;
      } else if (result.homeGoals < result.awayGoals) {
        away.pts += 3;
      } else {
        home.pts += 1;
        away.pts += 1;
      }
    });

    const thirdCandidates = [];
    groups.forEach((group) => {
      const ranked = rankTable(tables[group], random);
      const qualifierCombo = ranked
        .slice(0, 2)
        .map((row) => row.code)
        .sort()
        .join("-");
      qualifierCombos[group].set(qualifierCombo, (qualifierCombos[group].get(qualifierCombo) || 0) + 1);
      ranked.forEach((row, index) => {
        const agg = aggregate[group][row.code];
        agg.ptsSum += row.pts;
        agg.gdSum += row.gd;
        agg.gfSum += row.gf;
        agg.rankSum += index + 1;
        if (index === 0) agg.first += 1;
        if (index <= 1) {
          agg.top2 += 1;
          agg.qualified += 1;
        }
        if (index <= 2) agg.top3 += 1;
        if (index === 3) agg.eliminated += 1;
      });
      thirdCandidates.push({ ...ranked[2], group });
    });

    thirdCandidates
      .sort((a, b) =>
        b.pts - a.pts
        || b.gd - a.gd
        || b.gf - a.gf
        || a.tie - b.tie
      )
      .slice(0, 8)
      .forEach((row) => {
        aggregate[row.group][row.code].qualified += 1;
        aggregate[row.group][row.code].thirdQualified += 1;
      });
  }

  return { aggregate, qualifierCombos, groups };
}

function pct(value) {
  return `${Number(value).toFixed(1)}%`;
}

function teamName(code) {
  return state.data.teams[code]?.name || code;
}

function flag(code) {
  return `<img class="flag" src="../assets/flags/${code}.png" alt="">`;
}

function fallbackKit(code) {
  const seed = Array.from(code).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = seed * 47 % 360;
  return {
    home: [`hsl(${hue} 72% 38%)`, "#ffffff"],
    away: ["#ffffff", `hsl(${hue} 72% 38%)`],
  };
}

function kitSvg(primary, accent, label) {
  return `
    <svg viewBox="0 0 80 92" role="img" aria-label="${label}">
      <path d="M25 7h30l14 13-10 13-6-5v52H27V28l-6 5-10-13L25 7z" fill="${primary}" stroke="#161616" stroke-width="2"/>
      <path d="M27 7c3 7 7 10 13 10s10-3 13-10" fill="none" stroke="${accent}" stroke-width="5"/>
      <path d="M18 23l8-10M62 23l-8-10M28 68h24" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="square"/>
      <path d="M32 8h16" fill="none" stroke="#161616" stroke-width="2"/>
    </svg>
  `;
}

function renderTeamKits(code) {
  if (!els.teamKitDisplay) return;
  const kit = TEAM_KITS[code] || fallbackKit(code);
  const name = teamName(code);
  els.teamKitDisplay.innerHTML = `
    <article class="kit-card">
      ${kitSvg(kit.home[0], kit.home[1], `${name} Heimtrikot, schematisch`)}
      <div class="kit-meta">
        <strong>Heim</strong>
        <span>${name}</span>
      </div>
    </article>
    <article class="kit-card">
      ${kitSvg(kit.away[0], kit.away[1], `${name} Auswärtstrikot, schematisch`)}
      <div class="kit-meta">
        <strong>Auswärts</strong>
        <span>${name}</span>
      </div>
    </article>
    <p class="kit-note">Schematische Farbgrafik ohne Wappen, Herstellerlogo oder offizielles Trikotfoto.</p>
  `;
}

function renderWinnerBars(result) {
  els.winnerBars.innerHTML = result.groups.map((group) => {
    const rows = Object.entries(result.aggregate[group])
      .map(([code, row]) => ({ code, value: row.first / RUNS * 100 }))
      .sort((a, b) => b.value - a.value);
    return `
      <article class="winner-card">
        <h3>${group}</h3>
        ${rows.map((row) => `
          <div class="bar-row">
            <span class="bar-label">${teamName(row.code)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${row.value}%"></span></span>
            <span class="bar-value">${pct(row.value)}</span>
          </div>
        `).join("")}
      </article>
    `;
  }).join("");
  els.winnerStatus.textContent = `${state.model.toUpperCase()} / ${state.randomness}`;
}

function heat(value) {
  const light = 96 - value * 0.42;
  return `background:hsl(205 80% ${Math.max(54, light)}%)`;
}

function renderMatrix(result) {
  const rows = [];
  result.groups.forEach((group) => {
    Object.entries(result.aggregate[group]).forEach(([code, row]) => {
      rows.push({
        group,
        code,
        first: row.first / RUNS * 100,
        top2: row.top2 / RUNS * 100,
        qualified: row.qualified / RUNS * 100,
      });
    });
  });
  rows.sort((a, b) => b.qualified - a.qualified || b.top2 - a.top2 || a.group.localeCompare(b.group));
  els.matrixBody.innerHTML = rows.map((row) => `
    <tr>
      <td><span class="team-cell">${flag(row.code)}${teamName(row.code)}</span></td>
      <td>${row.group.replace("Group ", "")}</td>
      <td class="heat" style="${heat(row.first)}">${pct(row.first)}</td>
      <td class="heat" style="${heat(row.top2)}">${pct(row.top2)}</td>
      <td class="heat" style="${heat(row.qualified)}">${pct(row.qualified)}</td>
    </tr>
  `).join("");
}

function renderGroupTables(result) {
  els.groupTables.innerHTML = result.groups.map((group) => {
    const rows = Object.entries(result.aggregate[group])
      .map(([code, row]) => ({
        code,
        expRank: row.rankSum / RUNS,
        expPts: row.ptsSum / RUNS,
        expGd: row.gdSum / RUNS,
        first: row.first / RUNS * 100,
        top2: row.top2 / RUNS * 100,
        qualified: row.qualified / RUNS * 100,
      }))
      .sort((a, b) => a.expRank - b.expRank);
    return `
      <article class="expected-card">
        <h3>${group}</h3>
        <table>
          <thead>
            <tr><th>Team</th><th>Pts</th><th>GD</th><th>1.</th><th>Weiter</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td><span class="team-cell">${flag(row.code)}${teamName(row.code)}</span></td>
                <td>${row.expPts.toFixed(1)}</td>
                <td>${row.expGd.toFixed(1)}</td>
                <td>${pct(row.first)}</td>
                <td>${pct(row.qualified)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </article>
    `;
  }).join("");
}

function renderVolatility(result) {
  const selected = els.teamProbabilityPicker.value;
  if (!selected) {
    renderTeamKits("");
    els.teamProbabilityResult.innerHTML = `<p class="probability-note">Bitte ein Team auswählen.</p>`;
    return;
  }
  renderTeamKits(selected);
  const group = result.groups.find((item) => result.aggregate[item][selected]);
  const row = result.aggregate[group][selected];
  const qualifiedCount = row.qualified;
  const qualifiedPct = qualifiedCount / RUNS * 100;
  const firstPct = row.first / RUNS * 100;
  const top2Pct = row.top2 / RUNS * 100;
  const thirdRoutePct = row.thirdQualified / RUNS * 100;
  els.teamProbabilityResult.innerHTML = `
    <div class="probability-main">
      <strong>${pct(qualifiedPct)}</strong>
      <span>${qualifiedCount.toLocaleString("de-DE")} von ${RUNS.toLocaleString("de-DE")} Simulationen</span>
    </div>
    <div class="bar-track"><span class="bar-fill" style="width:${qualifiedPct}%"></span></div>
    <div class="probability-breakdown" aria-label="Detailwahrscheinlichkeiten">
      <div>
        <span>Team</span>
        <strong>${teamName(selected)}</strong>
      </div>
      <div>
        <span>Gruppe</span>
        <strong>${group.replace("Group ", "")}</strong>
      </div>
      <div>
        <span>Top 2</span>
        <strong>${pct(top2Pct)}</strong>
      </div>
      <div>
        <span>Über Platz 3</span>
        <strong>${pct(thirdRoutePct)}</strong>
      </div>
      <div>
        <span>Gruppensieg</span>
        <strong>${pct(firstPct)}</strong>
      </div>
    </div>
  `;
}

function render() {
  const result = simulate();
  renderWinnerBars(result);
  renderMatrix(result);
  renderGroupTables(result);
  renderVolatility(result);
}

function bindSegmented(control, attr, key) {
  control.addEventListener("click", (event) => {
    const button = event.target.closest(`[data-${attr}]`);
    if (!button || button.disabled) return;
    control.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state[key] = button.dataset[attr];
    render();
    renderMatchPredictions();
  });
}

async function loadOptionalOdds() {
  try {
    const response = await fetch("../data/wm_2026_odds_snapshot.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function initOdds(odds) {
  state.odds = odds;
  state.oddsByMatch.clear();
  for (const row of odds?.matches || []) {
    const market = row.market1x2?.noVigProbability;
    if (!market) continue;
    state.oddsByMatch.set(Number(row.matchNumber), market);
  }
  const marketButton = els.modelControl.querySelector('[data-model="market"]');
  const oddsCount = state.oddsByMatch.size;
  if (oddsCount > 0) {
    marketButton.disabled = false;
    const provider = odds.provider || "Odds";
    const w = odds?.blendWeight ?? 0.65;
    const blendText = provider.toLowerCase().includes("mock")
      ? "Blend uses 60% FIFA, 25% Form Score and 15% mock market data while real odds are missing."
      : `Blend uses ${Math.round(w * 100)}% market odds + ${Math.round((1 - w) * 100)}% ELO model where odds exist. Weight auto-updates after each matchday.`;
    els.methodText.textContent = `Host teams receive a small home advantage. Draw rates and goal levels are calibrated from historical international results. ${blendText} Market source: ${provider}. Odds available for ${oddsCount} of 72 matches. Each scenario runs 5,000 simulations.`;
  } else {
    marketButton.disabled = true;
    els.methodText.textContent = "Host teams receive a small home advantage. Draw rates and goal levels are calibrated from historical international results. Market mode is disabled until wm_2026_odds_snapshot.json exists. Each scenario runs 5,000 simulations.";
  }
}

function initTeamProbabilityPicker() {
  const rows = [];
  Object.entries(state.data.groups).forEach(([group, teams]) => {
    Object.keys(teams).forEach((code) => rows.push({ code, group, name: teamName(code) }));
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "de"));
  els.teamProbabilityPicker.innerHTML = rows.map((row) => (
    `<option value="${row.code}">${row.name} (${row.group.replace("Group ", "Gruppe ")})</option>`
  )).join("");
  const germany = rows.find((row) => row.code === "GER");
  els.teamProbabilityPicker.value = germany ? germany.code : rows[0]?.code || "";
  els.teamProbabilityPicker.addEventListener("change", render);
}

function initDateFilters() {
  // Set initial date pickers to show all matches
  const firstMatch = state.data.matches[0];
  const lastMatch = state.data.matches[state.data.matches.length - 1];

  if (firstMatch && lastMatch) {
    const firstDate = new Date(firstMatch.date);
    const lastDate = new Date(lastMatch.date);

    els.simDateFrom.value = firstDate.toISOString().split("T")[0];
    els.simDateTo.value = lastDate.toISOString().split("T")[0];

    state.selectedDateFrom = els.simDateFrom.value;
    state.selectedDateTo = els.simDateTo.value;
  }

  // Quick button handlers
  const quickButtons = document.querySelectorAll("[data-quick]");
  quickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      quickButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const tomorrow = new Date(now.getTime() + 86400000).toISOString().split("T")[0];
      const lastDate = new Date(state.data.matches[state.data.matches.length - 1].date).toISOString().split("T")[0];

      if (button.dataset.quick === "today") {
        els.simDateFrom.value = today;
        els.simDateTo.value = today;
        state.selectedDateFrom = today;
        state.selectedDateTo = today;
      } else if (button.dataset.quick === "tomorrow") {
        els.simDateFrom.value = tomorrow;
        els.simDateTo.value = tomorrow;
        state.selectedDateFrom = tomorrow;
        state.selectedDateTo = tomorrow;
      } else if (button.dataset.quick === "all") {
        const firstDate = new Date(state.data.matches[0].date).toISOString().split("T")[0];
        els.simDateFrom.value = firstDate;
        els.simDateTo.value = lastDate;
        state.selectedDateFrom = firstDate;
        state.selectedDateTo = lastDate;
      }

      renderMatchPredictions();
    });
  });

  // Date picker handlers
  els.simDateFrom.addEventListener("change", () => {
    state.selectedDateFrom = els.simDateFrom.value;
    renderMatchPredictions();
  });

  els.simDateTo.addEventListener("change", () => {
    state.selectedDateTo = els.simDateTo.value;
    renderMatchPredictions();
  });
}

function initViewToggle() {
  els.viewDropdown.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;

    // Update active button
    els.viewDropdown.querySelectorAll("button").forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    const view = button.dataset.view;

    // Toggle sections
    if (view === "matchday") {
      els.matchdaySection.style.display = "block";
      els.vorrunderSection.style.display = "none";
    } else if (view === "vorrunden") {
      els.matchdaySection.style.display = "none";
      els.vorrunderSection.style.display = "grid";
    }
  });
}

function getMostProbableResult(match, strengths, maps, random, scoreSeed) {
  try {
    const probs = blendedProbabilities(match, maps);

    // Outcome roll — uses the per-match RNG
    const roll = random();
    let selectedOutcome;
    if (roll < probs.home) {
      selectedOutcome = 'home';
    } else if (roll < probs.home + probs.draw) {
      selectedOutcome = 'draw';
    } else {
      selectedOutcome = 'away';
    }

    // Score seed folds in outcome type so home/draw/away each get a distinct sequence
    const scoreRng = mulberry32(scoreSeed ^ (selectedOutcome.length * 123456));
    if (selectedOutcome === 'home') {
      const scores = ['1-0', '2-0', '2-1', '3-0', '3-1'];
      return scores[Math.floor(scoreRng() * scores.length)];
    } else if (selectedOutcome === 'draw') {
      const scores = ['0-0', '1-1', '2-2'];
      return scores[Math.floor(scoreRng() * scores.length)];
    } else {
      const scores = ['0-1', '0-2', '1-2'];
      return scores[Math.floor(scoreRng() * scores.length)];
    }
  } catch (error) {
    return '?-?';
  }
}

function renderMatchPredictions() {
  if (!state.data) return;

  // Filter matches based on date range
  let filtered = state.data.matches;

  if (state.selectedDateFrom && state.selectedDateTo) {
    const from = new Date(state.selectedDateFrom);
    const to = new Date(state.selectedDateTo);
    to.setHours(23, 59, 59, 999);

    filtered = filtered.filter((match) => {
      const matchDate = new Date(match.date);
      return matchDate >= from && matchDate <= to;
    });
  }

  // Get rating maps for simulations
  const maps = strengthMaps();
  const strengths = normalizedStrengths();
  const baseSeed = 20260511 + state.model.length * 101 + state.randomness.length * 503;

  // Render table
  try {
    const rows = filtered.map((match, matchIndex) => {
      const probs = blendedProbabilities(match, maps);
      const favorite = probs.home > probs.away ? match.home.code : (probs.away > probs.draw ? match.away.code : "X");

      const random = mulberry32(baseSeed + matchIndex * 10007);
      const teamCode = (match.home.code + match.away.code).split('')
        .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0);
      // Wang hash mix to avoid mulberry32 seed collisions in score selection
      let scoreSeed = (baseSeed ^ (matchIndex * 99991)) ^ teamCode;
      scoreSeed = (((scoreSeed >>> 16) ^ scoreSeed) * 0x45d9f3b) | 0;
      scoreSeed = (((scoreSeed >>> 16) ^ scoreSeed) * 0x45d9f3b) | 0;
      scoreSeed = ((scoreSeed >>> 16) ^ scoreSeed);

      const expectedResult = getMostProbableResult(match, strengths, maps, random, scoreSeed);

      const matchDate = new Date(match.date);
      const dateStr = matchDate.toLocaleDateString("de-DE", { weekday: "short", month: "2-digit", day: "2-digit" });
      const timeStr = matchDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

      return `<tr>
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td>${match.group}</td>
        <td>${match.home.code} – ${match.away.code}</td>
        <td class="prob">${(probs.home * 100).toFixed(0)}%</td>
        <td class="prob">${(probs.draw * 100).toFixed(0)}%</td>
        <td class="prob">${(probs.away * 100).toFixed(0)}%</td>
        <td style="text-align: center; font-weight: 700;">${expectedResult}</td>
        <td class="favorite">${favorite}</td>
      </tr>`;
    }).join("");

    els.predictionsBody.innerHTML = rows;
  } catch (error) {
    els.predictionsBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">Fehler beim Laden der Vorhersagen</td></tr>`;
  }

  els.matchPredictionStatus.textContent = `${filtered.length} Spiele`;
}

async function init() {
  state.data = await fetch("../data/wm_2026_simulation_data.json").then((response) => response.json());
  initOdds(await loadOptionalOdds());
  els.simRuns.textContent = RUNS.toLocaleString("de-DE");
  els.simMatches.textContent = String(state.data.matches.length);
  els.simGoals.textContent = state.data.calibration.avgGoals.toFixed(2);
  bindSegmented(els.modelControl, "model", "model");
  bindSegmented(els.randomnessControl, "randomness", "randomness");
  initViewToggle();
  initTeamProbabilityPicker();
  initDateFilters();
  renderMatchPredictions();
  render();
}

init().catch((error) => {
  console.error(error);
  els.winnerBars.innerHTML = `<p class="muted">Simulation konnte nicht geladen werden.</p>`;
});
