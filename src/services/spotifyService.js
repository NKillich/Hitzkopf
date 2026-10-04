/**
 * Spotify API Service für Amplify
 * 
 * Hinweis: Um die Spotify API zu nutzen, benötigst du:
 * 1. Einen Spotify Developer Account (https://developer.spotify.com/)
 * 2. Eine registrierte App mit Client ID
 * 3. Redirect URI in deiner Spotify App konfiguriert
 *
 * Umgebungsvariablen (in .env.local):
 * VITE_SPOTIFY_CLIENT_ID=deine_client_id
 * VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/Hitzkopf/
 *
 * Das Client Secret gehoert NICHT in den Browser: App-Tokens (Suche ohne User-Login)
 * holt die Cloud Function "spotifyToken" (functions/spotifyToken.js).
 */

import { getApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import '../firebase.js'
import { log, warn } from '../utils/logger.js'

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
        // Redirect URI: Aus .env.local laden (lokal) oder Production-Fallback.
        // Lokal: VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/Hitzkopf in .env.local setzen.
        // Spotify erlaubt kein "localhost" – explizite IP 127.0.0.1 verwenden!
        const productionRedirect = 'https://nkillich.github.io/Hitzkopf'
        const fromEnv = import.meta.env.VITE_SPOTIFY_REDIRECT_URI
        this.redirectUri = fromEnv || productionRedirect
        if (typeof console !== 'undefined') {
            log('🎵 Spotify Redirect URI:', this.redirectUri)
        }
        this.accessToken = null
        this.tokenExpiry = null
        this._userToken = null
        this._deviceId = null
        this._player = null
        this._sdkReady = false
        this._pendingPlayer = null          // Player, der noch nicht 'ready' gemeldet hat (sonst ginge er beim Trennen verloren)
        this._lastState = null              // letzter Zustand aus player_state_changed
        this._lastStateAt = 0
        this._stateSubs = new Set()
        this._errorSubs = new Set()

        if (!this.clientId) {
            warn('⚠️ VITE_SPOTIFY_CLIENT_ID fehlt! Überprüfe .env.local')
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
        log('✅ Spotify Token erhalten. Scopes:', data.scope)
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
     * App-only Token (ohne User-Login) von der Cloud Function "spotifyToken" holen.
     * Das Client Secret bleibt serverseitig.
     */
    async getClientCredentialsToken() {
        try {
            const auth = getAuth(getApp())
            await auth.authStateReady()
            if (!auth.currentUser) await signInAnonymously(auth)

            const callable = httpsCallable(getFunctions(getApp()), 'spotifyToken')
            const { data } = await callable()

            this.accessToken = data.access_token
            this.tokenExpiry = Date.now() + (data.expires_in * 1000)
            log('✅ Spotify App-Token erhalten')
            return data
        } catch (error) {
            console.error('Spotify App-Token fehlgeschlagen:', error)
            const err = new Error(`Spotify-Token konnte nicht geholt werden: ${error.message || 'Unbekannter Fehler'}`)
            err.code = 'SPOTIFY_API_ERROR'
            throw err
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
            log(`✅ Spotify Suche erfolgreich: ${results.length} Ergebnisse für "${query}"`)
            
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
    async initPlaybackPlayer(onReady, onError, { activate = false, name = 'Amplify Host' } = {}) {
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
            name,
            getOAuthToken: (cb) => {
                this.getStoredUserToken().then((t) => cb(t || ''))
            },
            volume: 0.8
        })

        this._pendingPlayer = player

        player.addListener('ready', async ({ device_id }) => {
            this._deviceId = device_id
            this._player = player
            this._pendingPlayer = null
            log('✅ Spotify Web Playback bereit, Device ID:', device_id)
            // Spotify kennt das neue Gerät serverseitig oft erst verzögert → erst aktivieren,
            // sonst kommt beim ersten Abspielen "Device not found".
            if (activate) await this.activateDevice(device_id)
            onReady({ deviceId: device_id })
        })

        player.addListener('not_ready', ({ device_id }) => {
            log('Spotify Device offline:', device_id)
        })

        player.addListener('authentication_error', ({ message }) => {
            console.error('Spotify Auth-Fehler:', message)
            onError?.(message)
        })

        player.addListener('initialization_error', ({ message }) => {
            console.error('Spotify Init-Fehler:', message)
            onError?.(message)
        })

        player.addListener('account_error', ({ message }) => {
            console.error('Spotify Account-Fehler:', message)
            onError?.(message || 'Spotify Premium erforderlich.')
        })

        player.addListener('playback_error', ({ message }) => {
            warn('Spotify Playback-Fehler:', message)
            this._errorSubs.forEach((cb) => { try { cb(new Error(message || 'Playback-Fehler')) } catch (e) { console.error(e) } })
        })

        // Browser blockiert Audio ohne Nutzergeste → Hinweis an die Oberfläche
        player.addListener('autoplay_failed', () => {
            this._errorSubs.forEach((cb) => { try { cb('autoplay_failed') } catch (e) { console.error(e) } })
        })

        // Echter Wiedergabezustand: Grundlage, um zu wissen, WELCHER Titel WIRKLICH läuft
        player.addListener('player_state_changed', (state) => {
            const at = Date.now()
            this._lastState = state || null
            this._lastStateAt = at
            this._stateSubs.forEach((cb) => { try { cb(state || null, at) } catch (e) { console.error(e) } })
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
    async ensurePlaybackPlayerReady({ name = 'Amplify Host' } = {}) {
        if (this.isPlaybackReady()) return

        // Nach disconnectPlayer() kennt Spotify das alte Gerät noch kurz → Neustart-Race vermeiden
        const sinceDisconnect = Date.now() - (this._lastDisconnect || 0)
        if (sinceDisconnect < 1200) await new Promise(r => setTimeout(r, 1200 - sinceDisconnect))

        return new Promise((resolve, reject) => {
            let settled = false
            const done = (fn, arg) => {
                if (settled) return
                settled = true
                clearTimeout(timeout)
                fn(arg)
            }
            const timeout = setTimeout(() => {
                this.disconnectPlayer()
                done(reject, new Error('Spotify Player antwortet nicht. Bitte Seite neu laden und erneut versuchen.'))
            }, 20000)

            if (this._player) this.disconnectPlayer()
            this.initPlaybackPlayer(
                () => done(resolve),
                (msg) => done(reject, new Error(msg || 'Spotify Player konnte nicht gestartet werden.')),
                { activate: true, name }
            )
        })
    }

    /**
     * Wartet, bis Spotify das Web-Player-Gerät in der Geräteliste führt, und schaltet Shuffle aus.
     * Bewusst KEIN Playback-Transfer: der würde (play:false = "Zustand beibehalten") eine
     * laufende Wiedergabe auf dem Konto auf diesen Player mitnehmen und sofort abspielen.
     */
    async activateDevice(deviceId) {
        if (!deviceId) return false
        const sleep = (ms) => new Promise(r => setTimeout(r, ms))
        for (let attempt = 1; attempt <= 10; attempt++) {
            try {
                const devices = await this.getDevices()
                if (devices.some(d => d.id === deviceId)) {
                    log(`[SpotifyService] Gerät bekannt (Versuch ${attempt})`)
                    const token = await this.getStoredUserToken()
                    await fetch(`${SPOTIFY_API_BASE}/me/player/shuffle?state=false&device_id=${deviceId}`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).catch(() => {})
                    return true
                }
            } catch (e) {
                warn('[SpotifyService] Geräteliste fehlgeschlagen:', e.message)
            }
            await sleep(500)
        }
        warn('[SpotifyService] Gerät in der Geräteliste nicht gefunden')
        return false
    }

    /** Pausiert direkt den lokalen Web-Player (SDK), unabhängig von der Web-API. */
    async pauseLocalPlayer() {
        try { await this._player?.pause() } catch (_) { /* ignorieren */ }
    }

    /** true/false = lokaler Player pausiert/spielt, null = unbekannt (kein Player/State). */
    async isLocalPaused() {
        try {
            const state = await this._player?.getCurrentState()
            return state ? !!state.paused : null
        } catch (_) {
            return null
        }
    }

    getDeviceId() {
        return this._deviceId
    }

    // ── Wiedergabezustand des lokalen Players ────────────────────────────────
    subscribeState(cb) {
        this._stateSubs.add(cb)
        return () => this._stateSubs.delete(cb)
    }

    subscribeErrors(cb) {
        this._errorSubs.add(cb)
        return () => this._errorSubs.delete(cb)
    }

    getLastState() {
        return this._lastState ? { state: this._lastState, at: this._lastStateAt } : null
    }

    /** Muss synchron in einem Klick aufgerufen werden (Autoplay-Regeln von Safari/iOS/Chrome). */
    activateAudio() {
        try { return this._player?.activateElement?.() } catch (_) { return undefined }
    }

    async getPlayerState() {
        try { return (await this._player?.getCurrentState()) || null } catch (_) { return null }
    }

    async seekLocal(ms) { await this._player?.seek(ms) }
    async resumeLocal() { await this._player?.resume() }

    async getVolumeLocal() {
        try { return await this._player?.getVolume() } catch (_) { return null }
    }

    async setVolumeLocal(v) {
        try { await this._player?.setVolume(v) } catch (_) { /* iOS: Lautstärke nicht setzbar */ }
    }

    /**
     * Stellt sicher, dass Shuffle und Wiederholen AUS sind – und prüft es am echten Zustand.
     * Mit Shuffle ignoriert Spotify die gewünschte Position, mit "Titel wiederholen" bleibt der Player hängen.
     */
    async ensureLinearPlayback() {
        const ok = (st) => st && st.shuffle === false && st.repeat_mode === 0
        let st = await this.getPlayerState()
        if (ok(st)) return true
        const token = await this.getStoredUserToken()
        const targetId = this._deviceId
        if (!token || !targetId) return false
        const put = (path) => fetch(`${SPOTIFY_API_BASE}/me/player/${path}&device_id=${targetId}`, {
            method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => null)
        if (!st || st.shuffle) await put('shuffle?state=false')
        if (!st || st.repeat_mode !== 0) await put('repeat?state=off')
        if (!st) return false   // noch nichts geladen: nicht prüfbar (wird nach dem Start am echten Zustand kontrolliert)
        // Nachprüfen (der Zustand kommt asynchron zurück)
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 250))
            st = await this.getPlayerState()
            if (ok(st)) return true
        }
        warn('[SpotifyService] Shuffle/Wiederholen ließ sich nicht verlässlich ausschalten', st && { shuffle: st.shuffle, repeat: st.repeat_mode })
        return !!ok(st)
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
        log('[SpotifyService] Gespeicherte Scopes:', scopes || '(keine)')
        log('[SpotifyService] playlist-read-private vorhanden:', hasScope)
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
        const trackCount = data.items?.total ?? data.tracks?.total ?? 0
        log(`[SpotifyService] getPlaylistInfo "${data.name}": items.total=${trackCount}`)
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
    async detectPlaylistSize(contextUri, { maxSearch = 5000, onProgress, shouldCancel } = {}) {
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
            log(`[detectSize] Shuffle deaktivieren: HTTP ${r.status}`)
        } catch (e) {
            warn('[detectSize] Shuffle off fehlgeschlagen:', e.message)
        }

        const cleanup = async () => {
            await this._player.pause().catch(() => {})
            await this._player.setVolume(originalVolume).catch(() => {})
        }

        let rateLimited = false
        try {
            // Spielt offset, wartet auf State, gibt {uri, contextUri} zurück (oder null).
            // Bei 429-Rate-Limit: 2s warten, retry. Bei null-State: 400ms warten, retry.
            const playAndGetState = async (offset) => {
                const doPlay = async () => {
                    try { await this.playContextAtOffset(contextUri, offset); return null }
                    catch (e) { return e }
                }
                let err = await doPlay()
                if (err && /429|rate|too many/i.test(err.message || '')) {
                    rateLimited = true
                    warn(`[detectSize] offset=${offset} rate-limit, warte 4s…`)
                    await sleep(4000)
                    err = await doPlay()
                }
                if (err) {
                    log(`[detectSize] offset=${offset} HTTP-Fehler: ${err.message}`)
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
                    if (uri) log(`[detectSize] offset=${offset} URI erst beim Retry verfügbar`)
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
                if (shouldCancel?.()) throw new Error('abgebrochen')
                const a = await playAndGetState(offset)
                if (!a) return { valid: false, reason: 'no-state-A' }
                if (a.ctxUri && a.ctxUri !== contextUri) {
                    return { valid: false, reason: `autoplay-${a.ctxUri.slice(-12)}` }
                }
                await sleep(450)
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
            const probes = [0, 30, 120, 500, 2000].filter(p => p <= maxSearch)
            let validMax = -1   // höchster Offset bewiesen "valid" → Playlist >= validMax + 2
            let invalidMin = -1 // niedrigster Offset bewiesen "invalid" → Playlist <= invalidMin + 1
            let stepIdx = 0
            const totalSteps = probes.length + 12

            for (const p of probes) {
                stepIdx++
                onProgress?.({ step: stepIdx, totalSteps, label: `Teste Offset ${p}…` })
                let r = await verifyOffset(p)
                for (let retry = 0; p === 0 && !r.valid && retry < 2; retry++) {
                    warn(`[detectSize] offset 0 ungültig (${r.reason}) – Wiederholung ${retry + 1}`)
                    await sleep(1000)
                    r = await verifyOffset(p)
                }
                log(`[detectSize] geo offset=${p} → ${r.valid ? 'VALID' : `INVALID (${r.reason})`}`)
                if (r.valid) {
                    validMax = p
                } else {
                    invalidMin = p
                    break
                }
                await sleep(700)
            }

            // Nicht einmal offset 0 ist "valid": NICHT raten (früher: Größe 1 → Spiel mit nur einem Song
            // und hörbarer Wiedergabe), sondern Fehler melden – der Aufrufer zeigt ihn an.
            if (validMax < 0) {
                if (rateLimited) throw new Error('Spotify bremst gerade die Anfragen aus. Bitte 1–2 Minuten warten und dann nochmal starten.')
                throw new Error('Playlist-Größe konnte nicht ermittelt werden (Wiedergabe-Test fehlgeschlagen). Bitte erneut versuchen.')
            }

            if (invalidMin < 0) {
                return validMax + 2 // alle Probes gültig, Playlist mind. so groß
            }

            // Binary Search auf Offsets [validMax, invalidMin]
            let iter = 0
            while (invalidMin - validMax > 1 && iter < 4) {   // grobe Schätzung reicht (untere Schranke)
                iter++
                const mid = Math.floor((validMax + invalidMin) / 2)
                stepIdx++
                onProgress?.({
                    step: Math.min(stepIdx, totalSteps),
                    totalSteps,
                    label: `Suche zwischen ${validMax + 2} und ${invalidMin + 1} Songs…`
                })

                const r = await verifyOffset(mid)
                log(`[detectSize] bsearch offset=${mid} → ${r.valid ? 'VALID' : `INVALID (${r.reason})`}`)
                if (r.valid) validMax = mid
                else invalidMin = mid
                await sleep(700)
            }

            // validMax ist der höchste Offset, der mit Sicherheit Track ungleich Nachbar hat
            // → Playlist hat mindestens validMax + 2 Tracks
            const size = validMax + 2
            log(`[detectSize] FINAL: ${size} Tracks (validMax=${validMax}, invalidMin=${invalidMin})`)
            return size
        } finally {
            // Immer pausieren + Lautstärke zurücksetzen – auch bei Fehlern
            await cleanup()
        }
    }

    async playContextAtOffset(contextUri, offsetPosition, deviceId) {
        return this._playRequest({ context_uri: contextUri, offset: { position: offsetPosition } }, deviceId)
    }

    /** Spielt genau einen Titel (URI) auf dem Web-Player – unabhängig von Shuffle/Context. */
    async playUriOnPlayer(trackUri, deviceId) {
        return this._playRequest({ uris: [trackUri] }, deviceId)
    }

    async _playRequest(payload, deviceId) {
        const token = await this.getStoredUserToken()
        if (!token) throw new Error('Nicht mit Spotify verbunden.')
        const sleep = (ms) => new Promise(r => setTimeout(r, ms))
        const body = JSON.stringify(payload)

        let lastError = null
        for (let attempt = 1; attempt <= 5; attempt++) {
            const targetId = deviceId || this._deviceId
            if (!targetId) throw new Error('Kein Spotify-Gerät verfügbar. Warte bis der Player bereit ist.')
            const res = await fetch(`${SPOTIFY_API_BASE}/me/player/play?device_id=${targetId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body
            })
            if (res.ok) return
            const err = await res.json().catch(() => ({}))
            lastError = new Error(err.error?.message || 'Wiedergabe fehlgeschlagen')
            lastError.status = res.status

            if (res.status === 404 && attempt < 4) {
                // Gerät noch nicht registriert → warten und wiederholen
                warn(`[SpotifyService] play 404 (Versuch ${attempt}) – warte auf Gerät`)
                await this.activateDevice(targetId)
                await sleep(400 * attempt)
                continue
            }
            if (res.status === 429) {
                // Rate-Limit: Wartezeit beachten (Retry-After, falls lesbar), sonst kurz warten
                const wait = Number(res.headers.get('Retry-After')) || 2
                if (wait > 10 || attempt >= 3) {
                    throw new Error('Spotify bremst gerade die Anfragen aus. Bitte kurz warten und nochmal tippen.')
                }
                warn(`[SpotifyService] play 429 – warte ${wait}s`)
                await sleep(wait * 1000 + 200)
                continue
            }
            if (res.status >= 500 && attempt < 4) {
                // Serverfehler (z. B. 502): Play ist idempotent → erneut versuchen
                warn(`[SpotifyService] play ${res.status} (Versuch ${attempt}) – wiederhole`)
                await sleep(500 * attempt)
                continue
            }
            throw lastError
        }
        throw lastError
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
                // Seit Feb 2026: items statt tracks, und nur für eigene/gemeinsame Playlists vorhanden
                trackCount: pl.items?.total ?? pl.tracks?.total ?? 0,
                uri: pl.uri || `spotify:playlist:${pl.id}`
            }))
            playlists = [...playlists, ...page]
            // Alle Seiten laden (Spotify liefert max. 50 pro Seite); Sicherheitsgrenze 1000 Playlists
            url = playlists.length < 1000 ? (data.next || null) : null
        }
        return playlists
    }

    /**
     * Sucht nach Playlists auf Spotify.
     * Nutzt den User-Token (falls vorhanden), sonst Client Credentials.
     */
    async searchPlaylists(query, limit = 10, offset = 0) {
        let token = await this.getStoredUserToken()
        if (!token) {
            await this.ensureValidToken()
            token = this.accessToken
        }

        // Seit Feb 2026 liefert die Suche höchstens 10 Treffer pro Anfrage → per offset blättern
        const params = new URLSearchParams({
            q: query,
            type: 'playlist',
            limit: String(Math.min(limit, 10)),
            offset: String(offset)
        })

        const response = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            throw new Error(err.error?.message || 'Playlist-Suche fehlgeschlagen')
        }

        const data = await response.json()
        const raw = data.playlists?.items || []
        const items = raw.filter(Boolean).map(pl => ({
            id: pl.id,
            name: pl.name,
            owner: pl.owner?.display_name || pl.owner?.id || '',
            imageUrl: pl.images?.[0]?.url || null,
            trackCount: pl.items?.total ?? pl.tracks?.total ?? 0,
            uri: pl.uri || `spotify:playlist:${pl.id}`
        }))
        return {
            items,
            hasMore: !!data.playlists?.next,
            nextOffset: offset + raw.length
        }
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
        log(`[SpotifyService] getPlaylistTracks "${playlistId}" | Token-Typ: ${tokenType}`)

        const fetchPage = async (url, token) => {
            log(`[SpotifyService] GET ${url.replace(SPOTIFY_API_BASE, '')}`)
            return fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
        }

        let tracks = []
        // Kein market=from_token – funktioniert nicht mit Client-Credentials und blockiert manche öffentlichen Playlists
        let url = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100`

        while (url) {
            let res = await fetchPage(url, activeToken)
            log(`[SpotifyService] Response: ${res.status} ${res.statusText}`)

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

            log(`[SpotifyService] Seite geladen: ${pageTracks.length} Tracks (gesamt: ${tracks.length + pageTracks.length})`)
            tracks = [...tracks, ...pageTracks]
            url = data.next || null
        }

        log(`[SpotifyService] ✓ getPlaylistTracks fertig: ${tracks.length} Tracks total`)
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
        if (this._pendingPlayer) {
            try { this._pendingPlayer.disconnect() } catch (_) { /* egal */ }
            this._pendingPlayer = null
        }
        this._deviceId = null
        this._lastState = null
        this._lastDisconnect = Date.now()
    }
}

// Singleton Instance
const spotifyService = new SpotifyService()

export default spotifyService
