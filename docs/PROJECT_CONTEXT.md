# WM 2026 Smart Spielplan & Simulator - Projektkontext

Dieses Projekt enthält einen lokalen Daten-/Web-Prototypen für die WM 2026.
Ziel: redaktioneller Spielplanservice plus Szenario-Simulator für die Vorrunde.

## Aktueller Stand

- Lokaler Server läuft über:
  - `python3 -m http.server 8765`
  - Projekt-URL: `http://127.0.0.1:8765/wm_2026_map_app/`
- Übersicht:
  - `http://127.0.0.1:8765/wm_2026_map_app/index.html`
- Simulation:
  - `http://127.0.0.1:8765/wm_2026_map_app/simulation.html`

## Wichtige Dateien

- `wm_2026_matches_fifa.json`
  - FIFA-Spielplan-Cache, 104 Spiele.
  - In der Web-App wird aktuell nur `First Stage` verwendet: 72 Vorrundenspiele.

- `fifa_mens_ranking_latest.json`
  - aktueller FIFA/Coca-Cola-Men's-World-Ranking-Cache.

- `international_results.csv`
  - historische Länderspielergebnisse aus `martj42/international_results`.
  - Wird für lokale Elo-artige Ratings und historische Kalibrierung genutzt.

- `ranking_fifa_historical.csv`
  - historische FIFA-Rankings aus `Dato-Futbol/fifa-ranking`.
  - Wird für QA gegen frühere WM-Vorrunden genutzt.

- `wm_2026_simulation_data.json`
  - vorbereitete Simulationsdaten: Teams, Gruppen, Matches, FIFA-Punkte, Elo-artige Scores, Kalibrierwerte.
  - Erzeugt durch `build_simulation_data.py`.

- `wm_2026_odds_snapshot.json`
  - lokale Odds-Datei.
  - Aktuell enthält sie **Mock-Odds**, nicht echte Quoten.
  - Erzeugt durch `build_mock_odds_snapshot.py`.

- `.env`
  - enthält lokalen Odds-API.io-Key.
  - ist per `.gitignore` ausgeschlossen.

- `.env.example`
  - Vorlage ohne echten Key.

## Web-App

Ordner: `wm_2026_map_app/`

- `index.html`
  - Übersicht / Smart Spielplan.
  - Karte links, Spieltabelle rechts.
  - Filter:
    - Datumsbereich
    - Anstoßzeit von/bis
    - Gruppe
    - Team
    - Karten-Zoom/Pan filtert sichtbare Orte
  - Tabelle zeigt Anstoß und `Abpfiff ca.`.

- `simulation.html`
  - Simulator-Seite.
  - Navigation oben: `Übersicht | Simulation`.
  - Controls:
    - Ranking model: `Blend`, `FIFA`, `Elo`, `Market`
    - Randomness: `Low`, `Normal`, `High`
  - Ergebnisbereiche:
    - Gruppensieger-Wahrscheinlichkeiten
    - Weiterkommen nach Team
    - Qualifikationsmatrix
    - Expected Group Tables

- `simulation.js`
  - Läuft clientseitig.
  - 5.000 Simulationen.
  - Host teams (`USA`, `MEX`, `CAN`) bekommen kleinen Home-Bonus.
  - Draw- und Goal-Level aus historischen Länderspielen kalibriert.

## Modelllogik

Aktuelle Standardmodelle:

- `FIFA`
  - Stärke nur aus FIFA-Punkten.

- `Elo`
  - Stärke aus lokal berechnetem Elo-artigem Score auf Basis historischer Ergebnisse.

- `Market`
  - nutzt `wm_2026_odds_snapshot.json`.
  - aktuell: Mock-Odds.
  - später: echte Odds-API.io-Daten.

- `Blend`
  - wenn Market/Odds vorhanden:
    - 50% Market
    - 30% Elo
    - 20% FIFA
  - wenn Market/Odds fehlen:
    - 60% Elo
    - 40% FIFA

Mock-Odds:

- Datei: `build_mock_odds_snapshot.py`
- Generiert 1X2-Wahrscheinlichkeiten für alle 72 Vorrundenspiele.
- Basis: lokale FIFA/Elo-Stärke.
- Fügt deterministische ca. ±10% Abweichung hinzu.
- Zweck: UI und Market/Blend-Logik testen, bevor echte Quoten verfügbar sind.
- Wichtig: Mock-Odds sind nicht als Prognose zu interpretieren.

## QA / Plausibilitätscheck

Datei: `qa_worldcup_group_model.py`

Erzeugt:

- `wm_2026_model_qa.json`

Historische QA:

- Scope: WM-Vorrunden 1998-2022.
- Jeweilige FIFA-Ränge vor Turnierstart.
- Gruppen rekonstruiert aus den ersten 48 WM-Spielen.
- Ergebnis:
  - Historisch sind Top-20-Teams zu ca. 30.4% in der Vorrunde ausgeschieden.
  - Aktuelles Default-Modell erwartete zuletzt ca. 33.1% Top-20-Ausscheiden.
  - Flop-20 pro Turnier kamen historisch zu ca. 38.6% weiter.
  - Aktuelles Modell erwartete zuletzt ca. 33.7% für Flop-20-Weiterkommen.

Wichtig:

- Top-3 historisch wirkt überraschend: 6 von 20 Top-3-Teams 1998-2022 schieden in der Vorrunde aus.
- Beispiele: Frankreich 2002, Spanien 2014, Deutschland 2018, Belgien 2022.

## Odds-Integration

Datei: `fetch_odds_snapshot.py`

Ziel:

- echte Odds-API.io-Daten holen.
- API-Key aus `.env` laden.
- Ausgabe: `wm_2026_odds_snapshot.json`.

Wichtig:

- Der erste Fetch-Ansatz nutzte zu viele `/events/search` Requests und lief in Rate Limit.
- Das Script wurde danach umgestellt:
  - ein `/events` Request für den ganzen Vorrundenzeitraum
  - danach `/odds/multi` in 10er-Blöcken
  - erwartete Requests: ca. 1 + 8 statt 72+
- Beim letzten Stand war der API-Key rate-limited:
  - 100 requests/hour
  - reset war damals in ca. 58 Minuten.

## Next Steps

1. **Echte Odds holen**
   - Nach Rate-Limit-Reset:
     - `/Users/j.schlosser/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 fetch_odds_snapshot.py`
   - Danach prüfen:
     - Coverage `eventsLinked`
     - Coverage `oddsAvailable`
     - `missingMatchNumbers`
     - ob Odds-API.io überhaupt schon WM-2026-Gruppenspiele führt.

2. **Mock-Odds durch echte Odds ersetzen**
   - `wm_2026_odds_snapshot.json` wird durch echten Fetch überschrieben.
   - Simulator erkennt echte Odds automatisch.
   - Methodik-Text zeigt Provider und Coverage.

3. **Modell nach echten Odds erneut prüfen**
   - Browser-Simulation öffnen.
   - Werte für z. B. Deutschland, Spanien, Curaçao prüfen.
   - Besonders vergleichen:
     - `FIFA`
     - `Elo`
     - `Market`
     - `Blend`
   - Prüfen, ob `Blend` sinnvoll zwischen Market und Rating-Modellen liegt.

4. **QA erneut laufen lassen**
   - `qa_worldcup_group_model.py` aktualisiert aktuell noch nicht automatisch echte Market-Odds.
   - Wenn Market-Odds ernsthaft genutzt werden, QA-Script erweitern:
     - current model snapshot sollte `Blend mit Market` simulieren.
     - Top-3/Top-7/Top-12/Top-20-Buckets neu vergleichen.
     - Flop-20-Bucket neu vergleichen.

5. **Market-vs-Model-Gap ergänzen**
   - Für den Team-Picker ist geplant:
     - Model Top-2 Probability
     - Market-implied match expectations
     - Gap vs Market
     - Label:
       - `Model and market agree`
       - `Model is warmer than market`
       - `Market is warmer than model`
       - `High disagreement`

6. **Optional: Velocity/Form**
   - Noch nicht umgesetzt.
   - Mögliche Signale:
     - Elo-Veränderung letzte 12 Monate
     - FIFA-Punkte-Veränderung
     - letzte 10 Spiele
     - letzte 10 Pflichtspiele
   - Wenn umgesetzt, Blend evtl.:
     - 45% Market
     - 30% Elo
     - 20% FIFA
     - 5% Form Velocity

## Wichtige Hinweise für neue Session

- Nicht neu anfangen; vorhandene Daten und Scripts nutzen.
- Server kann noch laufen; falls nicht:
  - `python3 -m http.server 8765`
- Für Python mit Paketen am besten verwenden:
  - `/Users/j.schlosser/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`
- Für Browser-/Playwright-Checks:
  - Chrome liegt unter `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- API-Key niemals in Code oder Antwort ausgeben.
- `.env` ist lokal vorhanden und in `.gitignore`.
