# Music Voter - Projektübersicht

## 🎵 Was ist Music Voter?

Music Voter ist eine kollaborative Musik-Abstimmungs-App, bei der Spieler gemeinsam eine Playlist erstellen und durch Votes entscheiden, welche Songs/Alben zuerst gehört werden sollen.

## ✨ Hauptfeatures

### Lobby-System (Fertig)
- **Name + Emoji Auswahl:** Genau wie bei Hitzkopf wählt jeder Spieler einen Namen und ein Emoji
- **Lobby erstellen/beitreten:** Host erstellt eine 6-stellige Lobby, andere können beitreten
- **Echtzeit-Synchronisation:** Alle Änderungen werden live über Firebase synchronisiert

### Musik hinzufügen (Fertig)
- **Manuell:** Songs/Alben mit Titel und Künstler eingeben (funktioniert ohne Spotify)
- **Spotify:** Songs/Alben über Spotify API suchen (Setup erforderlich, siehe SPOTIFY_SETUP.md)

### Voting-System (Fertig)
- **+1 Vote:** Song gefällt mir
- **-1 Vote:** Song gefällt mir nicht
- **Toggle:** Erneutes Klicken entfernt den Vote
- **Live-Sortierung:** Playlist sortiert sich automatisch nach Gesamtscore

### Berechtigungen
- **Host:** Kann alle Songs löschen
- **Ersteller:** Kann eigene Songs löschen
- **Alle:** Können voten

## 🗂️ Projektstruktur

```
src/
├── App.jsx                          # Router (ProjectHub, Hitzkopf, MusicVoter)
├── components/
│   └── ProjectHub.jsx               # Projekt-Auswahlseite
├── shared/
│   ├── LobbySystem.jsx              # Wiederverwendbare Lobby-Komponente
│   └── LobbySystem.module.css
├── projects/
│   ├── Hitzkopf/
│   │   ├── HitzkopfGame.jsx
│   │   └── HitzkopfGame.module.css
│   └── MusicVoter/
│       ├── MusicVoter.jsx           # Haupt-Komponente
│       └── MusicVoter.module.css
├── services/
│   └── spotifyService.js            # Spotify API Integration
└── data/, utils/, assets/
```

## 🔥 Firebase Integration

### Collections

**musicVoterLobbies/{roomId}:**
```javascript
{
  host: "SpielerName",
  createdAt: Timestamp,
  status: "active",
  players: {
    "SpielerName": {
      emoji: "🐶",
      joinedAt: Timestamp
    }
  },
  playlist: [
    {
      id: "unique_id",
      title: "Bohemian Rhapsody",
      artist: "Queen",
      type: "song",          // "song" oder "album"
      source: "manual",       // "manual" oder "spotify"
      votes: {
        "SpielerName": 1,    // 1 = upvote, -1 = downvote
        "AndererSpieler": -1
      },
      addedBy: "SpielerName",
      addedAt: 1234567890,
      
      // Optional bei Spotify:
      spotifyId: "...",
      spotifyUrl: "...",
      imageUrl: "...",
      previewUrl: "..."
    }
  ]
}
```

## 🎨 Design

- **Farbschema:** Türkis (#4ecdc4) als Hauptfarbe
- **Style:** Konsistent mit Hitzkopf (Dark Theme, Glass-Morphism)
- **Responsive:** Funktioniert auf Desktop und Mobile
- **Animationen:** Smooth Transitions, Hover-Effekte

## 🚀 Verwendung

### Music Voter starten

1. Öffne die App
2. Wähle "Music Voter" auf der Startseite
3. Gib deinen Namen ein und wähle ein Emoji
4. "Lobby erstellen" oder "Lobby beitreten"

### Songs hinzufügen

1. Klicke auf "+ Song/Album hinzufügen"
2. Wähle "Manuell" oder "Spotify"
3. Gib die Informationen ein
4. Fertig! Der Song erscheint in der Playlist

### Voten

1. Klicke auf 👍 für einen Upvote
2. Klicke auf 👎 für einen Downvote
3. Erneutes Klicken entfernt den Vote
4. Die Playlist sortiert sich automatisch

## 📱 Screens

### 1. Lobby Screen
- Name eingeben
- Emoji auswählen (scrollbare Galerie)
- Lobby erstellen / beitreten

### 2. Room Screen
- **Header:** Titel, Room-Code, Verlassen-Button
- **Spieler-Liste:** Alle Spieler mit Emoji (Host hat 👑)
- **Add-Button:** Songs/Alben hinzufügen
- **Playlist:** Sortierte Liste mit Votes

### 3. Add Modal
- Auswahl: Spotify oder Manuell
- Formulare zum Hinzufügen
- Spotify-Suche (wenn konfiguriert)

## 🔧 Spotify Setup (Optional)

Music Voter funktioniert **ohne Spotify** durch manuelle Eingabe.

Für Spotify-Integration siehe: **SPOTIFY_SETUP.md**

Kurzfassung:
1. Spotify Developer Account erstellen
2. App registrieren
3. Client ID & Secret in `.env.local` eintragen
4. Fertig!

## 🎯 Nächste Schritte / Erweiterungen

### Geplante Features
- ✅ Basis-Funktionalität (fertig)
- 🚧 Spotify API Integration
- 📋 Cover-Bilder anzeigen
- 🎵 30-Sekunden-Preview abspielen
- 📊 Vote-Statistiken pro Spieler
- 💾 Playlist exportieren (JSON, Spotify Playlist)
- 🎨 Custom Themes
- 🔊 Audio-Feedback (wie Hitzkopf)

### Mögliche Erweiterungen
- Playlist-History speichern
- Multiple Playlists pro Lobby
- Kategorien/Tags für Songs
- Time-Limited Voting (z.B. 30 Sekunden pro Song)
- Integration mit anderen Musik-Services (Apple Music, YouTube Music)

## 🐛 Bekannte Einschränkungen

1. **Spotify API:** Benötigt Setup (siehe Doku)
2. **Preview-Playback:** Nicht alle Songs haben Preview-URLs
3. **Cover-Bilder:** Nur bei Spotify-Songs verfügbar

## 💡 Tipps

- **Kein Spotify?** Nutze die manuelle Eingabe - funktioniert einwandfrei!
- **Große Gruppe?** Host sollte regelmäßig aufräumen (alte Songs entfernen)
- **Faire Votes:** Jeder kann nur einmal pro Song voten (1 oder -1)
- **Ranking:** Bei gleichem Score wird nach Hinzufüge-Zeit sortiert

## 🤝 Gemeinsame Komponenten mit Hitzkopf

- **LobbySystem:** Wird von beiden Projekten genutzt
- **Firebase Config:** Gleiche Firebase-Instanz
- **Design-System:** Gemeinsame CSS-Variablen
- **Audio-Utils:** Könnten geteilt werden (für Sound-Effekte)

## 📝 Lizenz & Credits

- Firebase für Echtzeit-Datenbank
- Spotify Web API (optional)
- Design inspiriert von Hitzkopf
