# Music Voter - Spotify Integration

## Übersicht

Music Voter ist eine kollaborative Musik-Voting-App, bei der Nutzer Songs und Alben hinzufügen und gemeinsam abstimmen können, welche Musik als nächstes gehört werden soll.

## Features

✅ **Bereits implementiert:**
- Lobby-System mit Namen und Emoji-Auswahl (wie Hitzkopf)
- Manuelles Hinzufügen von Songs/Alben
- +1/-1 Voting-System
- Automatische Sortierung nach Votes
- Echtzeit-Synchronisation über Firebase
- Host kann Songs löschen
- Ersteller können ihre eigenen Songs löschen

🚧 **In Entwicklung:**
- Spotify API Integration
- Song-Suche über Spotify
- Album-Suche über Spotify
- Preview-Playback
- Cover-Bilder

## Spotify API einrichten

### 1. Spotify Developer Account erstellen

1. Gehe zu [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Melde dich mit deinem Spotify-Account an
3. Klicke auf "Create an App"
4. Gib der App einen Namen (z.B. "Music Voter")
5. Akzeptiere die Terms of Service

### 2. App konfigurieren

Nach dem Erstellen der App:

1. Notiere dir die **Client ID** und **Client Secret**
2. Klicke auf "Edit Settings"
3. Füge unter "Redirect URIs" hinzu:
   - Für lokale Entwicklung: `http://localhost:5173/callback`
   - Für Production: `https://deine-domain.com/callback`
4. Speichere die Einstellungen

### 3. Umgebungsvariablen konfigurieren

Erstelle eine `.env.local` Datei im Projekt-Root:

```env
VITE_SPOTIFY_CLIENT_ID=deine_client_id_hier
VITE_SPOTIFY_CLIENT_SECRET=dein_client_secret_hier
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
```

**Wichtig:** Die `.env.local` Datei ist bereits in `.gitignore` und wird NICHT ins Git-Repository committet!

### 4. Spotify Service nutzen

Der Spotify Service ist bereits implementiert in `src/services/spotifyService.js`:

```javascript
import spotifyService from '@/services/spotifyService'

// Songs suchen
const results = await spotifyService.searchTracks('Bohemian Rhapsody', 10)

// Alben suchen
const albums = await spotifyService.searchAlbums('Abbey Road', 10)

// Beides suchen
const mixed = await spotifyService.search('Queen', 20)
```

### 5. Integration in MusicVoter.jsx

Die Integration erfolgt in der `handleSpotifySearch` Funktion:

```javascript
const handleSpotifySearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    
    try {
        const results = await spotifyService.search(searchQuery, 10)
        setSearchResults(results)
    } catch (error) {
        console.error('Spotify Suche fehlgeschlagen:', error)
        alert('Spotify Suche fehlgeschlagen. Bitte versuche es erneut.')
    } finally {
        setIsSearching(false)
    }
}
```

## API Limits und Best Practices

### Rate Limits
- Spotify erlaubt standardmäßig bis zu **180 Requests pro Minute**
- Client Credentials Token ist 1 Stunde gültig
- Der Service erneuert den Token automatisch

### Best Practices
1. **Debouncing:** Implementiere ein Debouncing bei der Suche (z.B. 300ms)
2. **Caching:** Speichere häufige Suchanfragen im LocalStorage
3. **Error Handling:** Zeige benutzerfreundliche Fehlermeldungen
4. **Loading States:** Zeige Ladeindikatoren während API-Calls

## Alternative: Ohne Spotify

Die App funktioniert auch komplett ohne Spotify! Nutzer können Songs manuell eingeben:
- Titel eingeben
- Künstler eingeben (optional)
- Song oder Album auswählen

## Nächste Schritte

1. `.env.local` mit deinen Spotify Credentials erstellen
2. `handleSpotifySearch` in `MusicVoter.jsx` aktivieren (bereits vorbereitet)
3. UI für Suchergebnisse erweitern (Vorschlag im Code vorhanden)
4. Optional: Preview-Player für 30-Sekunden-Snippets hinzufügen
5. Optional: Cover-Bilder in der Playlist anzeigen

## Troubleshooting

### "Failed to get access token"
- Prüfe ob Client ID und Secret korrekt sind
- Prüfe ob die App in Spotify Developer Dashboard aktiviert ist

### "CORS Error"
- Spotify API erfordert Server-seitige Authentifizierung für Production
- Für Production: Implementiere einen Backend-Proxy (z.B. mit Netlify Functions)

### "Token expired"
- Der Service erneuert Token automatisch
- Falls Probleme auftreten: Seite neu laden

## Support

Bei Fragen oder Problemen:
1. Spotify Developer Docs: https://developer.spotify.com/documentation/web-api
2. API Reference: https://developer.spotify.com/documentation/web-api/reference

## Lizenz

Dieses Projekt nutzt die Spotify Web API gemäß den [Spotify Developer Terms](https://developer.spotify.com/terms).
