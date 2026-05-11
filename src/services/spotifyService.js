/**
 * Spotify API Service für Amplify
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
    USER_SCOPE: 'spotify_user_scope',
    RETURN_TO: 'spotify_return_to'
}

class SpotifyService {
    constructor() {
        this.clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID
        this.clientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET
        // Redirect URI: Aus .env.local laden (lokal) oder Production-Fallback.
        // Lokal: VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/Hitzkopf in .env.local setzen.
        // Spotify erlaubt kein "localhost" – explizite IP 127.0.0.1 verwenden!
        const productionRedirect = 'https://nkillich.github.io/Hitzkopf'
        const fromEnv = import.meta.env.VITE_SPOTIFY_REDIRECT_URI
        this.redirectUri = fromEnv || productionRedirect
        if (typeof console !== 'undefined') {
            console.log('🎵 Spotify Redirect URI:', this.redirectUri)
        }
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
            'user-read-playback-state',
            'playlist-read-private',
            'playlist-read-collaborative'
        ].join(' ')

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            scope: scopes,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            redirect_uri: this.redirectUri,
            state: this._generateRandomString(16),
            show_dialog: 'true'   // Erzwingt Consent-Dialog → neue Scopes werden immer gewährt
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
        this._storeUserTokens(data.access_token, data.refresh_token, data.expires_in, data.scope)
        console.log('✅ Spotify Token erhalten. Scopes:', data.scope)
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEYS.PKCE_VERIFIER)
        }
        return data
    }

    _storeUserTokens(accessToken, refreshToken, expiresIn, scope) {
        const expiry = Date.now() + (expiresIn * 1000)
        this._userToken = accessToken
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEYS.USER_ACCESS, accessToken)
            sessionStorage.setItem(STORAGE_KEYS.USER_REFRESH, refreshToken || '')
            sessionStorage.setItem(STORAGE_KEYS.USER_EXPIRY, String(expiry))
            if (scope) sessionStorage.setItem(STORAGE_KEYS.USER_SCOPE, scope)
        }
    }

    getGrantedScopes() {
        if (typeof sessionStorage === 'undefined') return ''
        return sessionStorage.getItem(STORAGE_KEYS.USER_SCOPE) || ''
    }

    hasScope(scopeName) {
        return this.getGrantedScopes().split(' ').includes(scopeName)
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
            sessionStorage.removeItem(STORAGE_KEYS.USER_SCOPE)
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

    /** Wahr, wenn Web-Player verbunden und Device-ID bekannt (für Live-Detection vor GAME). */
    isPlaybackReady() {
        return !!(this._player && this._deviceId)
    }

    /**
     * Stellt sicher, dass der Web Playback Player bereit ist (Promise).
     * Wird vor detectPlaylistSize während PHASES.LOADING benötigt.
     */
    async ensurePlaybackPlayerReady() {
        if (this.isPlaybackReady()) return
        return new Promise((resolve, reject) => {
            if (this._player) this.disconnectPlayer()
            this.initPlaybackPlayer(
                () => resolve(),
                (msg) => reject(new Error(msg || 'Spotify Player konnte nicht gestartet werden.'))
            )
        })
    }

    getDeviceId() {
        return this._deviceId
    }

    /**
     * Liste aller Spotify-Connect-Geräte (Browser, Alexa, Handy, …).
     * Returns [{ id, name, type, is_active }, …]
     */
    async getDevices() {
        const token = await this.getStoredUserToken()
        if (!token) return []
        const res = await fetch(`${SPOTIFY_API_BASE}/me/player/devices`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) return []
        const data = await res.json()
        const list = (data.devices || []).map((d) => ({
            id: d.id,
            name: d.name || 'Unbekannt',
            type: d.type || 'unknown',
            is_active: !!d.is_active
        }))
        return list
    }

    /**
     * Startet die Wiedergabe auf einem Gerät (Browser, Alexa, …).
     * uris: Array von "spotify:track:ID"
     * deviceId: optional – Gerät-ID, oder 'active' = aktives Gerät (kein device_id), oder null/undefined = dieser Browser.
     * positionMs: optional – Position in ms, um an gleicher Stelle weiterzuspielen (z. B. bei Queue-Update).
     */
    async playOnDevice(uris, deviceId, positionMs) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        const useActive = deviceId === 'active'
        const targetId = useActive ? null : (deviceId || this._deviceId)
        if (!useActive && !targetId) throw new Error('Wähle ein Gerät aus oder warte, bis „Amplify Host“ erscheint.')

        const url = `${SPOTIFY_API_BASE}/me/player/play${targetId ? `?device_id=${targetId}` : ''}`
        const body = { uris }
        if (positionMs != null && positionMs >= 0) body.position_ms = Math.floor(positionMs)
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            if (res.status === 404) {
                throw new Error('Kein aktiver Player. Bitte "Mit Spotify verbinden" und in Amplify starten.')
            }
            throw new Error(err.error?.message || 'Wiedergabe fehlgeschlagen')
        }
    }

    /**
     * Fügt einen Track ans Ende der Warteschlange hinzu, ohne die aktuelle Wiedergabe zu unterbrechen.
     * uri: "spotify:track:ID"
     * deviceId: optional – wie bei playOnDevice ('active' oder Gerät-ID).
     */
    async addToQueue(uri, deviceId) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        const useActive = deviceId === 'active'
        const targetId = useActive ? null : (deviceId || this._deviceId)
        const params = new URLSearchParams({ uri })
        if (targetId) params.set('device_id', targetId)
        const res = await fetch(`${SPOTIFY_API_BASE}/me/player/queue?${params}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error?.message || 'Queue hinzufügen fehlgeschlagen')
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

    async skipNext() {
        const token = await this.getStoredUserToken()
        if (!token) return
        await fetch(`${SPOTIFY_API_BASE}/me/player/next`, {
            method: 'POST',
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
     * Aktuellen Wiedergabe-Status abrufen (für Now Playing Anzeige).
     * Returns { trackName, artist, imageUrl, positionMs, durationMs, isPlaying, updatedAt } oder null.
     */
    async getPlaybackState() {
        const token = await this.getStoredUserToken()
        if (!token) return null
        const res = await fetch(`${SPOTIFY_API_BASE}/me/player`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.status === 204 || !res.ok) return null
        const data = await res.json()
        const item = data.item
        if (!item) return null
        return {
            trackId: item.id,
            trackName: item.name,
            artist: item.artists?.map((a) => a.name).join(', ') || '',
            imageUrl: item.album?.images?.[0]?.url || null,
            positionMs: data.progress_ms ?? 0,
            durationMs: item.duration_ms ?? 0,
            isPlaying: !!data.is_playing,
            updatedAt: Date.now()
        }
    }

    /**
     * Holt das Spotify-Profil des eingeloggten Users (Display Name, ID).
     * Returns { displayName, id } oder null.
     */
    async getUserProfile() {
        const token = await this.getStoredUserToken()
        if (!token) return null
        try {
            const res = await fetch(`${SPOTIFY_API_BASE}/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!res.ok) return null
            const data = await res.json()
            return {
                displayName: data.display_name || data.id || null,
                id: data.id || null
            }
        } catch (_) {
            return null
        }
    }

    /**
     * Prüft ob der gespeicherte Token den playlist-read-private Scope enthält.
     * Spotify liefert die gewährten Scopes im Token-Response – wir speichern sie.
     */
    async testPlaylistAccess() {
        const token = await this.getStoredUserToken()
        if (!token) return false
        const scopes = this.getGrantedScopes()
        const hasScope = scopes.includes('playlist-read-private')
        console.log('[SpotifyService] Gespeicherte Scopes:', scopes || '(keine)')
        console.log('[SpotifyService] playlist-read-private vorhanden:', hasScope)
        return hasScope
    }

    /**
     * Holt Playlist-Metadaten (Name, URI, Track-Anzahl, Cover).
     * Benötigt KEINEN /tracks Endpoint – umgeht die API-Restriction von 2024.
     */
    async getPlaylistInfo(playlistId) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        // Spotify liefert tracks.total seit Nov 2024 oft 0 für 3rd-Party-Apps.
        // Wir versuchen nur den Basis-Endpoint. Wenn das nicht klappt, übernimmt
        // detectPlaylistSize() (Live-Test) die echte Größenermittlung.
        const res = await fetch(
            `${SPOTIFY_API_BASE}/playlists/${playlistId}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        )
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            console.error('[SpotifyService] getPlaylistInfo FEHLER', res.status, errData)
            throw new Error(`Playlist-Info Fehler (HTTP ${res.status}): ${errData.error?.message || 'Unbekannt'}`)
        }
        const data = await res.json()
        const trackCount = data.tracks?.total ?? 0
        console.log(`[SpotifyService] getPlaylistInfo "${data.name}": tracks.total=${trackCount}`)
        return {
            id: data.id,
            name: data.name,
            uri: data.uri,
            trackCount,
            imageUrl: data.images?.[0]?.url || null
        }
    }

    /**
     * Spielt eine Playlist ab einem bestimmten Track-Index ab.
     * Umgeht /playlists/{id}/tracks – der Player holt die Songs direkt von Spotify.
     */
    async playTrackUri(trackUri) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        const targetId = this._deviceId
        if (!targetId) throw new Error('Kein Spotify-Gerät verfügbar. Warte bis der Player bereit ist.')
        const url = `${SPOTIFY_API_BASE}/me/player/play?device_id=${targetId}`
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: [trackUri] })
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error?.message || 'Wiedergabe fehlgeschlagen')
        }
    }

    /**
     * Ermittelt die echte Größe einer Playlist über "lautlose Wiedergabe-Tests".
     * Spotify gibt tracks.total seit Nov 2024 nicht mehr zuverlässig zurück.
     *
     * Ablauf:
     *  1. Volume auf 0 setzen
     *  2. Geometrisch wachsende Offsets testen (1, 10, 50, 100, 250, ...)
     *  3. Sobald ein Offset fehlschlägt (Error ODER Spotify fällt auf Track 0 zurück),
     *     Binary Search zwischen letztem OK und erstem FAIL
     *  4. Volume + Pause restaurieren
     *
     * Returns: ermittelte Track-Anzahl (Anzahl gültiger Offsets)
     */
    async detectPlaylistSize(contextUri, { maxSearch = 5000, onProgress } = {}) {
        if (!this._player) throw new Error('Player nicht bereit')

        const sleep = (ms) => new Promise(r => setTimeout(r, ms))

        // Volume merken + auf 0 setzen
        let originalVolume = 0.8
        try { originalVolume = (await this._player.getVolume()) ?? 0.8 } catch (_) {}
        await this._player.setVolume(0).catch(() => {})

        // Shuffle deaktivieren – mit aktivem Shuffle springt Spotify ignoriert die
        // Offset-Position und es lässt sich keine Größe ermitteln.
        const token = await this.getStoredUserToken()
        try {
            const r = await fetch(
                `${SPOTIFY_API_BASE}/me/player/shuffle?state=false&device_id=${this._deviceId}`,
                { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } }
            )
            console.log(`[detectSize] Shuffle deaktivieren: HTTP ${r.status}`)
        } catch (e) {
            console.warn('[detectSize] Shuffle off fehlgeschlagen:', e.message)
        }

        const cleanup = async () => {
            await this._player.pause().catch(() => {})
            await this._player.setVolume(originalVolume).catch(() => {})
        }

        // Spielt offset, wartet auf State, gibt {uri, contextUri} zurück (oder null).
        // Bei 429-Rate-Limit: 2s warten, retry. Bei null-State: 400ms warten, retry.
        const playAndGetState = async (offset) => {
            const doPlay = async () => {
                try { await this.playContextAtOffset(contextUri, offset); return null }
                catch (e) { return e }
            }
            let err = await doPlay()
            if (err && /429|rate|too many/i.test(err.message || '')) {
                console.warn(`[detectSize] offset=${offset} rate-limit, warte 2s…`)
                await sleep(2000)
                err = await doPlay()
            }
            if (err) {
                console.log(`[detectSize] offset=${offset} HTTP-Fehler: ${err.message}`)
                return null
            }
            await sleep(550)
            let state = null
            try { state = await this._player.getCurrentState() } catch (_) {}
            let uri = state?.track_window?.current_track?.uri || null
            // Retry bei null-State (Player war noch nicht synchron)
            if (!uri) {
                await sleep(400)
                try { state = await this._player.getCurrentState() } catch (_) {}
                uri = state?.track_window?.current_track?.uri || null
                if (uri) console.log(`[detectSize] offset=${offset} URI erst beim Retry verfügbar`)
            }
            const ctxUri = state?.context?.uri || null
            return uri ? { uri, ctxUri } : null
        }

        // VERIFIZIERTE Probe: prüft offset UND offset+1.
        // Liefert { valid, uri }:
        //  - valid=true wenn beide einen Track liefern, URIs unterschiedlich sind UND
        //    der Player-Context der angeforderten Playlist entspricht.
        //  - valid=false wenn Spotify in Autoplay/Radio fällt (anderer context.uri),
        //    die Anfrage stillschweigend ignoriert (gleiche URI für beide) oder Fehler.
        const verifyOffset = async (offset) => {
            const a = await playAndGetState(offset)
            if (!a) return { valid: false, reason: 'no-state-A' }
            if (a.ctxUri && a.ctxUri !== contextUri) {
                return { valid: false, reason: `autoplay-${a.ctxUri.slice(-12)}` }
            }
            await sleep(180)
            const b = await playAndGetState(offset + 1)
            if (!b) return { valid: false, reason: 'no-state-B' }
            if (b.ctxUri && b.ctxUri !== contextUri) {
                return { valid: false, reason: `autoplay-${b.ctxUri.slice(-12)}` }
            }
            if (a.uri === b.uri) return { valid: false, reason: 'stuck' }
            return { valid: true, uri: a.uri }
        }

        // Geometric phase: jeder Probe wird mit verifyOffset doppelt getestet.
        // Wenn offset N valid ist, wissen wir: Playlist hat mind. N+2 Tracks.
        const probes = [0, 25, 100, 400, 1000, 2500, 5000].filter(p => p <= maxSearch)
        let validMax = -1   // höchster Offset bewiesen "valid" → Playlist >= validMax + 2
        let invalidMin = -1 // niedrigster Offset bewiesen "invalid" → Playlist <= invalidMin + 1
        let stepIdx = 0
        const totalSteps = probes.length + 12

        for (const p of probes) {
            stepIdx++
            onProgress?.({ step: stepIdx, totalSteps, label: `Teste Offset ${p}…` })
            const r = await verifyOffset(p)
            console.log(`[detectSize] geo offset=${p} → ${r.valid ? 'VALID' : `INVALID (${r.reason})`}`)
            if (r.valid) {
                validMax = p
            } else {
                invalidMin = p
                break
            }
            await sleep(220)
        }

        // Spezialfall: nicht einmal offset 0 ist "valid" → Playlist hat 0 oder 1 Track
        if (validMax < 0) {
            await cleanup()
            // Falls offset 0 zumindest etwas geliefert hat, ist mind. 1 Track da
            const fallback = await playAndGetUri(0)
            if (fallback) return 1
            throw new Error('Playlist konnte nicht abgespielt werden.')
        }

        if (invalidMin < 0) {
            await cleanup()
            return validMax + 2 // alle Probes gültig, Playlist mind. so groß
        }

        // Binary Search auf Offsets [validMax, invalidMin]
        let iter = 0
        while (invalidMin - validMax > 1 && iter < 14) {
            iter++
            const mid = Math.floor((validMax + invalidMin) / 2)
            stepIdx++
            onProgress?.({
                step: Math.min(stepIdx, totalSteps),
                totalSteps,
                label: `Suche zwischen ${validMax + 2} und ${invalidMin + 1} Songs…`
            })

            const r = await verifyOffset(mid)
            console.log(`[detectSize] bsearch offset=${mid} → ${r.valid ? 'VALID' : `INVALID (${r.reason})`}`)
            if (r.valid) validMax = mid
            else invalidMin = mid
            await sleep(220)
        }

        await cleanup()

        // validMax ist der höchste Offset, der mit Sicherheit Track ungleich Nachbar hat
        // → Playlist hat mindestens validMax + 2 Tracks
        const size = validMax + 2
        console.log(`[detectSize] FINAL: ${size} Tracks (validMax=${validMax}, invalidMin=${invalidMin})`)
        return size
    }

    async playContextAtOffset(contextUri, offsetPosition, deviceId) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        const targetId = deviceId || this._deviceId
        if (!targetId) throw new Error('Kein Spotify-Gerät verfügbar. Warte bis der Player bereit ist.')
        const url = `${SPOTIFY_API_BASE}/me/player/play?device_id=${targetId}`
        const body = { context_uri: contextUri, offset: { position: offsetPosition } }
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error?.message || 'Wiedergabe fehlgeschlagen')
        }
    }

    /**
     * Holt alle Playlists des eingeloggten Nutzers (eigene + gefolgten).
     * Nutzt /me/playlists – funktioniert zuverlässig mit playlist-read-private.
     */
    async getMyPlaylists(limit = 50) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        let playlists = []
        let url = `${SPOTIFY_API_BASE}/me/playlists?limit=${Math.min(limit, 50)}`
        while (url) {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error?.message || 'Eigene Playlists konnten nicht geladen werden.')
            }
            const data = await res.json()
            const page = (data.items || []).filter(Boolean).map(pl => ({
                id: pl.id,
                name: pl.name,
                owner: pl.owner?.display_name || pl.owner?.id || '',
                imageUrl: pl.images?.[0]?.url || null,
                trackCount: pl.tracks?.total ?? 0,
                uri: pl.uri || `spotify:playlist:${pl.id}`
            }))
            playlists = [...playlists, ...page]
            // Nur erste Seite laden wenn limit ≤ 50
            url = limit > 50 ? (data.next || null) : null
        }
        return playlists
    }

    /**
     * Sucht nach Playlists auf Spotify.
     * Nutzt den User-Token (falls vorhanden), sonst Client Credentials.
     */
    async searchPlaylists(query, limit = 8) {
        let token = await this.getStoredUserToken()
        if (!token) {
            await this.ensureValidToken()
            token = this.accessToken
        }

        const params = new URLSearchParams({
            q: query,
            type: 'playlist',
            limit: String(Math.min(limit, 50))
        })

        const response = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            throw new Error(err.error?.message || 'Playlist-Suche fehlgeschlagen')
        }

        const data = await response.json()
        const items = (data.playlists?.items || []).filter(Boolean)
        if (items.length > 0) {
            console.log('[SpotifyService] Search Playlist Sample:', {
                id: items[0].id,
                name: items[0].name,
                uri: items[0].uri,
                public: items[0].public,
                collaborative: items[0].collaborative,
                tracks: items[0].tracks,
                tracksTotal: items[0].tracks?.total,
                tracksHref: items[0].tracks?.href
            })
        }
        return items.map(pl => ({
            id: pl.id,
            name: pl.name,
            owner: pl.owner?.display_name || pl.owner?.id || '',
            imageUrl: pl.images?.[0]?.url || null,
            trackCount: pl.tracks?.total ?? 0,
            uri: pl.uri || `spotify:playlist:${pl.id}`
        }))
    }

    /**
     * Lädt alle Tracks einer Playlist (mit Pagination).
     * Versucht zuerst den User-Token; fällt bei 401/403 auf Client Credentials zurück
     * (funktioniert für öffentliche Playlists ohne Playlist-Scope).
     */
    async getPlaylistTracks(playlistId) {
        const userToken = await this.getStoredUserToken()

        let activeToken = userToken
        if (!activeToken) {
            await this.ensureValidToken()
            activeToken = this.accessToken
        }
        if (!activeToken) throw new Error('Nicht mit Spotify verbunden.')

        const tokenType = activeToken === userToken ? 'User-Token' : 'Client-Credentials'
        console.log(`[SpotifyService] getPlaylistTracks "${playlistId}" | Token-Typ: ${tokenType} | Token: ${activeToken?.slice(0,8)}…`)

        const fetchPage = async (url, token) => {
            console.log(`[SpotifyService] GET ${url.replace(SPOTIFY_API_BASE, '')} | Token: ${token?.slice(0,8)}…`)
            return fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
        }

        let tracks = []
        // Kein market=from_token – funktioniert nicht mit Client-Credentials und blockiert manche öffentlichen Playlists
        let url = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100`

        while (url) {
            let res = await fetchPage(url, activeToken)
            console.log(`[SpotifyService] Response: ${res.status} ${res.statusText}`)

            if (!res.ok) {
                const errText = await res.text().catch(() => '')
                console.error(`[SpotifyService] getPlaylistTracks FEHLER ${res.status}:`, errText)
                let errMsg = 'Zugriff verweigert'
                try { errMsg = JSON.parse(errText)?.error?.message || errMsg } catch {}
                throw new Error(`Playlist-Tracks Fehler (HTTP ${res.status}): ${errMsg}`)
            }

            const data = await res.json()
            const pageTracks = (data.items || [])
                .filter(item => item?.track?.uri && item?.track?.type !== 'episode')
                .map(item => ({
                    id: item.track.id,
                    name: item.track.name,
                    artist: item.track.artists?.map(a => a.name).join(', ') || '',
                    album: item.track.album?.name || '',
                    albumImage: item.track.album?.images?.[0]?.url || null,
                    uri: item.track.uri
                }))

            console.log(`[SpotifyService] Seite geladen: ${pageTracks.length} Tracks (gesamt: ${tracks.length + pageTracks.length})`)
            tracks = [...tracks, ...pageTracks]
            url = data.next || null
        }

        console.log(`[SpotifyService] ✓ getPlaylistTracks fertig: ${tracks.length} Tracks total`)
        return tracks
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
