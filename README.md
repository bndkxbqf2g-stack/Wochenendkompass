# Wochenendkompass

Mobile-first PWA für Ausflüge, Events und Genuss in Würzburg und Umgebung.

## Stand
- Frontend (PWA): Entdecken, Schlemmerblock, „Recherche ergänzen“ (Wünsche), Einstellungen, Offline-Cache
- Noch **nicht** vorhanden: Backend (zentrale Wünsche, Feed), täglicher Recherchelauf 07:30 Uhr, echtes Web-Push
- `data/feed.json` ist ein leerer Platzhalter, es gibt keine erfundenen Einträge

## Backend-Schnittstelle (erwartet)
- `GET /wishes`, `PUT /wishes/{id}`, `DELETE /wishes/{id}` (Bearer-Token)
- Feed: JSON `{ "updated": ISO-Zeit, "items": [ … ] }`

## Lokal testen
`python3 -m http.server 8000` und `http://localhost:8000` öffnen.
