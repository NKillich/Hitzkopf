# Spotify einrichten (Amplify & Song raten)

Es gibt zwei Arten von Spotify-Zugriff:

| Zweck | Wer | Wie |
|---|---|---|
| Suche nach Songs/Alben ohne Login (Amplify-Gäste) | alle Spieler | App-Token von der Cloud Function `spotifyToken` |
| Playlists lesen, Wiedergabe (Host, Song raten) | eingeloggter Nutzer | OAuth mit **PKCE** direkt im Browser, Spotify Premium nötig |

Das **Client Secret kommt nie ins Frontend** (kein `VITE_`-Prefix, nicht in der CI). Es liegt nur im Firebase Secret Manager.

## 1. Spotify-App anlegen
1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → *Create app*.
2. **Redirect URIs** eintragen (exakt, mit/ohne Slash wie in der Env-Variable):
   - Production: `https://nkillich.github.io/Hitzkopf`
   - Lokal: `http://127.0.0.1:5173/Hitzkopf/` (`localhost` erlaubt Spotify nicht, immer `127.0.0.1`)
3. **Client ID** und **Client Secret** notieren.

## 2. Frontend (lokal)
`.env.local.example` nach `.env.local` kopieren:

```env
VITE_SPOTIFY_CLIENT_ID=deine_client_id
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/Hitzkopf/
```

Für die Production-CI wird nur `VITE_SPOTIFY_CLIENT_ID` als GitHub-Secret benötigt
(*Settings → Secrets and variables → Actions*).

## 3. Cloud Function `spotifyToken` (Secret serverseitig)
Voraussetzung: Firebase-Projekt auf dem Blaze-Plan, `firebase login`.

```bash
npx firebase functions:secrets:set SPOTIFY_CLIENT_ID
npx firebase functions:secrets:set SPOTIFY_CLIENT_SECRET
npx firebase deploy --only functions:spotifyToken
```

Die Function verlangt einen Firebase-Login (anonym reicht), cached den Token und gibt ihn an den Client weiter.

## Fehlersuche
- **Suche schlägt fehl:** Ist die Function deployt (`firebase functions:log`)? Sind beide Secrets gesetzt?
- **Login-Redirect schlägt fehl:** Redirect URI im Dashboard stimmt nicht exakt mit `VITE_SPOTIFY_REDIRECT_URI` überein.
- **Wiedergabe geht nicht:** Spotify Premium und ein aktives Gerät nötig.
