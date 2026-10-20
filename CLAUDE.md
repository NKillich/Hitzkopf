# Hitzkopf – Party Games

React + Vite, Firebase (anonymer Login + Firestore), Spotify Web API, veröffentlicht über GitHub Pages
(`https://nkillich.github.io/Hitzkopf/`, Pfad `/Hitzkopf/`). Nach jedem Merge auf `main` baut GitHub Actions
die Seite neu (1–2 Minuten).

Projekte unter `src/projects/`: `Hitzkopf`, `QuizGame`, `SecondSound` (= **Identify**, früher „Song raten“),
`MusicVoter` (= Amplify 1.0), `Amplify2` (= **Amplify**, intern „Amplify 2.0“), `Testify`. Ordner- und Code-Namen bleiben so.
Startseite: `src/components/ProjectHub.jsx` (Raumcode/QR → erst Amplify, dann Testify; Spiele-Liste, Zahnrad = Hell/Dunkel),
Routing per Hash in `src/App.jsx` (`#identify`, alter Link `#songraten` geht weiter).
**Schwerpunkt: Amplify und Identify.** Hitzkopf ist auf Eis – keine Updates nötig, auch wenn es nicht mehr läuft.
Identify hat zwei Modi (Seite „Spiel einrichten“): **Quick** (nur Schnipsel + Erraten/Nicht erraten) und **Pro**
(zusätzlich Bonus-Tipp Interpret/Titel/Jahr); Joker in beiden. Logik ohne React in `SecondSound/songGuess.js`.

### Identify: Gastmodus (ohne Login, für alle)
- „Als Gast spielen“ auf der Identify-Startseite: statt Spotify-Playlists die **kuratierten Listen** aus Firestore
  (`identifyIndex/main` + `identifyLists/<id>`, `SecondSound/listStore.js`; lesen darf jeder) – Rückfall auf die Dateien in
  `public/identify/lists/`, solange dort nichts liegt. Ton = **Apples freie 30-s-Hörproben** (iTunes-Suche, CORS erlaubt,
  kein Schlüssel). Spieler brauchen kein Konto; Spotify-Modus bleibt unverändert für freigeschaltete Konten.
- Player: `src/services/appleClipPlayer.js` – gleiche Befehle wie `clipPlayerCore.js` (startNew/replay/resumeTo/extendTo),
  der Spielbildschirm wählt per `guestRef` den Player. Kein Einsetzpunkt (Hörprobe ist fest), Statistik nur auf dem Gerät.
- Pro-Vorschläge im Gastmodus über Apple (`SecondSound/guestMusic.js`), nicht über die Spotify-ID (die bleibt für Amplify frei).
  Apple sucht nur ganze Wörter → mit Interpret werden dessen Songs einmal geholt und lokal gefiltert.
- Auswahl „Musik wählen“ (nur Gastmodus): Suche, Kategorie-Chips, Gruppen je Kategorie (`SecondSound/listTiles.js`:
  Jahrzehnte → Genres → Best of → Party-Mixe → weitere alphabetisch → „Weitere“ ohne Kategorie). Kategorie und Kachel
  (`category`, `badge` = Kürzel/Emoji, max. 4 Zeichen) trägt der User pro Liste im Studio ein; Kachelfarbe kommt fest aus dem Namen.
- **Identify Studio** (`#studio`, nicht auf der Startseite, `src/projects/IdentifyStudio/`): Der User pflegt die Listen
  selbst – anlegen, umbenennen, **CSV von exportify.net hochladen** (Hauptweg: Titel/Interpret/Album/Länge stehen drin,
  **keine Spotify-Anfrage** → kein Kontingent), einzelne Spotify-Links (1 Anfrage/Song über die App-ID, gebremst 1,5 s,
  bei langer 429-Sperre sofort Abbruch mit Uhrzeit) – Zuordnung zu Apple im Browser (`SecondSound/appleMatch.js`),
  Songs löschen, nicht gefundene von Hand bei Apple suchen, „Andere Version“ pro Song, „Versionen prüfen“ pro Liste, Liste löschen.
  **Warteschlange** (`IdentifyStudio/useImportQueue.js`, `QueuePanel.jsx`): mehrere CSV-Dateien auf einmal (auch nachreichen),
  Abarbeitung nacheinander im Hintergrund der Studio-Seite; Liste = Dateiname, gleicher Name → Liste wird ergänzt; Stand im
  localStorage (`identify_studio_queue_v1`) → nach Neuladen geht es weiter. Die Liste, die gerade befüllt wird, ist im Editor
  gesperrt; arbeitet der Editor selbst an einer Liste (Links/Versionen prüfen), wartet die Warteschlange für diese Liste.
  Zuordnung: gleicher Titel + Interpret; Varianten (Live, Instrumental, Remix, Acoustic, Karaoke …) nur, wenn der Spotify-Song
  selbst eine ist; Original-Album vor Single/Deluxe/Jubiläum/Best-of – **immer**, auch wenn Spotify selbst eine Sonderausgabe
  nennt (Spotify: „Hybrid Theory (Bonus Edition)“); bei Gleichstand ältere Apple-ID. Apples **Suche** ist
  lückenhaft (z. B. „Collision Course“, „From Zero“ fehlen), per ID ist aber alles abrufbar → zweiter Weg:
  Künstler-ID (musicArtist-Suche) → `lookup?id=…&entity=album` (alle Alben) → Album mit dem Spotify-Namen (Kern ohne
  „- EP“/„(Deluxe)“), sonst Original-Alben aus dem Erscheinungsjahr (Spotify nennt oft die Single) → Songliste. Künstler/Alben/Songlisten werden pro Lauf gemerkt. Notfalls Apple-Music-Link (Album/Song)
  ins Suchfeld des Studios einfügen; bei Album-Links gibt es „Alle übernehmen“. Google-Login über eine **eigene Firebase-Instanz**
  („studio“), damit der anonyme Login der Spiele (Amplify-Host!) unberührt bleibt. Schreiben nur, wenn die UID in
  `isStudioAdmin()` in `firestore.rules` steht (UID statt E-Mail, weil die Regeln öffentlich im Repo liegen).
- Alternativ per Skript (große Mengen am PC, schreibt nur Dateien):
  Links in `scripts/identify-lists/<id>.txt` speichern, dann `node scripts/identify-list.mjs <id> "<Name>" <emoji> scripts/identify-lists/<id>.txt`.
  Das Skript fragt Spotify einmalig pro Song (App-Token), sucht bei Apple (ca. 20 Suchen/Minute → 400 Songs ≈ 25 Min.,
  im Hintergrund laufen lassen) und schreibt Liste, Verzeichnis und Bericht (`<id>.report.txt`: nicht gefunden/unsicher).
  Gespeichert werden nur Apple-Daten (ID, Titel, Interpret, Jahr, Cover, Hörprobe-Adresse), keine Spotify-Daten.

### Testify („Wie gut kennt ihr euch?“, `#testify/CODE`)
- Genau 2 Handys. Pro Frage: eigene Antwort (danach gesperrt) → Tipp für den anderen → warten → Countdown → Aufdeckung →
  beide „Weiter“. Fragetypen Eins aus 4 / Dies oder das (beides auf einem Bildschirm) / Skala 1–5 (1 daneben = „knapp“, ½ Punkt).
  Ergebnis „X kennt Y zu …“ bereinigt um Zufallstreffer. „Nochmal“: Host stellt neu ein, Gast bestätigt „Nochmal spielen“.
- Design nach `testify_screendesigns.pdf` (Akzent Lila `#C791FF`), Aufbau Start/Erstellen/Beitreten wie Amplify (Tier-Karussell geteilt).
- Feste Fragen in `Testify/questions.js` (Rückfall für KI-Fragen), sortiert nach **Themen** (`CATEGORIES`, Chips in „Spiel einrichten“,
  mehrere wählbar, u. a. „Freundeskreis“ und „Paar & Liebe“ – kein Freunde/Paar-Set mehr). Jede Frage nennt eindeutig, um wen es geht:
  `own` = „Hast du …?“, `other` = „Hat {n} …?“; Wer von uns? = „… – du oder {n}?“. Neutral formuliert, kein Gendern. Logik ohne React: `testifyLogic.js`.
  Typen: `pick4`, `pair`, `scale`, `emoji4` (Bildwahl 2 × 2), `yesno` (Schon mal …?), `who` (Wer von uns?: kein Tipp, zählt nur
  für den gemeinsamen Wert). Mischung pro Spiel `TYPE_MIX`. Ziel: ≥ 5 Spiele à 15 ohne Wiederholung – pro Typ genug Fragen
  (bei 15 Runden: 4 Eins aus 4, 3 Dies oder das, je 2 der übrigen). Gespielte Fragen merkt sich jedes Gerät
  (`tf_played_v1`, beim Beitreten als `players.<uid>.played` in die Lobby) → auch neue Lobbys wiederholen nichts.
- **KI-Fragen** (Schalter „KI-Fragen“ in „Spiel einrichten“, dazu bis zu 5 eigene Themen wie „Herr der Ringe“): Der Host ruft beim
  Erstellen bzw. bei „Nochmal“ die Firebase-Funktion `testifyQuestions` auf (`functions/testifyQuestions.js`, Logik in `testifyCore.js`).
  Sie nimmt zuerst Fragen aus dem gemeinsamen Pool `testifyPool` (gleiches Thema + Typ, noch nicht gespielt), nur Fehlendes erzeugt
  Claude Opus 5.5 (Secret `ANTHROPIC_API_KEY`, Tageslimit 20 pro Gerät in `testifyUsage`). Persönliche eigene Themen landen nicht im Pool.
  Ergebnis in der Lobby: `gen` (Status + Schlüssel `genKey`) und `genQuestions`; das Spiel nimmt sie nur bei passendem Schlüssel,
  leere Plätze und Fehler → feste Fragen. 👍/👎 nach der Aufdeckung (`testifyPool/{id}/votes/{uid}`, gezählt von `testifyVote`,
  ab 3 👎 und mehr 👎 als 👍 ausgeblendet). `genKey`/`cleanTheme` gibt es doppelt (App + Funktion) – immer beide ändern.
  KI-Oberfläche ohne veröffentlichte Funktion testen: Bot mit `FAKE_KI=1` starten. Kern-Logik: `node scripts/testify-ki-test.mjs`.
- Firestore `testifyLobbies`, Spieler-Schlüssel = UID (nicht der Name). Countdown synchron über `round.doneAt` (Serverzeit) + Uhrabgleich.
- Testen ohne zweites Handy: `scripts/testify-test.mjs` (Bot spielt mit). Vor dem Veröffentlichen der Regeln im Dev-Modus
  `localStorage.tf_dev_col = 'lobbies'` setzen (offene Hitzkopf-Sammlung) und das Skript mit `TF_COL=lobbies` starten; Lobbys danach löschen.

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

### Designs nach Vorlage (Screenshot/Mockup vom User)
- **Vorher:** Maße aus der Vorlage ablesen (Größen, Rundungen, Abstände, Schrift, Farben, Anzahl sichtbarer Elemente)
  und im Vorschlag nennen – der User bestätigt sie mit dem „go“.
- **Nachher:** Screenshot in derselben Breite, Seite an Seite mit der Vorlage in ein Bild legen, Element für Element
  vergleichen; erst ohne Abweichung fertig. Vergleichsbild + bewusste Abweichungen **im Chat** schicken (nicht im PR).
- Ziehen/Wischen immer mit **Maus und Touch** testen (der User prüft oft am PC).
- Neue Elemente bekommen eigene Klassen mit genug Spezifität (z. B. `.start button.x`): `.mvRoot .mvBtn`/`.mvInput`
  und die globalen `button`/`input`-Styles aus `App.css` überschreiben sonst Hintergrund, Rahmen und Größe.

## Amplify: zwei Versionen

- **Amplify 2.0** (in der App nur „Amplify“) = `src/projects/Amplify2/` – hier wird weiterentwickelt. Routen `#amplify2/CODE` und `#live2/CODE`,
  Firestore-Sammlung `amplify2Lobbies` (+ Unterliste `reactions`), Sitzungsschlüssel `a2_…`.
- **Amplify 1.0** = `src/projects/MusicVoter/` (`#amplify`, `#live`, `musicVoterLobbies`, `mv_…`) ist das Backup –
  **nicht ändern**, außer der User verlangt es. Steht nicht mehr auf der Startseite, nur noch per Link erreichbar.
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
- „Song hinzufügen“: Suche (Titel/Band/Album) mit Filtern **Genre** und **Jahrzehnt**. Mit Suchwort zählt nur das Jahrzehnt.
  Ohne Wort kommen bekannte Songs aus **Last.fm-Hitlisten** (Firebase-Funktion `lastfmTop`, Tags in `SEARCH_GENRES`):
  Genre + Jahrzehnt → Top-Künstler des Genres, je 2 ihrer Top-5-Songs im Jahrzehnt (Spotify); nur Genre / nur Jahrzehnt →
  Top-Songs des Tags, bei Spotify gesucht. Spotifys eigene Genres sind zu unsauber. Künstler-Seite; ein Suchfeld für
  Titel/Band/Album oder Spotify-Link (Link → Song sofort hinzugefügt), daneben Knopf „Spotify öffnen“.
- Startseiten „Neue Playlist“ / „Beitreten“: Tier-Karussell (`ANIMALS` in `avatars.js`, `AvatarPicker.jsx`: endlos, Mitte groß = gewählt,
  Schwung + Einrasten, Positionen direkt am DOM statt React-Neuzeichnen, gespeichert beim Stillstand),
  Name-Platzhalter immer „z. B. Niklas“, Regeln beim Erstellen (2 sichtbar, Rest unter „Mehr Regeln“), Knöpfe erst aktiv,
  wenn alles passt. Gäste: Raumcode mit Live-Prüfung + QR-Scanner (`QrScanner.jsx`, `BarcodeDetector`, sonst `jsqr`);
  Einladungslink/QR füllt den Code vor.
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
- **Kontingent der App-ID ist knapp:** Am 17.10.2026 nach >500 Einzel-Abfragen (Listen anlegen) „429 QUOTA_EXCEEDED“ für ~9 h –
  betrifft dann auch die Song-Suche der Amplify-Gäste. Massen-Abfragen vermeiden; Listen per Exportify-CSV anlegen.
- Ohne Login liefert Spotify nur: Suche, einzelne Songs per ID (`/tracks/{id}`; `/tracks?ids=` → 403), Playlist-Metadaten ohne Songs;
  oEmbed (`open.spotify.com/oembed`) nur den Titel. Playlist-Inhalte/Nutzer-Playlists nur mit Login (401/403).
- App im Entwicklermodus (Regeln seit 9. März 2026): nur **max. 5 freigeschaltete Konten** pro Client-ID (inkl. Entwickler),
  Spotify Premium nötig, nur **eine** Client-ID pro Entwickler – alle Spiele teilen sich diese 5 Plätze. Freischalten:
  developer.spotify.com/dashboard → App → Settings → User Management (Name + E-Mail des Spotify-Kontos).
- Login ist nur für den Host Pflicht – Gäste loggen sich nie ein (Suche läuft über den App-Token der Firebase-Funktion
  `spotifyToken`). Eigene Songs holen Gäste per „Teilen → Link kopieren“ aus der Spotify-App und „Einfügen“ in Amplify 2.0;
  Kurzlinks (`spotify.link/…`) löst die Firebase-Funktion `resolveSpotifyLink` auf (veröffentlichen am PC:
  `firebase deploy --only functions:resolveSpotifyLink`).
- Last.fm: API-Schlüssel nur als Firebase-Secret `LASTFM_API_KEY` (nie in den Code/Chat); die Quellenangabe verlangt Last.fm –
  sie steht im Hilfe-Text („Hitlisten beim Stöbern: Last.fm“), nicht entfernen. Last.fm ist aus der Cloud-Umgebung nicht erreichbar – Echttest nur live.
- **Bestehende Client-ID nicht löschen/neu anlegen:** Für neue Client-IDs gilt sofort eine kleinere Endpunkt-Liste
  (für bestehende ist das vorerst verschoben).
- Songs fremder/öffentlicher (auch nur gefolgter) Playlists liefert die API nicht (403); seit Feb. 2026
  `/playlists/{id}/items` statt `/tracks` (Einträge evtl. `item` statt `track` – der Code liest beides).
  Abspielen einer Playlist per `context_uri` funktioniert.
- `preview_url` ist leer → Hörprobe über den eingebetteten Player (`open.spotify.com/embed/track/<id>`).
- Suche: höchstens 10 Treffer pro Anfrage.

## Technisches
- Firebase-Funktionen (`functions/`): Node 22, `firebase-functions` 7 – Import immer `require('firebase-functions/v1')`
  (der Standard-Import ist seit Version 6 die 2. Generation mit anderer Schreibweise). Veröffentlichen nur am PC des Users.
- Die Arbeitskopie unter Windows hat CRLF (autocrlf): vor mehrzeiligen Ersetzungen per Skript Dateien auf LF bringen.
- `gh` unter Windows nur per vollem Pfad: `& "C:\Program Files\GitHub CLI\gh.exe"`; PR-Text per `--body-file`.
