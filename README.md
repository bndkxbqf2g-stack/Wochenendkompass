# Wochenendkompass

Mobile-first PWA für Ausflüge, Events und Genuss in Würzburg und Umgebung.

## Aufbau
- **PWA** (`index.html`, `app.js`, `sw.js`): Entdecken, Schlemmerblock, Recherche ergänzen, Einstellungen, Offline-Cache
- **Recherchelauf** (`scripts/research.mjs`, `.github/workflows/research.yml`): zweimal täglich, ca. 07:30 und 20:00 Uhr (Europe/Berlin)
- **Daten** (`data/`): `feed.json` (Ergebnisse), `interests.json` (feste Interessen, ohne Code änderbar), `wishes.json`, `wishstatus.json`, `runlog.json` (Lauf-Protokoll)

## Ablauf des Laufs
1. Feste Interessen + aktive Wünsche lesen (`data/wishes.json` und offene GitHub-Issues mit Label `wunsch`, nur vom Repo-Eigentümer)
2. Pro Themenblock eine Recherche mit Claude (Websuche). Fehler einzelner Blöcke brechen den Lauf nicht ab.
3. Jede gefundene Quelle wird abgerufen: 404/410 werden verworfen, nicht bestätigte Einträge als „ungeprüft“ markiert
4. Zusammenführen: Duplikate raus, abgelaufene Termine raus, `found` bleibt erhalten
5. Ergebnis ins Repo committen; die App liest `data/feed.json`

Zeitzone: je zwei Cron-Zeiten für Sommer-/Winterzeit (05:30/06:30 und 18:00/19:00 UTC); das Skript lässt nur den Lauf im passenden Fenster zu, höchstens einen pro Fenster.

## Einrichtung (einmalig)
1. Repo-Secret `ANTHROPIC_API_KEY` anlegen (Settings → Secrets and variables → Actions)
2. Label `wunsch` im Repo anlegen (Issues → Labels)
3. GitHub Pages aktivieren (Settings → Pages → Branch `main`, `/ (root)`)
4. Lauf testen: Actions → „Tägliche Recherche“ → Run workflow

## Entfernungsfilter
Filter „Bis X km ab Zellingen“ auf dem Entdecken-Tab. Die Entfernung wird aus dem Ortsnamen in `place` geschätzt (Tabelle `DIST_KM` in `app.js`, grobe Straßenkilometer) oder aus einem optionalen Feld `distanceKm`. Einträge ohne erkennbaren Ort bleiben sichtbar.

## Wünsche zentral eintragen
In der App unter „Recherche“ bei einem Wunsch „Zentral eintragen“ tippen, das GitHub-Issue absenden. Issue schließen = pausieren/löschen. Kein Token im Frontend.

## Noch nicht vorhanden
- Echtes Web-Push im Hintergrund (benötigt Server mit Push-Abonnements). Bis dahin: Hinweis in der App beim Öffnen.

## Tests
`node --test tests/research.test.mjs`

## Recherche ohne API-Key
Alternativ zur GitHub-Action laufen zwei geplante Claude-Aufgaben (07:30 und 20:00 Uhr), die `data/feed.json` aktualisieren und pushen. Ausgeschlossen: Airport Würzburg. Wichtig: Dornheim, Zauberberg, Alter Ego, Labyrinth, Bundschuh und die gesamte Gastro.
