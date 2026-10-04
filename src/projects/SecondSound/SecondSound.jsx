import { useState, useEffect, useRef } from 'react'
import { getApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc, increment } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'
import '../../firebase.js'
import spotifyService from '../../services/spotifyService'
import clip from '../../services/clipPlayer.js'
import { log, warn } from '../../utils/logger.js'
import styles from './SecondSound.module.css'

const PHASES = {
    HOME: 'home',            // Startseite: Spotify verbinden, Spiel starten
    PLAYLISTS: 'playlists',  // Schritt 1: Playlists wählen
    COUNT: 'count',          // Schritt 2: Songanzahl wählen
    SETTINGS: 'settings',    // Einstellungen + Statistik
    LOADING: 'loading',
    GAME: 'game',
    RESULTS: 'results'
}

const TIERS = [
    { min: 90, title: 'Absoluter Musikprofi!', sub: 'Kaum ein Song hatte eine Chance.', mouth: 'M19 37 Q32 55 45 37 Z', filled: true },
    { min: 70, title: 'Richtig stark!', sub: 'Da kennt sich jemand aus.', mouth: 'M20 39 Q32 51 44 39' },
    { min: 50, title: 'Gar nicht schlecht!', sub: 'Mindestens die Hälfte erraten – solide Runde.', mouth: 'M22 41 Q32 47 42 41' },
    { min: 30, title: 'Ausbaufähig', sub: 'Ein paar Songs saßen schon. Da geht noch mehr.', mouth: 'M22 43 L42 41' },
    { min: 0, title: 'Oje …', sub: 'Das war nicht eure Runde. Nächstes Mal klappt’s besser.', mouth: 'M21 46 Q32 36 43 46' }
]

const STAGES = [
    { label: '1 s', seconds: 1, long: '1 Sekunde' },
    { label: '5 s', seconds: 5, long: '5 Sekunden' },
    { label: '10 s', seconds: 10, long: '10 Sekunden' },
    { label: '30 s', seconds: 30, long: '30 Sekunden' }
]

const COUNT_OPTIONS = [5, 10, 15, 20, 25, 30]

// Größen-Cache über Sitzungen hinweg (spart die teure Live-Erkennung)
const SIZE_CACHE_KEY = 'ss_plsizes_v1'
const SIZE_CACHE_TTL = 7 * 24 * 3600 * 1000
const loadSizeCache = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(SIZE_CACHE_KEY) || '{}')
        const now = Date.now()
        return Object.fromEntries(Object.entries(raw).filter(([, v]) => v && now - v.t < SIZE_CACHE_TTL).map(([k, v]) => [k, v.n]))
    } catch { return {} }
}
const saveSize = (id, n) => {
    try {
        const raw = JSON.parse(localStorage.getItem(SIZE_CACHE_KEY) || '{}')
        raw[id] = { n, t: Date.now() }
        localStorage.setItem(SIZE_CACHE_KEY, JSON.stringify(raw))
    } catch { /* Cache ist optional */ }
}

// Platzhalter-Cover (wenn Spotify kein Bild liefert): zwei Farben + eine Form, stabil pro Schlüssel
const COVER_COLORS = [
    ['#FF5A1F', '#FFD23F'], ['#2F6BFF', '#A9C8FF'], ['#12A57A', '#C8F4E4'], ['#E83F6F', '#FFC2D4'],
    ['#7A5CFA', '#D7CCFF'], ['#F2B705', '#1C1E24'], ['#1C1E24', '#FF8A5B'], ['#00A6C8', '#FF5EA8']
]

const hashOf = (str = '') => {
    let h = 0
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
    return h
}

function CoverArt({ src, seed, size, radius }) {
    const h = hashOf(String(seed || ''))
    const [c1, c2] = COVER_COLORS[h % COVER_COLORS.length]
    const k = (h >> 3) % 3
    const r = (f) => Math.round(size * f)
    let shape
    if (k === 0) shape = { width: r(0.72), height: r(0.72), right: -r(0.16), bottom: -r(0.16), borderRadius: '50%', background: c2 }
    else if (k === 1) shape = { left: 0, right: 0, bottom: 0, height: r(0.42), background: c2 }
    else shape = { width: r(0.6), height: r(0.6), left: r(0.2), top: r(0.2), borderRadius: '50%', border: `${Math.max(4, r(0.1))}px solid ${c2}`, boxSizing: 'border-box' }
    return (
        <span style={{ width: size, height: size, borderRadius: radius, background: c1, position: 'relative', display: 'block', flex: 'none', overflow: 'hidden' }}>
            {src
                ? <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ position: 'absolute', display: 'block', ...shape }} />}
        </span>
    )
}

const Svg = ({ size = 20, w = 2.2, fill = 'none', children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const IconMoon = () => <Svg w={2}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>
const IconSun = () => <Svg w={2}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
const IconBack = () => <Svg size={22}><path d="M15 6l-6 6 6 6" /></Svg>
const IconCheck = ({ size = 18, w = 3 }) => <Svg size={size} w={w}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
const IconX = ({ size = 18, w = 2.6 }) => <Svg size={size} w={w}><path d="M6 6l12 12M18 6L6 18" /></Svg>
const IconLock = ({ size = 20, w = 2.2 }) => <Svg size={size} w={w}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
const IconPlay = ({ size = 18 }) => <Svg size={size} fill="currentColor" w={0}><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></Svg>
const IconNote = ({ size = 22 }) => <Svg size={size}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></Svg>
const IconSearch = ({ size = 20 }) => <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Svg>
const IconRetry = ({ size = 18 }) => <Svg size={size}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></Svg>
const IconReplay = ({ size = 18 }) => <Svg size={size}><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v5h5" /></Svg>
const IconEye = ({ size = 22 }) => <Svg size={size}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
const IconPause = ({ size = 18 }) => <Svg size={size} w={0}><rect x="6" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /><rect x="13.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /></Svg>
const IconEyeOff = ({ size = 22 }) => <Svg size={size}><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9" /><path d="M9.9 4.2A9.8 9.8 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2" /><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="M2 2l20 20" /></Svg>
const IconAlert = ({ size = 22 }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Svg>
const IconClock = ({ size = 24 }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
const IconChevron = ({ open }) => <span style={{ display: 'flex', transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform .2s' }}><Svg size={22} w={2.4}><path d="M6 9l6 6 6-6" /></Svg></span>
const IconWave = ({ size = 13 }) => <Svg size={size} w={3}><path d="M5 10v4M10 6v12M15 8v8M20 11v2" /></Svg>
const IconShuffle = () => <Svg size={30}><path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21" /><path d="M3 17h3.5c1.5 0 2.6-.6 3.5-1.6M14 8.6c.9-1 2-1.6 3.5-1.6H21" /><path d="M18 4l3 3-3 3M18 14l3 3-3 3" /></Svg>
const IconPhone = () => <Svg size={18} w={2}><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="14" r="3" /><path d="M12 7.5v.01" /></Svg>
const IconInfo = () => <Svg size={18} w={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></Svg>

export default function SecondSound({ onBack }) {
    const [phase, setPhase] = useState(PHASES.HOME)
    const [connected, setConnected] = useState(null)   // null = wird geprüft
    const [playerReady, setPlayerReady] = useState(false)
    const [playerError, setPlayerError] = useState(null)
    const [allTimeStats, setAllTimeStats] = useState(null)
    const [isDark, setIsDark] = useState(() => localStorage.getItem('ss_theme') !== 'light')
    const dbRef = useRef(null)

    const toggleTheme = () => {
        setIsDark(prev => {
            const next = !prev
            localStorage.setItem('ss_theme', next ? 'dark' : 'light')
            return next
        })
    }

    // Setup state
    const [searchMode, setSearchMode] = useState('mine') // 'playlist' | 'mine'
    const [playlistQuery, setPlaylistQuery] = useState('')
    const [playlistResults, setPlaylistResults] = useState([])
    const [myPlaylists, setMyPlaylists] = useState([])
    const [myPlaylistsLoaded, setMyPlaylistsLoaded] = useState(false)
    const [myPlaylistsError, setMyPlaylistsError] = useState(null)
    const [selectedPlaylists, setSelectedPlaylists] = useState([])
    const [songCount, setSongCount] = useState(10)
    const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0)
    // True sobald der aktuelle Song mindestens 1× abgespielt wurde – schaltet
    // Aufdecken- und Antwort-Buttons frei. Verhindert Klick-Spam mit 403/502.
    const [hasPlayedCurrentSong, setHasPlayedCurrentSong] = useState(false)
    const playlistSizeCache = useRef(loadSizeCache())
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingError, setLoadingError] = useState(null)
    const [needsRelogin, setNeedsRelogin] = useState(false)
    const [searchedQuery, setSearchedQuery] = useState('')   // zuletzt abgeschlossene Playlist-Suche
    const [confirmClose, setConfirmClose] = useState(false)  // Bottom-Sheet "Spiel beenden?"
    const [startingIdx, setStartingIdx] = useState(-1)       // Stufe, die gerade gestartet wird (Player lädt)
    const [cancelling, setCancelling] = useState(false)
    const [searchHasMore, setSearchHasMore] = useState(false)
    const [searchNextOffset, setSearchNextOffset] = useState(0)
    const [searchMoreLoading, setSearchMoreLoading] = useState(false)

    // Game state – songs sind jetzt {playlistUri, offset, playlistName, playlistImage}
    const [songs, setSongs] = useState([])          // kompletter Slot-Pool (3x Ziel)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [playedCount, setPlayedCount] = useState(0)  // tatsächlich gespielte Songs
    const [targetCount, setTargetCount] = useState(10) // gewünschte Anzahl
    const [isRevealed, setIsRevealed] = useState(false)
    const [currentTrackInfo, setCurrentTrackInfo] = useState(null)
    const [score, setScore] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [songHistory, setSongHistory] = useState([])
    const [historyOpen, setHistoryOpen] = useState(false)
    const [verdict, setVerdict] = useState(null)          // 'ok' | 'no' während der kurzen Auflösung
    const [startNotice, setStartNotice] = useState(null)  // z. B. "Deine Auswahl hat nur 20 Songs"
    const [statsState, setStatsState] = useState('idle')  // idle | loading | ready | error
    const [statsSaveFailed, setStatsSaveFailed] = useState(false)


    const currentIndexRef = useRef(0)
    const isAnsweringRef = useRef(false)        // verhindert Doppel-Klick auf Antwort-Buttons
    const maxHeardRef = useRef(0)               // längste gehörte Stufe des aktuellen Songs (für Ø-Zeit)
    const revealDoneRef = useRef(null)          // beendet die kurze Auflösung nach dem Werten vorzeitig
    const statsKeyRef = useRef(null)            // Statistik-Dokument pro Spotify-Konto (sp_…)
    const closeBtnRef = useRef(null)
    const keepPlayingRef = useRef(null)
    const usedUrisRef = useRef(new Set())        // schon gespielte Titel dieser Runde (Duplikate überspringen)
    const playGenRef = useRef(0)                 // wird bei Song-Wechsel erhöht: ältere Start-Anfragen verfallen
    const startingGameRef = useRef(false)        // verhindert doppelten Spielstart
    const cancelLoadRef = useRef(false)          // "Abbrechen" auf dem Ladescreen
    const playStartRef = useRef(0)              // Startzeit der laufenden Wiedergabe (Countdown)
    const isPlayingRequestRef = useRef(false)   // verhindert parallele Play-Requests
    const allowPlaybackRef = useRef(false)      // true nur, solange der Spieler einen Play-Button gedrückt hat
    const songsRef = useRef([])
    const trackUriRef = useRef({})              // Slot-Index → Track-URI (beim ersten Abspielen gemerkt)
    const searchInputRef = useRef(null)
    const lastPlaySecondsRef = useRef(null)
    const sessionSecondsCorrectRef = useRef([])

    // Firestore initialisieren
    useEffect(() => {
        dbRef.current = getFirestore(getApp())
    }, [])

    // Firestore-Regeln verlangen einen (anonymen) Firebase-Login
    const ensureFirebaseAuth = async () => {
        const auth = getAuth(getApp())
        await auth.authStateReady()
        if (!auth.currentUser) await signInAnonymously(auth)
    }

    // Statistik-Dokument des verbundenen Spotify-Kontos ermitteln
    const getStatsKey = async () => {
        if (statsKeyRef.current) return statsKeyRef.current
        const profile = await spotifyService.getUserProfile()
        if (!profile?.id) return null
        statsKeyRef.current = 'sp_' + String(profile.id).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 64)
        return statsKeyRef.current
    }

    const saveAndLoadStats = async (finalScore, finalPlayed, totalSeconds, countWithTime) => {
        const db = dbRef.current
        if (!db || finalPlayed <= 0) return
        setStatsSaveFailed(false)
        try {
            await ensureFirebaseAuth()
            const key = await getStatsKey()
            if (!key) throw new Error('Spotify-Konto nicht ermittelbar')
            const ref = doc(db, 'userStats', key)
            const correct = Math.min(finalScore, finalPlayed)
            const percent = Math.min(100, Math.round((correct / finalPlayed) * 100))
            const snap = await getDoc(ref)
            const currentBest = snap.exists() ? Math.min(100, snap.data().bestPercent || 0) : 0
            const update = {
                songsCorrect: increment(correct),
                songsTotal: increment(finalPlayed),
                gamesPlayed: increment(1),
                bestPercent: Math.max(currentBest, percent),
            }
            if (countWithTime > 0) {
                update.totalSecondsCorrect = increment(totalSeconds)
                update.correctGuessesWithTime = increment(countWithTime)
            }
            await setDoc(ref, update, { merge: true })
            const updated = await getDoc(ref)
            if (updated.exists()) setAllTimeStats(updated.data())
        } catch (e) {
            console.error('Stats speichern fehlgeschlagen:', e)
            setStatsSaveFailed(true)
        }
    }

    const loadStats = async () => {
        const db = dbRef.current
        if (!db) return
        setStatsState('loading')
        try {
            await ensureFirebaseAuth()
            const key = await getStatsKey()
            if (!key) throw new Error('Spotify-Konto nicht ermittelbar')
            const snap = await getDoc(doc(db, 'userStats', key))
            setAllTimeStats(snap.exists() ? snap.data() : null)
            setStatsState('ready')
        } catch (e) {
            console.error('Statistik laden fehlgeschlagen:', e)
            setStatsState('error')
        }
    }

    // OAuth-Rückkehr + Prüfung, ob Spotify schon verbunden ist
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (code) {
            // URL sofort leeren – verhindert dass React StrictMode (Dev-Doppelaufruf)
            // denselben Code ein zweites Mal an Spotify schickt → "Invalid authorization code"
            window.history.replaceState({}, '', window.location.pathname || '/')
            ;(async () => {
                try {
                    await spotifyService.exchangeCodeForToken(code)
                    setNeedsRelogin(false)
                    setConnected(true)
                } catch (e) {
                    console.error('Spotify Callback Fehler:', e)
                    setConnected(false)
                }
            })()
        } else {
            ;(async () => {
                const loggedIn = await spotifyService.isUserLoggedIn()
                if (!loggedIn) { setConnected(false); return }
                // Prüfen ob Token Playlist-Zugriff hat
                const hasScope = await spotifyService.testPlaylistAccess()
                log('[SecondSound] Playlist-Scope beim Start:', hasScope)
                setNeedsRelogin(!hasScope)
                setConnected(!!hasScope)
            })()
        }
    }, [])

    // Beim Verlassen der App den Player sauber trennen (er bleibt zwischen den Spielen verbunden)
    useEffect(() => () => {
        clip.detach()
        spotifyService.disconnectPlayer()
    }, [])

    // Web Playback SDK: Der Player wird beim Spielstart (LOADING) erzeugt und bleibt über mehrere Spiele
    // verbunden. Hier nur sicherstellen, dass er bereit ist (z. B. falls er unterwegs verloren ging).
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        setPlayerError(null)
        if (spotifyService.isPlaybackReady()) {
            setPlayerReady(true)
            return
        }
        setPlayerReady(false)
        spotifyService.initPlaybackPlayer(
            () => setPlayerReady(true),
            (msg) => setPlayerError(msg || 'Spotify Player konnte nicht gestartet werden. Spotify Premium erforderlich.'),
            { activate: true, name: 'Song raten' }
        )
    }, [phase])

    // Wiedergabe-Steuerung: Player-Ereignisse auswerten (Ende des Ausschnitts, Titelwechsel, Fehler)
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        clip.reset()
        clip.attach()
        clip.setHandlers({
            onEnd: (reason, info) => {
                allowPlaybackRef.current = false
                setIsPlaying(false)
                if (reason === 'drift') setPlayerError('Spotify hat von selbst den Titel gewechselt. Tippe auf Play, um den Song neu zu starten.')
                else if (reason === 'error') setPlayerError(`Abspielen unterbrochen: ${info.message || 'Spotify-Fehler'}`)
            },
            onAutoplayFailed: () => setPlayerError('Der Browser hat die Wiedergabe blockiert. Tippe nochmal auf Play.')
        })
        return () => { clip.detach() }
    }, [phase])

    // Wächter: Während des Spiels darf nur nach Klick auf einen Play-Button etwas laufen.
    // Fängt alles ab, was Spotify von sich aus startet (Resume nach Gerätewechsel,
    // fremde Wiedergabe auf dem Konto, fehlgeschlagene Pause usw.).
    useEffect(() => {
        if (phase !== PHASES.GAME || !playerReady) return
        let stopped = false
        const tick = async () => {
            if (stopped || allowPlaybackRef.current) return
            const paused = await spotifyService.isLocalPaused()
            if (!stopped && !allowPlaybackRef.current && paused === false) {
                log('[SS] Wächter: unerwartete Wiedergabe → pausiere')
                await spotifyService.pauseLocalPlayer()
            }
        }
        tick()
        const id = setInterval(tick, 500)
        return () => { stopped = true; clearInterval(id) }
    }, [phase, playerReady])

    const handleSpotifyLogin = async () => {
        try {
            sessionStorage.setItem('spotify_return_to', 'secondsound')
            const url = await spotifyService.getAuthUrlWithPKCE()
            window.location.href = url
        } catch (e) {
            alert('Login fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler'))
        }
    }

    const mergeById = (a, b) => {
        const seen = new Set(a.map(p => p.id))
        return [...a, ...b.filter(p => !seen.has(p.id))]
    }

    // Erste Suche: gleich zwei Seiten (bis zu 20 Treffer); weitere per "Mehr anzeigen"
    const handleSearchPlaylists = async () => {
        const query = playlistQuery.trim()
        if (!query) return
        setSearchLoading(true)
        setPlaylistResults([])
        setSearchHasMore(false)
        try {
            let all = []
            let offset = 0
            let more = true
            for (let i = 0; i < 2 && more; i++) {
                const r = await spotifyService.searchPlaylists(query, 10, offset)
                all = mergeById(all, r.items)
                offset = r.nextOffset
                more = r.hasMore
            }
            setPlaylistResults(all)
            setSearchNextOffset(offset)
            setSearchHasMore(more)
        } catch (e) {
            console.error('Playlist-Suche fehlgeschlagen:', e)
        } finally {
            setSearchedQuery(query)
            setSearchLoading(false)
        }
    }

    const handleMoreResults = async () => {
        const query = playlistQuery.trim()
        if (!query || searchMoreLoading) return
        setSearchMoreLoading(true)
        try {
            const r = await spotifyService.searchPlaylists(query, 10, searchNextOffset)
            setPlaylistResults(prev => mergeById(prev, r.items))
            setSearchNextOffset(r.nextOffset)
            setSearchHasMore(r.hasMore)
        } catch (e) {
            console.error('Weitere Playlists laden fehlgeschlagen:', e)
        } finally {
            setSearchMoreLoading(false)
        }
    }

    const sortPlaylists = (playlists) => {
        const startsWithEmoji = (str) => /^\p{Emoji}/u.test(str)
        const letterPlaylists = playlists.filter(p => !startsWithEmoji(p.name))
        const emojiPlaylists  = playlists.filter(p => startsWithEmoji(p.name))
        const byName = (a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
        return [...letterPlaylists.sort(byName), ...emojiPlaylists.sort(byName)]
    }

    const handleLoadMyPlaylists = async (force = false) => {
        if (myPlaylistsLoaded && !force) return
        setSearchLoading(true)
        setMyPlaylistsError(null)
        try {
            const playlists = await spotifyService.getMyPlaylists(50)
            setMyPlaylists(sortPlaylists(playlists))
            setMyPlaylistsLoaded(true)
        } catch (e) {
            console.error('[SecondSound] getMyPlaylists fehlgeschlagen:', e)
            setMyPlaylistsError('Playlists konnten nicht geladen werden. Spotify antwortet gerade nicht – bitte nochmal versuchen.')
            setMyPlaylistsLoaded(false)
        } finally {
            setSearchLoading(false)
        }
    }

    const handleAddPlaylist = (playlist) => {
        if (selectedPlaylists.find(p => p.id === playlist.id)) return
        setSelectedPlaylists(prev => [...prev, playlist])
    }

    const handleRemovePlaylist = (playlistId) => {
        setSelectedPlaylists(prev => prev.filter(p => p.id !== playlistId))
    }

    const handleCancelLoad = () => {
        cancelLoadRef.current = true
        setCancelling(true)
    }

    const handleStartGame = async () => {
        if (selectedPlaylists.length === 0 || startingGameRef.current) return
        startingGameRef.current = true
        cancelLoadRef.current = false
        setCancelling(false)
        setPhase(PHASES.LOADING)
        setLoadingError(null)
        usedUrisRef.current = new Set()
        playGenRef.current++
        clip.reset()

        try {
            // Echtes Fisher-Yates – Math.random()-0.5 als Sortier-Func ist statistisch
            // verzerrt und überrepräsentiert die ersten Elemente.
            const fisherYates = (arr) => {
                const a = arr.slice()
                for (let i = a.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1))
                    ;[a[i], a[j]] = [a[j], a[i]]
                }
                return a
            }

            // Player muss existieren, bevor Live-Detection (mute play tests) läuft –
            // der Effect mit initPlaybackPlayer greift erst bei PHASES.GAME.
            await spotifyService.ensurePlaybackPlayerReady({ name: 'Song raten' })
            if (cancelLoadRef.current) throw new Error('abgebrochen')

            const candidates = []   // alle (Playlist, Position)-Paare: so zählt jeder Titel gleich viel

            for (let pIdx = 0; pIdx < selectedPlaylists.length; pIdx++) {
                const playlist = selectedPlaylists[pIdx]
                const uri = `spotify:playlist:${playlist.id}`

                // Größe ermitteln: Cache → getPlaylistInfo (falls > 0) → detectPlaylistSize
                let count = playlistSizeCache.current[playlist.id] || 0

                if (!count && playlist.trackCount > 1) {
                    count = playlist.trackCount
                    log(`[SS] "${playlist.name}": nutze gecachte trackCount=${count} aus Auswahl`)
                }

                if (!count) {
                    try {
                        const info = await spotifyService.getPlaylistInfo(playlist.id)
                        if (info.trackCount > 1) {
                            count = info.trackCount
                            log(`[SS] "${playlist.name}": getPlaylistInfo trackCount=${count}`)
                        }
                    } catch (e) {
                        warn(`[SS] getPlaylistInfo für "${playlist.name}" fehlgeschlagen:`, e.message)
                    }
                }

                // Wenn beide API-Quellen versagen → echte Größe via Player-Test ermitteln
                if (!count) {
                    log(`[SS] "${playlist.name}": API-Größe nicht verfügbar, starte Live-Detection…`)
                    try {
                        count = await spotifyService.detectPlaylistSize(uri, {
                            shouldCancel: () => cancelLoadRef.current
                        })
                        log(`[SS] "${playlist.name}": Live-Detection ermittelt ${count} Tracks`)
                        saveSize(playlist.id, count)
                    } catch (e) {
                        if (cancelLoadRef.current) throw new Error('abgebrochen')
                        console.error(`[SS] Live-Detection fehlgeschlagen:`, e.message)
                        // Keine geratene Größe: sonst entstehen Offsets, die es nicht gibt (oder 1 Song)
                        throw new Error(`„${playlist.name}": ${e.message}`)
                    }
                }

                if (count > 1) playlistSizeCache.current[playlist.id] = count

                for (let i = 0; i < count; i++) candidates.push({ playlistUri: uri, offset: i })
                log(`[SS] "${playlist.name}": trackCount=${count}`)
                if (cancelLoadRef.current) throw new Error('abgebrochen')
            }

            // Zufällig aus ALLEN Titeln aller Playlists ziehen (3× Reserve für übersprungene/doppelte Titel)
            const slots = fisherYates(candidates).slice(0, songCount * 3)
            setStartNotice(candidates.length < songCount
                ? `Deine Auswahl hat nur ${candidates.length} Songs – die Runde hat deshalb ${candidates.length} Songs.`
                : null)

            // Sicherstellen, dass vor dem ersten Klick nichts mehr läuft
            allowPlaybackRef.current = false
            await spotifyService.pauseLocalPlayer()

            if (slots.length === 0) {
                setLoadingError('Keine Playlists verfügbar. Bitte eine Playlist auswählen.')
                setPhase(PHASES.COUNT)
                return
            }

            const shuffled = fisherYates(slots)
            log(`[SS] Spiel gestartet – ${shuffled.length} Slots, Ziel: ${songCount}`)

            songsRef.current = shuffled
            trackUriRef.current = {}
            sessionSecondsCorrectRef.current = []
            lastPlaySecondsRef.current = null

            setSongs(shuffled)
            currentIndexRef.current = 0
            setCurrentIndex(0)
            setPlayedCount(0)
            setTargetCount(Math.min(songCount, shuffled.length))
            setIsRevealed(false)
            setCurrentTrackInfo(null)
            setScore(0)
            setIsPlaying(false)
            setSongHistory([])
            setHistoryOpen(false)
            setPhase(PHASES.GAME)
        } catch (e) {
            if (cancelLoadRef.current) {
                setPhase(PHASES.COUNT)       // bewusst abgebrochen: keine Fehlermeldung
            } else {
                console.error('[SS] Fehler beim Starten:', e)
                setLoadingError(e.message || 'Fehler beim Starten des Spiels.')
                setPhase(PHASES.COUNT)
            }
        } finally {
            startingGameRef.current = false
            setCancelling(false)
        }
    }

    const dbg = (...args) => log('[SS]', ...args)

    // Pausiert den laufenden Ausschnitt (lokal über das SDK)
    const stopPlayback = async () => {
        dbg('stopPlayback aufgerufen')
        allowPlaybackRef.current = false
        setIsPlaying(false)
        await clip.pause()
    }

    // Spielt Stufe `idx` (1/5/10/30 s) des aktuellen Songs.
    // Ein Titel gilt erst als gestartet, wenn der Player "spielt" meldet (siehe clipPlayerCore.js).
    const handlePlayStage = async (idx) => {
        const seconds = STAGES[idx].seconds
        if (isPlayingRequestRef.current) { dbg('handlePlayStage: ignoriert (Start läuft)'); return }
        spotifyService.activateAudio()     // synchron im Klick: Autoplay-Regeln der Browser
        if (!playerReady) {
            setPlayerError('Spotify Player noch nicht bereit. Bitte warte einen Moment.')
            return
        }
        const gen = playGenRef.current
        const isStale = () => gen !== playGenRef.current
        let slot = currentIndexRef.current
        if (!songsRef.current[slot]) { dbg('handlePlayStage: kein Song an Slot', slot); return }

        isPlayingRequestRef.current = true
        setIsPlaying(false)         // eine laufende Stufe wird ersetzt
        setStartingIdx(idx)
        setPlayerError(null)
        lastPlaySecondsRef.current = seconds
        allowPlaybackRef.current = true
        dbg(`handlePlayStage: ${seconds}s | slot=${slot}`)

        try {
            const knownUri = trackUriRef.current[slot]
            let result
            if (knownUri) {
                // gleicher Titel von vorn (seek+resume); sonst per URI neu laden
                result = await clip.replay({ uri: knownUri, seconds, isStale })
            } else {
                let tries = 0
                for (;;) {
                    const song = songsRef.current[slot]
                    if (!song) throw new Error('Keine weiteren Songs verfügbar.')
                    const canSkip = slot + 1 < songsRef.current.length && tries < 5
                    result = await clip.startNew({
                        contextUri: song.playlistUri,
                        offset: song.offset,
                        seconds,
                        isStale,
                        // Duplikate werden stumm verworfen, BEVOR man sie hört (Titel ist hier verifiziert, nicht geraten)
                        accept: (t) => !(canSkip && usedUrisRef.current.has(t.uri))
                    })
                    if (!result.rejected) break
                    tries++
                    slot++
                    dbg(`Duplikat verworfen – nächster Slot ${slot}`)
                }
            }
            if (result.aborted || isStale()) return

            if (!knownUri) {
                usedUrisRef.current.add(result.track.uri)
                trackUriRef.current[slot] = result.track.uri
                setCurrentTrackInfo(result.track)
                if (slot !== currentIndexRef.current) {
                    currentIndexRef.current = slot
                    setCurrentIndex(slot)
                }
            }
            playStartRef.current = result.startedAt
            setIsPlaying(true)
            setHasPlayedCurrentSong(true)
            setStartNotice(null)
            maxHeardRef.current = Math.max(maxHeardRef.current, seconds)
            setMaxUnlockedIndex(prev => Math.max(prev, idx + 1))
        } catch (e) {
            allowPlaybackRef.current = false
            dbg('handlePlayStage Fehler:', e.message)
            if (!isStale()) {
                setPlayerError(e.message || 'Wiedergabe fehlgeschlagen')
                setIsPlaying(false)
            }
        } finally {
            if (!isStale()) {
                isPlayingRequestRef.current = false
                setStartingIdx(-1)
            }
        }
    }

    // Nicht abspielbaren Song auslassen (zählt nicht als gespielt)
    const skipSong = async () => {
        playGenRef.current++
        isPlayingRequestRef.current = false
        setStartingIdx(-1)
        await stopPlayback()
        const next = currentIndexRef.current + 1
        if (next >= songsRef.current.length) {
            setPlayerError('Keine weiteren Songs verfügbar. Du kannst die Runde beenden.')
            return
        }
        currentIndexRef.current = next
        maxHeardRef.current = 0
        setCurrentIndex(next)
        setIsRevealed(false)
        setMaxUnlockedIndex(0)
        setHasPlayedCurrentSong(false)
        setCurrentTrackInfo(null)
        setPlayerError(null)
    }

    // Rückt zum nächsten Song vor – zählt den Song als gespielt
    const advanceAfterAnswer = (correct) => {
        dbg(`advanceAfterAnswer: correct=${correct} | currentIndex=${currentIndex} | playedCount=${playedCount} | targetCount=${targetCount}`)
        dbg(`  aktueller Track: "${currentTrackInfo?.trackName}" von "${currentTrackInfo?.artist}"`)
        playGenRef.current++        // laufende Start-Anfragen des alten Songs verwerfen
        setStartingIdx(-1)
        setPlayerError(null)
        allowPlaybackRef.current = false
        isAnsweringRef.current = false
        isPlayingRequestRef.current = false
        if (correct) {
            setScore(prev => prev + 1)
            if (maxHeardRef.current > 0) {
                sessionSecondsCorrectRef.current.push(maxHeardRef.current)
            }
        }
        lastPlaySecondsRef.current = null
        maxHeardRef.current = 0
        const newPlayed = playedCount + 1
        setPlayedCount(newPlayed)
        setIsRevealed(false)
        setMaxUnlockedIndex(0)
        setHasPlayedCurrentSong(false)
        const historyEntry = currentTrackInfo
            ? { name: currentTrackInfo.trackName, artist: currentTrackInfo.artist, albumImage: currentTrackInfo.imageUrl }
            : { name: 'Unbekannter Titel', artist: '', albumImage: null }
        setSongHistory(prev => [...prev, { song: historyEntry, correct }])
        setCurrentTrackInfo(null)
        if (newPlayed >= targetCount || currentIndex + 1 >= songs.length) {
            dbg(`Spiel beendet: newPlayed=${newPlayed} targetCount=${targetCount} nextIndex=${currentIndex + 1}`)
            const finalScore = correct ? score + 1 : score
            const secondsArr = sessionSecondsCorrectRef.current
            const totalSeconds = secondsArr.reduce((a, b) => a + b, 0)
            saveAndLoadStats(finalScore, newPlayed, totalSeconds, secondsArr.length)
            setPhase(PHASES.RESULTS)
        } else {
            const nextIndex = currentIndex + 1
            currentIndexRef.current = nextIndex
            dbg(`Nächster Song: index ${currentIndex} → ${nextIndex} | Slot: playlist=${songs[nextIndex]?.playlistUri} offset=${songs[nextIndex]?.offset}`)
            setCurrentIndex(prev => prev + 1)
        }
    }

    const handleAnswer = async (correct) => {
        if (isAnsweringRef.current) {
            dbg('handleAnswer: ignoriert (bereits am Antworten)')
            return
        }
        isAnsweringRef.current = true
        dbg(`handleAnswer: ${correct ? '✓ RICHTIG' : '✕ FALSCH'}`)
        const gen = playGenRef.current
        await stopPlayback()
        if (!isRevealed) {
            // Lösung kurz zeigen; Tipp auf das Cover überspringt die Wartezeit
            setVerdict(correct ? 'ok' : 'no')
            setIsRevealed(true)
            await new Promise((resolve) => {
                const t = setTimeout(resolve, 1500)
                revealDoneRef.current = () => { clearTimeout(t); resolve() }
            })
            revealDoneRef.current = null
        }
        setVerdict(null)
        if (gen !== playGenRef.current) { isAnsweringRef.current = false; return }   // Runde wurde inzwischen beendet
        advanceAfterAnswer(correct)
        // wird in advanceAfterAnswer nach dem State-Update nicht zurückgesetzt –
        // das neue Lied setzt es zurück
    }

    // Alles rund um eine Runde zurücksetzen
    const resetGameState = () => {
        playGenRef.current++
        clip.reset()
        isPlayingRequestRef.current = false
        allowPlaybackRef.current = false
        setStartingIdx(-1)
        setPlayerError(null)
        setSongs([])
        setCurrentIndex(0)
        currentIndexRef.current = 0
        setPlayedCount(0)
        setIsRevealed(false)
        setCurrentTrackInfo(null)
        setScore(0)
        setIsPlaying(false)
        setHasPlayedCurrentSong(false)
        setMaxUnlockedIndex(0)
        setLoadingError(null)
        lastPlaySecondsRef.current = null
        maxHeardRef.current = 0
        setVerdict(null)
        setStartNotice(null)
        setStatsSaveFailed(false)
        sessionSecondsCorrectRef.current = []
        songsRef.current = []
        trackUriRef.current = {}
        usedUrisRef.current = new Set()
        setSongHistory([])
        setHistoryOpen(false)
    }

    // Auswahl vergessen: Playlists, Suche, Songanzahl
    const resetSelection = () => {
        setSelectedPlaylists([])
        setSongCount(10)
        setSearchMode('mine')
        setPlaylistQuery('')
        setPlaylistResults([])
        setSearchedQuery('')
        setSearchHasMore(false)
        setSearchNextOffset(0)
    }

    // "Nochmal spielen": alles frisch, wieder bei der Playlist-Auswahl
    const handleNewRound = () => {
        resetGameState()
        resetSelection()
        setPhase(PHASES.PLAYLISTS)
    }

    // Bekannte Gesamtzahl der gewählten Playlists (nur eigene Playlists liefern eine Anzahl)
    const knownTotal = selectedPlaylists.length > 0 && selectedPlaylists.every(p => p.trackCount > 1)
        ? selectedPlaylists.reduce((sum, p) => sum + p.trackCount, 0)
        : null
    const maxCount = knownTotal
        ? Math.max(COUNT_OPTIONS[0], Math.min(COUNT_OPTIONS[COUNT_OPTIONS.length - 1], Math.ceil(knownTotal / 5) * 5))
        : COUNT_OPTIONS[COUNT_OPTIONS.length - 1]

    const goToCount = () => {
        if (songCount > maxCount) setSongCount(maxCount)
        setPhase(PHASES.COUNT)
    }

    const handleOpenSettings = () => {
        setPhase(PHASES.SETTINGS)
        if (connected) loadStats()
    }

    // Startseite → Playlist-Auswahl (immer mit leerer Auswahl)
    const handleOpenPlaylists = () => {
        resetSelection()
        setLoadingError(null)
        setPhase(PHASES.PLAYLISTS)
    }

    // Spotify-Verbindung trennen (Token löschen, Player abbauen)
    const handleDisconnect = () => {
        spotifyService.disconnectPlayer()
        spotifyService.clearUserTokens()
        statsKeyRef.current = null
        setAllTimeStats(null)
        resetSelection()
        setMyPlaylists([])
        setMyPlaylistsLoaded(false)
        setMyPlaylistsError(null)
        setLoadingError(null)
        setConnected(false)
        setNeedsRelogin(false)
        setPhase(PHASES.HOME)
    }

    const handleBack = async () => {
        await stopPlayback()
        spotifyService.disconnectPlayer()
        onBack()
    }

    // Runde abbrechen (ohne Wertung) und zurück zur Startseite
    const endGame = async () => {
        setConfirmClose(false)
        await stopPlayback()
        resetGameState()
        resetSelection()
        setPhase(PHASES.HOME)
    }

    // Während ein Ausschnitt läuft: regelmäßig neu zeichnen (Fortschritt in der Kachel)
    const [, setFrame] = useState(0)
    useEffect(() => {
        if (phase !== PHASES.GAME || !isPlaying) return
        const id = setInterval(() => setFrame(f => f + 1), 150)
        return () => clearInterval(id)
    }, [phase, isPlaying])

    // Browser-Zurück während einer Runde: nicht abbrechen, sondern nachfragen
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        window.history.pushState({ ssGame: true }, '')
        const onPop = () => {
            window.history.pushState({ ssGame: true }, '')
            setConfirmClose(true)
        }
        window.addEventListener('popstate', onPop)
        return () => {
            window.removeEventListener('popstate', onPop)
            if (window.history.state?.ssGame) window.history.back()   // Hilfseintrag wieder entfernen
        }
    }, [phase])

    // Beenden-Dialog: Fokus hinein, Escape schließt, Fokus danach zurück auf das X
    useEffect(() => {
        if (!confirmClose) return
        const closeBtn = closeBtnRef.current
        keepPlayingRef.current?.focus()
        const onKey = (e) => { if (e.key === 'Escape') setConfirmClose(false) }
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            closeBtn?.focus()
        }
    }, [confirmClose])

    // Setup: eigene Playlists direkt beim Öffnen laden (häufigster Fall)
    useEffect(() => {
        if (phase === PHASES.PLAYLISTS && searchMode === 'mine') handleLoadMyPlaylists()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, searchMode])

    // Setup: Playlist-Suche startet automatisch kurz nach dem Tippen
    useEffect(() => {
        if (phase !== PHASES.PLAYLISTS || searchMode !== 'playlist') return
        if (playlistQuery.trim().length < 2) { setPlaylistResults([]); return }
        const id = setTimeout(() => handleSearchPlaylists(), 500)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playlistQuery, searchMode, phase])


    // ─── Gemeinsame Bausteine der neuen Oberfläche ───────────────────────────
    const rootClass = `${styles.srRoot} ${isDark ? styles.srDark : styles.srLight}`
    const themeLabel = isDark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'
    const themeBtn = (
        <button type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {isDark ? <IconSun /> : <IconMoon />}
        </button>
    )
    const shell = (content) => (
        <div className={rootClass}>
            <div className={styles.srApp}>{content}</div>
        </div>
    )

    // ─── Start ───────────────────────────────────────────────────────────────
    if (phase === PHASES.HOME) {
        const checking = connected === null
        return shell(
            <main className={`${styles.srMain} ${styles.srPad}`}>
                <div className={styles.srHeader}>
                    <button type="button" className={`${styles.srBtn} ${styles.srTextBtn}`} onClick={handleBack}>
                        <IconBack />Zum Menü
                    </button>
                    {themeBtn}
                </div>

                <div className={styles.srHomeHero}>
                    <span className={styles.srEmoji} aria-hidden="true">🎧</span>
                    <h1 className={styles.srHeroTitle}>Song raten</h1>
                    <p className={styles.srLead}>
                        Hör kurze Ausschnitte aus deinen Spotify-Playlists: erst 1 Sekunde, dann 5, 10 und 30. Erkennst du den Song, bevor er aufgedeckt wird?
                    </p>
                </div>

                <div className={styles.srStack}>
                    {needsRelogin && (
                        <div className={styles.srNotice} role="status">
                            <span className={styles.srNoticeIcon}><IconRetry size={22} /></span>
                            <div>
                                <p className={styles.srNoticeTitle}>Neue Freigabe nötig</p>
                                <p className={styles.srNoticeText}>Spotify möchte kurz bestätigen, dass Song raten deine Playlists lesen darf. Tippe auf „Spotify verbinden“.</p>
                            </div>
                        </div>
                    )}

                    {!connected && (
                        <button type="button" className={`${styles.srBtn} ${styles.srPrimary}`} onClick={handleSpotifyLogin} disabled={checking}>
                            <IconNote />{checking ? 'Verbindung wird geprüft …' : 'Spotify verbinden'}
                        </button>
                    )}

                    {connected ? (
                        <button type="button" className={`${styles.srBtn} ${styles.srPrimary}`} onClick={handleOpenPlaylists}>Spiel starten</button>
                    ) : (
                        <button type="button" disabled aria-disabled="true" className={`${styles.srBtn} ${styles.srStartOff}`}><IconLock />Spiel starten</button>
                    )}

                    <button type="button" className={`${styles.srBtn} ${styles.srSecondary}`} onClick={handleOpenSettings}>Einstellungen</button>

                    {connected ? (
                        <p className={styles.srStatus} role="status">
                            <span className={styles.srStatusDot} aria-hidden="true" />Spotify verbunden
                            <span aria-hidden="true">·</span>
                            <button type="button" className={`${styles.srBtn} ${styles.srStatusLink}`} onClick={handleDisconnect}>Verbindung trennen</button>
                        </p>
                    ) : (
                        !checking && <p className={styles.srFineRow}><IconInfo />Du brauchst Spotify Premium.</p>
                    )}
                </div>
            </main>
        )
    }

    // ─── Playlists wählen ────────────────────────────────────────────────────
    if (phase === PHASES.PLAYLISTS) {
        const isMine = searchMode === 'mine'
        const q = playlistQuery.trim()
        const k = selectedPlaylists.length
        const isSel = (id) => selectedPlaylists.some(p => p.id === id)
        const toggle = (p) => (isSel(p.id) ? handleRemovePlaylist(p.id) : handleAddPlaylist(p))

        let view
        if (isMine) {
            if (myPlaylistsError) view = 'error'
            else if (!myPlaylistsLoaded) view = 'loading'
            else view = myPlaylists.length ? 'ok' : 'empty'
        } else if (!q) view = 'prompt'
        else if (playlistResults.length) view = 'ok'
        else view = (searchLoading || searchedQuery !== q) ? 'loading' : 'empty'

        const list = isMine ? myPlaylists : playlistResults
        const heading = isMine ? 'Deine Playlists' : (q && view === 'ok' ? `Treffer für „${q}“` : 'Suchergebnisse')

        return shell(
            <main className={styles.srMain}>
                <header className={`${styles.srSubHeader} ${styles.srPad}`}>
                    <button type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={() => setPhase(PHASES.HOME)} aria-label="Zurück"><IconBack /></button>
                    <h1 className={styles.srSubTitle}>Playlists</h1>
                    {themeBtn}
                </header>

                <div className={`${styles.srScroll} ${styles.srScrollFix}`}>
                    <p className={styles.srInfo}>Wähle eine oder mehrere Playlists, aus denen du zufällige Songs erraten willst</p>

                    <div className={styles.srTabs} role="tablist" aria-label="Playlist-Quelle">
                        <button type="button" role="tab" aria-selected={isMine} className={`${styles.srBtn} ${styles.srTab} ${isMine ? styles.srTabOn : ''}`}
                            onClick={() => { setSearchMode('mine'); handleLoadMyPlaylists() }}>
                            Meine Playlists
                        </button>
                        <button type="button" role="tab" aria-selected={!isMine} className={`${styles.srBtn} ${styles.srTab} ${!isMine ? styles.srTabOn : ''}`}
                            onClick={() => setSearchMode('playlist')}>
                            <IconSearch size={18} />Suchen
                        </button>
                    </div>

                    {!isMine && (
                        <div className={styles.srField}>
                            <label htmlFor="sr-search" className={styles.srLabel}>Playlist suchen</label>
                            <div className={styles.srInputWrap}>
                                <span className={styles.srInputIcon}><IconSearch /></span>
                                <input
                                    id="sr-search"
                                    ref={searchInputRef}
                                    type="search"
                                    className={styles.srInput}
                                    value={playlistQuery}
                                    onChange={e => setPlaylistQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearchPlaylists()}
                                    placeholder="z. B. Rock, 80er, Party"
                                    autoComplete="off"
                                />
                                {playlistQuery && (
                                    <button type="button" className={`${styles.srBtn} ${styles.srInputClear}`} aria-label="Suche löschen"
                                        onClick={() => { setPlaylistQuery(''); searchInputRef.current?.focus() }}>
                                        <IconX size={16} w={2.6} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className={styles.srListHead}>
                        <h2 className={styles.srListTitle}>{heading}</h2>
                        {k > 0 && <span className={styles.srListCount}>{k} ausgewählt</span>}
                    </div>

                    <div className={styles.srListBox}>
                        {view === 'ok' && (
                            <>
                                <ul className={styles.srList}>
                                    {list.map(p => {
                                        const sel = isSel(p.id)
                                        return (
                                            <li key={p.id}>
                                                <button type="button" aria-pressed={sel} onClick={() => toggle(p)} className={`${styles.srBtn} ${styles.srRow} ${sel ? styles.srRowOn : ''}`}>
                                                    <CoverArt src={p.imageUrl} seed={p.id} size={46} radius={11} />
                                                    <span className={styles.srRowText}>
                                                        <span className={styles.srRowName}>{p.name}</span>
                                                        {(!isMine && p.owner) || p.trackCount ? (
                                                            <span className={styles.srRowMeta}>
                                                                {[!isMine ? p.owner : '', p.trackCount ? `${p.trackCount} Songs` : ''].filter(Boolean).join(' · ')}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    <span className={`${styles.srCheck} ${sel ? styles.srCheckOn : ''}`}>{sel && <IconCheck />}</span>
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>
                                {!isMine && searchHasMore && (
                                    <button type="button" className={`${styles.srBtn} ${styles.srOutline} ${styles.srMore}`} onClick={handleMoreResults} disabled={searchMoreLoading}>
                                        {searchMoreLoading ? 'Lädt …' : 'Mehr anzeigen'}
                                    </button>
                                )}
                            </>
                        )}

                        {view === 'loading' && (
                            <div className={styles.srSkeletons} role="status" aria-label="Playlists werden geladen">
                                {[150, 120, 170].map((w, i) => (
                                    <div key={w} className={styles.srSkelRow} style={{ opacity: 1 - i * 0.25 }}>
                                        <span className={styles.srSkelCover} />
                                        <span className={styles.srSkelLines}><span style={{ width: w }} /><span style={{ width: w / 2 }} /></span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {view === 'empty' && (
                            <div className={styles.srEmpty}>
                                <span className={styles.srEmptyIcon}>{isMine ? <IconNote size={24} /> : <IconSearch size={24} />}</span>
                                <p className={styles.srEmptyTitle}>{isMine ? 'Noch keine Playlists' : 'Nichts gefunden'}</p>
                                <p className={styles.srEmptyText}>
                                    {isMine ? 'In deinem Spotify-Konto gibt es noch keine Playlists. Such einfach nach anderen.' : `Zu „${q}“ gibt es keine Playlists. Versuch einen anderen Begriff.`}
                                </p>
                                {isMine && (
                                    <button type="button" className={`${styles.srBtn} ${styles.srOutline}`} onClick={() => setSearchMode('playlist')}>Playlists suchen</button>
                                )}
                            </div>
                        )}

                        {view === 'prompt' && (
                            <div className={styles.srEmpty}>
                                <span className={styles.srEmptyIcon}><IconSearch size={24} /></span>
                                <p className={styles.srEmptyTitle}>Andere Playlists finden</p>
                                <p className={styles.srEmptyText}>Gib einen Namen, ein Genre oder ein Jahrzehnt ein.</p>
                            </div>
                        )}

                        {view === 'error' && (
                            <div className={styles.srEmpty} role="alert">
                                <span className={`${styles.srEmptyIcon} ${styles.srEmptyIconBad}`}><IconAlert size={24} /></span>
                                <p className={styles.srEmptyTitle}>Playlists konnten nicht geladen werden</p>
                                <p className={styles.srEmptyText}>Prüf deine Internetverbindung und versuch es gleich nochmal.</p>
                                <button type="button" className={`${styles.srBtn} ${styles.srOutline}`} onClick={() => handleLoadMyPlaylists(true)}>
                                    <IconRetry />Erneut versuchen
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.srFooter}>
                    {k > 0 ? (
                        <button type="button" className={`${styles.srBtn} ${styles.srPrimary}`} onClick={goToCount}>Weiter</button>
                    ) : (
                        <button type="button" disabled aria-disabled="true" className={`${styles.srBtn} ${styles.srStartOff}`}><IconLock />Weiter</button>
                    )}
                </div>
            </main>
        )
    }

    // ─── Songanzahl wählen ───────────────────────────────────────────────────
    if (phase === PHASES.COUNT) {
        const k = selectedPlaylists.length
        return shell(
            <main className={styles.srMain}>
                <header className={`${styles.srSubHeader} ${styles.srPad}`}>
                    <button type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={() => { setLoadingError(null); setPhase(PHASES.PLAYLISTS) }} aria-label="Zurück"><IconBack /></button>
                    <h1 className={styles.srSubTitle}>Songanzahl</h1>
                    {themeBtn}
                </header>

                <div className={styles.srCountPage}>
                    <p id="sr-count-label" className={styles.srInfoBig}>Wie viele Songs möchtest du erraten?</p>
                    <div className={styles.srSliderBox}>
                        <p className={styles.srSliderValue} aria-hidden="true"><span className={styles.srSliderNum}>{songCount}</span>Songs</p>
                        <input
                            type="range"
                            className={styles.srSlider}
                            min={COUNT_OPTIONS[0]}
                            max={maxCount}
                            step={5}
                            value={Math.min(songCount, maxCount)}
                            onChange={e => setSongCount(Number(e.target.value))}
                            aria-label="Anzahl der Songs"
                            aria-valuetext={`${songCount} Songs`}
                            style={{ '--pct': `${maxCount > COUNT_OPTIONS[0] ? ((Math.min(songCount, maxCount) - COUNT_OPTIONS[0]) / (maxCount - COUNT_OPTIONS[0])) * 100 : 100}%` }}
                        />
                        <div className={styles.srTicks} aria-hidden="true">
                            {COUNT_OPTIONS.filter(n => n <= maxCount).map((n, i, arr) => (
                                <span key={n} className={n === songCount ? styles.srTickOn : ''} style={{ left: `calc(14px + (100% - 28px) * ${arr.length > 1 ? i / (arr.length - 1) : 1})` }}>{n}</span>
                            ))}
                        </div>
                        {knownTotal && knownTotal < songCount && (
                            <p className={styles.srCountHint}>Deine Auswahl hat nur {knownTotal} Songs – die Runde hat deshalb {knownTotal} Songs.</p>
                        )}
                    </div>
                </div>

                <div className={styles.srFooter}>
                    {loadingError && (
                        <div className={styles.srAlert} role="alert">
                            <div className={styles.srAlertRow}>
                                <span className={styles.srAlertIcon}><IconAlert /></span>
                                <div className={styles.srAlertBody}>
                                    <p className={styles.srAlertTitle}>Das Spiel konnte nicht gestartet werden</p>
                                    <p className={styles.srAlertText}>{loadingError}</p>
                                </div>
                                <button type="button" className={`${styles.srBtn} ${styles.srCloseSm}`} onClick={() => setLoadingError(null)} aria-label="Hinweis schließen"><IconX size={18} w={2.4} /></button>
                            </div>
                            <button type="button" className={`${styles.srBtn} ${styles.srOutline} ${styles.srOutlineSm}`} onClick={handleDisconnect}>
                                Spotify neu verbinden
                            </button>
                        </div>
                    )}
                    <button type="button" className={`${styles.srBtn} ${styles.srStart}`} onClick={handleStartGame}>
                        <span className={styles.srStartText}>
                            <span className={styles.srStartTitle}>Spiel starten</span>
                            <span className={styles.srStartSub}>{k} {k === 1 ? 'Playlist' : 'Playlists'} - {songCount} Songs</span>
                        </span>
                        <span className={styles.srStartIcon}><IconPlay size={20} /></span>
                    </button>
                </div>
            </main>
        )
    }

    // ─── Einstellungen ───────────────────────────────────────────────────────
    if (phase === PHASES.SETTINGS) {
        const st = allTimeStats || {}
        const games = st.gamesPlayed || 0
        const total = st.songsTotal || 0
        const correct = Math.min(st.songsCorrect || 0, total)
        const rate = total > 0 ? Math.round((correct / total) * 100) : null
        const avgSec = st.correctGuessesWithTime > 0 ? (st.totalSecondsCorrect / st.correctGuessesWithTime) : null
        const tiles = [
            { label: 'Spiele', value: games },
            { label: 'Songs gespielt', value: total },
            { label: 'Songs erraten', value: correct },
            { label: 'Trefferquote', value: rate !== null ? `${rate} %` : '–' },
            { label: 'Bestes Spiel', value: games > 0 ? `${Math.min(100, st.bestPercent || 0)} %` : '–' },
            { label: 'Ø erraten nach', value: avgSec !== null ? `${avgSec.toFixed(1).replace('.', ',')} s` : '–' }
        ]
        return shell(
            <main className={styles.srMain}>
                <header className={`${styles.srSubHeader} ${styles.srPad}`}>
                    <button type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={() => setPhase(PHASES.HOME)} aria-label="Zurück"><IconBack /></button>
                    <h1 className={styles.srSubTitle}>Einstellungen</h1>
                    {themeBtn}
                </header>
                <div className={styles.srScroll}>
                    <h2 className={styles.srListTitle}>Deine Statistik</h2>
                    {!connected && <p className={styles.srFineSm}>Verbinde Spotify auf der Startseite, um deine Statistik zu sehen.</p>}
                    {connected && statsState === 'loading' && <p className={styles.srFineSm}>Statistik wird geladen …</p>}
                    {connected && statsState === 'error' && (
                        <div className={styles.srEmpty} role="alert">
                            <p className={styles.srEmptyText}>Die Statistik konnte nicht geladen werden.</p>
                            <button type="button" className={`${styles.srBtn} ${styles.srOutline}`} onClick={loadStats}><IconRetry />Erneut versuchen</button>
                        </div>
                    )}
                    {connected && statsState === 'ready' && (
                        games > 0 ? (
                            <div className={styles.srStatsGrid}>
                                {tiles.map(t => (
                                    <div key={t.label} className={styles.srStat}>
                                        <span className={styles.srStatNum}>{t.value}</span>
                                        <span className={styles.srStatLabel}>{t.label}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.srFineSm}>Noch keine Spiele. Nach deiner ersten Runde erscheint hier deine Statistik.</p>
                        )
                    )}
                </div>
            </main>
        )
    }

    // ─── Laden ───────────────────────────────────────────────────────────────
    if (phase === PHASES.LOADING) {
        return shell(
            <main className={`${styles.srMain} ${styles.srPad}`}>
                <div className={`${styles.srHeader} ${styles.srHeaderEnd}`}>{themeBtn}</div>
                <div className={styles.srLoadBody}>
                    <span className={`${styles.srEmoji} ${styles.srEmojiPulse}`} aria-hidden="true">🎧</span>
                    <div aria-live="polite" className={styles.srLoadText}>
                        <h1 className={styles.srLoadTitle}>Songs werden geladen</h1>
                        <p className={styles.srFineSm}>Das Spiel startet in wenigen Sekunden</p>
                    </div>
                    <button type="button" className={`${styles.srBtn} ${styles.srLinkBtn}`} onClick={handleCancelLoad} disabled={cancelling}>
                        {cancelling ? 'Wird abgebrochen …' : 'Abbrechen'}
                    </button>
                </div>
            </main>
        )
    }

    // ─── Spiel ───────────────────────────────────────────────────────────────
    if (phase === PHASES.GAME) {
        const connecting = !playerReady && !playerError
        const playedN = Math.min(maxUnlockedIndex, STAGES.length)       // so viele Stufen sind freigeschaltet
        const playingSecs = isPlaying ? lastPlaySecondsRef.current : null
        const playingIdx = isPlaying ? STAGES.findIndex(s => s.seconds === playingSecs) : -1
        const elapsed = isPlaying && playStartRef.current ? (Date.now() - playStartRef.current) / 1000 : 0
        const progress = isPlaying && playingSecs ? Math.min(1, elapsed / playingSecs) : 0

        // Kachel: läuft sie gerade → pausieren; läuft nichts → abspielen; läuft etwas anderes → ignorieren
        const starting = startingIdx >= 0
        const onTile = (idx) => {
            if (!playerReady || idx > playedN || starting) return
            if (playingIdx === idx) { stopPlayback(); return }
            handlePlayStage(idx)      // läuft gerade etwas anderes, wird es durch diese Stufe ersetzt
        }

        const canAct = hasPlayedCurrentSong && !connecting && !verdict
        const friendlyError = playerError && (/device not found/i.test(playerError)
            ? { title: 'Der Player ist noch nicht bereit', text: 'Kurz warten und nochmal tippen.' }
            : { title: 'Abspielen hat nicht geklappt', text: playerError })
        const songNo = `Song ${playedCount + 1} von ${targetCount}`

        return shell(
            <main className={`${styles.srMain} ${styles.srPad} ${styles.srGame}`}>
                <header className={styles.srGameHead}>
                    {themeBtn}
                    <button ref={closeBtnRef} type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={() => setConfirmClose(true)} aria-label="Spiel beenden" title="Spiel beenden"><IconX /></button>
                </header>

                <div className={styles.srProgressBox}>
                    <span className={styles.srSongNo}>{songNo}</span>
                    <div role="progressbar" aria-label={songNo} aria-valuemin="1" aria-valuemax={targetCount} aria-valuenow={playedCount + 1} className={styles.srSegs}>
                        {Array.from({ length: targetCount }, (_, i) => (
                            <span key={i} className={`${styles.srSeg} ${i < playedCount ? styles.srSegDone : (i === playedCount ? styles.srSegNow : '')}`} />
                        ))}
                    </div>
                </div>

                {startNotice && <p className={styles.srToast} role="status">{startNotice}</p>}

                <div
                    className={`${styles.srCardGame} ${!isRevealed ? styles.srSkelGame : ''} ${(!isRevealed && (isPlaying || starting || connecting)) ? styles.srPulse : ''} ${((!isRevealed && canAct) || verdict) ? styles.srCardTap : ''} ${verdict === 'ok' ? styles.srVerdictOk : ''} ${verdict === 'no' ? styles.srVerdictNo : ''}`}
                    onClick={() => {
                        if (verdict) { revealDoneRef.current?.(); return }
                        if (!isRevealed && canAct) setIsRevealed(true)
                    }}
                >
                    {verdict && (
                        <span className={`${styles.srVerdictBadge} ${verdict === 'ok' ? styles.srVerdictBadgeOk : styles.srVerdictBadgeNo}`} aria-hidden="true">
                            {verdict === 'ok' ? <IconCheck size={22} w={3.2} /> : <IconX size={20} w={3.2} />}
                        </span>
                    )}
                    {isRevealed ? (
                        <div role="img" aria-label={`Albumcover: ${currentTrackInfo?.trackName || 'Song'}`} className={styles.srCoverFill}>
                            <CoverArt src={currentTrackInfo?.imageUrl} seed={currentTrackInfo?.trackId || currentTrackInfo?.trackName || currentIndex} size={248} radius={0} />
                        </div>
                    ) : (
                        <span className={styles.srSkelQ} role="img" aria-label="Verdecktes Albumcover">?</span>
                    )}
                </div>

                <div className={styles.srTitleArea}>
                    {isRevealed ? (
                        <>
                            <h2 className={styles.srSongTitle} title={currentTrackInfo?.trackName || ''}>{currentTrackInfo?.trackName || 'Titel wird geladen …'}</h2>
                            <p className={styles.srSongArtist}>{currentTrackInfo?.artist || ''}</p>
                        </>
                    ) : (
                        <div role="img" aria-label="Titel und Interpret sind verdeckt" className={styles.srMasks}>
                            <span style={{ width: 196, height: 16 }} /><span style={{ width: 124, height: 12 }} />
                        </div>
                    )}
                </div>

                <div role="group" aria-label="Ausschnitte" className={styles.srTiles}>
                    {STAGES.map((s, i) => {
                        const locked = i > playedN
                        const playing = playingIdx === i
                        const loadingTile = startingIdx === i
                        const otherPlaying = starting && !loadingTile
                        const aria = locked ? `${s.long} – noch gesperrt` : (playing ? `${s.long} pausieren` : `${s.long} abspielen`)
                        return (
                            <button key={s.label} type="button" onClick={() => onTile(i)} disabled={locked || connecting || otherPlaying || loadingTile} aria-label={aria}
                                className={`${styles.srBtn} ${styles.srTile} ${locked ? styles.srTile_locked : ((playing || loadingTile) ? styles.srTile_playing : (i === playedN ? styles.srTile_next : styles.srTile_played))} ${(connecting && !locked) || otherPlaying ? styles.srTileConn : ''}`}>
                                {playing && <span className={styles.srTileFill} style={{ width: `${Math.round(progress * 100)}%` }} />}
                                <span className={styles.srTileLabel}>{s.label}</span>
                                <span className={styles.srTileStatus}>
                                    {locked ? <><IconLock size={14} w={2.6} />gesperrt</> : (loadingTile ? <IconWave size={16} /> : (playing ? <IconPause size={20} /> : <IconPlay size={18} />))}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <div className={styles.srSpacer} />

                {friendlyError && (
                    <div className={styles.srAlert} role="alert">
                        <div className={styles.srAlertRow}>
                            <span className={styles.srAlertIcon}><IconAlert /></span>
                            <div className={styles.srAlertBody}>
                                <p className={styles.srAlertTitle}>{friendlyError.title}</p>
                                <p className={styles.srAlertText}>{friendlyError.text}</p>
                            </div>
                            <button type="button" className={`${styles.srBtn} ${styles.srSkipBtn}`} onClick={skipSong}>
                                Anderer Song
                            </button>
                        </div>
                    </div>
                )}

                <div className={styles.srActions}>
                    <button type="button" onClick={() => canAct && setIsRevealed(r => !r)} disabled={!canAct}
                        className={`${styles.srBtn} ${styles.srReveal} ${!canAct ? styles.srRevealOff : styles.srRevealOpen}`}>
                        {!canAct ? <IconLock /> : (isRevealed ? <IconEyeOff /> : <IconEye />)}
                        {!canAct ? 'Song aufdecken' : (isRevealed ? 'Song verdecken' : 'Song aufdecken')}
                    </button>
                    <div className={styles.srRate}>
                        <button type="button" onClick={() => canAct && handleAnswer(false)} disabled={!canAct} className={`${styles.srBtn} ${styles.srRateNo} ${!canAct ? styles.srRateOff : ''}`}><IconX size={20} w={2.8} />Nicht erraten</button>
                        <button type="button" onClick={() => canAct && handleAnswer(true)} disabled={!canAct} className={`${styles.srBtn} ${styles.srRateOk} ${!canAct ? styles.srRateOff : ''}`}><IconCheck size={22} />Erraten</button>
                    </div>
                </div>

                {confirmClose && (
                    <div className={styles.srScrim} onClick={(e) => { if (e.target === e.currentTarget) setConfirmClose(false) }}>
                        <div role="dialog" aria-modal="true" aria-labelledby="sr-end-title" className={styles.srSheet}
                            onKeyDown={(e) => {
                                // Tab bleibt im Dialog
                                if (e.key !== 'Tab') return
                                const items = e.currentTarget.querySelectorAll('button')
                                const first = items[0], last = items[items.length - 1]
                                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
                                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
                            }}>
                            <span className={styles.srGrab} aria-hidden="true" />
                            <h2 id="sr-end-title" className={styles.srSheetTitle}>Spiel beenden?</h2>
                            <p className={styles.srSheetText}>Die laufende Runde wird abgebrochen und nicht gewertet.</p>
                            <button ref={keepPlayingRef} type="button" className={`${styles.srBtn} ${styles.srPrimary} ${styles.srPrimarySm}`} onClick={() => setConfirmClose(false)}>Weiterspielen</button>
                            <button type="button" className={`${styles.srBtn} ${styles.srDanger}`} onClick={endGame}>Spiel beenden</button>
                        </div>
                    </div>
                )}
            </main>
        )
    }

    // ─── Ergebnis ────────────────────────────────────────────────────────────
    if (phase === PHASES.RESULTS) {
        const total = playedCount
        const pct = total > 0 ? Math.round((score / total) * 100) : 0
        const tier = TIERS.find(t => pct >= t.min) || TIERS[TIERS.length - 1]
        const secondsArr = sessionSecondsCorrectRef.current
        const avg = secondsArr.length > 0 ? (secondsArr.reduce((a, b) => a + b, 0) / secondsArr.length) : null
        const segs = songHistory.length ? songHistory.map(h => h.correct) : []
        return shell(
            <main className={styles.srMain}>
                <header className={`${styles.srHeader} ${styles.srPad}`}>
                    <span className={styles.srHeaderLabel}>Ergebnis</span>
                    {themeBtn}
                </header>

                <div className={styles.srScroll}>
                    <section className={styles.srResultCard}>
                        <div className={styles.srTierRow}>
                            <span className={styles.srTierFace}>
                                <svg width="44" height="44" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="22" cy="25" r="3" fill="currentColor" stroke="none" /><circle cx="42" cy="25" r="3" fill="currentColor" stroke="none" />
                                    <path d={tier.mouth} fill={tier.filled ? 'currentColor' : 'none'} />
                                </svg>
                            </span>
                            <div className={styles.srTierText}>
                                <h1 className={styles.srTierTitle}>{tier.title}</h1>
                                <p className={styles.srTierSub}>{tier.sub}</p>
                            </div>
                        </div>
                        <div className={styles.srScoreRow}>
                            <p className={styles.srScore}><span className={styles.srScoreNum}>{score}</span><span className={styles.srScoreOf}>von {total}<br />erraten</span></p>
                            <span className={styles.srPct}>{pct} %</span>
                        </div>
                        {segs.length > 0 && (
                            <div className={styles.srResSegs} aria-hidden="true">
                                {segs.map((ok, i) => <span key={i} className={ok ? styles.srResSegOk : ''} />)}
                            </div>
                        )}
                    </section>

                    {statsSaveFailed && (
                        <p className={styles.srToast} role="status">Deine Statistik konnte diesmal nicht gespeichert werden.</p>
                    )}

                    {avg !== null && (
                        <section className={styles.srAvg}>
                            <span className={styles.srAvgIcon}><IconClock /></span>
                            <p className={styles.srAvgText}>
                                <span className={styles.srMuted}>Im Schnitt erraten nach</span>
                                <span className={styles.srAvgNum}>{avg.toFixed(1).replace('.', ',')} Sekunden</span>
                            </p>
                        </section>
                    )}

                    {songHistory.length > 0 && (
                        <section className={styles.srSongs}>
                            <button type="button" aria-expanded={historyOpen} aria-controls="sr-song-list" onClick={() => setHistoryOpen(o => !o)} className={`${styles.srBtn} ${styles.srSongsToggle}`}>
                                {historyOpen ? 'Songs ausblenden' : `Alle ${songHistory.length} Songs ansehen`}
                                <IconChevron open={historyOpen} />
                            </button>
                            {historyOpen && (
                                <ul id="sr-song-list" className={styles.srSongList}>
                                    {songHistory.map((entry, i) => (
                                        <li key={i} className={styles.srSongItem}>
                                            <CoverArt src={entry.song.albumImage} seed={entry.song.name || i} size={48} radius={10} />
                                            <span className={styles.srRowText}>
                                                <span className={styles.srRowName}>{entry.song.name}</span>
                                                <span className={styles.srRowMeta}>{entry.song.artist}</span>
                                            </span>
                                            <span role="img" aria-label={entry.correct ? 'erraten' : 'nicht erraten'} className={`${styles.srMark} ${entry.correct ? styles.srMarkOk : ''}`}>
                                                {entry.correct ? <IconCheck size={16} w={3.4} /> : <IconX size={14} w={3.4} />}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}
                </div>

                <div className={`${styles.srFooter} ${styles.srFooterTight}`}>
                    <button type="button" className={`${styles.srBtn} ${styles.srPrimary}`} onClick={handleNewRound}><IconReplay size={22} />Nochmal spielen</button>
                    <button type="button" className={`${styles.srBtn} ${styles.srGhost}`} onClick={handleBack}>Zurück zum Menü</button>
                </div>
            </main>
        )
    }

    return null
}
