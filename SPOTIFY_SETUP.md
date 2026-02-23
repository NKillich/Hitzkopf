# Spotify API - Schnellstart-Anleitung

## ✅ Was wurde implementiert

Die Spotify API ist jetzt vollständig in Music Voter integriert!

## 📋 Setup-Schritte

### 1. Spotify Developer App erstellen

1. Gehe zu: **https://developer.spotify.com/dashboard**
2. Melde dich an (oder erstelle einen kostenlosen Account)
3. Klicke **"Create app"**
4. Fülle aus:
   - **App name:** `Music Voter`
   - **App description:** `Collaborative music voting app`
   - **Redirect URIs:** `http://localhost:5173/callback`
   - **API/SDKs:** `Web API`
5. Akzeptiere die Terms und klicke **"Save"**
6. Auf der App-Seite:
   - Kopiere die **Client ID**
   - Klicke **"Show Client Secret"** und kopiere das Secret

### 2. .env.local konfigurieren

Die Datei `.env.local` wurde bereits erstellt. Du musst nur deine Credentials einfügen:

```bash
# Öffne die Datei .env.local im Projekt-Root
# Ersetze die Platzhalter mit deinen echten Werten:

VITE_SPOTIFY_CLIENT_ID=deine_echte_client_id_hier
VITE_SPOTIFY_CLIENT_SECRET=dein_echtes_client_secret_hier
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
```

**Wichtig:** 
- Keine Anführungszeichen um die Werte
- Keine Leerzeichen vor/nach dem `=`
- Die Datei ist in `.gitignore` und wird nicht committet

### 3. Dev-Server neu starten

**Wichtig:** Du musst den Dev-Server neu starten, damit die Umgebungsvariablen geladen werden!

```bash
# Terminal stoppen (Ctrl+C falls läuft)
npm run dev
```

### 4. Testen

1. Öffne die App: `http://localhost:5173`
2. Wähle **"Music Voter"**
3. Erstelle eine Lobby
4. Klicke **"+ Song/Album hinzufügen"**
5. Wähle **"Spotify"**
6. Suche nach einem Song (z.B. "Bohemian Rhapsody")
7. Die Ergebnisse sollten erscheinen!

## 🎵 Features

### Was funktioniert:
- ✅ **Suche nach Songs**
- ✅ **Suche nach Alben**
- ✅ **Kombinierte Suche** (Songs + Alben)
- ✅ **Cover-Bilder** werden angezeigt
- ✅ **Klicken zum Hinzufügen**
- ✅ **Automatische Token-Verwaltung**

### Suchergebnis enthält:
- Titel
- Künstler
- Album (bei Songs)
- Cover-Bild
- Spotify-Link
- Preview-URL (für spätere Audio-Playback)

## 🔍 So suchst du:

1. **Nach Song:** Gib Songtitel oder Künstler ein
   - Beispiel: "Bohemian Rhapsody"
   - Beispiel: "Queen"

2. **Nach Album:** Gib Albumtitel ein
   - Beispiel: "A Night at the Opera"
   - Beispiel: "Abbey Road"

3. **Kombiniert:** Künstler + Song/Album
   - Beispiel: "Queen Bohemian"
   - Beispiel: "Beatles Abbey"

## 🐛 Troubleshooting

### "Spotify Suche fehlgeschlagen. Überprüfe deine Credentials"

**Lösung:**
1. Prüfe ob `.env.local` die richtigen Werte enthält
2. Stelle sicher, dass keine Anführungszeichen um die Werte sind
3. **Dev-Server neu starten!** (Umgebungsvariablen werden nur beim Start geladen)

### "CORS Error"

**Lösung:**
- Das ist normal bei Client Credentials Flow
- Der Service nutzt automatisch den richtigen Flow
- Bei Problemen: Prüfe ob Client Secret korrekt ist

### "Token expired"

**Lösung:**
- Der Service erneuert Token automatisch
- Sollte nicht passieren
- Falls doch: Seite neu laden

### Keine Ergebnisse

**Lösung:**
1. Prüfe Suchbegriff (Tippfehler?)
2. Versuche allgemeineren Begriff
3. Prüfe Spotify Dashboard (ist App aktiv?)

## 📊 API Limits

- **Rate Limit:** 180 Requests/Minute (mehr als genug!)
- **Token Gültigkeit:** 1 Stunde (automatische Erneuerung)
- **Suchergebnisse:** Max. 20 pro Suche (konfigurierbar)

## 🎨 UI Features

### Suchergebnisse zeigen:
- **Cover-Bild** (50x50px) links
- **Titel** (fett)
- **Künstler** (grau)
- **Album** (bei Songs, kleinere Schrift)
- **+ Button** rechts zum Hinzufügen

### Interaktion:
- **Hover:** Item hebt sich hervor
- **Klick:** Song/Album wird zur Playlist hinzugefügt
- **Enter:** Startet Suche

### Loading State:
- Spinner während der Suche
- "Durchsuche Spotify..." Text
- Button wird disabled

## 🚀 Erweiterte Features (optional)

### Preview Playback (später hinzufügen)

Viele Songs haben eine `previewUrl` (30 Sekunden):

```javascript
// Im Suchergebnis-Item:
{item.previewUrl && (
    <audio controls>
        <source src={item.previewUrl} type="audio/mpeg" />
    </audio>
)}
```

### Externe Links

```javascript
// Spotify-Link öffnen:
<a href={item.spotifyUrl} target="_blank" rel="noopener noreferrer">
    🎵 In Spotify öffnen
</a>
```

### Größere Cover-Bilder

In der Playlist (nicht Suche):

```javascript
// In MusicVoter.jsx bei playlistItem:
{item.imageUrl && (
    <img 
        src={item.imageUrl} 
        alt={item.title}
        className={styles.itemCover}
    />
)}
```

```css
/* In MusicVoter.module.css: */
.itemCover {
    width: 60px;
    height: 60px;
    border-radius: 8px;
    object-fit: cover;
}
```

## 🎉 Das war's!

Spotify ist jetzt vollständig integriert und einsatzbereit!

**Tipp:** Wenn du keine Spotify-API nutzen möchtest, funktioniert die manuelle Eingabe weiterhin perfekt. Die App ist hybrid! 🎵
