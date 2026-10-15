# Hitzkopf – Party Games

React + Vite, Firebase (anonymer Login + Firestore), Spotify Web API, veröffentlicht über GitHub Pages
(`https://nkillich.github.io/Hitzkopf/`, Pfad `/Hitzkopf/`). Nach jedem Merge auf `main` baut GitHub Actions
die Seite neu (1–2 Minuten).

Projekte unter `src/projects/`: `Hitzkopf`, `QuizGame`, `SecondSound` (= „Song raten“), `MusicVoter` (= Amplify 1.0),
`Amplify2` (= Amplify 2.0). Startseite: `src/components/ProjectHub.jsx`, Routing per Hash in `src/App.jsx`.

## Arbeitsweise

- Sprache: **Deutsch** – Antworten, Code-Kommentare, Commit- und PR-Texte.
- Bei Wünschen **erst Einschätzung + Vorschlag + kurze Rückfragen (jeweils mit Empfehlung)**, ehrlich auch bei Risiken.
  **Umsetzen erst nach ausdrücklichem „go“.**
- Pro Paket ein Branch von `main` (`feat/…`, `fix/…`, `docs/…`) und ein PR. **Mergen macht der User selbst.**
- Vor dem PR: `npm run lint` (für den betroffenen Ordner) und `npm run build` müssen fehlerfrei sein.
- Wenn möglich im Browser testen (Dev-Server `npm run dev`, Port 5173, Pfad `/Hitzkopf/`), Handy-Breite 375 px.
  Test-Lobbys für Amplify 2.0 per `scripts/amplify2-test.mjs` anlegen und **danach wieder löschen**.
- Echte Spotify-Wiedergabe lässt sich nur am Host-Gerät des Users testen – im PR klar sagen, was ungetestet ist.
- Firestore-Regeln stehen in `firestore.rules`; veröffentlichen mit `npm run deploy:rules` (braucht Firebase-Login,
  geht nur am PC des Users – sonst im PR darauf hinweisen).

## Amplify: zwei Versionen

- **Amplify 2.0** = `src/projects/Amplify2/` – hier wird weiterentwickelt. Routen `#amplify2/CODE` und `#live2/CODE`,
  Firestore-Sammlung `amplify2Lobbies` (+ Unterliste `reactions`), Sitzungsschlüssel `a2_…`.
- **Amplify 1.0** = `src/projects/MusicVoter/` (`#amplify`, `#live`, `musicVoterLobbies`, `mv_…`) ist das Backup –
  **nicht ändern**, außer der User verlangt es.
- Gemeinsam genutzt (vor Änderungen fragen): `src/services/spotifyService.js`, `src/shared/ui/*`, `ProjectHub.jsx`, `App.jsx`.

### So funktioniert Amplify 2.0
- Eine lange Playlist ohne Phasen: Jeder schlägt jederzeit Songs vor (Limit pro Person) und votet jederzeit (↑/↓-Budget,
  eine Stimme steckt im Song und kommt zurück, sobald er läuft). Eigene Songs kann man nicht voten.
- **Platz 1 läuft als Nächstes:** Das Host-Gerät legt Platz 1 per `finishRound` 5 s vor Ende des laufenden Songs fest
  (`LOCK_BEFORE_END_MS`, in den letzten 15 s wird alle 0,5 s abgefragt). Läuft nichts → sofort; läuft fremde Musik
  (Spotify-Autoplay) → anstellen und überspringen.
- **Backup-Playlist** (`backupPlaylist`): läuft, wenn kein Song im Voting ist; neue Songs werden danach angestellt.
- Verdienter Nummer-1-Hit = Song lief mit mindestens einer Stimme hoch → Toast + Konfetti beim Einreichenden, Streak +1.
- Ladenhüter (`dropBelow`, `dropAfterMin`), ✨ NEU (10 Min.), Runden-Modi (Künstler/Jahrzehnt/Stichwort), Live-Board
  mit Top 10, Live-Emoji-Reaktionen.
- Logik ohne React in `amplifyLogic.js` (App und Board nutzen dieselben Funktionen).

### Fallstricke (haben schon Bugs verursacht)
- Alle Lesen-Ändern-Schreiben-Zugriffe auf eine Lobby über `mutateLobby` (Firestore-Transaktion), sonst gehen
  gleichzeitige Stimmen verloren.
- Firestore liefert beim Abo zuerst Cache-Daten (`metadata.fromCache`) – „entfernt/geschlossen“ nur aus Serverdaten ableiten.
- Vor dem Lesen einer Lobby auf den anonymen Login warten (sonst „gibt es nicht“).
- Nur das Host-Gerät sieht Spotify. Board und Gäste rechnen Songwechsel hoch (`liveNowPlaying`, `upcomingQueue`) –
  für Anzeigen nie direkt `data.nowPlaying` nehmen. Der Host hält den Bildschirm wach (Wake Lock).
- Songs gehen immer per `addToQueue` in die Spotify-Warteschlange (nie als `uris`-Abspielliste), vorher Abgleich mit `getQueueIds`.
- Spieler-Schlüssel ist der Name (`players.<Name>`, Vergleich ohne Groß-/Kleinschreibung), dazu `uid` für den Wiedereintritt;
  nur das Gerät mit `hostUid` darf die Lobby löschen. Test-Lobbys deshalb ohne `hostUid` anlegen.

## Spotify-Grenzen (Stand Okt. 2026)
- App im Entwicklermodus (Regeln seit 9. März 2026): nur **max. 5 freigeschaltete Konten** pro Client-ID (inkl. Entwickler),
  Spotify Premium nötig, nur **eine** Client-ID pro Entwickler – alle Spiele teilen sich diese 5 Plätze. Freischalten:
  developer.spotify.com/dashboard → App → Settings → User Management (Name + E-Mail des Spotify-Kontos).
- Login ist nur für den Host Pflicht. Gäste brauchen ihn nur für Amplify 2.0 „Meine Playlists“ (eigene Playlists +
  Lieblingssongs, Scope `user-library-read`); nicht freigeschaltete Konten bekommen 403. Die normale Suche geht ohne Login.
- **Bestehende Client-ID nicht löschen/neu anlegen:** Für neue Client-IDs gilt sofort eine kleinere Endpunkt-Liste
  (für bestehende ist das vorerst verschoben).
- Songs fremder/öffentlicher (auch nur gefolgter) Playlists liefert die API nicht (403); seit Feb. 2026
  `/playlists/{id}/items` statt `/tracks` (Einträge evtl. `item` statt `track` – der Code liest beides).
  Abspielen einer Playlist per `context_uri` funktioniert.
- `preview_url` ist leer → Hörprobe über den eingebetteten Player (`open.spotify.com/embed/track/<id>`).
- Suche: höchstens 10 Treffer pro Anfrage.

## Technisches
- Die Arbeitskopie unter Windows hat CRLF (autocrlf): vor mehrzeiligen Ersetzungen per Skript Dateien auf LF bringen.
- `gh` unter Windows nur per vollem Pfad: `& "C:\Program Files\GitHub CLI\gh.exe"`; PR-Text per `--body-file`.
