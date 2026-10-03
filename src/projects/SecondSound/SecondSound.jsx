import { useState, useEffect, useRef } from 'react'
import { getApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc, increment } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'
import '../../firebase.js'
import spotifyService from '../../services/spotifyService'
import { log, warn } from '../../utils/logger.js'
import styles from './SecondSound.module.css'

const getDeviceId = () => {
    let id = localStorage.getItem('ss_deviceId')
    if (!id) {
        id = 'ss_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
        localStorage.setItem('ss_deviceId', id)
    }
    return id
}

const PHASES = {
    LOGIN: 'login',
    SETUP: 'setup',
    LOADING: 'loading',
    GAME: 'game',
    RESULTS: 'results'
}

const RESULT_MESSAGES = [
    { minPercent: 90, emoji: '🏆', title: 'Absoluter Musikprofi!', sub: 'Du erkennst Songs schon am ersten Ton. Respect!' },
    { minPercent: 70, emoji: '🎸', title: 'Sehr beeindruckend!', sub: 'Du kennst deine Playlists wirklich gut.' },
    { minPercent: 50, emoji: '👍', title: 'Solide Leistung!', sub: 'Da ist noch Luft nach oben.' },
    { minPercent: 30, emoji: '😅', title: 'Ausbaufähig...', sub: 'Vielleicht öfter mal in die Playlist reinhören?' },
    { minPercent: 0, emoji: '😬', title: 'Oje...', sub: 'Diese Playlists kennt wohl jemand noch nicht so gut.' }
]

const SunIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5"/>
        <line x1="12" y1="2" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="22"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="2" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="22" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
)

const MoonIcon = () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
)

export default function SecondSound({ onBack }) {
    const [phase, setPhase] = useState(PHASES.LOGIN)
    const [playerReady, setPlayerReady] = useState(false)
    const [playerError, setPlayerError] = useState(null)
    const [allTimeStats, setAllTimeStats] = useState(null)
    const [isDark, setIsDark] = useState(() => localStorage.getItem('ss_theme') !== 'light')
    const dbRef = useRef(null)
    const deviceId = useRef(getDeviceId())

    const toggleTheme = () => {
        setIsDark(prev => {
            const next = !prev
            localStorage.setItem('ss_theme', next ? 'dark' : 'light')
            return next
        })
    }

    const wrapperClass = `${styles.wrapper} ${isDark ? '' : styles.light}`

    const ThemeToggle = () => (
        <button className={styles.themeToggle} onClick={toggleTheme} aria-label="Theme wechseln">
            <div className={styles.toggleKnob}>
                {isDark ? <MoonIcon /> : <SunIcon />}
            </div>
        </button>
    )

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
    const [sizeDetectionProgress, setSizeDetectionProgress] = useState(null)
    const playlistSizeCache = useRef({})
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingError, setLoadingError] = useState(null)
    const [loadingStatus, setLoadingStatus] = useState('')
    const [isAuthError, setIsAuthError] = useState(false)
    const [needsRelogin, setNeedsRelogin] = useState(false)

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


    const timerRef = useRef(null)
    const fetchGenRef = useRef(0)               // bricht veraltete getPlaybackState-Callbacks ab
    const currentIndexRef = useRef(0)
    const isAnsweringRef = useRef(false)        // verhindert Doppel-Klick auf Antwort-Buttons
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

    const saveAndLoadStats = async (finalScore, finalPlayed, totalSeconds, countWithTime) => {
        const db = dbRef.current
        if (!db) return
        // Firestore-Regeln verlangen einen (anonymen) Login
        const auth = getAuth(getApp())
        await auth.authStateReady()
        if (!auth.currentUser) {
            try { await signInAnonymously(auth) } catch (e) {
                console.error('Anonymer Login fehlgeschlagen:', e)
                return
            }
        }
        const ref = doc(db, 'userStats', deviceId.current)
        const percent = finalPlayed > 0 ? Math.round((finalScore / finalPlayed) * 100) : 0
        try {
            const snap = await getDoc(ref)
            const currentBest = snap.exists() ? (snap.data().bestPercent || 0) : 0
            const update = {
                songsCorrect: increment(finalScore),
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
        }
    }

    // OAuth callback + initial login check
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
                    setPhase(PHASES.SETUP)
                } catch (e) {
                    console.error('Spotify Callback Fehler:', e)
                    setPhase(PHASES.LOGIN)
                }
            })()
        } else {
            ;(async () => {
                const loggedIn = await spotifyService.isUserLoggedIn()
                if (!loggedIn) return
                // Prüfen ob Token Playlist-Zugriff hat
                const hasScope = await spotifyService.testPlaylistAccess()
                log('[SecondSound] Playlist-Scope beim Start:', hasScope)
                if (hasScope) {
                    setNeedsRelogin(false)
                    setPhase(PHASES.SETUP)
                } else {
                    // Token vorhanden aber ohne Playlist-Scope → Neu-Login nötig
                    setNeedsRelogin(true)
                    setPhase(PHASES.LOGIN)
                }
            })()
        }
    }, [])

    // Web Playback SDK: bei GAME verbinden. Nach LOADING kann der Player schon
    // durch ensurePlaybackPlayerReady() existieren – dann nicht neu erzeugen.
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        setPlayerReady(false)
        setPlayerError(null)
        if (spotifyService.isPlaybackReady()) {
            setPlayerReady(true)
            return () => {
                spotifyService.disconnectPlayer()
                setPlayerReady(false)
            }
        }
        spotifyService.initPlaybackPlayer(
            () => setPlayerReady(true),
            (msg) => setPlayerError(msg || 'Spotify Player konnte nicht gestartet werden. Spotify Premium erforderlich.'),
            { activate: true }
        )
        return () => {
            spotifyService.disconnectPlayer()
            setPlayerReady(false)
        }
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

    const handleSearchPlaylists = async () => {
        if (!playlistQuery.trim()) return
        setSearchLoading(true)
        setPlaylistResults([])
        try {
            const results = await spotifyService.searchPlaylists(playlistQuery.trim(), 10)
            setPlaylistResults(results)
        } catch (e) {
            console.error('Playlist-Suche fehlgeschlagen:', e)
        } finally {
            setSearchLoading(false)
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

    const handleStartGame = async () => {
        if (selectedPlaylists.length === 0) return
        setPhase(PHASES.LOADING)
        setLoadingError(null)
        setLoadingStatus('Playlist wird vorbereitet…')

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
            setLoadingStatus('Spotify-Player wird bereitgestellt…')
            await spotifyService.ensurePlaybackPlayerReady()

            const slots = []

            for (let pIdx = 0; pIdx < selectedPlaylists.length; pIdx++) {
                const playlist = selectedPlaylists[pIdx]
                const uri = `spotify:playlist:${playlist.id}`

                // Größe ermitteln: Cache → getPlaylistInfo (falls > 0) → detectPlaylistSize
                let count = playlistSizeCache.current[playlist.id] || 0

                if (!count && playlist.trackCount > 0 && playlist.trackCount >= songCount * 2) {
                    count = playlist.trackCount
                    log(`[SS] "${playlist.name}": nutze gecachte trackCount=${count} aus Auswahl`)
                }

                if (!count) {
                    try {
                        const info = await spotifyService.getPlaylistInfo(playlist.id)
                        if (info.trackCount >= songCount * 2) {
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
                    setSizeDetectionProgress({
                        playlistName: playlist.name,
                        playlistIndex: pIdx + 1,
                        totalPlaylists: selectedPlaylists.length,
                        step: 0,
                        totalSteps: 18,
                        label: 'Starte Suche…'
                    })
                    try {
                        count = await spotifyService.detectPlaylistSize(uri, {
                            onProgress: (p) => {
                                setSizeDetectionProgress(prev => ({ ...prev, ...p }))
                            }
                        })
                        log(`[SS] "${playlist.name}": Live-Detection ermittelt ${count} Tracks`)
                    } catch (e) {
                        console.error(`[SS] Live-Detection fehlgeschlagen:`, e.message)
                        // Keine geratene Größe: sonst entstehen Offsets, die es nicht gibt (oder 1 Song)
                        throw new Error(`„${playlist.name}": ${e.message}`)
                    }
                }

                if (count > 1) playlistSizeCache.current[playlist.id] = count

                const poolSize = Math.min(count, songCount * 3)
                const allPositions = Array.from({ length: count }, (_, i) => i)
                const positions = fisherYates(allPositions).slice(0, poolSize)
                positions.forEach(offset => slots.push({ playlistUri: uri, offset }))
                log(`[SS] "${playlist.name}": trackCount=${count}, poolSize=${poolSize}, offsets=[${positions.slice(0, 20).join(',')}${positions.length > 20 ? ',…' : ''}]`)
            }

            setSizeDetectionProgress(null)

            // Sicherstellen, dass vor dem ersten Klick nichts mehr läuft
            allowPlaybackRef.current = false
            await spotifyService.pauseLocalPlayer()
            await spotifyService.pausePlayback().catch(() => {})

            if (slots.length === 0) {
                setLoadingError('Keine Playlists verfügbar. Bitte eine Playlist auswählen.')
                setPhase(PHASES.SETUP)
                return
            }

            const shuffled = fisherYates(slots)
            log(`[SS] Spiel gestartet – ${shuffled.length} Slots, Ziel: ${songCount}`)

            fetchGenRef.current = 0
            songsRef.current = shuffled
            trackUriRef.current = {}
            sessionSecondsCorrectRef.current = []
            lastPlaySecondsRef.current = null

            setSongs(shuffled)
            currentIndexRef.current = 0
            setCurrentIndex(0)
            setPlayedCount(0)
            setTargetCount(songCount)
            setIsRevealed(false)
            setCurrentTrackInfo(null)
            setScore(0)
            setIsPlaying(false)
            setSongHistory([])
            setHistoryOpen(false)
            setPhase(PHASES.GAME)
        } catch (e) {
            console.error('[SS] Fehler beim Starten:', e)
            setSizeDetectionProgress(null)
            setLoadingError(e.message || 'Fehler beim Starten des Spiels.')
            setPhase(PHASES.SETUP)
        }
    }

    const dbg = (...args) => log('[SS]', ...args)

    const stopPlayback = async () => {
        dbg('stopPlayback aufgerufen')
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        allowPlaybackRef.current = false
        setIsPlaying(false)
        await spotifyService.pauseLocalPlayer()
        await spotifyService.pausePlayback().catch(() => {})
    }

    const handlePlayFor = async (seconds) => {
        dbg(`handlePlayFor: ${seconds}s | currentIndex=${currentIndex}`)
        if (isPlayingRequestRef.current) {
            dbg('handlePlayFor: ignoriert (Request bereits aktiv)')
            return
        }
        if (!playerReady) {
            setPlayerError('Spotify Player noch nicht bereit. Bitte warte einen Moment.')
            return
        }

        const song = songs[currentIndex]
        if (!song) {
            dbg('handlePlayFor: kein Song an currentIndex', currentIndex)
            return
        }

        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }

        lastPlaySecondsRef.current = seconds
        isPlayingRequestRef.current = true
        allowPlaybackRef.current = true

        try {
            // Erstes Abspielen: Playlist+Offset (Shuffle aus). Danach immer genau derselbe Titel per URI,
            // sonst wählt Spotify bei aktivem Shuffle bei jedem Klick einen neuen Song.
            const knownUri = trackUriRef.current[currentIndex]
            if (knownUri) {
                await spotifyService.playUriOnPlayer(knownUri)
            } else {
                await spotifyService.playContextAtOffset(song.playlistUri, song.offset, undefined, { shuffleOff: true })
                // Nicht abwarten: der Auto-Pause-Timer darf dadurch nicht später starten
                const slot = currentIndex
                spotifyService.waitForLocalTrackUri().then(uri => {
                    if (uri) trackUriRef.current[slot] = uri
                    else warn(`[SS] Keine Track-URI für Slot ${slot} erhalten`)
                })
            }
            isPlayingRequestRef.current = false
            setIsPlaying(true)
            setHasPlayedCurrentSong(true)
            setPlayerError(null)

            // Einmalig nach 700ms Track-Info holen – kein Warte-Loop, kein Auto-Skip
            const gen = ++fetchGenRef.current
            setTimeout(async () => {
                if (fetchGenRef.current !== gen) return
                const state = await spotifyService.getPlaybackState().catch(() => null)
                if (fetchGenRef.current !== gen || !state) return
                dbg(`Track erkannt: "${state.trackName}" von "${state.artist}" (id=${state.trackId})`)
                setCurrentTrackInfo(state)
            }, 700)

            if (seconds !== null) {
                timerRef.current = setTimeout(async () => {
                    dbg(`Auto-Pause nach ${seconds}s`)
                    allowPlaybackRef.current = false
                    await spotifyService.pauseLocalPlayer()
                    await spotifyService.pausePlayback().catch(() => {})
                    setIsPlaying(false)
                    timerRef.current = null
                }, seconds * 1000)
            }
        } catch (e) {
            isPlayingRequestRef.current = false
            allowPlaybackRef.current = false
            dbg('handlePlayFor Fehler:', e.message)
            setPlayerError(e.message || 'Wiedergabe fehlgeschlagen')
            setIsPlaying(false)
        }
    }

    // Rückt zum nächsten Song vor – zählt den Song als gespielt
    const advanceAfterAnswer = (correct) => {
        dbg(`advanceAfterAnswer: correct=${correct} | currentIndex=${currentIndex} | playedCount=${playedCount} | targetCount=${targetCount}`)
        dbg(`  aktueller Track: "${currentTrackInfo?.trackName}" von "${currentTrackInfo?.artist}"`)
        fetchGenRef.current++       // veraltete Polls abbrechen
        allowPlaybackRef.current = false
        isAnsweringRef.current = false
        isPlayingRequestRef.current = false
        if (correct) {
            setScore(prev => prev + 1)
            if (lastPlaySecondsRef.current != null) {
                sessionSecondsCorrectRef.current.push(lastPlaySecondsRef.current)
            }
        }
        lastPlaySecondsRef.current = null
        const newPlayed = playedCount + 1
        setPlayedCount(newPlayed)
        setIsRevealed(false)
        setMaxUnlockedIndex(0)
        setHasPlayedCurrentSong(false)
        const historyEntry = currentTrackInfo
            ? { name: currentTrackInfo.trackName, artist: currentTrackInfo.artist, albumImage: currentTrackInfo.imageUrl }
            : null
        if (historyEntry) {
            setSongHistory(prev => [...prev, { song: historyEntry, correct }])
        }
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
        await stopPlayback()
        advanceAfterAnswer(correct)
        // wird in advanceAfterAnswer nach dem State-Update nicht zurückgesetzt –
        // das neue Lied setzt es zurück
    }

    const handleNewRound = () => {
        setSongs([])
        setCurrentIndex(0)
        setPlayedCount(0)
        setIsRevealed(false)
        setCurrentTrackInfo(null)
        setScore(0)
        setIsPlaying(false)
        setHasPlayedCurrentSong(false)
        setMaxUnlockedIndex(0)
        setLoadingError(null)
        lastPlaySecondsRef.current = null
        sessionSecondsCorrectRef.current = []
        songsRef.current = []
        trackUriRef.current = {}
        setSongHistory([])
        setHistoryOpen(false)
        setPhase(PHASES.SETUP)
    }

    const handleBack = async () => {
        await stopPlayback()
        spotifyService.disconnectPlayer()
        onBack()
    }

    const getResultMessage = () => {
        const percent = playedCount > 0 ? (score / playedCount) * 100 : 0
        return RESULT_MESSAGES.find(m => percent >= m.minPercent) || RESULT_MESSAGES[RESULT_MESSAGES.length - 1]
    }

    // Setup: eigene Playlists direkt beim Öffnen laden (häufigster Fall)
    useEffect(() => {
        if (phase === PHASES.SETUP && searchMode === 'mine') handleLoadMyPlaylists()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    const currentSong = songs[currentIndex] // {playlistUri, offset, playlistName, playlistImage}

    // ─── Login ───────────────────────────────────────────────────────────────
    if (phase === PHASES.LOGIN) {
        return (
            <div className={wrapperClass}>
                <ThemeToggle />
                <div className={styles.bg} />
                <div className={`${styles.uxPage} ${styles.uxCenterPage}`}>
                    <div className={styles.uxLogo}>🎧</div>
                    <h1 className={styles.uxTitle}>Song raten</h1>
                    <p className={styles.uxLead}>
                        Hör einen Song nur 1, 5, 10 oder 30 Sekunden lang – und rate, welcher es ist.
                    </p>

                    {needsRelogin && (
                        <div className={styles.uxNotice}>
                            Wir brauchen eine neue Freigabe von Spotify, um deine Playlists zu lesen. Tippe unten auf „Mit Spotify anmelden“.
                        </div>
                    )}

                    <button className={styles.uxPrimary} onClick={handleSpotifyLogin}>
                        Mit Spotify anmelden
                    </button>
                    <p className={styles.uxFine}>Du brauchst Spotify Premium.</p>

                    <button className={styles.uxLink} onClick={handleBack}>← Zurück zum Menü</button>
                </div>
            </div>
        )
    }

    // ─── Setup ───────────────────────────────────────────────────────────────
    if (phase === PHASES.SETUP) {
        const countOptions = [5, 10, 15, 20]
        const isSelected = (id) => selectedPlaylists.some(p => p.id === id)
        const togglePlaylist = (p) => (isSelected(p.id) ? handleRemovePlaylist(p.id) : handleAddPlaylist(p))
        const visibleList = searchMode === 'mine' ? myPlaylists : playlistResults
        const playlistRow = (p) => (
            <button
                key={p.id}
                className={`${styles.uxItem} ${isSelected(p.id) ? styles.uxItemOn : ''}`}
                onClick={() => togglePlaylist(p)}
                aria-pressed={isSelected(p.id)}
            >
                {p.imageUrl
                    ? <img src={p.imageUrl} alt="" className={styles.uxThumb} />
                    : <div className={styles.uxThumb}>🎵</div>}
                <span className={styles.uxItemText}>
                    <span className={styles.uxItemName}>{p.name}</span>
                    <span className={styles.uxItemMeta}>
                        {[searchMode === 'playlist' ? p.owner : '', p.trackCount ? `${p.trackCount} Songs` : ''].filter(Boolean).join(' · ')}
                    </span>
                </span>
                <span className={styles.uxCheck}>{isSelected(p.id) ? '✓' : '+'}</span>
            </button>
        )
        const startLabel = selectedPlaylists.length === 0
            ? 'Spiel starten'
            : `${songCount} Songs starten`

        return (
            <div className={wrapperClass}>
                <ThemeToggle />
                <div className={styles.bg} />
                <div className={styles.uxPage}>
                    <button className={styles.uxBack} onClick={handleBack}>← Menü</button>
                    <h1 className={styles.uxTitle}>Song raten</h1>
                    <p className={styles.uxLead}>
                        Ein Song läuft nur kurz an. Wer erkennt ihn zuerst? Der Titel bleibt geheim, bis du aufdeckst.
                    </p>

                    <ol className={styles.uxHow}>
                        <li><span>1</span>Playlist wählen</li>
                        <li><span>2</span>Anhören: 1 → 5 → 10 → 30 s</li>
                        <li><span>3</span>Aufdecken &amp; werten</li>
                    </ol>

                    {loadingError && (
                        <div className={styles.uxError}>
                            <strong>Das hat nicht geklappt.</strong>
                            <span>{loadingError}</span>
                            {isAuthError && (
                                <button
                                    className={styles.uxLink}
                                    onClick={() => {
                                        spotifyService.clearUserTokens()
                                        setLoadingError(null)
                                        setPhase(PHASES.LOGIN)
                                    }}
                                >
                                    Neu bei Spotify anmelden
                                </button>
                            )}
                        </div>
                    )}

                    <h2 className={styles.uxSection}>Welche Playlist?</h2>
                    <div className={styles.uxSeg} role="tablist">
                        <button
                            role="tab"
                            aria-selected={searchMode === 'mine'}
                            className={`${styles.uxSegBtn} ${searchMode === 'mine' ? styles.uxSegBtnOn : ''}`}
                            onClick={() => { setSearchMode('mine'); handleLoadMyPlaylists() }}
                        >
                            Meine Playlists
                        </button>
                        <button
                            role="tab"
                            aria-selected={searchMode === 'playlist'}
                            className={`${styles.uxSegBtn} ${searchMode === 'playlist' ? styles.uxSegBtnOn : ''}`}
                            onClick={() => setSearchMode('playlist')}
                        >
                            Suchen
                        </button>
                    </div>

                    {searchMode === 'playlist' && (
                        <div className={styles.uxSearchRow}>
                            <input
                                ref={searchInputRef}
                                className={styles.uxInput}
                                placeholder="Playlist suchen …"
                                value={playlistQuery}
                                onChange={e => setPlaylistQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearchPlaylists()}
                            />
                            <button
                                className={styles.uxSearchBtn}
                                onClick={handleSearchPlaylists}
                                disabled={searchLoading || !playlistQuery.trim()}
                            >
                                {searchLoading ? '…' : 'Suchen'}
                            </button>
                        </div>
                    )}

                    {searchMode === 'mine' && searchLoading && (
                        <p className={styles.uxFine}>Deine Playlists werden geladen …</p>
                    )}
                    {searchMode === 'mine' && !searchLoading && myPlaylistsError && (
                        <div className={styles.uxError}>
                            <span>{myPlaylistsError}</span>
                            <button className={styles.uxLink} onClick={() => handleLoadMyPlaylists(true)}>Erneut versuchen</button>
                        </div>
                    )}
                    {searchMode === 'mine' && !searchLoading && myPlaylistsLoaded && myPlaylists.length === 0 && (
                        <p className={styles.uxFine}>Keine Playlists gefunden.</p>
                    )}
                    {visibleList.length > 0 && (
                        <div className={styles.uxList}>{visibleList.map(playlistRow)}</div>
                    )}

                    <h2 className={styles.uxSection}>Wie viele Songs?</h2>
                    <div className={styles.uxChips}>
                        {countOptions.map(n => (
                            <button
                                key={n}
                                className={`${styles.uxChip} ${songCount === n ? styles.uxChipOn : ''}`}
                                onClick={() => setSongCount(n)}
                                aria-pressed={songCount === n}
                            >
                                {n}
                            </button>
                        ))}
                    </div>

                    <button
                        className={styles.uxLink}
                        onClick={() => {
                            spotifyService.clearUserTokens()
                            setLoadingError(null)
                            setPhase(PHASES.LOGIN)
                        }}
                    >
                        Spotify-Konto wechseln
                    </button>
                </div>

                <div className={styles.uxBottomBar}>
                    <div className={styles.uxBottomInner}>
                        <button
                            className={styles.uxPrimary}
                            onClick={handleStartGame}
                            disabled={selectedPlaylists.length === 0}
                        >
                            {startLabel}
                        </button>
                        <p className={styles.uxBottomHint}>
                            {selectedPlaylists.length === 0
                                ? 'Wähle mindestens eine Playlist.'
                                : `${selectedPlaylists.length} ${selectedPlaylists.length === 1 ? 'Playlist' : 'Playlists'} ausgewählt`}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Loading ─────────────────────────────────────────────────────────────
    if (phase === PHASES.LOADING) {
        const detect = sizeDetectionProgress
        const detectPct = detect ? Math.min(100, Math.round((detect.step / detect.totalSteps) * 100)) : 0
        return (
            <div className={wrapperClass}>
                <ThemeToggle />
                <div className={styles.bg} />
                <div className={`${styles.uxPage} ${styles.uxCenterPage}`}>
                    <div className={styles.loadingSpinner} />
                    <h1 className={styles.uxTitleSm}>Dein Quiz wird vorbereitet …</h1>
                    <p className={styles.uxFine}>
                        {detect ? 'Songs werden zufällig ausgewählt. Das dauert einen Moment.' : (loadingStatus || 'Einen Moment bitte.')}
                    </p>
                    {detect && (
                        <div className={styles.uxBar} aria-hidden="true">
                            <div className={styles.uxBarFill} style={{ width: `${detectPct}%` }} />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ─── Game ─────────────────────────────────────────────────────────────────
    if (phase === PHASES.GAME) {
        const steps = [
            { label: '1 s', seconds: 1, long: '1 Sekunde' },
            { label: '5 s', seconds: 5, long: '5 Sekunden' },
            { label: '10 s', seconds: 10, long: '10 Sekunden' },
            { label: '30 s', seconds: 30, long: '30 Sekunden' }
        ]
        const nextIdx = Math.min(maxUnlockedIndex, steps.length - 1)
        const progressPct = (playedCount / targetCount) * 100
        const connecting = !playerReady && !playerError
        const playStep = (idx) => {
            if (!playerReady) return
            handlePlayFor(steps[idx].seconds)
            setMaxUnlockedIndex(prev => Math.max(prev, idx + 1))
        }

        let hint
        if (isRevealed) hint = 'Wurde der Song erkannt?'
        else if (isPlaying) hint = 'Hört genau hin …'
        else if (hasPlayedCurrentSong) hint = 'Erkannt? Dann aufdecken – sonst länger anhören.'
        else hint = 'Drück Play. Der Titel bleibt geheim, bis du aufdeckst.'

        const friendlyError = playerError && /device not found/i.test(playerError)
            ? 'Der Spotify-Player ist noch nicht bereit. Kurz warten und nochmal tippen.'
            : playerError

        return (
            <div className={wrapperClass}>
                <ThemeToggle />
                <div className={styles.bg} />
                <div className={`${styles.uxPage} ${styles.uxGame}`}>
                    <div className={styles.uxTop}>
                        <button
                            className={styles.uxClose}
                            aria-label="Spiel beenden"
                            onClick={() => { if (window.confirm('Spiel beenden? Der Spielstand geht verloren.')) handleBack() }}
                        >
                            ✕
                        </button>
                        <div className={styles.uxCounter}>
                            Song <strong>{playedCount + 1}</strong> von {targetCount}
                        </div>
                    </div>
                    <div className={styles.uxBar} aria-hidden="true">
                        <div className={styles.uxBarFill} style={{ width: `${progressPct}%` }} />
                    </div>

                    <p className={styles.uxHint} aria-live="polite">{hint}</p>

                    {friendlyError && <div className={styles.uxError}>{friendlyError}</div>}

                    {!isRevealed ? (
                        <div className={styles.uxHero}>
                            <button
                                className={`${styles.uxPlayBig} ${isPlaying ? styles.uxPlayBigOn : ''}`}
                                onClick={() => playStep(nextIdx)}
                                disabled={!playerReady}
                                aria-label={`Song ${steps[nextIdx].long} abspielen`}
                            >
                                <span className={styles.uxPlayIcon}>{isPlaying ? '♪' : '▶'}</span>
                            </button>
                            <div className={styles.uxPlayLabel}>
                                {connecting ? 'Verbinde mit Spotify …' : `${steps[nextIdx].long} abspielen`}
                            </div>

                            <div className={styles.uxLadder} role="group" aria-label="Abspiellänge">
                                {steps.map((s, idx) => {
                                    const locked = idx > maxUnlockedIndex
                                    const done = idx < maxUnlockedIndex
                                    return (
                                        <button
                                            key={s.label}
                                            className={`${styles.uxLadderChip} ${done ? styles.uxLadderDone : ''} ${idx === nextIdx ? styles.uxLadderNext : ''}`}
                                            onClick={() => playStep(idx)}
                                            disabled={locked || !playerReady}
                                            title={locked ? 'Wird nach der vorherigen Stufe freigeschaltet' : `${s.long} abspielen`}
                                        >
                                            {done ? '✓ ' : ''}{s.label}
                                        </button>
                                    )
                                })}
                            </div>

                            {hasPlayedCurrentSong && (
                                <button className={styles.uxReveal} onClick={() => setIsRevealed(true)}>
                                    Song aufdecken
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className={styles.uxHero}>
                            <div className={styles.uxRevealCard}>
                                {currentTrackInfo?.imageUrl
                                    ? <img src={currentTrackInfo.imageUrl} alt="" className={styles.uxArt} />
                                    : <div className={styles.uxArt}>🎵</div>}
                                <div className={styles.uxSongName}>{currentTrackInfo?.trackName || 'Titel wird geladen …'}</div>
                                <div className={styles.uxSongArtist}>{currentTrackInfo?.artist || ''}</div>
                            </div>
                            <button
                                className={styles.uxLink}
                                onClick={() => playStep(steps.length - 1)}
                                disabled={!playerReady}
                            >
                                ▶ Nochmal anhören (30 s)
                            </button>
                            <div className={styles.uxAnswers}>
                                <button className={styles.uxAnswerNo} onClick={() => handleAnswer(false)}>
                                    ✕ Nicht erkannt
                                </button>
                                <button className={styles.uxAnswerYes} onClick={() => handleAnswer(true)}>
                                    ✓ Erkannt
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ─── Results ─────────────────────────────────────────────────────────────
    if (phase === PHASES.RESULTS) {
        const result = getResultMessage()
        const secondsArr = sessionSecondsCorrectRef.current
        const avgSeconds = secondsArr.length > 0
            ? (secondsArr.reduce((a, b) => a + b, 0) / secondsArr.length).toFixed(1)
            : null

        return (
            <div className={wrapperClass}>
                <ThemeToggle />
                <div className={styles.bg} />
                <div className={`${styles.uxPage} ${styles.uxCenterPage}`}>
                    <div className={styles.uxLogo}>{result.emoji}</div>
                    <div className={styles.uxScore}>
                        {score} <span>von {playedCount}</span>
                    </div>
                    <p className={styles.uxScoreCaption}>Songs erkannt</p>
                    <h1 className={styles.uxTitleSm}>{result.title}</h1>
                    <p className={styles.uxLead}>{result.sub}</p>
                    {avgSeconds && (
                        <p className={styles.uxFine}>Im Schnitt erkannt nach {avgSeconds} Sekunden.</p>
                    )}

                    <button className={styles.uxPrimary} onClick={handleNewRound}>Nochmal spielen</button>
                    <button className={styles.uxLink} onClick={handleBack}>Zurück zum Menü</button>

                    {songHistory.length > 0 && (
                        <div className={styles.uxHistory}>
                            <button className={styles.uxLink} onClick={() => setHistoryOpen(o => !o)}>
                                {historyOpen ? 'Songs ausblenden ▲' : 'Alle Songs anzeigen ▼'}
                            </button>
                            {historyOpen && (
                                <div className={styles.uxList}>
                                    {songHistory.map((entry, i) => (
                                        <div key={i} className={styles.uxItem}>
                                            {entry.song.albumImage
                                                ? <img src={entry.song.albumImage} alt="" className={styles.uxThumb} />
                                                : <div className={styles.uxThumb}>🎵</div>}
                                            <span className={styles.uxItemText}>
                                                <span className={styles.uxItemName}>{entry.song.name}</span>
                                                <span className={styles.uxItemMeta}>{entry.song.artist}</span>
                                            </span>
                                            <span className={entry.correct ? styles.uxOk : styles.uxMiss}>{entry.correct ? '✓' : '✕'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return null
}
