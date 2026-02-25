# Spotify API - Redirect URI Info

## 🔍 Zwei Anwendungsfälle:

### 1. Suche (Client Credentials)
- ✅ Keine User-Anmeldung, keine Redirect URI nötig
- ✅ Nur für Spotify-Suche nach Songs/Alben

### 2. Playlist abspielen (Host – PKCE)
- ✅ **Redirect URI wird benötigt**, damit der Host sich mit Spotify anmelden kann
- ✅ Im Spotify Dashboard **exakt** eintragen, z. B. `http://localhost:5173/` oder `http://localhost:5173/callback`
- ✅ Erfordert **Spotify Premium** (Web Playback SDK)

## 🎯 Für Music Voter:

- **Nur Suche:** Redirect URI im Dashboard optional.
- **Playlist abspielen (Host):** Redirect URI in den Spotify-Einstellungen **exakt** setzen (wie in `.env.local` unter `VITE_SPOTIFY_REDIRECT_URI`).

## 🚀 Setup für lokale Entwicklung:

### Wenn der Host die Playlist abspielen will:
```
Spotify Dashboard → Settings → Redirect URIs:
http://localhost:5173/
```
(Oder z. B. `http://localhost:5173/callback` – muss mit VITE_SPOTIFY_REDIRECT_URI übereinstimmen.)

## ✅ Was wichtig ist:

1. **Client ID** (immer erforderlich)
2. **Client Secret** (immer erforderlich)
3. **Redirect URI** (nur für User-Login, nutzen wir nicht)

## 🐛 Dein Fehler war:

**"Invalid limit"** - Spotify akzeptiert bei kombinierten Suchen (track,album) ein kleineres Limit.

**Behoben durch:**
- Limit von 20 → 10 reduziert
- Limit wird pro Typ berechnet (5 Tracks + 5 Albums = 10 total)

## 📝 Zusammenfassung:

```env
# In .env.local:
VITE_SPOTIFY_CLIENT_ID=2d9c122237af4b2391ab504f72edfd70
VITE_SPOTIFY_CLIENT_SECRET=d73dfc215bf04c58a74d535793baefcd
VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback  # Optional, wird nicht genutzt!
```

**Tipp:** Du kannst die Redirect URI auch ganz weglassen oder eine beliebige URL eintragen - für unseren Use-Case (nur Suche) spielt das keine Rolle!
