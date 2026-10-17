import { useState, useEffect, useRef, useCallback } from 'react'
import { getApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc, increment } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'
import '../../firebase.js'
import spotifyService from '../../services/spotifyService'
import clip from '../../services/clipPlayer.js'
import { AppleClipPlayer, appleUri } from '../../services/appleClipPlayer.js'
import { log, warn } from '../../utils/logger.js'
import CoverArt from '../../shared/ui/CoverArt'
import { ConfirmSheet } from '../../shared/ui/BottomSheet'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import {
    IconMoon, IconSun, IconBack, IconCheck, IconX, IconLock, IconPlay, IconNote, IconSearch, IconRetry, IconReplay,
    IconEye, IconPause, IconAlert, IconClock, IconChevron, IconWave, IconInfo, IconNext, IconStar
} from '../../shared/ui/icons'
import styles from './SecondSound.module.css'
import BonusSheet from './BonusSheet'
import { loadGuestIndex, loadGuestList, appleSearch } from './guestMusic.js'
import JokerSheet from './JokerSheet'
import { JOKERS, loadTrackMeta, checkTip, tipGiven, tipAnyHit, songScore, tipSummary, titleHint, decadeLabel } from './songGuess.js'

// Joker-Symbol (Spielkarte mit Stern)
const IconJoker = ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" />
    </svg>
)

// Gastmodus: Apple-Hörproben aus kuratierten Listen, ohne Login
const appleClip = new AppleClipPlayer({ log })

// Statistik für Gäste: nur auf diesem Gerät
const GUEST_STATS_KEY = 'ss_guest_stats'
const readGuestStats = () => {
    try { return JSON.parse(localStorage.getItem(GUEST_STATS_KEY) || 'null') } catch { return null }
}

const PHASES = {
    HOME: 'home',            // Startseite: Spotify verbinden, Spiel starten
    PLAYLISTS: 'playlists',  // Schritt 1: Playlists wählen
    COUNT: 'count',          // Schritt 2: Songanzahl wählen
    SETTINGS: 'settings',    // Einstellungen (Menü)
    STATS: 'stats',          // Einstellungen → Statistik
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

// Freischaltbare Teile der Zeitleiste; je früher erraten, desto mehr Punkte
const STAGES = [
    { label: '1 s', seconds: 1, long: '1 Sekunde', points: 4 },
    { label: '5 s', seconds: 5, long: '5 Sekunden', points: 3 },
    { label: '10 s', seconds: 10, long: '10 Sekunden', points: 2 },
    { label: '30 s', seconds: 30, long: '30 Sekunden', points: 1 }
]

const COUNT_OPTIONS = [5, 10, 15, 20, 25, 30]

// Einsetzpunkt der Songs (0 = von vorn … 90 % der Songlänge, 100 = Zufall pro Song), auf dem Gerät gemerkt
const START_PCT_KEY = 'ss_start_pct'
const START_PCT_MAX = 100
const START_RANDOM = 100
const startLabel = (pct) => pct === START_RANDOM ? 'Zufall' : (pct === 0 ? 'von vorn' : `ab ${pct} %`)
// Spielmodus: Quick = nur Schnipsel + Erraten/Nicht erraten, Pro = zusätzlich Bonus-Tipp (Interpret, Titel, Jahr)
const MODE_KEY = 'ss_mode'
const MODES = [
    { id: 'quick', label: 'Quick', desc: 'Schnipsel hören, erraten oder nicht – je früher, desto mehr Punkte.' },
    { id: 'pro', label: 'Pro', desc: 'Dazu Bonuspunkte: Interpret und Titel eintippen, Jahr als Doppelt-oder-nichts.' }
]
const loadMode = () => {
    try { return localStorage.getItem(MODE_KEY) === 'pro' ? 'pro' : 'quick' } catch { return 'quick' }
}
const loadStartPct = () => {
    try {
        const n = Number(localStorage.getItem(START_PCT_KEY))
        return Number.isFinite(n) ? Math.max(0, Math.min(START_PCT_MAX, Math.round(n / 10) * 10)) : 0
    } catch { return 0 }
}

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

export default function SecondSound({ onBack }) {
    const [phase, setPhase] = useState(PHASES.HOME)
    const [connected, setConnected] = useState(null)   // null = wird geprüft
    const [playerReady, setPlayerReady] = useState(false)
    const [guest, setGuest] = useState(false)              // Gastmodus (Apple-Hörproben, kein Login)
    const guestRef = useRef(false)
    const [guestLists, setGuestLists] = useState(null)     // Verzeichnis der Gast-Listen (null = lädt)
    const [guestListsError, setGuestListsError] = useState(false)
    const [playerError, setPlayerError] = useState(null)
    const [allTimeStats, setAllTimeStats] = useState(null)
    const { isDark, toggleTheme } = useTheme()
    const dbRef = useRef(null)

    // Setup state
    const [searchMode, setSearchMode] = useState('mine') // 'playlist' | 'mine'
    const [playlistQuery, setPlaylistQuery] = useState('')
    const [playlistResults, setPlaylistResults] = useState([])
    const [myPlaylists, setMyPlaylists] = useState([])
    const [myPlaylistsLoaded, setMyPlaylistsLoaded] = useState(false)
    const [myPlaylistsError, setMyPlaylistsError] = useState(null)
    const [selectedPlaylists, setSelectedPlaylists] = useState([])
    const [songCount, setSongCount] = useState(10)
    const [startPct, setStartPct] = useState(loadStartPct)
    const [mode, setMode] = useState(loadMode)
    const [stage, setStage] = useState(0)                 // freigeschalteter Teil der Zeitleiste (0 = 1 s … 3 = 30 s)
    const [lockedStage, setLockedStage] = useState(null)  // Stufe beim Auflösen – zählt für die Punkte, danach ist alles frei
    // True sobald der aktuelle Song mindestens 1× abgespielt wurde – schaltet
    // Aufdecken- und Antwort-Buttons frei. Verhindert Klick-Spam mit 403/502.
    const [hasPlayedCurrentSong, setHasPlayedCurrentSong] = useState(false)
    const playlistSizeCache = useRef(loadSizeCache())
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingError, setLoadingError] = useState(null)
    const [needsRelogin, setNeedsRelogin] = useState(false)
    const [searchedQuery, setSearchedQuery] = useState('')   // zuletzt abgeschlossene Playlist-Suche
    const [confirmClose, setConfirmClose] = useState(false)  // Bottom-Sheet "Spiel beenden?"
    const [confirmReset, setConfirmReset] = useState(false)  // Bottom-Sheet "Statistiken zurücksetzen?"
    const [resetState, setResetState] = useState('idle')     // idle | busy | error | done
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
    const [score, setScore] = useState(0)            // erratene Songs (für die Statistik)
    const [points, setPoints] = useState(0)          // Punkte der Runde (früher erraten = mehr)
    const [trackMeta, setTrackMeta] = useState(null) // { id, name, artists, year } des aktuellen Songs (für Tipp + Jahr)
    const [usedJokers, setUsedJokers] = useState([]) // Joker des aktuellen Songs
    const [jokerSpent, setJokerSpent] = useState(0)  // Joker-Kosten der Runde
    const [jokerOpen, setJokerOpen] = useState(false)
    const [bonusOpen, setBonusOpen] = useState(false)
    const [tipResult, setTipResult] = useState(null) // { artist, title, year } nach „Prüfen“
    const [isPlaying, setIsPlaying] = useState(false)
    const [songHistory, setSongHistory] = useState([])
    const [historyOpen, setHistoryOpen] = useState(false)
    const [verdict, setVerdict] = useState(null)          // 'ok' | 'no' während der kurzen Auflösung
    const [startNotice, setStartNotice] = useState(null)  // z. B. "Deine Auswahl hat nur 20 Songs"
    const [statsState, setStatsState] = useState('idle')  // idle | loading | ready | error
    const [statsSaveFailed, setStatsSaveFailed] = useState(false)


    const currentIndexRef = useRef(0)
    const isAnsweringRef = useRef(false)        // verhindert Doppel-Klick auf Antwort-Buttons
    const frozenHeardRef = useRef(0)            // gehörte Stufe beim Auflösen (für Ø-Zeit)
    const maxHeardRef = useRef(0)               // längste gehörte Stufe des aktuellen Songs (für Ø-Zeit)
    const revealDoneRef = useRef(null)          // beendet die kurze Auflösung nach dem Werten vorzeitig
    const statsKeyRef = useRef(null)            // Statistik-Dokument pro Spotify-Konto (sp_…)
    const closeBtnRef = useRef(null)
    const jokerBtnRef = useRef(null)
    const solveBtnRef = useRef(null)
    const resetBtnRef = useRef(null)
    const usedUrisRef = useRef(new Set())        // schon gespielte Titel dieser Runde (Duplikate überspringen)
    const playGenRef = useRef(0)                 // wird bei Song-Wechsel erhöht: ältere Start-Anfragen verfallen
    const startingGameRef = useRef(false)        // verhindert doppelten Spielstart
    const cancelLoadRef = useRef(false)          // "Abbrechen" auf dem Ladescreen
    const playRef = useRef(null)                // laufender Ausschnitt: { startPos, startedAt, untilMs } (Spotify-Positionen in ms)
    const baseRef = useRef(0)                   // Position, an der der Song „bei 0 s“ startet
    const heardRef = useRef(0)                  // so weit wurde der Song gehört (ms ab baseRef)
    const posRef = useRef(0)                    // hier wurde zuletzt angehalten (ms ab baseRef)
    const isPlayingRequestRef = useRef(false)   // verhindert parallele Play-Requests
    const allowPlaybackRef = useRef(false)      // true nur, solange der Spieler einen Play-Button gedrückt hat
    const songsRef = useRef([])
    const guestSongsRef = useRef(new Map())     // Gastmodus: apple:ID → Song aus der Liste
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
        if (guestRef.current) {
            if (finalPlayed <= 0) return
            const old = readGuestStats() || {}
            const correct = Math.min(finalScore, finalPlayed)
            const st = {
                songsCorrect: (old.songsCorrect || 0) + correct,
                songsTotal: (old.songsTotal || 0) + finalPlayed,
                gamesPlayed: (old.gamesPlayed || 0) + 1,
                bestPercent: Math.max(old.bestPercent || 0, Math.min(100, Math.round((correct / finalPlayed) * 100))),
                totalSecondsCorrect: (old.totalSecondsCorrect || 0) + (countWithTime > 0 ? totalSeconds : 0),
                correctGuessesWithTime: (old.correctGuessesWithTime || 0) + countWithTime
            }
            try { localStorage.setItem(GUEST_STATS_KEY, JSON.stringify(st)) } catch { setStatsSaveFailed(true) }
            setAllTimeStats(st)
            return
        }
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

    // Alle Werte auf 0 setzen (Löschen verbieten die Firestore-Regeln bewusst)
    const resetStats = async () => {
        const db = dbRef.current
        if (!db) return
        setResetState('busy')
        try {
            await ensureFirebaseAuth()
            const key = await getStatsKey()
            if (!key) throw new Error('Spotify-Konto nicht ermittelbar')
            const zeros = { songsCorrect: 0, songsTotal: 0, gamesPlayed: 0, bestPercent: 0, totalSecondsCorrect: 0, correctGuessesWithTime: 0 }
            await setDoc(doc(db, 'userStats', key), zeros)
            setAllTimeStats(zeros)
            setResetState('done')
        } catch (e) {
            console.error('Statistik zurücksetzen fehlgeschlagen:', e)
            setResetState('error')
        } finally {
            setConfirmReset(false)
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
        appleClip.detach()
        spotifyService.disconnectPlayer()
    }, [])

    // Web Playback SDK: Der Player wird beim Spielstart (LOADING) erzeugt und bleibt über mehrere Spiele
    // verbunden. Hier nur sicherstellen, dass er bereit ist (z. B. falls er unterwegs verloren ging).
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        setPlayerError(null)
        if (guestRef.current) { setPlayerReady(true); return }      // Apple-Hörproben brauchen keinen Player-Start
        if (spotifyService.isPlaybackReady()) {
            setPlayerReady(true)
            return
        }
        setPlayerReady(false)
        spotifyService.initPlaybackPlayer(
            () => setPlayerReady(true),
            (msg) => setPlayerError(msg || 'Spotify Player konnte nicht gestartet werden. Spotify Premium erforderlich.'),
            { activate: true, name: 'Identify' }
        )
    }, [phase])

    // Wiedergabe-Steuerung: Player-Ereignisse auswerten (Ende des Ausschnitts, Titelwechsel, Fehler)
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        const player = guestRef.current ? appleClip : clip
        player.reset()
        player.attach()
        player.setHandlers({
            onEnd: (reason, info) => {
                noteHeard(reason === 'done')
                allowPlaybackRef.current = false
                setIsPlaying(false)
                if (reason === 'drift') setPlayerError('Spotify hat von selbst den Titel gewechselt. Tippe auf Play, um den Song neu zu starten.')
                else if (reason === 'error') setPlayerError(`Abspielen unterbrochen: ${info.message || 'Spotify-Fehler'}`)
            },
            onAutoplayFailed: () => setPlayerError('Der Browser hat die Wiedergabe blockiert. Tippe nochmal auf Play.')
        })
        return () => { player.detach() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    // Interpreten und frühestes Erscheinungsjahr nachladen (der Player liefert sie nicht mit)
    const trackId = currentTrackInfo?.trackId
    useEffect(() => {
        if (!trackId) return
        if (guestRef.current) {
            // Gast: alles steht schon in der Liste
            const song = guestSongsRef.current.get(trackId)
            setTrackMeta(song
                ? { id: trackId, name: song.title, artists: [{ id: song.artistId ?? null, name: song.artist }], year: song.year || null }
                : { id: trackId, failed: true })
            return
        }
        let alive = true
        loadTrackMeta(spotifyService, trackId)
            .then(m => { if (alive) setTrackMeta(m) })
            .catch(() => { if (alive) setTrackMeta({ id: trackId, failed: true }) })
        return () => { alive = false }
    }, [trackId])

    // Wächter: Während des Spiels darf nur nach Klick auf einen Play-Button etwas laufen.
    // Fängt alles ab, was Spotify von sich aus startet (Resume nach Gerätewechsel,
    // fremde Wiedergabe auf dem Konto, fehlgeschlagene Pause usw.).
    useEffect(() => {
        if (phase !== PHASES.GAME || !playerReady || guestRef.current) return
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
        appleClip.reset()

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

            const candidates = []   // alle Titel aller gewählten Listen/Playlists: so zählt jeder gleich viel
            if (guestRef.current) {
                // Gast: Songs stehen in den Listen-Dateien
                guestSongsRef.current = new Map()
                const lists = await Promise.all(selectedPlaylists.map(p => loadGuestList(p.id)))
                if (cancelLoadRef.current) throw new Error('abgebrochen')
                const seenSongs = new Set()
                for (const list of lists) {
                    for (const song of list.songs || []) {
                        if (!song?.preview || seenSongs.has(song.id)) continue
                        seenSongs.add(song.id)
                        guestSongsRef.current.set(appleUri(song), song)
                        candidates.push({ guestSong: song })
                    }
                }
            } else {
                // Player muss existieren, bevor Live-Detection (mute play tests) läuft –
                // der Effect mit initPlaybackPlayer greift erst bei PHASES.GAME.
                await spotifyService.ensurePlaybackPlayerReady({ name: 'Identify' })
                if (cancelLoadRef.current) throw new Error('abgebrochen')


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

            }

            // Zufällig aus ALLEN Titeln aller Playlists ziehen (3× Reserve für übersprungene/doppelte Titel)
            const slots = fisherYates(candidates).slice(0, songCount * 3)
            setStartNotice(candidates.length < songCount
                ? `Deine Auswahl hat nur ${candidates.length} Songs – die Runde hat deshalb ${candidates.length} Songs.`
                : null)

            // Sicherstellen, dass vor dem ersten Klick nichts mehr läuft
            allowPlaybackRef.current = false
            if (!guestRef.current) await spotifyService.pauseLocalPlayer()

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
            setPoints(0)
            setJokerSpent(0)
            resetTimeline()
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

    // Aktuelle Abspielposition (ms ab Einsetzpunkt) – live hochgerechnet, solange ein Ausschnitt läuft
    const livePosMs = () => {
        const p = playRef.current
        if (!p) return posRef.current
        return Math.max(0, Math.min(p.untilMs, p.startPos + (Date.now() - p.startedAt)) - baseRef.current)
    }

    // Ausschnitt ist zu Ende oder pausiert: Position und gehörte Strecke merken (reachedEnd = bis zur Grenze gelaufen)
    const noteHeard = (reachedEnd) => {
        const p = playRef.current
        if (!p) return
        const pos = reachedEnd ? p.untilMs - baseRef.current : livePosMs()
        heardRef.current = Math.max(heardRef.current, pos)
        posRef.current = pos
        playRef.current = null
    }

    // Song wechselt: Zeitleiste zurücksetzen
    const resetTimeline = () => {
        playRef.current = null
        baseRef.current = 0
        heardRef.current = 0
        posRef.current = 0
        setStage(0)
        setLockedStage(null)
        setUsedJokers([])
        setTipResult(null)
        setBonusOpen(false)
        setJokerOpen(false)
    }

    // Pausiert den laufenden Ausschnitt (lokal über das SDK)
    const stopPlayback = async () => {
        dbg('stopPlayback aufgerufen')
        noteHeard(false)
        allowPlaybackRef.current = false
        setIsPlaying(false)
        await (guestRef.current ? appleClip : clip).pause()
    }

    // Spielt den Song vom Einsetzpunkt bis zum Ende von Teil `idx` (1/5/10/30 s).
    // Ein Titel gilt erst als gestartet, wenn der Player "spielt" meldet (siehe clipPlayerCore.js).
    const handlePlayStage = async (idx) => {
        const seconds = STAGES[idx].seconds
        if (isPlayingRequestRef.current) { dbg('handlePlayStage: ignoriert (Start läuft)'); return }
        spotifyService.activateAudio()     // synchron im Klick: Autoplay-Regeln der Browser
        if (!playerReady) {
            setPlayerError('Spotify Player noch nicht bereit. Bitte warte einen Moment.')
            return
        }
        const player = guestRef.current ? appleClip : clip
        const gen = playGenRef.current
        const isStale = () => gen !== playGenRef.current
        let slot = currentIndexRef.current
        if (!songsRef.current[slot]) { dbg('handlePlayStage: kein Song an Slot', slot); return }

        isPlayingRequestRef.current = true
        noteHeard(false)
        setIsPlaying(false)         // ein laufender Ausschnitt wird ersetzt
        setStartingIdx(idx)
        setPlayerError(null)
        lastPlaySecondsRef.current = seconds
        allowPlaybackRef.current = true
        dbg(`handlePlayStage: ${seconds}s | slot=${slot}`)

        try {
            const knownUri = trackUriRef.current[slot]
            let result
            if (knownUri) {
                // gleicher Titel ab Einsetzpunkt (seek+resume); sonst per URI neu laden
                result = await player.replay({ uri: knownUri, seconds, isStale, startMs: baseRef.current, untilMs: baseRef.current + seconds * 1000 })
            } else {
                let tries = 0
                for (;;) {
                    const song = songsRef.current[slot]
                    if (!song) throw new Error('Keine weiteren Songs verfügbar.')
                    const canSkip = slot + 1 < songsRef.current.length && tries < 5
                    result = await player.startNew({
                        song: song.guestSong,          // Gast: Apple-Song aus der Liste
                        contextUri: song.playlistUri,
                        offset: song.offset,
                        seconds,
                        isStale,
                        startFrac: startPct === START_RANDOM ? Math.floor(Math.random() * 10) / 10 : startPct / 100,
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
            if (!knownUri) baseRef.current = result.startPos
            playRef.current = { startPos: result.startPos, startedAt: result.startedAt, untilMs: baseRef.current + seconds * 1000 }
            setIsPlaying(true)
            setHasPlayedCurrentSong(true)
            setStartNotice(null)
            maxHeardRef.current = Math.max(maxHeardRef.current, seconds)
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

    // Spielt an der aktuellen Stelle weiter bis zum Ende von Teil `idx` (nichts doppelt hören).
    // Klappt das Fortsetzen nicht, wird von vorn gespielt.
    const resumeStage = async (idx) => {
        if (isPlayingRequestRef.current) return
        spotifyService.activateAudio()
        if (!playerReady) {
            setPlayerError('Spotify Player noch nicht bereit. Bitte warte einen Moment.')
            return
        }
        const uri = trackUriRef.current[currentIndexRef.current]
        if (!uri) { handlePlayStage(idx); return }
        const gen = playGenRef.current
        const isStale = () => gen !== playGenRef.current
        const untilMs = baseRef.current + STAGES[idx].seconds * 1000

        isPlayingRequestRef.current = true
        noteHeard(false)
        setIsPlaying(false)
        setStartingIdx(idx)
        setPlayerError(null)
        allowPlaybackRef.current = true
        dbg(`resumeStage: bis ${STAGES[idx].seconds}s`)

        let fallback = false
        try {
            const result = await (guestRef.current ? appleClip : clip).resumeTo({ uri, untilMs, isStale })
            if (result.aborted || isStale()) return
            if (result.lost) { fallback = true; return }
            playRef.current = { startPos: result.startPos, startedAt: result.startedAt, untilMs }
            setIsPlaying(true)
            maxHeardRef.current = Math.max(maxHeardRef.current, STAGES[idx].seconds)
        } catch (e) {
            allowPlaybackRef.current = false
            if (!isStale()) setPlayerError(e.message || 'Wiedergabe fehlgeschlagen')
        } finally {
            if (!isStale()) {
                isPlayingRequestRef.current = false
                setStartingIdx(-1)
            }
        }
        if (fallback && !isStale()) {
            dbg('resumeStage: Fortsetzen nicht möglich → von vorn')
            handlePlayStage(idx)
        }
    }

    // Spielt nur Teil `idx` der Zeitleiste (z. B. 5–10 s)
    const playSegment = async (idx) => {
        if (isPlayingRequestRef.current) return
        spotifyService.activateAudio()
        if (!playerReady) {
            setPlayerError('Spotify Player noch nicht bereit. Bitte warte einen Moment.')
            return
        }
        const uri = trackUriRef.current[currentIndexRef.current]
        if (!uri) { handlePlayStage(idx); return }
        const gen = playGenRef.current
        const isStale = () => gen !== playGenRef.current
        const from = idx === 0 ? 0 : STAGES[idx - 1].seconds
        const startMs = baseRef.current + from * 1000
        const untilMs = baseRef.current + STAGES[idx].seconds * 1000

        isPlayingRequestRef.current = true
        noteHeard(false)
        setIsPlaying(false)
        setStartingIdx(idx)
        setPlayerError(null)
        allowPlaybackRef.current = true
        dbg(`playSegment: ${from}–${STAGES[idx].seconds}s`)

        try {
            const result = await (guestRef.current ? appleClip : clip).replay({ uri, seconds: STAGES[idx].seconds - from, isStale, startMs, untilMs })
            if (result.aborted || isStale()) return
            playRef.current = { startPos: result.startPos, startedAt: result.startedAt, untilMs }
            setIsPlaying(true)
            maxHeardRef.current = Math.max(maxHeardRef.current, STAGES[idx].seconds)
        } catch (e) {
            allowPlaybackRef.current = false
            if (!isStale()) setPlayerError(e.message || 'Wiedergabe fehlgeschlagen')
        } finally {
            if (!isStale()) {
                isPlayingRequestRef.current = false
                setStartingIdx(-1)
            }
        }
    }

    // In welchem Teil der Zeitleiste steht eine Position (ms ab Einsetzpunkt)?
    const partAt = (ms) => {
        const i = STAGES.findIndex(s => ms < s.seconds * 1000 - 50)
        return i < 0 ? STAGES.length - 1 : i
    }

    // Teil, der gerade läuft – nie hinter dem Ende des laufenden Ausschnitts (an der Grenze sonst kurz der nächste)
    const playingPart = () => {
        const p = playRef.current
        const at = partAt(livePosMs())
        return p ? Math.min(at, partAt(p.untilMs - baseRef.current - 100)) : Math.min(at, stage)
    }

    // Tipp auf einen freigeschalteten Teil: nur diesen hören (läuft er gerade → Pause)
    const handleSegmentTap = (idx) => {
        if (idx > stage || !hasPlayedCurrentSong) return
        if (isPlaying && playingPart() === idx) { stopPlayback(); return }
        playSegment(idx)
    }

    // Großer Play-Button: dort weiter, wo angehalten wurde – bis zum Ende des freigeschalteten Bereichs.
    // Steht man schon am Ende, geht es vom Einsetzpunkt los.
    const handlePlayToggle = () => {
        if (isPlaying) { stopPlayback(); return }
        const endMs = STAGES[stage].seconds * 1000
        if (hasPlayedCurrentSong && posRef.current > 0 && posRef.current < endMs - 400) resumeStage(stage)
        else handlePlayStage(stage)
    }

    // „+4 s“ usw.: nächsten Teil freischalten und genau dort weiterspielen, wo der letzte aufgehört hat
    const handleUnlockNext = () => {
        if (stage >= STAGES.length - 1 || isPlayingRequestRef.current) return
        const next = stage + 1
        setStage(next)
        const uri = trackUriRef.current[currentIndexRef.current]
        const untilMs = baseRef.current + STAGES[next].seconds * 1000
        const toFrontier = playRef.current && playRef.current.untilMs >= baseRef.current + STAGES[stage].seconds * 1000 - 50
        if (isPlaying && toFrontier && (guestRef.current ? appleClip : clip).extendTo({ uri, untilMs })) {
            // läuft bis zum bisherigen Ende: Ende einfach nach hinten schieben (spielt alle Abschnitte dazwischen)
            playRef.current = { ...playRef.current, untilMs }
            maxHeardRef.current = Math.max(maxHeardRef.current, STAGES[next].seconds)
            return
        }
        // am Ende des bisherigen Bereichs angehalten → nahtlos weiter; sonst genau den neuen Teil spielen
        if (!isPlaying && posRef.current >= STAGES[stage].seconds * 1000 - 400) resumeStage(next)
        else playSegment(next)
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
        resetTimeline()
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
        const earned = songScore({ stagePoints: STAGES[lockedStage ?? stage].points, correct, tip: tipGiven(tipResult) ? tipResult : null }).total
        const heardAtReveal = lockedStage !== null ? frozenHeardRef.current : maxHeardRef.current
        setPoints(prev => prev + earned)
        if (correct) {
            setScore(prev => prev + 1)
            if (heardAtReveal > 0) {
                sessionSecondsCorrectRef.current.push(heardAtReveal)
            }
        }
        lastPlaySecondsRef.current = null
        maxHeardRef.current = 0
        const newPlayed = playedCount + 1
        setPlayedCount(newPlayed)
        setIsRevealed(false)
        resetTimeline()
        setHasPlayedCurrentSong(false)
        const historyEntry = currentTrackInfo
            ? { name: currentTrackInfo.trackName, artist: currentTrackInfo.artist, albumImage: currentTrackInfo.imageUrl }
            : { name: 'Unbekannter Titel', artist: '', albumImage: null }
        setSongHistory(prev => [...prev, { song: historyEntry, correct, points: earned, tip: tipGiven(tipResult) ? tipResult : null }])
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

    // Songdaten für Tipp/Joker: geladene Daten, sonst das, was der Player kennt (dann ohne Jahr)
    const songMeta = () => {
        const id = currentTrackInfo?.trackId
        if (id && trackMeta?.id === id && !trackMeta.failed) return trackMeta
        return {
            id, name: currentTrackInfo?.trackName || '', year: null,
            artists: (currentTrackInfo?.artist || '').split(', ').filter(Boolean).map(name => ({ id: null, name }))
        }
    }
    const metaReady = !!currentTrackInfo && trackMeta?.id === currentTrackInfo.trackId

    // Joker einsetzen: Kosten sofort abziehen (Punktestand darf ins Minus)
    const handleUseJoker = (id) => {
        const j = JOKERS.find(x => x.id === id)
        if (!j || usedJokers.includes(id)) return
        setUsedJokers(prev => [...prev, id])
        setPoints(prev => prev - j.cost)
        setJokerSpent(prev => prev + j.cost)
        setJokerOpen(false)
    }

    // „Auflösen“: erst das Bonus-Fenster, dann aufdecken
    // Aufdecken: Punkte-Stufe einfrieren, danach sind alle Abschnitte kostenlos frei
    const revealSong = (result) => {
        setLockedStage(stage)
        frozenHeardRef.current = maxHeardRef.current
        setStage(STAGES.length - 1)
        setTipResult(result)
        setBonusOpen(false)
        setIsRevealed(true)
    }
    // Pro ohne Eingabe: aufdecken, zählt als nicht erraten
    const handleBonusSkip = () => revealSong({ artist: null, title: null, year: null, skipped: true })
    const handleBonusCheck = (tip) => revealSong(checkTip(tip, songMeta()))

    const handleAnswer = async (correct) => {
        if (isAnsweringRef.current) {
            dbg('handleAnswer: ignoriert (bereits am Antworten)')
            return
        }
        isAnsweringRef.current = true
        dbg(`handleAnswer: ${correct ? '✓ RICHTIG' : '✕ FALSCH'}`)
        const gen = playGenRef.current
        await stopPlayback()
        // Wertung kurz am Cover zeigen; Tipp auf das Cover überspringt die Wartezeit
        setVerdict(correct ? 'ok' : 'no')
        setIsRevealed(true)
        await new Promise((resolve) => {
            const t = setTimeout(resolve, 700)
            revealDoneRef.current = () => { clearTimeout(t); resolve() }
        })
        revealDoneRef.current = null
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
        appleClip.reset()
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
        setPoints(0)
        setJokerSpent(0)
        setIsPlaying(false)
        setHasPlayedCurrentSong(false)
        resetTimeline()
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

    const handleOpenSettings = () => setPhase(PHASES.SETTINGS)
    const closeEndSheet = useCallback(() => setConfirmClose(false), [])
    const closeResetSheet = useCallback(() => setConfirmReset(false), [])

    const handleOpenStats = () => {
        setResetState('idle')
        setPhase(PHASES.STATS)
        if (connected) loadStats()
    }

    // Startseite → Playlist-Auswahl (immer mit leerer Auswahl)
    const handleOpenPlaylists = () => {
        guestRef.current = false
        setGuest(false)
        resetSelection()
        setLoadingError(null)
        setPhase(PHASES.PLAYLISTS)
    }

    // Gastmodus: kuratierte Listen mit Apple-Hörproben, ohne Login
    const loadGuestLists = async () => {
        setGuestListsError(false)
        try { setGuestLists(await loadGuestIndex()) } catch (e) {
            console.error('[SS] Gast-Listen laden fehlgeschlagen:', e)
            setGuestListsError(true)
        }
    }
    const handleOpenGuest = () => {
        guestRef.current = true
        setGuest(true)
        resetSelection()
        setLoadingError(null)
        if (!guestLists) loadGuestLists()
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

    // Nach einer Runde den Hilfseintrag für die Zurück-Taste wieder entfernen –
    // aber nur einen, den diese Sitzung angelegt hat (nach einem Neuladen sonst ein Schritt zu weit zurück)
    const gameEntryRef = useRef(false)
    useEffect(() => {
        if (phase === PHASES.GAME) return
        if (gameEntryRef.current && window.history.state?.ssGame) window.history.back()
        gameEntryRef.current = false
    }, [phase])

    // Runde abbrechen (ohne Wertung) und zurück zur Startseite
    const endGame = async () => {
        setConfirmClose(false)
        await stopPlayback()
        resetGameState()
        resetSelection()
        setPhase(PHASES.HOME)
    }

    // Während ein Ausschnitt läuft: regelmäßig neu zeichnen (Fortschritt der Zeitleiste)
    const [, setFrame] = useState(0)
    useEffect(() => {
        if (phase !== PHASES.GAME || !isPlaying) return
        const id = setInterval(() => setFrame(f => f + 1), 100)
        return () => clearInterval(id)
    }, [phase, isPlaying])

    // Browser-Zurück während einer Runde: nicht abbrechen, sondern nachfragen
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        // Hilfseintrag nur einmal anlegen (React führt Effekte im Dev-Modus doppelt aus)
        if (!window.history.state?.ssGame) window.history.pushState({ ssGame: true }, '')
        gameEntryRef.current = true
        const onPop = () => {
            if (window.history.state?.ssGame) return      // landet noch auf dem Hilfseintrag: nichts zu tun
            window.history.pushState({ ssGame: true }, '')
            setConfirmClose(true)
        }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [phase])

    // Setup: eigene Playlists direkt beim Öffnen laden (häufigster Fall)
    useEffect(() => {
        if (phase === PHASES.PLAYLISTS && searchMode === 'mine' && !guestRef.current) handleLoadMyPlaylists()
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
    const rootClass = `${styles.srRoot} ${isDark ? theme.dark : theme.light}`
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
                    <h1 className={styles.srHeroTitle}>Identify</h1>
                    <p className={styles.srLead}>
                        Hör kurze Ausschnitte aus deinen Playlists – erst 1 Sekunde, dann 5, 10 und 30. Je früher du den Song erkennst, desto mehr Punkte. Im Pro-Modus holst du dir Bonuspunkte für Interpret, Titel und Jahr.
                    </p>
                </div>

                <div className={styles.srStack}>
                    {needsRelogin && (
                        <div className={styles.srNotice} role="status">
                            <span className={styles.srNoticeIcon}><IconRetry size={22} /></span>
                            <div>
                                <p className={styles.srNoticeTitle}>Neue Freigabe nötig</p>
                                <p className={styles.srNoticeText}>Spotify möchte kurz bestätigen, dass Identify deine Playlists lesen darf. Tippe auf „Spotify verbinden“.</p>
                            </div>
                        </div>
                    )}

                    {!connected && (
                        <button type="button" className={`${styles.srBtn} ${styles.srPrimary}`} onClick={handleSpotifyLogin} disabled={checking}>
                            <IconNote />{checking ? 'Verbindung wird geprüft …' : 'Spotify verbinden'}
                        </button>
                    )}

                    {connected && (
                        <button type="button" className={`${styles.srBtn} ${styles.srPrimary}`} onClick={handleOpenPlaylists}>Spiel starten</button>
                    )}

                    <button type="button" className={`${styles.srBtn} ${styles.srSecondary}`} onClick={handleOpenGuest}>Als Gast spielen</button>

                    <button type="button" className={`${styles.srBtn} ${styles.srSecondary}`} onClick={handleOpenSettings}>Einstellungen</button>

                    {connected ? (
                        <p className={styles.srStatus} role="status">
                            <span className={styles.srStatusDot} aria-hidden="true" />Spotify verbunden
                            <span aria-hidden="true">·</span>
                            <button type="button" className={`${styles.srBtn} ${styles.srStatusLink}`} onClick={handleDisconnect}>Verbindung trennen</button>
                        </p>
                    ) : (
                        !checking && <p className={styles.srFineRow}><IconInfo />Mit Spotify: Premium nötig. Als Gast: ohne Konto, 30-Sekunden-Ausschnitte.</p>
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

        let list = isMine ? myPlaylists : playlistResults
        let heading = isMine ? 'Deine Playlists' : (q && view === 'ok' ? `Treffer für „${q}“` : 'Suchergebnisse')
        if (guest) {
            if (guestListsError) view = 'error'
            else if (!guestLists) view = 'loading'
            else view = guestLists.length ? 'ok' : 'empty'
            list = (guestLists || []).map(l => ({ id: l.id, name: `${l.emoji ? l.emoji + ' ' : ''}${l.name}`, imageUrl: l.cover, trackCount: l.count }))
            heading = 'Listen'
        }

        return shell(
            <main className={styles.srMain}>
                <header className={`${styles.srSubHeader} ${styles.srPad}`}>
                    <button type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={() => setPhase(PHASES.HOME)} aria-label="Zurück"><IconBack /></button>
                    <h1 className={styles.srSubTitle}>{guest ? 'Listen' : 'Playlists'}</h1>
                    {themeBtn}
                </header>

                <div className={`${styles.srScroll} ${styles.srScrollFix}`}>
                    <p className={styles.srInfo}>{guest
                        ? 'Wähle eine oder mehrere Listen – gespielt werden 30-Sekunden-Ausschnitte, ganz ohne Konto'
                        : 'Wähle eine oder mehrere Playlists, aus denen du zufällige Songs erraten willst'}</p>

                    {!guest && <div className={styles.srTabs} role="tablist" aria-label="Playlist-Quelle">
                        <button type="button" role="tab" aria-selected={isMine} className={`${styles.srBtn} ${styles.srTab} ${isMine ? styles.srTabOn : ''}`}
                            onClick={() => { setSearchMode('mine'); handleLoadMyPlaylists() }}>
                            Meine Playlists
                        </button>
                        <button type="button" role="tab" aria-selected={!isMine} className={`${styles.srBtn} ${styles.srTab} ${!isMine ? styles.srTabOn : ''}`}
                            onClick={() => setSearchMode('playlist')}>
                            <IconSearch size={18} />Suchen
                        </button>
                    </div>}

                    {!guest && !isMine && (
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
                                <p className={styles.srEmptyTitle}>{guest ? 'Noch keine Listen' : (isMine ? 'Noch keine Playlists' : 'Nichts gefunden')}</p>
                                <p className={styles.srEmptyText}>
                                    {guest ? 'Hier kommen bald Listen dazu.' : (isMine ? 'In deinem Spotify-Konto gibt es noch keine Playlists. Such einfach nach anderen.' : `Zu „${q}“ gibt es keine Playlists. Versuch einen anderen Begriff.`)}
                                </p>
                                {isMine && !guest && (
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
                                <button type="button" className={`${styles.srBtn} ${styles.srOutline}`} onClick={() => (guest ? loadGuestLists() : handleLoadMyPlaylists(true))}>
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
                    <h1 className={styles.srSubTitle}>Spiel einrichten</h1>
                    {themeBtn}
                </header>

                <div className={styles.srCountPage}>
                    <div className={styles.srModeBox}>
                        <div className={styles.srTabs} role="radiogroup" aria-label="Spielmodus">
                            {MODES.map(m => (
                                <button key={m.id} type="button" role="radio" aria-checked={mode === m.id}
                                    className={`${styles.srBtn} ${styles.srTab} ${mode === m.id ? styles.srTabOn : ''}`}
                                    onClick={() => {
                                        setMode(m.id)
                                        try { localStorage.setItem(MODE_KEY, m.id) } catch { /* nur Komfort */ }
                                    }}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <p className={styles.srModeDesc}>{MODES.find(m => m.id === mode).desc}</p>
                    </div>

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

                    {!guest && <div className={styles.srStartBox}>
                        <div className={styles.srStartHead}>
                            <span id="sr-start-label" className={styles.srStartLabel}>Songs setzen ein</span>
                            <span className={styles.srStartValue}>{startLabel(startPct)}</span>
                        </div>
                        <input
                            type="range"
                            className={styles.srSlider}
                            min={0}
                            max={START_PCT_MAX}
                            step={10}
                            value={startPct}
                            onChange={e => {
                                const v = Number(e.target.value)
                                setStartPct(v)
                                try { localStorage.setItem(START_PCT_KEY, String(v)) } catch { /* nur Komfort */ }
                            }}
                            aria-labelledby="sr-start-label"
                            aria-valuetext={startPct === START_RANDOM ? 'zufällig' : (startPct === 0 ? 'von vorn' : `ab ${startPct} Prozent der Songlänge`)}
                            style={{ '--pct': `${(startPct / START_PCT_MAX) * 100}%` }}
                        />
                    </div>}
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
                            <span className={styles.srStartSub}>{[MODES.find(m => m.id === mode).label, guest ? `${k} ${k === 1 ? 'Liste' : 'Listen'}` : `${k} ${k === 1 ? 'Playlist' : 'Playlists'}`, `${songCount} Songs`, !guest && startPct > 0 && startLabel(startPct)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className={styles.srStartIcon}><IconPlay size={20} /></span>
                    </button>
                </div>
            </main>
        )
    }

    // ─── Einstellungen (Menü) ────────────────────────────────────────────────
    if (phase === PHASES.SETTINGS) {
        return shell(
            <main className={styles.srMain}>
                <header className={`${styles.srSubHeader} ${styles.srPad}`}>
                    <button type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={() => setPhase(PHASES.HOME)} aria-label="Zurück"><IconBack /></button>
                    <h1 className={styles.srSubTitle}>Einstellungen</h1>
                    {themeBtn}
                </header>
                <div className={styles.srScroll}>
                    <ul className={styles.srMenu}>
                        <li>
                            <button type="button" className={`${styles.srBtn} ${styles.srMenuItem}`} onClick={handleOpenStats}>
                                <span className={styles.srMenuIcon}><IconClock size={22} /></span>
                                <span className={styles.srMenuText}>
                                    <span className={styles.srMenuTitle}>Statistik</span>
                                    <span className={styles.srMenuSub}>Deine Spiele, Trefferquote und Bestwerte</span>
                                </span>
                                <IconNext />
                            </button>
                        </li>
                    </ul>
                </div>
            </main>
        )
    }

    // ─── Statistik ───────────────────────────────────────────────────────────
    if (phase === PHASES.STATS) {
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
                    <button type="button" className={`${styles.srBtn} ${styles.srIconBtn}`} onClick={() => setPhase(PHASES.SETTINGS)} aria-label="Zurück"><IconBack /></button>
                    <h1 className={styles.srSubTitle}>Statistik</h1>
                    {themeBtn}
                </header>
                <div className={styles.srScroll}>
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
                            <p className={styles.srFineSm}>
                                {resetState === 'done' ? 'Deine Statistik wurde zurückgesetzt.' : 'Noch keine Spiele. Nach deiner ersten Runde erscheint hier deine Statistik.'}
                            </p>
                        )
                    )}
                    {resetState === 'error' && (
                        <p className={styles.srToast} role="status">Die Statistik konnte nicht zurückgesetzt werden. Bitte versuch es nochmal.</p>
                    )}
                </div>
                {connected && statsState === 'ready' && games > 0 && (
                    <div className={styles.srFooter}>
                        <button ref={resetBtnRef} type="button" className={`${styles.srBtn} ${styles.srResetBtn}`} onClick={() => setConfirmReset(true)}>
                            Statistiken zurücksetzen
                        </button>
                    </div>
                )}
                <ConfirmSheet
                    open={confirmReset}
                    title="Statistiken zurücksetzen?"
                    text="Alle Spiele und Werte werden gelöscht. Das kann nicht rückgängig gemacht werden."
                    cancelLabel="Abbrechen"
                    confirmLabel="Zurücksetzen"
                    onCancel={closeResetSheet}
                    onConfirm={resetStats}
                    returnFocusRef={resetBtnRef}
                    busy={resetState === 'busy'}
                />
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
        const starting = startingIdx >= 0
        const busy = connecting || starting || !!verdict
        const headSec = livePosMs() / 1000                          // Abspielposition
        const heardSec = Math.max(heardRef.current / 1000, headSec)  // so weit gehört
        const playPart = playingPart()
        const isLast = stage >= STAGES.length - 1
        const nextStep = isLast ? 0 : STAGES[stage + 1].seconds - STAGES[stage].seconds
        const canAct = hasPlayedCurrentSong && !connecting && !verdict
        const canUnlock = hasPlayedCurrentSong && !isLast && !busy && !isRevealed
        const pointsStage = lockedStage ?? stage
        const stagePoints = STAGES[pointsStage].points
        const meta = songMeta()
        const year = meta.year
        const tip = tipGiven(tipResult) ? tipResult : null
        const tipHit = tipAnyHit(tip)
        const tipSkipped = !!tipResult?.skipped
        const okPoints = songScore({ stagePoints, correct: true, tip }).total
        const jokerImg = usedJokers.includes('blur') ? currentTrackInfo?.imageUrl : null
        const hint = usedJokers.includes('letters') && meta.name ? titleHint(meta.name) : null
        const decade = usedJokers.includes('decade') ? decadeLabel(year) : null
        const jokerUnavailable = [!year && 'decade', !meta.name && 'letters', !currentTrackInfo?.imageUrl && 'blur'].filter(Boolean)
        const canJoker = hasPlayedCurrentSong && !isRevealed && !verdict && metaReady
        const openBonus = () => {
            if (!canAct || isRevealed) return
            if (mode === 'pro') setBonusOpen(true)
            else revealSong(null)      // Quick: ohne Bonus-Fenster aufdecken
        }
        const friendlyError = playerError && (/device not found/i.test(playerError)
            ? { title: 'Der Player ist noch nicht bereit', text: 'Kurz warten und nochmal tippen.' }
            : { title: 'Abspielen hat nicht geklappt', text: playerError })
        const songNo = `Song ${playedCount + 1} von ${targetCount}`
        const playLabel = isPlaying ? 'Pause' : `Bis ${STAGES[stage].long} abspielen`

        return shell(
            <main className={`${styles.srMain} ${styles.srPad} ${styles.srGame}`}>
                <header className={styles.srGameHead}>
                    <button ref={closeBtnRef} type="button" className={`${styles.srBtn} ${styles.srIconBtn} ${styles.srHeadBtn}`} onClick={() => setConfirmClose(true)} aria-label="Spiel beenden" title="Spiel beenden"><IconX /></button>
                    <div className={styles.srProgressBox}>
                        <span className={styles.srSongNo}>{songNo}</span>
                        <div role="progressbar" aria-label={songNo} aria-valuemin="1" aria-valuemax={targetCount} aria-valuenow={playedCount + 1} className={styles.srSegs}>
                            {Array.from({ length: targetCount }, (_, i) => (
                                <span key={i} className={`${styles.srSeg} ${i < playedCount ? (songHistory[i]?.correct ? styles.srSegOk : styles.srSegNo) : (i === playedCount ? styles.srSegNow : '')}`} />
                            ))}
                        </div>
                    </div>
                    <span className={styles.srPoints} role="status" aria-label={`${points} Punkte`}>
                        {points}<small>P</small>
                    </span>
                </header>

                {startNotice && <p className={styles.srToast} role="status">{startNotice}</p>}

                <div className={styles.srStage}>
                    <div
                        className={`${styles.srCardGame} ${!isRevealed ? styles.srSkelGame : ''} ${(!isRevealed && (isPlaying || starting || connecting)) ? styles.srPulse : ''} ${((!isRevealed && canAct) || verdict) ? styles.srCardTap : ''} ${verdict === 'ok' ? styles.srVerdictOk : ''} ${verdict === 'no' ? styles.srVerdictNo : ''}`}
                        onClick={() => {
                            if (verdict) { revealDoneRef.current?.(); return }
                            if (!isRevealed && canAct) openBonus()
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
                        ) : jokerImg ? (
                            <div role="img" aria-label="Verschwommenes Albumcover (Joker)" className={`${styles.srCoverFill} ${styles.srCoverBlur}`}>
                                <img src={jokerImg} alt="" />
                            </div>
                        ) : (
                            <span className={styles.srSkelQ} role="img" aria-label="Verdecktes Albumcover">?</span>
                        )}
                    </div>

                    <div className={styles.srTitleArea}>
                        {isRevealed ? (
                            <>
                                <h2 className={styles.srSongTitle} title={currentTrackInfo?.trackName || ''}>{currentTrackInfo?.trackName || 'Titel wird geladen …'}</h2>
                                <p className={styles.srSongArtist}>{[currentTrackInfo?.artist, year].filter(Boolean).join(' · ')}</p>
                                {tip && (
                                    <div className={styles.srTipMarks}>
                                        {[['title', 'Titel'], ['artist', 'Interpret'], ['year', 'Jahr']].filter(([k]) => tip[k] !== null).map(([k, label]) => (
                                            <span key={k} className={`${styles.srTipMark} ${tip[k] ? styles.srTipMarkOk : styles.srTipMarkNo}`}>
                                                {tip[k] ? <IconCheck size={14} w={3.2} /> : <IconX size={13} w={3.2} />}{label}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (hint || decade) ? (
                            <div className={styles.srHints}>
                                {hint && <p className={styles.srHintTitle} aria-label={`Anfangsbuchstaben: ${hint}`}>{hint}</p>}
                                {decade && <span className={styles.srHintChip}>{decade}</span>}
                            </div>
                        ) : (
                            <div role="img" aria-label="Titel und Interpret sind verdeckt" className={styles.srMasks}>
                                <span style={{ width: 196, height: 16 }} /><span style={{ width: 124, height: 12 }} />
                            </div>
                        )}
                    </div>
                </div>

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

                {/* Zeitleiste: 4 Teile, gesperrte gestrichelt, Orange = so weit gehört; freigeschaltete Teile einzeln abspielbar */}
                <div className={styles.srTimeline} role="group" aria-label={`Freigeschaltet bis ${STAGES[stage].long}, gehört ${Math.floor(heardSec)} Sekunden`}>
                    {STAGES.map((s, i) => {
                        const from = i === 0 ? 0 : STAGES[i - 1].seconds
                        const span = s.seconds - from
                        const fill = Math.max(0, Math.min(1, (heardSec - from) / span))
                        const locked = i > stage
                        const playingHere = isPlaying && playPart === i
                        // Positionsstrich: zeigt, wo gerade gespielt wird bzw. angehalten wurde (wenn nicht ganz vorn an der Hörgrenze)
                        const showHead = !locked && headSec >= from && headSec < s.seconds && (isPlaying || headSec < heardSec - 0.3) && headSec > 0
                        const label = locked ? `${from}–${s.seconds} Sekunden, noch gesperrt` : (playingHere ? `${from}–${s.seconds} Sekunden pausieren` : `Nur ${from}–${s.seconds} Sekunden abspielen`)
                        return (
                            <button key={s.label} type="button" onClick={() => handleSegmentTap(i)}
                                disabled={locked || !hasPlayedCurrentSong || busy} aria-label={label} title={locked ? undefined : label}
                                className={`${styles.srBtn} ${styles.srTlPart} ${playingHere ? styles.srTlPartOn : ''}`}>
                                <span className={`${styles.srTlBar} ${locked ? styles.srTlLocked : ''}`}>
                                    {!locked && <span className={styles.srTlFill} style={{ width: `${fill * 100}%` }} />}
                                    {showHead && <span className={styles.srTlHead} style={{ left: `${((headSec - from) / span) * 100}%` }} />}
                                </span>
                                <span className={`${styles.srTlLabel} ${i === stage ? styles.srTlLabelNow : ''}`}>{s.label}</span>
                            </button>
                        )
                    })}
                </div>

                <div className={styles.srControls}>
                    <button ref={jokerBtnRef} type="button" className={`${styles.srBtn} ${styles.srCtrlSide} ${usedJokers.length ? styles.srCtrlJokerUsed : ''}`} onClick={() => setJokerOpen(true)}
                        disabled={!canJoker} aria-label="Joker" title="Joker">
                        <IconJoker size={26} />
                        {usedJokers.length > 0 && <span className={styles.srJokerBadge}>{usedJokers.length}</span>}
                    </button>
                    <button type="button" className={`${styles.srBtn} ${styles.srCtrlPlay}`} onClick={handlePlayToggle}
                        disabled={busy} aria-label={playLabel} title={playLabel}>
                        {starting ? <IconWave size={30} /> : (isPlaying ? <IconPause size={32} /> : <IconPlay size={32} />)}
                    </button>
                    <button type="button" className={`${styles.srBtn} ${styles.srCtrlSide} ${styles.srCtrlMore}`} onClick={handleUnlockNext}
                        disabled={!canUnlock}
                        aria-label={lockedStage !== null ? `Aufgelöst bei ${STAGES[lockedStage].long}` : (isLast ? 'Alle 30 Sekunden freigeschaltet' : `${nextStep} Sekunden mehr hören`)}>
                        {lockedStage !== null ? STAGES[lockedStage].label : (isLast ? '30 s' : `+${nextStep} s`)}
                    </button>
                </div>

                <div className={styles.srGameFoot}>
                    {!isRevealed ? (
                        <button ref={solveBtnRef} type="button" onClick={openBonus} disabled={!canAct}
                            className={`${styles.srBtn} ${styles.srSolve}`}>
                            <IconEye />Auflösen
                        </button>
                    ) : (
                        <>
                            {tip && <p className={styles.srTipSummary} role="status">{tipSummary(tip)}{tipHit ? ` · ${okPoints} ${okPoints === 1 ? 'Punkt' : 'Punkte'}` : ''}</p>}
                            {tipSkipped && <p className={styles.srTipSummary} role="status">Nichts getippt · 0 Punkte</p>}
                            <div className={styles.srRate}>
                                <button type="button" onClick={() => handleAnswer(false)} disabled={!!verdict || (tip && tipHit)} className={`${styles.srBtn} ${styles.srRateNo}`}><IconX size={20} w={2.8} />Nicht erraten</button>
                                <button type="button" onClick={() => handleAnswer(true)} disabled={!!verdict || tipSkipped || (tip && !tipHit)} className={`${styles.srBtn} ${styles.srRateOk}`}><IconCheck size={22} />Erraten · +{okPoints}</button>
                            </div>
                        </>
                    )}
                </div>

                <BonusSheet
                    key={currentIndex}
                    open={bonusOpen}
                    svc={guest ? appleSearch : spotifyService}
                    onClose={() => setBonusOpen(false)}
                    onSkip={handleBonusSkip}
                    onCheck={handleBonusCheck}
                    busy={!metaReady}
                    yearAvailable={!!year}
                    isPlaying={isPlaying}
                    onPlayToggle={handlePlayToggle}
                    returnFocusRef={solveBtnRef}
                />
                <JokerSheet
                    open={jokerOpen}
                    onClose={() => setJokerOpen(false)}
                    onUse={handleUseJoker}
                    used={usedJokers}
                    unavailable={jokerUnavailable}
                    returnFocusRef={jokerBtnRef}
                />

                <ConfirmSheet
                    open={confirmClose}
                    title="Spiel beenden?"
                    text="Die laufende Runde wird abgebrochen und nicht gewertet."
                    cancelLabel="Weiterspielen"
                    confirmLabel="Spiel beenden"
                    onCancel={closeEndSheet}
                    onConfirm={endGame}
                    returnFocusRef={closeBtnRef}
                />
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
        const tipCount = (k) => songHistory.filter(h => h.tip?.[k] === true).length
        const tipLine = [['title', 'Titel'], ['artist', 'Interpret'], ['year', 'Jahr']]
            .map(([k, label]) => [label, tipCount(k)]).filter(([, n]) => n > 0)
            .map(([label, n]) => `${n}× ${label}`).join(' · ')
        const pointsSub = [
            jokerSpent > 0 && `Joker: −${jokerSpent}`,
            tipLine && `Tipps richtig: ${tipLine}`
        ].filter(Boolean).join(' · ') || 'Je früher erraten, desto mehr'
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
                                {segs.map((ok, i) => <span key={i} className={ok ? styles.srResSegOk : styles.srResSegNo} />)}
                            </div>
                        )}
                    </section>

                    {statsSaveFailed && (
                        <p className={styles.srToast} role="status">Deine Statistik konnte diesmal nicht gespeichert werden.</p>
                    )}

                    {total > 0 && (
                        <section className={styles.srAvg}>
                            <span className={styles.srAvgIcon}><IconStar /></span>
                            <p className={styles.srAvgText}>
                                <span className={styles.srMuted}>Deine Punkte</span>
                                <span className={styles.srAvgNum}>{points} {Math.abs(points) === 1 ? 'Punkt' : 'Punkte'}</span>
                                <span className={styles.srAvgSub}>{pointsSub}</span>
                            </p>
                        </section>
                    )}

                    {avg !== null && (
                        <section className={styles.srAvg}>
                            <span className={styles.srAvgIcon}><IconClock /></span>
                            <p className={styles.srAvgText}>
                                <span className={styles.srMuted}>Erratene Songs: im Schnitt nach</span>
                                <span className={styles.srAvgNum}>{avg.toFixed(1).replace('.', ',')} Sekunden</span>
                                <span className={styles.srAvgSub}>aus {secondsArr.length} {secondsArr.length === 1 ? 'erratenem Song' : 'erratenen Songs'}</span>
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
