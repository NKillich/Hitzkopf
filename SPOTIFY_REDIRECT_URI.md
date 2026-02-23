# Spotify API - Redirect URI Info

## 🔍 Wichtig zu verstehen:

### Client Credentials Flow (Was wir nutzen)
- ✅ **Keine User-Anmeldung** erforderlich
- ✅ **Redirect URI wird NICHT genutzt**
- ✅ Funktioniert lokal ohne GitHub Pages
- ✅ Nur App-Level Zugriff (Suche, etc.)

### Authorization Code Flow (Nutzen wir NICHT)
- ❌ Erfordert User-Login bei Spotify
- ❌ Redirect URI wird benötigt
- ❌ Komplexer Setup

## 🎯 Für Music Voter:

Die **Redirect URI in den Spotify Settings ist OPTIONAL**!

Wir nutzen sie nicht, weil:
1. Keine User-Anmeldung nötig
2. Nur öffentliche Daten (Suche)
3. Client Credentials reichen aus

## 🚀 Setup für lokale Entwicklung:

### Option 1: Redirect URI weglassen (Empfohlen für lokal)
```
Spotify Dashboard → Settings → Redirect URIs:
[leer lassen oder beliebige URL]
```

### Option 2: GitHub Pages URL eintragen (Für Production)
```
Spotify Dashboard → Settings → Redirect URIs:
https://nkillich.github.io/Hitzkopf/callback
```

**Wichtig:** Für unsere Zwecke (Musik-Suche) ist die Redirect URI egal!

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
