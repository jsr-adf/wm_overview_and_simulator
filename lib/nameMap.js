'use strict';
/**
 * lib/nameMap.js — Kicktipp-Teamname → FIFA-Code
 *
 * Ergänzt die statische Map automatisch mit allen Namen aus data.teams,
 * sodass neue Teams bei der nächsten EM/WM automatisch aufgelöst werden.
 */

const STATIC_MAP = {
  // Europäisch (Deutsch)
  'deutschland':'GER','frankreich':'FRA','spanien':'ESP','england':'ENG','portugal':'POR',
  'niederlande':'NED','belgien':'BEL','schweiz':'SUI','österreich':'AUT',
  'türkei':'TUR','türkiye':'TUR','schweden':'SWE','norwegen':'NOR','schottland':'SCO',
  'wales':'WAL','dänemark':'DEN','kroatien':'CRO','tschechien':'CZE','slowakei':'SVK',
  'slowenien':'SVN','serbien':'SRB','ungarn':'HUN','albanien':'ALB','georgien':'GEO',
  'bosnien-herzegowina':'BIH','bosnien und herzegowina':'BIH',
  // Afrika
  'marokko':'MAR','ägypten':'EGY','algerien':'ALG','kamerun':'CMR','senegal':'SEN',
  'tunesien':'TUN','ghana':'GHA','nigeria':'NGA','elfenbeinküste':'CIV',
  "côte d'ivoire":'CIV','kongo dr':'COD','dr kongo':'COD','kap verde':'CPV',
  'südafrika':'RSA','mosambik':'MOZ',
  // Amerika
  'brasilien':'BRA','argentinien':'ARG','uruguay':'URU','kolumbien':'COL',
  'ecuador':'ECU','paraguay':'PAR','chile':'CHI','peru':'PER','bolivien':'BOL',
  'venezuela':'VEN','panama':'PAN','haiti':'HAI','costa rica':'CRC',
  'honduras':'HON','jamaika':'JAM','trinidad und tobago':'TRI',
  'kuraçao':'CUW','curaçao':'CUW','vereinigte staaten':'USA','usa':'USA',
  'mexiko':'MEX','kanada':'CAN',
  // Asien/Ozeanien
  'japan':'JPN','südkorea':'KOR','australien':'AUS','neuseeland':'NZL',
  'usbekistan':'UZB','saudi-arabien':'KSA','saudi arabien':'KSA',
  'irak':'IRQ','jordanien':'JOR','iran':'IRN','katar':'QAT',
  'vereinigte arabische emirate':'UAE','thailand':'THA','vietnam':'VIE',
};

/**
 * buildNameMap — ergänzt die statische Map mit allen Namen aus data.teams.
 * @param {object} teams - data.teams aus wm_2026_simulation_data.json
 * @returns {{ resolveCode: function }}
 */
function buildNameMap(teams = {}) {
  const map = { ...STATIC_MAP };
  // Englische Namen aus data.teams automatisch hinzufügen
  for (const [code, t] of Object.entries(teams)) {
    if (t.name) map[t.name.toLowerCase()] = code;
  }

  function resolveCode(name) {
    return map[(name || '').toLowerCase().trim()] || null;
  }

  return { resolveCode, map };
}

module.exports = { buildNameMap, STATIC_MAP };
