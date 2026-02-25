/**
 * Spotify API Service für Music Voter
 * 
 * Hinweis: Um die Spotify API zu nutzen, benötigst du:
 * 1. Einen Spotify Developer Account (https://developer.spotify.com/)
 * 2. Eine registrierte App mit Client ID und Client Secret
 * 3. Redirect URI in deiner Spotify App konfiguriert
 * 
 * Umgebungsvariablen (in .env.local):
 * VITE_SPOTIFY_CLIENT_ID=deine_client_id
 * VITE_SPOTIFY_CLIENT_SECRET=dein_client_secret
 * VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback
 */

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const SPOTIFY_AUTH_BASE = 'https://accounts.spotify.com'

const STORAGE_KEYS = {
    PKCE_VERIFIER: 'spotify_pkce_verifier',
    USER_ACCESS: 'spotify_user_access_token',
    USER_REFRESH: 'spotify_user_refresh_token',
    USER_EXPIRY: 'spotify_user_expiry',
    RETURN_TO: 'spotify_return_to'
}

class SpotifyService {
    constructor() {
        this.clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID
        this.clientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET
        // Redirect URI: aus .env ODER dynamisch (Origin + Base + /callback), damit es auf GitHub Pages mit deinem bestehenden Eintrag funktioniert
        const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
        const dynamicRedirect = typeof window !== 'undefined'
            ? `${window.location.origin}${base}/callback`
            : 'https://nkillich.github.io/Hitzkopf/callback'
        this.redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || dynamicRedirect
        this.accessToken = null
        this.tokenExpiry = null
        this._userToken = null
        this._deviceId = null
        this._player = null
        this._sdkReady = false

        // Debug: Prüfe ob Credentials geladen wurden
        if (!this.clientId || !this.clientSecret) {
            console.warn('⚠️ Spotify Credentials fehlen! Überprüfe .env.local')
            console.log('Client ID vorhanden:', !!this.clientId)
            console.log('Client Secret vorhanden:', !!this.clientSecret)
        } else {
            console.log('✅ Spotify Credentials geladen')
        }
    }

    /**
     * PKCE: Zufälligen String erzeugen
     */
    _generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        const values = crypto.getRandomValues(new Uint8Array(length))
        return values.reduce((acc, x) => acc + possible[x % possible.length], '')
    }

    /**
     * PKCE: SHA256-Hash für Code Challenge
     */
    async _sha256(plain) {
        const encoder = new TextEncoder()
        const data = encoder.encode(plain)
        return window.crypto.subtle.digest('SHA-256', data)
    }

    _base64urlEncode(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
    }

    /**
     * Login-URL für Host (PKCE, mit Streaming-Scopes für Web Playback)
     * Speichert code_verifier in sessionStorage. Vor Redirect sessionStorage.setItem('spotify_return_to', 'musicvoter') setzen.
     */
    async getAuthUrlWithPKCE() {
        if (!this.clientId) throw new Error('Spotify Client ID fehlt')
        const codeVerifier = this._generateRandomString(64)
        const hashed = await this._sha256(codeVerifier)
        const codeChallenge = this._base64urlEncode(hashed)

        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEYS.PKCE_VERIFIER, codeVerifier)
        }

        const scopes = [
            'streaming',
            'user-read-email',
            'user-read-private',
            'user-modify-playback-state',
            'user-read-playback-state'
        ].join(' ')

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            scope: scopes,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            redirect_uri: this.redirectUri,
            state: this._generateRandomString(16)
        })

        return `${SPOTIFY_AUTH_BASE}/authorize?${params.toString()}`
    }

    /**
     * Authorization Code gegen User Access Token tauschen (PKCE, kein Client Secret nötig)
     */
    async exchangeCodeForToken(code) {
        const codeVerifier = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEYS.PKCE_VERIFIER) : null
        if (!codeVerifier) throw new Error('Code Verifier nicht gefunden – bitte erneut verbinden.')

        const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.redirectUri,
                code_verifier: codeVerifier
            })
        })

        if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            throw new Error(err.error_description || err.error || 'Token-Austausch fehlgeschlagen')
        }

        const data = await response.json()
        this._storeUserTokens(data.access_token, data.refresh_token, data.expires_in)
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEYS.PKCE_VERIFIER)
        }
        return data
    }

    _storeUserTokens(accessToken, refreshToken, expiresIn) {
        const expiry = Date.now() + (expiresIn * 1000)
        this._userToken = accessToken
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEYS.USER_ACCESS, accessToken)
            sessionStorage.setItem(STORAGE_KEYS.USER_REFRESH, refreshToken || '')
            sessionStorage.setItem(STORAGE_KEYS.USER_EXPIRY, String(expiry))
        }
    }

    /**
     * User Access Token aus Speicher laden (oder per Refresh erneuern)
     */
    async getStoredUserToken() {
        if (typeof sessionStorage === 'undefined') return null
        let token = sessionStorage.getItem(STORAGE_KEYS.USER_ACCESS)
        const refresh = sessionStorage.getItem(STORAGE_KEYS.USER_REFRESH)
        const expiry = Number(sessionStorage.getItem(STORAGE_KEYS.USER_EXPIRY) || 0)
        if (token && Date.now() >= expiry - 60000 && refresh) {
            try {
                const data = await this.refreshUserToken()
                token = data.access_token
            } catch (_) {
                return null
            }
        }
        this._userToken = token
        return token || null
    }

    async refreshUserToken() {
        const refresh = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEYS.USER_REFRESH) : null
        if (!refresh) throw new Error('Kein Refresh Token')

        const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refresh,
                client_id: this.clientId
            })
        })

        if (!response.ok) {
            this.clearUserTokens()
            throw new Error('Token-Erneuerung fehlgeschlagen')
        }

        const data = await response.json()
        this._storeUserTokens(data.access_token, data.refresh_token || refresh, data.expires_in)
        return data
    }

    clearUserTokens() {
        this._userToken = null
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEYS.USER_ACCESS)
            sessionStorage.removeItem(STORAGE_KEYS.USER_REFRESH)
            sessionStorage.removeItem(STORAGE_KEYS.USER_EXPIRY)
        }
    }

    async isUserLoggedIn() {
        const token = await this.getStoredUserToken()
        return !!token
    }

    /**
     * Generiert die Spotify Login-URL für OAuth (Legacy, ohne PKCE)
     */
    getAuthUrl() {
        const scopes = [
            'user-read-private',
            'user-read-email',
            'playlist-read-private',
            'playlist-read-collaborative'
        ].join(' ')

        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            scope: scopes,
            show_dialog: 'false'
        })

        return `${SPOTIFY_AUTH_BASE}/authorize?${params.toString()}`
    }

    /**
     * Tauscht den Authorization Code gegen einen Access Token
     */
    async getAccessToken(code) {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.redirectUri
        })

        const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(`${this.clientId}:${this.clientSecret}`)
            },
            body: params.toString()
        })

        if (!response.ok) {
            throw new Error('Failed to get access token')
        }

        const data = await response.json()
        this.accessToken = data.access_token
        this.tokenExpiry = Date.now() + (data.expires_in * 1000)
        
        return data
    }

    /**
     * Client Credentials Flow für App-only Zugriff (ohne User Auth)
     */
    async getClientCredentialsToken() {
        // Prüfe ob Credentials vorhanden sind
        if (!this.clientId || !this.clientSecret) {
            const error = new Error('Spotify Credentials fehlen! Überprüfe .env.local und starte Dev-Server neu.')
            error.code = 'MISSING_CREDENTIALS'
            throw error
        }

        const params = new URLSearchParams({
            grant_type: 'client_credentials'
        })

        try {
            const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(`${this.clientId}:${this.clientSecret}`)
                },
                body: params.toString()
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                console.error('Spotify API Fehler:', errorData)
                
                const error = new Error(
                    `Spotify API Fehler (${response.status}): ${errorData.error_description || errorData.error || 'Unbekannter Fehler'}`
                )
                error.code = 'SPOTIFY_API_ERROR'
                error.status = response.status
                throw error
            }

            const data = await response.json()
            this.accessToken = data.access_token
            this.tokenExpiry = Date.now() + (data.expires_in * 1000)
            
            console.log('✅ Spotify Token erfolgreich abgerufen')
            return data
        } catch (error) {
            if (error.code === 'MISSING_CREDENTIALS' || error.code === 'SPOTIFY_API_ERROR') {
                throw error
            }
            
            // Netzwerkfehler
            const networkError = new Error('Netzwerkfehler beim Abrufen des Spotify Tokens: ' + error.message)
            networkError.code = 'NETWORK_ERROR'
            throw networkError
        }
    }

    /**
     * Prüft ob Token gültig ist und erneuert ihn falls nötig
     */
    async ensureValidToken() {
        if (!this.accessToken || Date.now() >= this.tokenExpiry) {
            await this.getClientCredentialsToken()
        }
    }

    /**
     * Sucht nach Songs auf Spotify
     */
    async searchTracks(query, limit = 10) {
        await this.ensureValidToken()

        const params = new URLSearchParams({
            q: query,
            type: 'track',
            limit: limit.toString()
        })

        const response = await fetch(`${SPOTIFY_API_BASE}/search?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        })

        if (!response.ok) {
            throw new Error('Failed to search tracks')
        }

        const data = await response.json()
        
        return data.tracks.items.map(track => ({
            id: `spotify_track_${track.id}`,
            spotifyId: track.id,
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            type: 'song',
            source: 'spotify',
            spotifyUrl: track.external_urls.spotify,
            previewUrl: track.preview_url,
            imageUrl: track.album.images[0]?.url,
            duration: track.duration_ms,
            votes: {},
            addedAt: Date.now()
        }))
    }

    /**
     * Sucht nach Alben auf Spotify
     */
    async searchAlbums(query, limit = 10) {
        await this.ensureValidToken()

        const params = new URLSearchParams({
            q: query,
            type: 'album',
            limit: limit.toString()
        })

        const response = await fetch(`${SPOTIFY_API_BASE}/search?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        })

        if (!response.ok) {
            throw new Error('Failed to search albums')
        }

        const data = await response.json()
        
        return data.albums.items.map(album => ({
            id: `spotify_album_${album.id}`,
            spotifyId: album.id,
            title: album.name,
            artist: album.artists.map(a => a.name).join(', '),
            type: 'album',
            source: 'spotify',
            spotifyUrl: album.external_urls.spotify,
            imageUrl: album.images[0]?.url,
            releaseDate: album.release_date,
            totalTracks: album.total_tracks,
            votes: {},
            addedAt: Date.now()
        }))
    }

    /**
     * Universelle Suche (Songs und Alben)
     */
    async search(query, limit = 10) {
        try {
            await this.ensureValidToken()

            // Spotify erlaubt max 50 pro Typ, wir verwenden limit/2 für jeden
            const limitPerType = Math.min(Math.floor(limit / 2), 10)

            const params = new URLSearchParams({
                q: query,
                type: 'track,album',
                limit: limitPerType.toString()
            })

            const response = await fetch(`${SPOTIFY_API_BASE}/search?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                console.error('Spotify Search Fehler:', errorData)
                
                const error = new Error(
                    `Spotify Search Fehler (${response.status}): ${errorData.error?.message || 'Unbekannter Fehler'}`
                )
                error.code = 'SEARCH_FAILED'
                throw error
            }

            const data = await response.json()
            
            const tracks = (data.tracks?.items || []).map(track => ({
                id: `spotify_track_${track.id}`,
                spotifyId: track.id,
                title: track.name,
                artist: track.artists.map(a => a.name).join(', '),
                album: track.album.name,
                type: 'song',
                source: 'spotify',
                spotifyUrl: track.external_urls.spotify,
                previewUrl: track.preview_url,
                imageUrl: track.album.images[0]?.url,
                duration: track.duration_ms,
                votes: {},
                addedAt: Date.now()
            }))

            const albums = (data.albums?.items || []).map(album => ({
                id: `spotify_album_${album.id}`,
                spotifyId: album.id,
                title: album.name,
                artist: album.artists.map(a => a.name).join(', '),
                type: 'album',
                source: 'spotify',
                spotifyUrl: album.external_urls.spotify,
                imageUrl: album.images[0]?.url,
                releaseDate: album.release_date,
                totalTracks: album.total_tracks,
                votes: {},
                addedAt: Date.now()
            }))

            const results = [...tracks, ...albums]
            console.log(`✅ Spotify Suche erfolgreich: ${results.length} Ergebnisse für "${query}"`)
            
            return results
        } catch (error) {
            console.error('❌ Spotify Suche fehlgeschlagen:', error)
            throw error
        }
    }

    /**
     * Holt Details zu einem Track
     */
    async getTrack(trackId) {
        await this.ensureValidToken()

        const response = await fetch(`${SPOTIFY_API_BASE}/tracks/${trackId}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        })

        if (!response.ok) {
            throw new Error('Failed to get track')
        }

        return await response.json()
    }

    /**
     * Holt Details zu einem Album
     */
    async getAlbum(albumId) {
        await this.ensureValidToken()

        const response = await fetch(`${SPOTIFY_API_BASE}/albums/${albumId}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        })

        if (!response.ok) {
            throw new Error('Failed to get album')
        }

        return await response.json()
    }

    // ---------- Web Playback (Host) ----------

    /**
     * Lädt das Spotify Web Playback SDK
     */
    loadSpotifySDK() {
        return new Promise((resolve) => {
            if (window.Spotify) {
                this._sdkReady = true
                resolve()
                return
            }
            if (document.querySelector('script[src*="spotify-player"]')) {
                window.onSpotifyWebPlaybackSDKReady = () => {
                    this._sdkReady = true
                    resolve()
                }
                return
            }
            const script = document.createElement('script')
            script.src = 'https://sdk.scdn.co/spotify-player.js'
            script.async = true
            window.onSpotifyWebPlaybackSDKReady = () => {
                this._sdkReady = true
                resolve()
            }
            document.body.appendChild(script)
        })
    }

    /**
     * Initialisiert den Web Playback Player (Host). Erzeugt ein Gerät im Browser.
     * onReady({ deviceId }) wird aufgerufen, wenn das Gerät bereit ist.
     */
    async initPlaybackPlayer(onReady, onError) {
        const token = await this.getStoredUserToken()
        if (!token) {
            onError?.('Nicht mit Spotify angemeldet.')
            return
        }
        await this.loadSpotifySDK()
        if (!window.Spotify) {
            onError?.('Spotify SDK konnte nicht geladen werden.')
            return
        }

        const player = new window.Spotify.Player({
            name: 'Amplify Host',
            getOAuthToken: (cb) => {
                this.getStoredUserToken().then((t) => cb(t || ''))
            },
            volume: 0.8
        })

        player.addListener('ready', ({ device_id }) => {
            this._deviceId = device_id
            this._player = player
            console.log('✅ Spotify Web Playback bereit, Device ID:', device_id)
            onReady({ deviceId: device_id })
        })

        player.addListener('not_ready', ({ device_id }) => {
            console.log('Spotify Device offline:', device_id)
        })

        player.addListener('authentication_error', ({ message }) => {
            console.error('Spotify Auth-Fehler:', message)
            onError?.(message)
        })

        player.addListener('initialization_error', ({ message }) => {
            console.error('Spotify Init-Fehler:', message)
            onError?.(message)
        })

        player.connect()
    }

    getDeviceId() {
        return this._deviceId
    }

    /**
     * Startet die Wiedergabe auf dem Host-Gerät (nur Spotify-Tracks mit spotifyId).
     * uris: Array von "spotify:track:ID"
     */
    async playOnDevice(uris) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        const deviceId = this._deviceId
        if (!deviceId) throw new Error('Spotify-Player noch nicht bereit. Bitte kurz warten.')

        const url = `${SPOTIFY_API_BASE}/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris })
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            if (res.status === 404) {
                throw new Error('Kein aktiver Player. Bitte "Mit Spotify verbinden" und Playlist starten.')
            }
            throw new Error(err.error?.message || 'Wiedergabe fehlgeschlagen')
        }
    }

    async pausePlayback() {
        const token = await this.getStoredUserToken()
        if (!token) return
        await fetch(`${SPOTIFY_API_BASE}/me/player/pause`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        })
    }

    async resumePlayback() {
        const token = await this.getStoredUserToken()
        if (!token) return
        await fetch(`${SPOTIFY_API_BASE}/me/player/play`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        })
    }

    async nextTrack() {
        const token = await this.getStoredUserToken()
        if (!token) return
        await fetch(`${SPOTIFY_API_BASE}/me/player/next`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        })
    }

    /**
     * Trennt den Web-Player (z.B. beim Verlassen)
     */
    disconnectPlayer() {
        if (this._player) {
            this._player.disconnect()
            this._player = null
        }
        this._deviceId = null
    }
}

// Singleton Instance
const spotifyService = new SpotifyService()

export default spotifyService
