'use strict';
/**
 * lib/kicktipp.js — Kicktipp HTTP-Client
 *
 * Kapselung aller Kicktipp-spezifischen HTTP- und HTML-Logik.
 * Konfigurierbar → wiederverwendbar für EM, WM, andere Gruppen.
 *
 * Verwendung:
 *   const { KickTippClient } = require('./lib/kicktipp');
 *   const client = new KickTippClient({ session, login, group, saisonId });
 *   const ok = await client.checkLogin();
 *   const { hidden, games } = await client.fetchSpieltag(11);
 *   await client.submitTips(11, postData);
 */

const https = require('https');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

class KickTippClient {
  /**
   * @param {object} config
   * @param {string} config.session   - SESSION cookie value
   * @param {string} config.login     - login cookie value
   * @param {string} config.group     - Kicktipp-Gruppenname, z.B. "buli06-tipp"
   * @param {string} config.saisonId  - tippsaisonId, z.B. "4729275"
   */
  constructor({ session, login, group, saisonId }) {
    this.group    = group;
    this.saisonId = saisonId;
    this.cookies  = `SESSION=${session}; login=${login}; kurzname=${group}`;
  }

  // ─── HTTP ──────────────────────────────────────────────────────────────────

  get(url) {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          Cookie: this.cookies,
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9',
        }
      }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  }

  post(urlStr, bodyStr) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          Cookie: this.cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyStr),
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9',
          Origin: 'https://www.kicktipp.de',
          Referer: `https://www.kicktipp.de/${this.group}/tippabgabe`,
        }
      }, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  // ─── HTML-Parsing ──────────────────────────────────────────────────────────

  /** Parst ein einzelnes <input>-Tag, attributreihenfolge-unabhängig */
  static parseInputTag(tag) {
    const get = attr => { const m = tag.match(new RegExp(`\\b${attr}="([^"]*)"`, 'i')); return m ? m[1] : null; };
    return { name: get('name'), value: get('value') ?? '', type: get('type') ?? 'text', id: get('id') };
  }

  /**
   * Parst eine Tippabgabe-Seite.
   * @returns {{ hidden: object, games: Array<{id, heimName, gastName, existHeim, existGast}> }}
   */
  static parsePage(html) {
    const hidden = {};
    for (const m of html.matchAll(/<input\b([^>]*?)(?:\/>|>)/gi)) {
      const inp = KickTippClient.parseInputTag(m[1]);
      if (!inp.name) continue;
      if (inp.type === 'hidden') hidden[inp.name] = inp.value;
      if (inp.name.includes('tippAbgegeben')) hidden[inp.name] = inp.value || 'true';
    }

    const games = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const row = m[1];
      if (!row.includes('spieltippForms')) continue;
      const idM = row.match(/spieltippForms\[(\d+)\]/);
      if (!idM) continue;
      const id = idM[1];

      const tds = [...row.matchAll(/<td class="nw[^"]*">([^<]*)<\/td>/g)].map(x => x[1].trim());
      const heimName = tds[1] || '';
      const gastName = tds[2] || '';

      let existHeim = '', existGast = '';
      for (const inp of row.matchAll(/<input\b([^>]*?)(?:\/>|>)/gi)) {
        const f = KickTippClient.parseInputTag(inp[1]);
        if (!f.name) continue;
        if (f.name === `spieltippForms[${id}].heimTipp`) existHeim = f.value;
        if (f.name === `spieltippForms[${id}].gastTipp`) existGast = f.value;
      }

      games.push({ id, heimName, gastName, existHeim, existGast });
    }

    return { hidden, games };
  }

  /** Parst gespeicherte Tipp-Werte aus einer Seite (für Live-Verifikation) */
  static parseVerification(html) {
    const results = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const row = m[1];
      if (!row.includes('spieltippForms')) continue;
      const tds = [...row.matchAll(/<td class="nw[^"]*">([^<]*)<\/td>/g)].map(x => x[1].trim());
      const hv = row.match(/heimTipp[^>]*value="(\d*)"/)?.[1] ?? '';
      const gv = row.match(/gastTipp[^>]*value="(\d*)"/)?.[1] ?? '';
      if (hv !== '' && gv !== '') results.push({ heim: tds[1] || '?', gast: tds[2] || '?', hv, gv });
    }
    return results;
  }

  // ─── High-Level API ────────────────────────────────────────────────────────

  /** Prüft ob die Session gültig ist. Gibt Benutzernamen zurück oder null. */
  async checkLogin() {
    const resp = await this.get(`https://www.kicktipp.de/${this.group}/tippabgabe`);
    const m = resp.body.match(/class="entry[^"]*"[^>]*>\s*([A-Za-z0-9_\-\.]+)\s*</);
    if (resp.body.includes('tippabgabeForm')) return m?.[1] ?? 'unknown';
    return null;
  }

  /** Holt und parst einen Spieltag. */
  async fetchSpieltag(index) {
    const url  = `https://www.kicktipp.de/${this.group}/tippabgabe?tippsaisonId=${this.saisonId}&spieltagIndex=${index}`;
    const resp = await this.get(url);
    if (!resp.body.includes('spieltippForms')) return null;
    return KickTippClient.parsePage(resp.body);
  }

  /** Sendet Tipps für einen Spieltag ab. Gibt true bei Erfolg zurück. */
  async submitTips(postData) {
    const body = Object.entries(postData)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v || ''))
      .join('&');
    const result = await this.post(`https://www.kicktipp.de/${this.group}/tippabgabe`, body);
    return result.status === 200 || result.status === 302;
  }

  /** Holt Seite erneut und gibt gespeicherte Werte zurück (Live-Verifikation). */
  async verifySpieltag(index) {
    const url  = `https://www.kicktipp.de/${this.group}/tippabgabe?tippsaisonId=${this.saisonId}&spieltagIndex=${index}`;
    const resp = await this.get(url);
    return KickTippClient.parseVerification(resp.body);
  }
}

module.exports = { KickTippClient };
