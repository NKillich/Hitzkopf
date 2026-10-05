# Party Games Hub 🎮

Eine Sammlung von Partyspielen für Freunde, mit gemeinsamer Echtzeit-Infrastruktur (Firebase) und Spotify-Anbindung.
Live: [nkillich.github.io/Hitzkopf](https://nkillich.github.io/Hitzkopf)

## 🎯 Apps

| App | Link | Beschreibung |
|---|---|---|
| 🎵 **Amplify** | `#amplify` | Gemeinsam eine Playlist erstellen: Songs/Alben per Spotify-Suche oder manuell hinzufügen, per +1/-1 abstimmen, der Host spielt sie ab. |
| 🧠 **Quiz Royale** | `#quizroyale` | Rundenbasiertes Quiz mit Charakteren und Upgrades. |
| 🎧 **Song raten** | `#songraten` | Songs aus eigenen Spotify-Playlists erraten, mit Statistiken pro Gerät. Spotify Premium nötig. |
| 🔥 **Hitzkopf** | `#hitzkopf` | Partyspiel mit Temperatur-System, Fragen und Attacken. *Aktuell pausiert.* |

## 🚀 Quick Start

```bash
npm install
cp .env.local.example .env.local   # Spotify Client ID eintragen
npm run dev                        # http://127.0.0.1:5173/Hitzkopf/
```

Weitere Scripts: `npm run build`, `npm run preview`, `npm run lint`.

## 🔧 Technologie

- **Frontend:** React 19, Vite, CSS Modules
- **Backend:** Firebase (Firestore, anonyme Auth, Cloud Functions, Analytics)
- **APIs:** Spotify Web API + Web Playback SDK
- **Hosting:** GitHub Pages (`gh-pages`-Branch)

## 🗂️ Projektstruktur

```
src/
├── App.jsx                    # Router (Hash-basiert)
├── components/ProjectHub.jsx  # Startseite
├── shared/ui/                 # Gemeinsames Design (Amplify, Song raten)
├── projects/
│   ├── MusicVoter/            # Amplify
│   ├── QuizGame/              # Quiz Royale
│   ├── SecondSound/           # Song raten
│   └── Hitzkopf/              # Hitzkopf (pausiert)
├── services/spotifyService.js # Spotify-Anbindung (PKCE + Token-Proxy)
├── utils/                     # audioManager, logger (Debug-Logs nur im Dev-Modus)
└── data/                      # Fragen, Charaktere, Upgrades
functions/                     # Cloud Functions (spotifyToken, Hitzkopf-Trigger)
firestore.rules                # Sicherheitsregeln
```

## 🎵 Spotify

Das Client Secret liegt **nicht** im Frontend, sondern im Firebase Secret Manager. Eine Cloud Function (`spotifyToken`)
liefert App-Tokens für die Suche, der Nutzer-Login läuft per PKCE.
Setup und Deployment: [SPOTIFY_SETUP.md](./SPOTIFY_SETUP.md). Details zu Amplify: [MUSIC_VOTER.md](./MUSIC_VOTER.md).

## 🔐 Deployment

- **Website:** Push/Merge auf `main` → GitHub Action baut (`npm run build`) und deployt nach `gh-pages`.
  Benötigtes GitHub-Secret: `VITE_SPOTIFY_CLIENT_ID`.
- **Firestore-Regeln:** `npm run deploy:rules`
- **Cloud Function:** `npx firebase deploy --only functions:spotifyToken`
- `dist/` wird nicht eingecheckt.

Entwickelt wird auf `dev`, Änderungen gehen per Pull Request nach `main`.

## 🐛 Bekannte Probleme

**Windows/OneDrive: `spawn EPERM` (esbuild):** Projekt außerhalb von OneDrive verschieben, Defender-Ausnahme hinzufügen
oder `node_modules` neu installieren.

## 📄 Lizenz

MIT
