import { useState, useEffect, useRef } from 'react'
import spotifyService from '../../services/spotifyService'
import styles from './SecondSound.module.css'

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

    // Setup state
    const [playlistQuery, setPlaylistQuery] = useState('')
    const [playlistResults, setPlaylistResults] = useState([])
    const [selectedPlaylists, setSelectedPlaylists] = useState([])
    const [songCount, setSongCount] = useState(10)
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingError, setLoadingError] = useState(null)

    // Game state
    const [songs, setSongs] = useState([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isRevealed, setIsRevealed] = useState(false)
    const [score, setScore] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)

    const timerRef = useRef(null)
    const searchInputRef = useRef(null)

    // OAuth callback + initial login check
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (code) {
            ;(async () => {
                try {
                    await spotifyService.exchangeCodeForToken(code)
                    window.history.replaceState({}, '', window.location.pathname || '/')
                    setPhase(PHASES.SETUP)
                } catch (e) {
                    console.error('Spotify Callback Fehler:', e)
                    setPhase(PHASES.LOGIN)
                }
            })()
        } else {
            spotifyService.isUserLoggedIn().then(loggedIn => {
                if (loggedIn) setPhase(PHASES.SETUP)
            })
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
            let allTracks = []
            for (const playlist of selectedPlaylists) {
                const tracks = await spotifyService.getPlaylistTracks(playlist.id)
                allTracks = [...allTracks, ...tracks]
            }

            // Duplikate entfernen (gleiche Track-ID)
            const seen = new Set()
            allTracks = allTracks.filter(t => {
                if (!t.uri || !t.name || seen.has(t.id)) return false
                seen.add(t.id)
                return true
            })

            if (allTracks.length === 0) {
                setLoadingError('Keine abspielbaren Songs in den ausgewählten Playlists gefunden.')
                setPhase(PHASES.SETUP)
                return
            }

            const shuffled = [...allTracks].sort(() => Math.random() - 0.5)
            const selected = shuffled.slice(0, Math.min(songCount, shuffled.length))

            setSongs(selected)
            setCurrentIndex(0)
            setIsRevealed(false)
            setScore(0)
            setIsPlaying(false)
            setPhase(PHASES.GAME)
        } catch (e) {
            setLoadingError('Fehler beim Laden der Songs: ' + (e.message || 'Unbekannter Fehler'))
            setPhase(PHASES.SETUP)
        }
    }

    const stopPlayback = async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        setIsPlaying(false)
        await spotifyService.pausePlayback().catch(() => {})
    }

    const handlePlayFor = async (seconds) => {
        if (!playerReady) {
            setPlayerError('Spotify Player noch nicht bereit. Bitte warte einen Moment.')
            return
        }

        const song = songs[currentIndex]
        if (!song?.uri) return

        // Laufenden Timer stoppen
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }

        try {
            await spotifyService.playOnDevice([song.uri], null)
            setIsPlaying(true)
            setPlayerError(null)

            if (seconds !== null) {
                timerRef.current = setTimeout(async () => {
                    await spotifyService.pausePlayback().catch(() => {})
                    setIsPlaying(false)
                    timerRef.current = null
                }, seconds * 1000)
            }
        } catch (e) {
            setPlayerError(e.message || 'Wiedergabe fehlgeschlagen')
            setIsPlaying(false)
        }
    }

    const handleAnswer = async (correct) => {
        await stopPlayback()
        if (correct) setScore(prev => prev + 1)

        if (currentIndex + 1 >= songs.length) {
            setPhase(PHASES.RESULTS)
        } else {
            setCurrentIndex(prev => prev + 1)
            setIsRevealed(false)
        }
    }

    const handleNewRound = () => {
        setSongs([])
        setCurrentIndex(0)
        setIsRevealed(false)
        setScore(0)
        setIsPlaying(false)
        setLoadingError(null)
        setPhase(PHASES.SETUP)
    }

    const handleBack = async () => {
        await stopPlayback()
        spotifyService.disconnectPlayer()
        onBack()
    }

    const getResultMessage = () => {
        const percent = songs.length > 0 ? (score / songs.length) * 100 : 0
        return RESULT_MESSAGES.find(m => percent >= m.minPercent) || RESULT_MESSAGES[RESULT_MESSAGES.length - 1]
    }

    const currentSong = songs[currentIndex]

    // ─── Login ───────────────────────────────────────────────────────────────
    if (phase === PHASES.LOGIN) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <button className={styles.loginBackBtn} onClick={handleBack}>← Zurück</button>
                <div className={styles.loginContainer}>
                    <div className={styles.appIcon}>🎧</div>
                    <h1 className={styles.appTitle}>SecondSound</h1>
                    <p className={styles.appSubtitle}>Das Spotify Musik-Quiz</p>
                    <p className={styles.loginHint}>
                        Melde dich an und ratle Songs aus deinen eigenen Playlists
                    </p>
                    <button className={styles.spotifyBtn} onClick={handleSpotifyLogin}>
                        <svg className={styles.spotifyIcon} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                        Mit Spotify anmelden
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
                    <div className={styles.setupHeader}>
                        <h1 className={styles.appTitleSmall}>🎧 SecondSound</h1>
                        <button
                            className={styles.disconnectBtn}
                            onClick={() => {
                                spotifyService.clearUserTokens()
                                setPhase(PHASES.LOGIN)
                            }}
                            title="Spotify-Verbindung trennen und neu anmelden"
                        >
                            Spotify abmelden
                        </button>
                    </div>
                    <p className={styles.setupHint}>Wähle Playlists aus, stelle die Song-Anzahl ein und starte das Quiz.</p>

                    {loadingError && <div className={styles.errorMsg}>{loadingError}</div>}

                    <div className={styles.setupCard}>
                        <h2 className={styles.sectionTitle}>Playlists auswählen</h2>
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
                                {searchLoading ? (
                                    <span className={styles.spinnerSmall} />
                                ) : 'Suchen'}
                            </button>
                        </div>

                        {playlistResults.length > 0 && (
                            <div className={styles.playlistResults}>
                                {playlistResults.map(p => {
                                    const isAdded = !!selectedPlaylists.find(s => s.id === p.id)
                                    return (
                                        <button
                                            key={p.id}
                                            className={`${styles.playlistItem} ${isAdded ? styles.playlistItemAdded : ''}`}
                                            onClick={() => handleAddPlaylist(p)}
                                            disabled={isAdded}
                                        >
                                            {p.imageUrl
                                                ? <img src={p.imageUrl} alt="" className={styles.playlistThumb} />
                                                : <div className={styles.playlistThumbFallback}>🎵</div>
                                            }
                                            <div className={styles.playlistInfo}>
                                                <span className={styles.playlistName}>{p.name}</span>
                                                <span className={styles.playlistMeta}>{p.owner} · {p.trackCount} Songs</span>
                                            </div>
                                            <span className={styles.addIcon}>{isAdded ? '✓' : '+'}</span>
                                        </button>
                                    )
                                })}
                            </div>
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
                                            <span className={styles.playlistMeta}>{p.trackCount} Songs</span>
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
        const progressPct = ((currentIndex) / songs.length) * 100

        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <div className={styles.gameContainer}>

                    <div className={styles.gameTopBar}>
                        <button className={styles.backBtnSmall} onClick={handleBack}>✕</button>
                        <div className={styles.gameProgress}>
                            Song <strong>{currentIndex + 1}</strong> / {songs.length}
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
                            <div className={styles.revealedInfo}>
                                {currentSong?.albumImage
                                    ? <img src={currentSong.albumImage} alt="" className={styles.albumArt} />
                                    : <div className={styles.albumArtFallback}>🎵</div>
                                }
                                <div className={styles.songName}>{currentSong?.name}</div>
                                <div className={styles.songArtist}>{currentSong?.artist}</div>
                                <div className={styles.songAlbum}>{currentSong?.album}</div>
                            </div>
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
                                { label: '▶ Komplett', seconds: null }
                            ].map(({ label, seconds }) => (
                                <button
                                    key={label}
                                    className={`${styles.playBtn} ${seconds === null ? styles.playBtnFull : ''}`}
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
        const percent = songs.length > 0 ? Math.round((score / songs.length) * 100) : 0

        return (
            <div className={styles.wrapper}>
                <div className={styles.bg} />
                <div className={styles.resultsContainer}>
                    <h1 className={styles.appTitleSmall}>🎧 SecondSound</h1>

                    <div className={styles.resultsCard}>
                        <div className={styles.resultEmoji}>{result.emoji}</div>
                        <div className={styles.scoreDisplay}>
                            <span className={styles.scoreNum}>{score}</span>
                            <span className={styles.scoreSep}>/</span>
                            <span className={styles.scoreTotal}>{songs.length}</span>
                        </div>
                        <div className={styles.scorePercent}>{percent}%</div>
                        <div className={styles.resultTitle}>{result.title}</div>
                        <div className={styles.resultSub}>{result.sub}</div>
                    </div>

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
