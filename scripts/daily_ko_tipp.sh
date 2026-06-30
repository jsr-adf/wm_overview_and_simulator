#!/bin/bash
# Daily WM 2026 KO-Runde Tipp-Update
# Wird täglich um 09:00 Uhr via launchd ausgeführt.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG="$PROJECT_DIR/data/daily_ko_tipp.log"

echo "=== $(date) ===" >> "$LOG"
cd "$PROJECT_DIR"

# 1. Frische Wettquoten für KO-Runde holen
echo "→ Fetching KO odds..." >> "$LOG"
python3 odds/fetch_ko_odds.py >> "$LOG" 2>&1

# 2. Tipps eintragen und Output festhalten
OUTPUT="$(node scripts/kicktipp_http.js --yes 2>&1)"
EXIT_CODE=$?
echo "$OUTPUT" >> "$LOG"
echo "" >> "$LOG"

# Notification direkt via osascript (terminal-notifier hat Encoding-Probleme mit Emoji in Subshell)
send_notification() {
  local TITLE="$1"
  local MSG="$2"
  osascript -e "display dialog \"${TITLE}\n\n${MSG}\" buttons {\"OK\"} default button \"OK\" with title \"WM 2026 Tipp-Update\" giving up after 60"
}

if echo "$OUTPUT" | grep -q "Session abgelaufen"; then
  send_notification "WM Tipp - Session abgelaufen" "Bitte neuen SESSION-Cookie eintragen!"

elif [ "$EXIT_CODE" -ne 0 ]; then
  send_notification "WM Tipp - Fehler" "Skript mit Fehlercode $EXIT_CODE beendet."

else
  NEW=$(echo "$OUTPUT" | grep -oE "[0-9]+ Tipps eingetragen" | grep -oE "^[0-9]+" | tail -1)
  NEW="${NEW:-0}"

  # Tipp-Zeilen: eine pro Zeile, als "HEI X-Y GAS"
  TIPS=$(echo "$OUTPUT" | sed 's/–/-/g' \
    | grep -oE '[A-Z]{2,4}[[:space:]]+[0-9]-[0-9][[:space:]]+[A-Z]{2,4}' \
    | awk '{print $1 "  " $2 "  " $3}')

  # Für osascript: Newlines als literal \n encoden
  TIPS_ESC=$(echo "$TIPS" | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')

  # Kicktipp-Bestätigung aus Output extrahieren
  CONFIRMED=$(echo "$OUTPUT" | grep "Kicktipp bestätigt" | sed 's/.*bestätigt: //' | tr ',' '\n' | sed 's/^ *//' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')

  if [ "${NEW}" -gt 0 ] 2>/dev/null; then
    if [ -n "$CONFIRMED" ]; then
      MSG="${TIPS_ESC}\\n\\n✅ Live auf Kicktipp bestätigt:\\n${CONFIRMED}"
    else
      MSG="${TIPS_ESC:-Tipps eingetragen}\\n\\n✅ Auf Kicktipp gespeichert (HTTP 302)"
    fi
    send_notification "WM Tipp — $NEW neue Tipps" "$MSG"
  else
    send_notification "WM Tipp — Keine neuen Spiele" "Alle Partien noch unbekannt."
  fi
fi
