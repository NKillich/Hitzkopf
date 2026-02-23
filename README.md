# Party Games Hub 🎮

Eine zentrale Plattform für verschiedene Partyspiele mit gemeinsamer Lobby-Infrastruktur.

## 🎯 Projekte

### 1. 🔥 Hitzkopf
Das explosive Partyspiel - Errate die Antworten deiner Freunde!

**Features:**
- Multiplayer Lobby-System
- Kategoriebasierte Fragen
- Temperatur-System
- Echtzeit-Voting
- Sound-Effekte

[Mehr über Hitzkopf →](./docs/HITZKOPF.md)

### 2. 🎵 Music Voter (NEU!)
Gemeinsam die perfekte Playlist erstellen!

**Features:**
- Lobby-System (Name + Emoji)
- Songs/Alben hinzufügen (manuell oder Spotify)
- +1/-1 Voting-System
- Automatische Sortierung nach Votes
- Echtzeit-Synchronisation

📖 **Dokumentation:**
- [Music Voter Übersicht](./MUSIC_VOTER.md)
- [Spotify Integration Setup](./MUSIC_VOTER_SPOTIFY.md)

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

Die App läuft dann auf `http://localhost:5173`

### Build für Production

```bash
npm run build
```

### Deploy

```bash
npm run deploy
```

## 🗂️ Projektstruktur

```
src/
├── App.jsx                      # Haupt-Router
├── components/
│   └── ProjectHub.jsx          # Projekt-Auswahlseite
├── shared/
│   └── LobbySystem.jsx         # Gemeinsame Lobby-Komponente
├── projects/
│   ├── Hitzkopf/              # Hitzkopf-Spiel
│   │   ├── HitzkopfGame.jsx
│   │   └── HitzkopfGame.module.css
│   └── MusicVoter/            # Music Voter
│       ├── MusicVoter.jsx
│       └── MusicVoter.module.css
├── services/
│   └── spotifyService.js      # Spotify API Integration
├── data/                       # Spieldaten (Fragen, etc.)
├── utils/                      # Hilfsfunktionen
└── assets/                     # Bilder, Sounds, etc.
```

## 🔧 Technologie-Stack

- **Frontend:** React 19 + Vite
- **Styling:** CSS Modules
- **Backend:** Firebase (Firestore + Auth)
- **Hosting:** GitHub Pages
- **APIs:** Spotify Web API (optional)

## 🎨 Features

### Gemeinsame Komponenten

- **LobbySystem:** Wiederverwendbare Lobby mit Namen + Emoji-Auswahl
- **Firebase Integration:** Zentrale Echtzeit-Datenbank
- **Design-System:** Konsistente UI über alle Projekte
- **Responsive:** Funktioniert auf Desktop und Mobile

### Project Hub

Die Startseite zeigt alle verfügbaren Projekte:
- Animierte Projekt-Karten
- Hover-Effekte
- Gradient-Animationen
- Responsive Grid-Layout

## 🔥 Firebase Setup

Die App nutzt Firebase für:
- **Authentication:** Anonyme Anmeldung
- **Firestore:** Echtzeit-Datenbank für Lobbies
- **Hosting:** Optional für Production

Collections:
- `lobbies/` - Hitzkopf-Lobbies
- `musicVoterLobbies/` - Music Voter Lobbies

## 🎵 Spotify Integration (Optional)

Music Voter kann optional mit der Spotify API verbunden werden:

1. Erstelle eine App auf [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Kopiere `.env.local.example` zu `.env.local`
3. Füge deine Spotify Credentials ein

**Wichtig:** Music Voter funktioniert auch **ohne Spotify** durch manuelle Song-Eingabe!

Detaillierte Anleitung: [MUSIC_VOTER_SPOTIFY.md](./MUSIC_VOTER_SPOTIFY.md)

## 📱 Verwendung

1. **Öffne die App** - Du siehst den Project Hub
2. **Wähle ein Projekt** - Hitzkopf oder Music Voter
3. **Erstelle eine Lobby** - Gib deinen Namen ein und wähle ein Emoji
4. **Teile den Code** - Andere können mit dem 6-stelligen Code beitreten
5. **Spiele!** - Viel Spaß!

## 🎯 Geplante Erweiterungen

### Neue Projekte
- 🎲 Würfel-Spiele
- 🃏 Karten-Spiele
- 🎨 Draw & Guess
- 📝 Trivia Quiz

### Allgemeine Features
- User Accounts (optional)
- Lobby-Browser
- Private/Public Lobbies
- Chat-Funktion
- Voice Chat Integration

## 🐛 Bekannte Probleme

### Windows/OneDrive esbuild EPERM Fehler

Falls der Dev-Server mit einem `spawn EPERM` Fehler fehlschlägt:

**Lösungen:**
1. Projekt außerhalb von OneDrive verschieben
2. Windows Defender Ausnahme hinzufügen
3. Terminal als Administrator ausführen
4. `node_modules` neu installieren:
   ```bash
   rm -rf node_modules
   npm install
   ```

Der Code selbst ist fehlerfrei - dies ist ein bekanntes Windows-Problem mit esbuild.

## 📝 Scripts

```bash
npm run dev          # Development Server
npm run build        # Production Build
npm run preview      # Preview Production Build
npm run lint         # ESLint
npm run deploy       # Deploy zu GitHub Pages
```

## 🤝 Mitwirken

Ideen für neue Spiele? Verbesserungsvorschläge?

1. Fork das Repository
2. Erstelle einen Feature-Branch
3. Committe deine Änderungen
4. Erstelle einen Pull Request

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE)

## 🎉 Credits

- Firebase für Echtzeit-Datenbank
- Spotify Web API (optional)
- React + Vite für das Framework
- Community für Feedback und Ideen

---

Made with ❤️ by Niklas

**Viel Spaß beim Spielen! 🎮🎵**
