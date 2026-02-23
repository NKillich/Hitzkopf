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

class SpotifyService {
    constructor() {
        this.clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID
        this.clientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET
        this.redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI
        this.accessToken = null
        this.tokenExpiry = null
        
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
     * Generiert die Spotify Login-URL für OAuth
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
}

// Singleton Instance
const spotifyService = new SpotifyService()

export default spotifyService
