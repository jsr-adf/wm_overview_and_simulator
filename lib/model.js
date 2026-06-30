'use strict';
/**
 * lib/model.js — Tipp-Modell (pure functions)
 *
 * Alle Funktionen sind zustandslos und dateninjiziert → direkt testbar.
 * Wird von kicktipp_http.js, kicktipp_swing_check.js und app/simulation.js genutzt.
 *
 * Verwendung:
 *   const { createModel } = require('./lib/model');
 *   const model = createModel(simulationData, oddsMap, koOddsMap);
 *   const tip   = model.bestScore('GER', 'FRA', { noDraws: false });
 *   const probs = model.blendedProbs('GER', 'FRA');
 */

// Poisson-PMF: P(X=k | lambda=l)
function pmf(l, k) {
  if (l <= 0) return k === 0 ? 1 : 0;
  let r = -l + k * Math.log(l);
  for (let i = 1; i <= k; i++) r -= Math.log(i);
  return Math.exp(r);
}

/**
 * createModel — baut alle Hilfsfunktionen mit den gegebenen Daten.
 *
 * @param {object} data        - wm_2026_simulation_data.json
 * @param {object} oddsMap     - { [matchNumber]: { home, draw, away } }  (Gruppenphase)
 * @param {object} koOddsMap   - { "HOM|AWA": { noVigProbability: {...} } } (KO-Runde)
 * @param {Set}    hosts       - Set von FIFA-Codes der Gastgeberteams (Heimvorteil)
 * @param {number} blendWeight - Gewichtung Marktquoten vs ELO (default 0.65)
 */
function createModel(data, oddsMap = {}, koOddsMap = {}, hosts = new Set(['USA','MEX','CAN']), blendWeight = 0.65) {
  const { teams, offensiveRatings: off, defensiveRatings: def, calibration } = data;

  /** ELO-basierte 1x2-Wahrscheinlichkeiten */
  function eloProbs(hc, ac) {
    const ht = teams[hc], at = teams[ac];
    if (!ht || !at) return { home: 0.38, draw: 0.24, away: 0.38 };
    const homeAdv = hosts.has(hc) ? 55 : 0;
    const diff    = (ht.elo - at.elo) + homeAdv;
    const ph = 1 / (1 + Math.pow(10, -diff / 400));
    const pd = Math.max(0.16, Math.min(0.32, 0.30 - Math.abs(ht.elo - at.elo) / 2000));
    const pa = Math.max(0.02, 1 - ph - pd);
    const tot = ph + pd + pa;
    return { home: ph / tot, draw: pd / tot, away: pa / tot };
  }

  /** 65% Marktquoten + 35% ELO (oder reines ELO wenn keine Quoten vorhanden) */
  function blendedProbs(hc, ac, matchNumber = null) {
    const mp = (matchNumber != null ? oddsMap[matchNumber] : null)
            || koOddsMap[`${hc}|${ac}`]?.noVigProbability
            || koOddsMap[`${ac}|${hc}`]?.noVigProbability;
    if (!mp) return eloProbs(hc, ac);
    const ep = eloProbs(hc, ac);
    const w  = blendWeight;
    return {
      home: w * mp.home + (1 - w) * ep.home,
      draw: w * mp.draw + (1 - w) * ep.draw,
      away: w * mp.away + (1 - w) * ep.away,
    };
  }

  /**
   * Dixon-Coles-basiertes bestes Ergebnis.
   *
   * @param {string}  hc       - Heimteam FIFA-Code
   * @param {string}  ac       - Auswärtsteam FIFA-Code
   * @param {object}  opts
   * @param {boolean} opts.noDraws    - KO-Runde: kein Unentschieden (default false)
   * @param {number}  opts.matchNumber - Spielnummer für oddsMap-Lookup
   * @returns {{ h: number, a: number, prob: number, probs: object }}
   */
  function bestScore(hc, ac, { noDraws = false, matchNumber = null } = {}) {
    const p    = blendedProbs(hc, ac, matchNumber);
    const base = calibration.avgGoals * 0.88 * 1.15;
    const lH   = base * (p.home + p.draw * 0.45) * Math.sqrt(off[hc] || 1) / Math.sqrt(def[ac] || 1);
    const lA   = base * (p.away + p.draw * 0.45) * Math.sqrt(off[ac] || 1) / Math.sqrt(def[hc] || 1);

    let best = { h: 1, a: 0, prob: -1 };
    for (let h = 0; h <= 7; h++) {
      for (let a = 0; a <= 7; a++) {
        if (noDraws && h === a) continue;
        const pr = h > a ? p.home * pmf(lH, h) * pmf(lA * 0.55, a)
                 : h < a ? p.away * pmf(lH * 0.55, h) * pmf(lA, a)
                 : p.draw * pmf((lH + lA) / 2 * 0.9, h);
        if (pr > best.prob) best = { h, a, prob: pr };
      }
    }
    // KO-Sicherheitsnetz: falls doch Unentschieden
    if (noDraws && best.h === best.a) {
      best.a = best.h > 0 ? best.h - 1 : best.h + 1;
    }
    return { ...best, probs: p };
  }

  return { eloProbs, blendedProbs, bestScore };
}

module.exports = { createModel, pmf };
