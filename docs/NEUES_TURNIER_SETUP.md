# Neues Turnier aufsetzen (EM / WM)

Vollständige Anleitung um das System für ein neues Turnier zu konfigurieren.  
Zeitaufwand: ~2–3 Stunden, hauptsächlich Datenbeschaffung.

---

## Überblick: Was das System tut

```
FIFA-Ranking + historische Ergebnisse
        ↓
build_simulation_data.py  →  data/wm_2026_simulation_data.json
                                        ↓
fetch_odds_snapshot.py    →  data/wm_2026_odds_snapshot.json   ─┐
fetch_ko_odds.py          →  data/ko_odds.json                  ┤
                                                                 ↓
                                               kicktipp_http.js  →  Kicktipp
                                               (täglich via launchd 09:00)
```

ELO-Ratings werden **lokal** aus historischen Länderspielergebnissen berechnet (kein ELO-API).  
Wettquoten kommen von **Odds-API.io** (API-Key nötig, ca. $10/Monat).

---

## Schritt 1 — Daten beschaffen

### 1a. Historische Länderspiel-Ergebnisse

Quelle: `https://github.com/martj42/international_results`

```bash
curl -L "https://github.com/martj42/international_results/raw/master/results.csv" \
     -o data/international_results.csv
```

Das CSV enthält alle Länderspiele seit 1872. ELO wird daraus ab 2010 (gewichtet) berechnet.  
**Wichtig:** Vor dem Setup-Tag herunterladen, damit aktuelle Qualifikationsspiele einfließen.

### 1b. FIFA-Spielplan (Turnierpartien)

Quelle: FIFA-API (Read-only, kein Auth nötig):
```
https://api.fifa.com/api/v3/calendar/matches?
  IdSeason=<SEASON_ID>&idCompetition=<COMP_ID>&count=200&language=en-GB
```

- WM 2026: `IdSeason=2025`, `idCompetition=17` (FIFA Men's World Cup)
- EM 2028: Saisonid jährlich von `https://api.fifa.com/api/v3/competitions` abrufbar

```bash
curl "https://api.fifa.com/api/v3/calendar/matches?IdSeason=2025&idCompetition=17&count=200&language=en-GB" \
     -o data/wm_2026_matches_fifa.json
```

Dateiname für neues Turnier anpassen (z.B. `em_2028_matches_fifa.json`) und in  
`scripts/build_simulation_data.py` Zeile 15 (`MATCHES_PATH`) aktualisieren.

### 1c. FIFA-Ranking

```bash
curl "https://api.fifa.com/api/v3/ranking/FIFA?language=en-GB&dateId=latest" \
     -o data/fifa_mens_ranking_latest.json
```

### 1d. Wettquoten (Gruppenphase)

Odds-API.io-Key in `.env` eintragen (Datei liegt im Projektroot, **nicht** ins Git):
```
ODDS_API_KEY=dein_key_hier
```

Dann:
```bash
python3 odds/fetch_odds_snapshot.py
# → schreibt data/wm_2026_odds_snapshot.json
```

Dateiname + Datumsfenster (`DATE_FROM`, `DATE_TO`) in `fetch_odds_snapshot.py`  
auf den Turnierzeitraum anpassen.

---

## Schritt 2 — Simulation-Daten bauen

```bash
python3 scripts/build_simulation_data.py
# → schreibt data/wm_2026_simulation_data.json
```

**Was das Skript tut:**
- Liest Spielplan (`matches_fifa.json`) + Ranking + historisches CSV
- Berechnet ELO-Ratings via K-Faktor-gewichtetem Elo-System (WM=60, Quali=38, Freundschaft=20)
- Berechnet offensive/defensive Ratings (Dixon-Coles-Kalibrierung)
- Berechnet `avgGoals` aus den letzten 3 Jahren internationaler Partien

**Was zu prüfen ist nach dem Lauf:**
```bash
node -e "
const d = require('./data/wm_2026_simulation_data.json');
console.log('Teams:', Object.keys(d.teams).length);
console.log('Matches:', d.matches.length);
console.log('avgGoals:', d.calibration.avgGoals);
console.log('Top-3 ELO:', Object.entries(d.teams).sort((a,b)=>b[1].elo-a[1].elo).slice(0,3).map(([c,t])=>c+' '+t.elo));
"
```

Erwartungswerte: Teams=32 (WM) / 24 (EM), avgGoals ≈ 2.5–2.9, Top-ELO bei bekannten Nationen.

---

## Schritt 3 — Kicktipp-Gruppe konfigurieren

### 3a. Gruppe anlegen / finden

1. Kicktipp-Gruppe für das Turnier anlegen oder der bestehenden beitreten
2. Gruppenname aus der URL ablesen: `kicktipp.de/**buli06-tipp**/tippabgabe`
3. `tippsaisonId` aus dem Seitenquelltext holen:  
   `Strg+U` → Suche nach `tippsaisonId` → fünfstellige Zahl

### 3b. Session-Cookie extrahieren

1. Browser-DevTools öffnen (F12) → Network-Tab
2. Kicktipp aufrufen und einloggen
3. Beliebige Anfrage anklicken → Headers → Cookie
4. `SESSION=...` und `login=...` Werte kopieren

### 3c. KO-Struktur verstehen

Kicktipp nummeriert Spieltage fortlaufend:
- WM 2026: ST 1–10 = Gruppenphase (10 Spieltage), ST 11–15 = KO-Runde (R32→Finale)
- EM 2024: ST 1–6 = Gruppenphase, ST 7–10 = KO-Runde
- **`KO_SPIELTAG_START`** = erster Spieltag-Index der KO-Runde

KO-Runden haben **kein Unentschieden** (`noDraws: true` wird ab diesem Index gesetzt).

### 3d. Konstanten in scripts/kicktipp_http.js anpassen

```js
const GROUP            = 'buli06-tipp';     // ← Kicktipp-Gruppenname
const SAISONID         = '4729275';          // ← tippsaisonId aus Quelltext
const SESSION          = '...';             // ← SESSION-Cookie (läuft ab!)
const LOGIN            = '...';             // ← login-Cookie
const KO_SPIELTAG_START = 11;               // ← erster KO-Spieltag-Index
const MAX_CONSECUTIVE_EMPTY = 13;           // ← Gruppenphase-Spieltage + 3 Puffer
```

Gleiches in `scripts/kicktipp_swing_check.js` (SESSION/LOGIN dort ebenfalls aktualisieren).

### 3e. Hosts-Bonus anpassen

In `lib/model.js` Zeile 32:
```js
function createModel(data, oddsMap={}, koOddsMap={}, hosts=new Set(['USA','MEX','CAN']), ...)
```

Bei EM ohne Heimvorteil: leeres Set übergeben:
```js
const model = createModel(simData, oddsMap, koOddsMap, new Set());
```

Bei EM mit Gastgeber (z.B. Deutschland 2024): `new Set(['GER'])`.

---

## Schritt 4 — KO-Quoten (während des Turniers)

Für die KO-Runde werden Live-Quoten täglich neu geholt. Das passiert automatisch  
über den launchd-Job. Manuell:

```bash
python3 odds/fetch_ko_odds.py
# → schreibt data/ko_odds.json
```

**Anpassen für neues Turnier:** In `odds/fetch_ko_odds.py`:
- `NAME_TO_CODE` dict erweitern für alle 32 (bzw. 24) Nationennamen so wie die Odds-API sie nennt
- Filterstring `"world cup"` → bei EM z.B. `"european championship"` oder `"euro"`

---

## Schritt 5 — Namen-Map erweitern

`lib/nameMap.js` enthält eine statische Map von Kicktipp-Namen → FIFA-Codes.  
Kicktipp zeigt Teamnamen auf Deutsch. Neue oder ungewöhnliche Teams prüfen:

```bash
node -e "
const { buildNameMap } = require('./lib/nameMap');
const d = require('./data/wm_2026_simulation_data.json');
const { resolveCode } = buildNameMap(d.teams);
// Teste verdächtige Namen:
['Elfenbeinküste','Bosnien-Herzegowina','Nordmazedonien'].forEach(n =>
  console.log(n, '->', resolveCode(n))
);
"
```

Nicht-gematchte Namen werden im Autofill-Lauf als `⚠️ Unbekannt: ...` ausgegeben.  
→ Dann in `lib/nameMap.js` in den `staticMap` eintragen.

---

## Schritt 6 — Täglich-Job aufsetzen

### launchd (macOS)

```bash
cp ~/Library/LaunchAgents/de.buli06.wm_ko_tipp.plist \
   ~/Library/LaunchAgents/de.TURNIER.tipp.plist
```

Anpassen: `Label`, `ProgramArguments` (Pfad zur Shell-Datei), Log-Pfade.

```bash
launchctl load ~/Library/LaunchAgents/de.TURNIER.tipp.plist
# Testen:
launchctl start de.TURNIER.tipp
```

### Session-Cookie-Ablauf

Kicktipp-Sessions laufen typisch nach **1–4 Wochen** ab. Wenn der Job fehlschlägt:
1. Log prüfen: `data/daily_ko_tipp_stderr.log`
2. Neuen Cookie aus Browser holen
3. SESSION + LOGIN in `kicktipp_http.js` und `kicktipp_swing_check.js` aktualisieren

---

## Schritt 7 — Tests ausführen

```bash
npm test
# Erwartet: 28/28 passed
```

Die Tests sind datenunabhängig (Mock-Daten) — sie laufen immer grün, auch wenn neue  
Turnierdaten geladen werden. Sie validieren Modell-Mathematik und HTML-Parser.

---

## Schritt 8 — Erster Lauf (Gruppenphase)

```bash
# Einmalig alle Gruppenphase-Tipps eintragen:
node scripts/kicktipp_http.js
# → "Alle Spieltage tippen? (j/n)" → j
```

Das Skript überspringt abgelaufene Spieltage automatisch.  
KO-Runde: läuft täglich per launchd sobald Paarungen feststehen.

---

## Datei-Umbenennen für neues Turnier (optional)

Empfehlung: Dateien mit Turniercode benennen damit History erhalten bleibt:

| jetzt | neu (Beispiel EM 2028) |
|---|---|
| `data/wm_2026_simulation_data.json` | `data/em_2028_simulation_data.json` |
| `data/wm_2026_odds_snapshot.json` | `data/em_2028_odds_snapshot.json` |
| `data/wm_2026_matches_fifa.json` | `data/em_2028_matches_fifa.json` |

Dann in `scripts/build_simulation_data.py` und `scripts/kicktipp_http.js` die Pfade anpassen.

---

## Schnell-Referenz: Änderungen je Turnier

| Wo | Was |
|---|---|
| `scripts/kicktipp_http.js` | `GROUP`, `SAISONID`, `SESSION`, `LOGIN`, `KO_SPIELTAG_START` |
| `scripts/kicktipp_swing_check.js` | `GROUP`, `SAISONID`, `SESSION`, `LOGIN` |
| `scripts/build_simulation_data.py` | `MATCHES_PATH`, `OUTPUT_PATH`, `HOST_CODES` |
| `odds/fetch_odds_snapshot.py` | `OUTPUT_PATH`, Datumsfenster, `blendWeight` |
| `odds/fetch_ko_odds.py` | `NAME_TO_CODE`, Ligafilter-String |
| `lib/model.js` | `hosts`-Set (Heimvorteil-Länder) |
| `lib/nameMap.js` | `staticMap` (neue/umbenannte Teams auf Deutsch) |
| `~/Library/LaunchAgents/` | neue Plist für neuen Turniernamen |
