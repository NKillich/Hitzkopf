import { useState, useEffect, useRef } from 'react'
import { getApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc, increment } from 'firebase/firestore'
import '../../firebase.js'
import spotifyService from '../../services/spotifyService'
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

export default function SecondSound({ onBack }) {
    const [phase, setPhase] = useState(PHASES.LOGIN)
    const [playerReady, setPlayerReady] = useState(false)
    const [playerError, setPlayerError] = useState(null)
    const [allTimeStats, setAllTimeStats] = useState(null)
    const dbRef = useRef(null)
    const deviceId = useRef(getDeviceId())

    // Setup state
    const [searchMode, setSearchMode] = useState('playlist') // 'playlist' | 'mine'
    const [playlistQuery, setPlaylistQuery] = useState('')
    const [playlistResults, setPlaylistResults] = useState([])
    const [myPlaylists, setMyPlaylists] = useState([])
    const [myPlaylistsLoaded, setMyPlaylistsLoaded] = useState(false)
    const [myPlaylistsError, setMyPlaylistsError] = useState(null)
    const [selectedPlaylists, setSelectedPlaylists] = useState([])
    const [songCount, setSongCount] = useState(10)
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingError, setLoadingError] = useState(null)
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
    const fetchGenRef = useRef(0)
    const lastPlayedTrackIdRef = useRef(null)
    const lastPlayedSlotRef = useRef(null)      // "{playlistUri}:{offset}" des zuletzt gespielten Slots
    const playedTrackIdsRef = useRef(new Set()) // alle bereits gespielten Track-IDs (Duplikat-Schutz)
    const currentIndexRef = useRef(0)           // Spiegel von currentIndex für async-Callbacks
    const isAnsweringRef = useRef(false)        // verhindert Doppel-Klick auf Antwort-Buttons
    const isPlayingRequestRef = useRef(false)   // verhindert parallele Play-Requests
    const songsRef = useRef([])
    const searchInputRef = useRef(null)
    const lastPlaySecondsRef = useRef(null)       // zuletzt gewählte Abspieldauer
    const sessionSecondsCorrectRef = useRef([])   // Sekunden pro richtig erratenen Song

    // Firestore initialisieren
    useEffect(() => {
        dbRef.current = getFirestore(getApp())
    }, [])

    const saveAndLoadStats = async (finalScore, finalPlayed, totalSeconds, countWithTime) => {
        const db = dbRef.current
        if (!db) return
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
            ;(async () => {
                try {
                    await spotifyService.exchangeCodeForToken(code)
                    window.history.replaceState({}, '', window.location.pathname || '/')
                    // Frischer Token: Playlist-Scope testen
                    const hasScope = await spotifyService.testPlaylistAccess()
                    console.log('[SecondSound] Playlist-Scope nach Login:', hasScope)
                    if (hasScope) {
                        setNeedsRelogin(false)
                        setPhase(PHASES.SETUP)
                    } else {
                        setNeedsRelogin(true)
                        setPhase(PHASES.LOGIN)
                    }
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
                console.log('[SecondSound] Playlist-Scope beim Start:', hasScope)
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

    // Web Playback SDK initialisieren wenn Spielphase beginnt
    useEffect(() => {
        if (phase !== PHASES.GAME) return
        setPlayerReady(false)
        setPlayerError(null)
        spotifyService.initPlaybackPlayer(
            () => setPlayerReady(true),
            (msg) => setPlayerError(msg || 'Spotify Player konnte nicht gestartet werden. Spotify Premium erforderlich.')
        )
        return () => {
            spotifyService.disconnectPlayer()
            setPlayerReady(false)
        }
    }, [phase])

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

        try {
            const slots = []

            for (const playlist of selectedPlaylists) {
                // Bekannte Anzahl aus den Suchergebnissen nutzen,
                // andernfalls einmalig von der API holen
                let count = playlist.trackCount || 0
                if (count === 0) {
                    try {
                        const info = await spotifyService.getPlaylistInfo(playlist.id)
                        count = info.trackCount || 0
                    } catch (e) {
                        console.warn(`[SecondSound] getPlaylistInfo fehlgeschlagen für "${playlist.name}":`, e.message)
                    }
                }
                // Sicherer Standardwert falls Spotify die Anzahl nicht liefert
                if (count === 0) count = 200

                const uri = `spotify:playlist:${playlist.id}`
                // 3× die Zielanzahl als Puffer für Duplikate
                Array.from({ length: Math.min(count, 500) }, (_, i) => i)
                    .sort(() => Math.random() - 0.5)
                    .slice(0, songCount * 3)
                    .forEach(offset => slots.push({ playlistUri: uri, offset }))
            }

            if (slots.length === 0) {
                setLoadingError('Keine Playlists verfügbar. Bitte eine Playlist auswählen.')
                setPhase(PHASES.SETUP)
                return
            }

            const shuffled = slots.sort(() => Math.random() - 0.5)

            fetchGenRef.current = 0
            lastPlayedTrackIdRef.current = null
            lastPlayedSlotRef.current = null
            playedTrackIdsRef.current = new Set()
            songsRef.current = shuffled
            sessionSecondsCorrectRef.current = []
            lastPlaySecondsRef.current = null

            console.log('[SS] Spiel gestartet – Song-Pool:', shuffled.length, 'Slots, Ziel:', songCount)

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
            console.error('[SecondSound] Fehler beim Starten:', e)
            setLoadingError(e.message || 'Fehler beim Starten des Spiels.')
            setPhase(PHASES.SETUP)
        }
    }

    const dbg = (...args) => console.log('[SS]', ...args)

    const stopPlayback = async () => {
        dbg('stopPlayback aufgerufen')
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        setIsPlaying(false)
        await spotifyService.pausePlayback().catch(() => {})
    }

    const handlePlayFor = async (seconds) => {
        dbg(`handlePlayFor: ${seconds}s | currentIndex=${currentIndex} | songs.length=${songs.length}`)
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
        dbg(`Song-Slot: playlist=${song.playlistUri} offset=${song.offset}`)

        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }

        lastPlaySecondsRef.current = seconds

        // Wenn derselbe Slot erneut gespielt wird, prevId nicht setzen –
        // sonst wartet der Poll ewig auf einen Track-Wechsel der nie kommt
        const slotKey = `${song.playlistUri}:${song.offset}`
        const isSameSlot = lastPlayedSlotRef.current === slotKey
        lastPlayedSlotRef.current = slotKey

        isPlayingRequestRef.current = true
        try {
            await spotifyService.playContextAtOffset(song.playlistUri, song.offset)
            isPlayingRequestRef.current = false
            setIsPlaying(true)
            setPlayerError(null)

            const gen = ++fetchGenRef.current
            const prevId = isSameSlot ? null : lastPlayedTrackIdRef.current
            dbg(`pollForInfo gestartet: gen=${gen} prevId=${prevId} (isSameSlot=${isSameSlot})`)

            const pollForInfo = async (attempt = 0) => {
                if (fetchGenRef.current !== gen) {
                    dbg(`pollForInfo gen veraltet (${gen} != ${fetchGenRef.current}), abgebrochen`)
                    return
                }
                const state = await spotifyService.getPlaybackState().catch(() => null)
                if (!state || fetchGenRef.current !== gen) {
                    dbg(`pollForInfo: kein state oder gen veraltet, abgebrochen`)
                    return
                }

                dbg(`pollForInfo attempt=${attempt}: trackId=${state.trackId} (prev=${prevId}) track="${state.trackName}" artist="${state.artist}"`)

                // Warten bis Spotify tatsächlich einen neuen Track geladen hat
                if (prevId && state.trackId === prevId && attempt < 15) {
                    dbg(`pollForInfo: gleicher Track wie vorher, warte 400ms (attempt ${attempt})`)
                    await new Promise(r => setTimeout(r, 400))
                    return pollForInfo(attempt + 1)
                }

                if (attempt >= 15) {
                    dbg('pollForInfo: max attempts erreicht! Spotify liefert immer noch denselben Track.')
                }

                // Duplikat-Check: wurde dieser Track in dieser Runde schon gespielt?
                if (playedTrackIdsRef.current.has(state.trackId)) {
                    dbg(`pollForInfo: DUPLIKAT erkannt! "${state.trackName}" (${state.trackId}) bereits gespielt – überspringe Slot`)
                    // Auto-Pause und nächsten Slot vorbereiten
                    await spotifyService.pausePlayback().catch(() => {})
                    setIsPlaying(false)
                    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
                    // Slot überspringen ohne Punkt und ohne History-Eintrag
                    const nextIdx = currentIndexRef.current + 1
                    if (nextIdx < songsRef.current.length) {
                        currentIndexRef.current = nextIdx
                        lastPlayedSlotRef.current = null
                        setCurrentIndex(nextIdx)
                        dbg(`Duplikat übersprungen → weiter mit Index ${nextIdx}`)
                    } else {
                        dbg('Duplikat übersprungen – keine weiteren Slots verfügbar')
                    }
                    return
                }

                dbg(`pollForInfo: Track gesetzt → "${state.trackName}" von "${state.artist}" (id=${state.trackId})`)
                lastPlayedTrackIdRef.current = state.trackId
                playedTrackIdsRef.current.add(state.trackId)
                setCurrentTrackInfo(state)
            }

            setTimeout(() => pollForInfo(), 700)

            if (seconds !== null) {
                timerRef.current = setTimeout(async () => {
                    dbg(`Auto-Pause nach ${seconds}s`)
                    await spotifyService.pausePlayback().catch(() => {})
                    setIsPlaying(false)
                    timerRef.current = null
                }, seconds * 1000)
            }
        } catch (e) {
            isPlayingRequestRef.current = false
            dbg('handlePlayFor Fehler:', e.message)
            setPlayerError(e.message || 'Wiedergabe fehlgeschlagen')
            setIsPlaying(false)
        }
    }

    // Rückt zum nächsten Slot vor – zählt den Song als gespielt
    const advanceAfterAnswer = (correct) => {
        dbg(`advanceAfterAnswer: correct=${correct} | currentIndex=${currentIndex} | playedCount=${playedCount} | targetCount=${targetCount} | songs.length=${songs.length}`)
        dbg(`  aktueller Track: "${currentTrackInfo?.trackName}" von "${currentTrackInfo?.artist}" (id=${currentTrackInfo?.trackId})`)
        if (currentTrackInfo?.trackId) playedTrackIdsRef.current.add(currentTrackInfo.trackId)
        fetchGenRef.current++           // laufende Polls abbrechen
        lastPlayedSlotRef.current = null  // nächster Song ist ein neuer Slot
        isAnsweringRef.current = false    // Sperre für nächsten Song freigeben
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
        setLoadingError(null)
        fetchGenRef.current = 0
        lastPlayedTrackIdRef.current = null
        lastPlaySecondsRef.current = null
        sessionSecondsCorrectRef.current = []
        songsRef.current = []
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

    const currentSong = songs[currentIndex] // {playlistUri, offset, playlistName, playlistImage}

    // ─── Login ───────────────────────────────────────────────────────────────
    if (phase === PHASES.LOGIN) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <div className={styles.loginContainer}>
                    <div className={styles.appIcon}>🎧</div>
                    <h1 className={styles.appTitle}>Song raten</h1>
                    <p className={styles.appSubtitle}>Das Spotify Musik-Quiz</p>

                    {needsRelogin ? (
                        <div className={styles.reloginBanner}>
                            <strong>Neu anmelden erforderlich</strong>
                            <p>Dein Token hat kein <code>playlist-read-private</code>. Klicke auf den Button — Spotify zeigt jetzt den Berechtigungsdialog und gewährt alle Scopes.</p>
                            <p className={styles.scopeDebug}>
                                Aktuelle Scopes: <code>{spotifyService.getGrantedScopes() || '(keine gespeichert)'}</code>
                            </p>
                        </div>
                    ) : (
                        <p className={styles.loginHint}>
                            Melde dich an und errate Songs aus deinen eigenen Playlists.
                        </p>
                    )}

                    <button className={styles.spotifyBtn} onClick={handleSpotifyLogin}>
                        <svg className={styles.spotifyIcon} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                        Mit Spotify anmelden
                    </button>

                    <button className={styles.loginBackBtnInline} onClick={handleBack}>
                        ← Zurück zum Menü
                    </button>
                </div>
            </div>
        )
    }

    // ─── Setup ───────────────────────────────────────────────────────────────
    if (phase === PHASES.SETUP) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <div className={styles.setupContainer}>
                    <h1 className={styles.appTitleSmall}>🎧 Song raten</h1>
                    <p className={styles.setupHint}>Wähle Playlists aus, stelle die Song-Anzahl ein und starte das Quiz.</p>

                    {loadingError && (
                        <div className={styles.errorBlock}>
                            <div className={styles.errorTitle}>⚠ Fehler beim Laden</div>
                            <div className={styles.errorDetail}>{loadingError}</div>
                            {isAuthError && (
                                <div className={styles.errorHelp}>
                                    <strong>Mögliche Ursachen:</strong>
                                    <ul>
                                        <li>Die Playlist ist <strong>privat</strong> → Spotify neu anmelden (Knopf unten) um Playlist-Zugriff zu erlauben</li>
                                        <li>Oder die Playlist in Spotify auf <strong>öffentlich</strong> stellen</li>
                                    </ul>
                                    <button
                                        className={styles.reloginBtn}
                                        onClick={() => {
                                            spotifyService.clearUserTokens()
                                            setLoadingError(null)
                                            setPhase(PHASES.LOGIN)
                                        }}
                                    >
                                        🔑 Neu bei Spotify anmelden
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className={styles.setupCard}>
                        {/* Tab-Toggle */}
                        <div className={styles.searchTabs}>
                            <button
                                className={`${styles.searchTab} ${searchMode === 'playlist' ? styles.searchTabActive : ''}`}
                                onClick={() => { setSearchMode('playlist'); setPlaylistResults([]) }}
                            >
                                🔍 Playlist
                            </button>
                            <button
                                className={`${styles.searchTab} ${searchMode === 'mine' ? styles.searchTabActive : ''}`}
                                onClick={() => { setSearchMode('mine'); handleLoadMyPlaylists() }}
                            >
                                🎧 Meine Playlists
                            </button>
                        </div>

                        {/* Playlist-Suche */}
                        {searchMode === 'playlist' && (
                            <>
                                <div className={styles.searchRow}>
                                    <input
                                        ref={searchInputRef}
                                        className={styles.searchInput}
                                        placeholder="Playlist suchen..."
                                        value={playlistQuery}
                                        onChange={e => setPlaylistQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchPlaylists()}
                                    />
                                    <button
                                        className={styles.searchBtn}
                                        onClick={handleSearchPlaylists}
                                        disabled={searchLoading || !playlistQuery.trim()}
                                    >
                                        {searchLoading ? <span className={styles.spinnerSmall} /> : 'Suchen'}
                                    </button>
                                </div>
                                {playlistResults.length > 0 && (
                                    <div className={styles.playlistResults}>
                                        {playlistResults.map(p => {
                                            const isAdded = !!selectedPlaylists.find(s => s.id === p.id)
                                            return (
                                                <button key={p.id}
                                                    className={`${styles.playlistItem} ${isAdded ? styles.playlistItemAdded : ''}`}
                                                    onClick={() => handleAddPlaylist(p)} disabled={isAdded}
                                                >
                                                    {p.imageUrl ? <img src={p.imageUrl} alt="" className={styles.playlistThumb} /> : <div className={styles.playlistThumbFallback}>🎵</div>}
                                                    <div className={styles.playlistInfo}>
                                                        <span className={styles.playlistName}>{p.name}</span>
                                                        <span className={styles.playlistMeta}>{p.owner}{p.trackCount ? ` · ${p.trackCount} Songs` : ''}</span>
                                                    </div>
                                                    <span className={styles.addIcon}>{isAdded ? '✓' : '+'}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Meine Playlists */}
                        {searchMode === 'mine' && (
                            <>
                                {searchLoading && (
                                    <div className={styles.loadingRow}>
                                        <span className={styles.spinnerSmall} /> Playlists werden geladen…
                                    </div>
                                )}
                                {!searchLoading && myPlaylistsError && (
                                    <div className={styles.myPlaylistsError}>
                                        <span>{myPlaylistsError}</span>
                                        <button className={styles.retryBtn} onClick={() => handleLoadMyPlaylists(true)}>
                                            Erneut versuchen
                                        </button>
                                    </div>
                                )}
                                {!searchLoading && myPlaylistsLoaded && myPlaylists.length === 0 && (
                                    <div className={styles.userNotFound}>Keine Playlists gefunden.</div>
                                )}
                                {myPlaylists.length > 0 && (
                                    <div className={styles.playlistResults}>
                                        {myPlaylists.map(p => {
                                            const isAdded = !!selectedPlaylists.find(s => s.id === p.id)
                                            return (
                                                <button key={p.id}
                                                    className={`${styles.playlistItem} ${isAdded ? styles.playlistItemAdded : ''}`}
                                                    onClick={() => handleAddPlaylist(p)} disabled={isAdded}
                                                >
                                                    {p.imageUrl ? <img src={p.imageUrl} alt="" className={styles.playlistThumb} /> : <div className={styles.playlistThumbFallback}>🎵</div>}
                                                    <div className={styles.playlistInfo}>
                                                        <span className={styles.playlistName}>{p.name}</span>
                                                        <span className={styles.playlistMeta}>{p.trackCount ? `${p.trackCount} Songs` : ''}</span>
                                                    </div>
                                                    <span className={styles.addIcon}>{isAdded ? '✓' : '+'}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {selectedPlaylists.length > 0 && (
                        <div className={styles.setupCard}>
                            <h2 className={styles.sectionTitle}>
                                Ausgewählt <span className={styles.badge}>{selectedPlaylists.length}</span>
                            </h2>
                            <div className={styles.selectedList}>
                                {selectedPlaylists.map(p => (
                                    <div key={p.id} className={styles.selectedItem}>
                                        {p.imageUrl
                                            ? <img src={p.imageUrl} alt="" className={styles.playlistThumb} />
                                            : <div className={styles.playlistThumbFallback}>🎵</div>
                                        }
                                        <div className={styles.playlistInfo}>
                                            <span className={styles.playlistName}>{p.name}</span>
                                            <span className={styles.playlistMeta}>{p.trackCount ? `${p.trackCount} Songs` : 'Songs werden geladen…'}</span>
                                        </div>
                                        <button className={styles.removeBtn} onClick={() => handleRemovePlaylist(p.id)}>✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={styles.setupCard}>
                        <h2 className={styles.sectionTitle}>
                            Anzahl Songs: <span className={styles.countHighlight}>{songCount}</span>
                        </h2>
                        <input
                            type="range"
                            min={3}
                            max={30}
                            step={1}
                            value={songCount}
                            onChange={e => setSongCount(Number(e.target.value))}
                            className={styles.slider}
                        />
                        <div className={styles.sliderLabels}>
                            <span>3</span>
                            <span>30</span>
                        </div>
                    </div>

                    <button
                        className={styles.startBtn}
                        onClick={handleStartGame}
                        disabled={selectedPlaylists.length === 0}
                    >
                        Spiel starten →
                    </button>

                    <button className={styles.setupBackBtn} onClick={handleBack}>
                        ← Zurück zum Menü
                    </button>

                    <button
                        className={styles.disconnectBtn}
                        onClick={() => {
                            spotifyService.clearUserTokens()
                            setLoadingError(null)
                            setPhase(PHASES.LOGIN)
                        }}
                    >
                        Spotify abmelden & neu anmelden
                    </button>
                </div>
            </div>
        )
    }

    // ─── Loading ─────────────────────────────────────────────────────────────
    if (phase === PHASES.LOADING) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner} />
                    <p className={styles.loadingText}>Songs werden geladen...</p>
                </div>
            </div>
        )
    }

    // ─── Game ─────────────────────────────────────────────────────────────────
    if (phase === PHASES.GAME) {
        const progressPct = (playedCount / targetCount) * 100

        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <div className={styles.gameContainer}>

                    <div className={styles.gameTopBar}>
                        <button className={styles.backBtnSmall} onClick={handleBack}>✕</button>
                        <div className={styles.gameProgress}>
                            Song <strong>{playedCount + 1}</strong> / {targetCount}
                        </div>
                        <div className={styles.scoreChip}>
                            {score} ✓
                        </div>
                    </div>


                    <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                    </div>

                    {playerError && (
                        <div className={styles.errorMsg}>{playerError}</div>
                    )}

                    <div className={styles.songCard}>
                        {!playerReady && !playerError && (
                            <div className={styles.playerConnecting}>
                                <div className={styles.spinnerSmall} />
                                <span>Verbinde Spotify Player...</span>
                            </div>
                        )}

                        {isRevealed ? (
                            currentTrackInfo ? (
                                <div className={styles.revealedInfo}>
                                    {currentTrackInfo.imageUrl
                                        ? <img src={currentTrackInfo.imageUrl} alt="" className={styles.albumArt} />
                                        : <div className={styles.albumArtFallback}>🎵</div>
                                    }
                                    <div className={styles.songName}>{currentTrackInfo.trackName}</div>
                                    <div className={styles.songArtist}>{currentTrackInfo.artist}</div>
                                </div>
                            ) : (
                                <div className={styles.revealedInfo}>
                                    <div className={styles.albumArtFallback}>🎵</div>
                                    <div className={styles.songName}>Erst abspielen!</div>
                                    <div className={styles.songArtist}>Drücke einen Play-Button um den Song zu laden</div>
                                </div>
                            )
                        ) : (
                            <div className={styles.hiddenSong}>
                                <div className={styles.questionMark}>?</div>
                                <p className={styles.hiddenHint}>Wer kennt diesen Song?</p>
                                <button className={styles.revealBtn} onClick={() => setIsRevealed(true)}>
                                    Aufdecken
                                </button>
                            </div>
                        )}
                    </div>

                    {isPlaying && (
                        <div className={styles.nowPlaying}>
                            <span className={styles.dot} />
                            <span className={styles.dot} />
                            <span className={styles.dot} />
                            <span>Wird abgespielt</span>
                        </div>
                    )}

                    <div className={styles.playSection}>
                        <p className={styles.playSectionLabel}>Song abspielen für:</p>
                        <div className={styles.playButtons}>
                            {[
                                { label: '1s', seconds: 1 },
                                { label: '5s', seconds: 5 },
                                { label: '10s', seconds: 10 },
                                { label: '30s', seconds: 30 }
                            ].map(({ label, seconds }) => (
                                <button
                                    key={label}
                                    className={styles.playBtn}
                                    onClick={() => handlePlayFor(seconds)}
                                    disabled={!playerReady}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.answerSection}>
                        <p className={styles.answerLabel}>Song erraten?</p>
                        <div className={styles.answerButtons}>
                            <button
                                className={`${styles.answerBtn} ${styles.wrongBtn}`}
                                onClick={() => handleAnswer(false)}
                            >
                                ✕
                            </button>
                            <button
                                className={`${styles.answerBtn} ${styles.correctBtn}`}
                                onClick={() => handleAnswer(true)}
                            >
                                ✓
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Results ─────────────────────────────────────────────────────────────
    if (phase === PHASES.RESULTS) {
        const result = getResultMessage()
        const percent = playedCount > 0 ? Math.round((score / playedCount) * 100) : 0

        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <div className={styles.resultsContainer}>
                    <h1 className={styles.appTitleSmall}>🎧 Song raten</h1>

                    <div className={styles.resultsCard}>
                        <div className={styles.resultEmoji}>{result.emoji}</div>
                        <div className={styles.scoreDisplay}>
                            <span className={styles.scoreNum}>{score}</span>
                            <span className={styles.scoreSep}>/</span>
                            <span className={styles.scoreTotal}>{playedCount}</span>
                        </div>
                        <div className={styles.scorePercent}>{percent}%</div>
                        <div className={styles.resultTitle}>{result.title}</div>
                        <div className={styles.resultSub}>{result.sub}</div>
                    </div>

                    {allTimeStats && (
                        <div className={styles.statsCard}>
                            <div className={styles.statsTitle}>📊 Deine Gesamt-Stats</div>
                            <div className={styles.statsGrid}>
                                <div className={styles.statItem}>
                                    <span className={styles.statValue}>{allTimeStats.songsCorrect ?? 0}</span>
                                    <span className={styles.statLabel}>Songs erraten</span>
                                </div>
                                <div className={styles.statItem}>
                                    <span className={styles.statValue}>
                                        {allTimeStats.songsTotal > 0
                                            ? Math.round((allTimeStats.songsCorrect / allTimeStats.songsTotal) * 100)
                                            : 0}%
                                    </span>
                                    <span className={styles.statLabel}>Trefferquote</span>
                                </div>
                                <div className={styles.statItem}>
                                    <span className={styles.statValue}>{allTimeStats.gamesPlayed ?? 0}</span>
                                    <span className={styles.statLabel}>Spiele</span>
                                </div>
                                <div className={styles.statItem}>
                                    <span className={styles.statValue}>{allTimeStats.bestPercent ?? 0}%</span>
                                    <span className={styles.statLabel}>Bestes Ergebnis</span>
                                </div>
                            </div>
                            {(allTimeStats.correctGuessesWithTime > 0) && (
                                <div className={styles.statItemWide}>
                                    <span className={styles.statValue}>
                                        {(allTimeStats.totalSecondsCorrect / allTimeStats.correctGuessesWithTime).toFixed(1)}s
                                    </span>
                                    <span className={styles.statLabel}>Ø Zeit zum Erraten</span>
                                </div>
                            )}
                        </div>
                    )}

                    {songHistory.length > 0 && (
                        <div className={styles.historyCard}>
                            <button
                                className={styles.historyToggle}
                                onClick={() => setHistoryOpen(o => !o)}
                            >
                                <span>🎵 Gespielte Songs</span>
                                <span className={styles.historyChevron}>{historyOpen ? '▲' : '▼'}</span>
                            </button>
                            {historyOpen && (
                                <div className={styles.historyList}>
                                    {songHistory.map((entry, i) => (
                                        <div key={i} className={`${styles.historyItem} ${entry.correct ? styles.historyCorrect : styles.historyWrong}`}>
                                            {entry.song.albumImage
                                                ? <img src={entry.song.albumImage} alt="" className={styles.historyThumb} />
                                                : <div className={styles.historyThumbFallback}>🎵</div>
                                            }
                                            <div className={styles.historyInfo}>
                                                <span className={styles.historyName}>{entry.song.name}</span>
                                                <span className={styles.historyArtist}>{entry.song.artist}</span>
                                            </div>
                                            <span className={styles.historyIcon}>{entry.correct ? '✓' : '✕'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className={styles.resultsActions}>
                        <button className={styles.newRoundBtn} onClick={handleNewRound}>
                            Neue Runde
                        </button>
                        <button className={styles.backBtn} onClick={handleBack}>
                            ← Zurück zum Menü
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return null
}
