# Checkliste — Neues Turnier

Kurze Abhak-Liste. Details → [NEUES_TURNIER_SETUP.md](NEUES_TURNIER_SETUP.md)

---

## Vor dem Turnier (1–2 Wochen vorher)

- [ ] `data/international_results.csv` neu ziehen (martj42/international_results)
- [ ] FIFA-Spielplan holen → `data/<turnier>_matches_fifa.json`
- [ ] FIFA-Ranking holen → `data/fifa_mens_ranking_latest.json`
- [ ] `scripts/build_simulation_data.py` anpassen: Pfade, `HOST_CODES`
- [ ] `python3 scripts/build_simulation_data.py` → Output prüfen (32/24 Teams, avgGoals ok)
- [ ] Wettquoten holen: `python3 odds/fetch_odds_snapshot.py` (`.env` mit `ODDS_API_KEY` nötig)
- [ ] `npm test` → 28/28 grün

## Kicktipp einrichten

- [ ] Gruppe anlegen / beitreten
- [ ] `GROUP` (URL-Name) + `SAISONID` (aus Quelltext) notieren
- [ ] Session-Cookie extrahieren: `SESSION=...` + `login=...`
- [ ] `KO_SPIELTAG_START` bestimmen (erster KO-Spieltag-Index)
- [ ] Alle 5 Werte in `scripts/kicktipp_http.js` eintragen
- [ ] Gleiche Werte in `scripts/kicktipp_swing_check.js` eintragen

## Namen-Map prüfen

- [ ] `lib/nameMap.js` staticMap auf neue/unbekannte Teams prüfen
- [ ] Testlauf: `node scripts/kicktipp_http.js` → `⚠️ Unbekannt`-Warnungen auflösen

## KO-Quoten konfigurieren

- [ ] `odds/fetch_ko_odds.py`: `NAME_TO_CODE` für alle Turnier-Teams prüfen
- [ ] Ligafilter-String anpassen (z.B. `"european championship"` für EM)

## Automation

- [ ] `scripts/daily_ko_tipp.sh`: Pfad stimmt noch / anpassen
- [ ] launchd-Plist kopieren + anpassen: Label, ProgramArguments, Log-Pfade
- [ ] `launchctl load ~/Library/LaunchAgents/de.TURNIER.tipp.plist`
- [ ] Testlauf: `launchctl start de.TURNIER.tipp` → Dialog erscheint?

## Während des Turniers

- [ ] **Nach jedem Gruppen-Spieltag**: Cookie noch gültig? Log checken
- [ ] **KO-Runde**: Quoten werden täglich automatisch geholt (launchd)
- [ ] **Cookie abgelaufen**: neuen SESSION+LOGIN aus Browser holen, beide Skripte updaten
- [ ] Swing-Check bei größeren Odds-Bewegungen: `node scripts/kicktipp_swing_check.js`
