import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { getApp } from 'firebase/app'
import '../../firebase.js'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion, serverTimestamp, deleteDoc, deleteField, collection, query, where, getDocs } from 'firebase/firestore'
import { generateRandomName } from '../../shared/randomName'
import spotifyService from '../../services/spotifyService'
import { log } from '../../utils/logger.js'
import CoverArt from '../../shared/ui/CoverArt'
import QrCode from '../../shared/ui/QrCode'
import { BottomSheet, ConfirmSheet } from '../../shared/ui/BottomSheet'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import {
    IconMoon, IconSun, IconBack, IconNext, IconCheck, IconX, IconLock, IconPlay, IconPause, IconNote, IconSearch,
    IconRetry, IconAlert, IconPlus, IconTrash, IconUsers, IconGear, IconThumbUp, IconThumbDown, IconQueue,
    IconBallot, IconWave, IconSpeaker, IconInfo, IconShare, IconHelp, IconCopy, IconTv, IconDice
} from '../../shared/ui/icons'
import { joinLink, boardLink } from './links'
import styles from './MusicVoter.module.css'

const baseEmojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']
const getRandomEmoji = () => baseEmojis[Math.floor(Math.random() * baseEmojis.length)]

const getOrCreateName = () => {
    const stored = sessionStorage.getItem('mv_name')
    if (stored) return stored
    const name = generateRandomName()
    sessionStorage.setItem('mv_name', name)
    return name
}
const getOrCreateEmoji = () => {
    const stored = sessionStorage.getItem('mv_emoji')
    if (stored) return stored
    const emoji = getRandomEmoji()
    sessionStorage.setItem('mv_emoji', emoji)
    return emoji
}

// Der Name ist Schlüssel in der Lobby (players.<Name>) – daher nur einfache Zeichen, kein Punkt
const NAME_RE = /^[\p{L}\p{N} _-]+$/u
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const nameProblem = (s) => {
    const n = cleanName(s)
    if (n.length < 2) return 'Bitte mindestens 2 Zeichen.'
    if (n.length > 20) return 'Bitte höchstens 20 Zeichen.'
    if (!NAME_RE.test(n)) return 'Nur Buchstaben, Zahlen, Leerzeichen, - und _.'
    return null
}
const fromSpotifyName = (s) => cleanName(String(s || '').replace(/[^\p{L}\p{N} _-]/gu, '')).slice(0, 20)

const PHASE_INFO = {
    songwahl: { title: 'Songs sammeln', dot: 'mvDotCollect' },
    abstimmung: { title: 'Abstimmung läuft', dot: 'mvDotVote' },
    laeuft: { title: 'Playlist läuft', dot: 'mvDotLive' }
}

// Stimmen pro Person und Runde (-1 = unbegrenzt)
const UNLIMITED = -1
const DEFAULT_UP = 3
const DEFAULT_DOWN = 1

const ROOM_SETTINGS = [
    { id: 'batchSize', label: 'Songs pro Runde', fallback: 10, options: [5, 10, 15, 20], tick: String, text: (v) => `${v} Songs kommen in die Warteschlange` },
    { id: 'maxSongsPerPerson', label: 'Songs pro Person', fallback: 5, options: [1, 2, 3, 5, 10], tick: String, text: (v) => `Jeder reicht bis zu ${v} ${v === 1 ? 'Song' : 'Songs'} ein` },
    { id: 'upvotesPerPerson', label: 'Daumen hoch pro Person', fallback: DEFAULT_UP, options: [1, 2, 3, 5, 10, UNLIMITED], tick: (v) => (v === UNLIMITED ? '∞' : String(v)), text: (v) => (v === UNLIMITED ? 'Unbegrenzt viele' : `${v} pro Runde`) },
    { id: 'downvotesPerPerson', label: 'Daumen runter pro Person', fallback: DEFAULT_DOWN, options: [0, 1, 2, 3, 5, UNLIMITED], tick: (v) => (v === UNLIMITED ? '∞' : String(v)), text: (v) => (v === UNLIMITED ? 'Unbegrenzt viele' : v === 0 ? 'Keine – nur Daumen hoch' : `${v} pro Runde`) },
    { id: 'votingDurationSec', label: 'Dauer der Abstimmung', fallback: 120, options: [60, 120, 180, 300], tick: (v) => `${v / 60}`, text: (v) => `${v / 60} ${v === 60 ? 'Minute' : 'Minuten'}` },
    { id: 'preQueueVotingMinutes', label: 'Nächste Abstimmung startet', fallback: 1, options: [1, 2, 3, 5], tick: String, text: (v) => `${v} ${v === 1 ? 'Minute' : 'Minuten'} vor Ablauf der Warteschlange` }
]

/** Schieberegler mit festen Stufen (Index-basiert, damit ungleiche Abstände gleich weit auseinander liegen) */
function StepSlider({ id, label, options, value, onChange, valueText, tickText }) {
    // Eigener Zwischenwert: der Regler folgt sofort, auch bevor Firestore den neuen Wert zurückmeldet
    const [draft, setDraft] = useState(value)
    const [lastValue, setLastValue] = useState(value)
    if (value !== lastValue) {
        setLastValue(value)
        setDraft(value)
    }
    let idx = options.indexOf(draft)
    if (idx < 0) idx = 0
    const pct = options.length > 1 ? (idx / (options.length - 1)) * 100 : 100
    return (
        <div className={styles.mvSliderField}>
            <label htmlFor={id} className={styles.mvLabel}>{label}</label>
            <p className={styles.mvSliderValue} aria-hidden="true">{valueText(options[idx])}</p>
            <input id={id} type="range" min={0} max={options.length - 1} step={1} value={idx}
                onChange={(e) => { const v = options[Number(e.target.value)]; setDraft(v); onChange(v) }}
                aria-valuetext={valueText(options[idx])}
                className={styles.mvSlider} style={{ '--pct': `${pct}%` }} />
            <div className={styles.mvTicks} aria-hidden="true">
                {options.map((o, i) => (
                    <span key={o} className={i === idx ? styles.mvTickOn : ''}
                        style={{ left: `calc(14px + (100% - 28px) * ${options.length > 1 ? i / (options.length - 1) : 1})` }}>{tickText(o)}</span>
                ))}
            </div>
        </div>
    )
}

const sameSong = (a, b) => (a.spotifyId && a.spotifyId === b.spotifyId) || a.id === b.id
const voteCounts = (item) => {
    const vals = Object.values(item.votes || {})
    return { up: vals.filter(v => v === 1).length, down: vals.filter(v => v === -1).length }
}

const MusicVoter = ({ onBack, joinCode }) => {
    // Firebase
    const [db, setDb] = useState(null)

    // State
    const [currentScreen, setCurrentScreen] = useState('lobby')   // lobby | create | browse | room
    const [myName, setMyName] = useState(getOrCreateName)
    const [myEmoji, setMyEmoji] = useState(getOrCreateEmoji)
    const [nameDraft, setNameDraft] = useState(myName)
    const nameTouchedRef = useRef(false)
    const [roomId, setRoomId] = useState(sessionStorage.getItem('mv_roomId') || '')
    const [isHost, setIsHost] = useState(false)
    const [lobbyData, setLobbyData] = useState(null)
    const [availableLobbies, setAvailableLobbies] = useState([])
    const [isLoadingLobbies, setIsLoadingLobbies] = useState(false)
    const [lobbiesError, setLobbiesError] = useState(false)
    const [invite, setInvite] = useState(null)               // { code, host, playerCount, songCount } | { code, missing: true }

    // Music State
    const [playlist, setPlaylist] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchedQuery, setSearchedQuery] = useState('')   // zuletzt abgeschlossene Suche
    const [searchError, setSearchError] = useState(null)
    const [showAddModal, setShowAddModal] = useState(false)

    // Im Hinzufügen-Modal bereits hinzugefügte IDs (für grünen Haken)
    const [addedInModalIds, setAddedInModalIds] = useState(() => new Set())
    const [addingId, setAddingId] = useState(null)

    // Album-Track-Ansicht im Suchmodal
    const [albumTracks, setAlbumTracks] = useState(null) // { album, tracks }
    const [isLoadingAlbum, setIsLoadingAlbum] = useState(false)

    // Spotify (Pflicht nur für den Host)
    const [spotifyConnected, setSpotifyConnected] = useState(null)   // null = wird geprüft
    const [spotifyPlayerReady, setSpotifyPlayerReady] = useState(false)
    const [spotifyPlaying, setSpotifyPlaying] = useState(false)
    const [spotifyError, setSpotifyError] = useState(null)
    const [spotifyDevices, setSpotifyDevices] = useState([])
    const [selectedSpotifyDeviceId, setSelectedSpotifyDeviceId] = useState('active') // 'active' | deviceId

    // Oberfläche
    const { isDark, toggleTheme } = useTheme()
    const [roomView, setRoomView] = useState('main')         // main | settings (nur Host)
    const [toast, setToast] = useState(null)                 // { text, tone: 'info' | 'bad' }
    const [startNotice, setStartNotice] = useState(null)     // Hinweis auf der Startseite (z. B. Playlist geschlossen)
    const [confirm, setConfirm] = useState(null)             // { kind: 'close' | 'leave' | 'remove' | 'deleteAll' | 'endVoting', item? }
    const [confirmBusy, setConfirmBusy] = useState(false)
    const [busyAction, setBusyAction] = useState(null)       // 'create' | 'readd' | ID der Playlist, der gerade beigetreten wird
    const [sheet, setSheet] = useState(null)                 // 'help' | 'share'

    // Refs
    const unsubscribeRef = useRef(null)
    const lastPlayedTrackIdRef = useRef(null) // für automatisches Entfernen abgespielter Songs
    const lastDurationRef = useRef(null)      // Länge des laufenden Songs (für den Verlauf)
    const lastSentQueueOrderRef = useRef(null) // letzte an Spotify gesendete Warteschlangen-Reihenfolge (Spotify-IDs)
    const closingRef = useRef(false)          // Host schließt selbst: kein "wurde geschlossen"-Hinweis
    const toastTimerRef = useRef(null)
    const searchInputRef = useRef(null)
    const myNameRef = useRef(myName)
    useEffect(() => { myNameRef.current = myName }, [myName])
    const [queueExpanded, setQueueExpanded] = useState(false)
    const [showWelcomePopup, setShowWelcomePopup] = useState(false)

    const showToast = useCallback((text, tone = 'info') => {
        clearTimeout(toastTimerRef.current)
        setToast({ text, tone })
        toastTimerRef.current = setTimeout(() => setToast(null), 5000)
    }, [])
    useEffect(() => () => clearTimeout(toastTimerRef.current), [])

    // Spotify OAuth-Callback verarbeiten und Login-Status prüfen
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (code) {
            // URL sofort leeren – verhindert React StrictMode Doppelaufruf → "Invalid authorization code"
            window.history.replaceState({}, '', window.location.pathname || '/')
            let cancelled = false
            ;(async () => {
                try {
                    await spotifyService.exchangeCodeForToken(code)
                    if (cancelled) return
                } catch (e) {
                    console.error('Spotify Callback Fehler:', e)
                    if (!cancelled) showToast('Spotify konnte nicht verbunden werden: ' + (e.message || 'Unbekannter Fehler'), 'bad')
                } finally {
                    if (!cancelled) spotifyService.isUserLoggedIn().then(setSpotifyConnected)
                }
            })()
            return () => { cancelled = true }
        } else {
            spotifyService.isUserLoggedIn().then(setSpotifyConnected)
        }
    }, [showToast])

    // Firebase Initialisierung
    useEffect(() => {
        const firebaseApp = getApp()
        const firebaseAuth = getAuth(firebaseApp)
        setDb(getFirestore(firebaseApp))

        signInAnonymously(firebaseAuth).catch(console.error)

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current()
            }
        }
    }, [])

    // ─── Name ────────────────────────────────────────────────────────────────
    const suggestName = () => {
        nameTouchedRef.current = true
        const newEmoji = getRandomEmoji()
        sessionStorage.setItem('mv_emoji', newEmoji)
        setMyEmoji(newEmoji)
        setNameDraft(generateRandomName())
    }

    // Eingegebenen Namen übernehmen; liefert den Namen oder null (Fehler steht dann am Feld)
    const commitName = () => {
        if (roomId) return myName
        const n = cleanName(nameDraft)
        if (nameProblem(n)) return null
        if (n !== myName) {
            sessionStorage.setItem('mv_name', n)
            setMyName(n)
            myNameRef.current = n
        }
        setNameDraft(n)
        return n
    }

    // Host mit Spotify: Spotify-Namen vorschlagen, solange man selbst nichts geändert hat
    useEffect(() => {
        if (currentScreen !== 'create' || !spotifyConnected || roomId || nameTouchedRef.current) return
        let cancelled = false
        spotifyService.getUserProfile().then((profile) => {
            const n = fromSpotifyName(profile?.displayName)
            if (!cancelled && n && !nameProblem(n) && !nameTouchedRef.current) setNameDraft(n)
        }).catch(() => { /* Zufallsname bleibt */ })
        return () => { cancelled = true }
    }, [currentScreen, spotifyConnected, roomId])

    // Lobby erstellen
    const handleCreateLobby = async () => {
        if (!db || busyAction) return
        const name = commitName()
        if (!name) return
        const emoji = myEmoji

        const newRoomId = generateRoomCode()
        const lobbyRef = doc(db, 'musicVoterLobbies', newRoomId)

        setBusyAction('create')
        try {
            await setDoc(lobbyRef, {
                host: name,
                createdAt: serverTimestamp(),
                players: {
                    [name]: { emoji, joinedAt: serverTimestamp() }
                },
                playlist: [],
                history: [],
                leftovers: {},
                status: 'active',
                // Phasen-Konfiguration
                batchSize: 10,
                maxSongsPerPerson: 5,
                upvotesPerPerson: DEFAULT_UP,
                downvotesPerPerson: DEFAULT_DOWN,
                votingDurationSec: 120,
                preQueueVotingMinutes: 1,
                // Sammelphase ohne Timer – Admin startet manuell
                lobbyPhase: 'songwahl',
                phaseEndsAt: null,
                votingRound: 0,
                pendingBatch: null,
                queueStartedAt: null,
                queueTotalDurationMs: null
            })

            setRoomId(newRoomId)
            setIsHost(true)
            sessionStorage.setItem('mv_roomId', newRoomId)
            setStartNotice(null)
            setRoomView('main')
            setCurrentScreen('room')
            setShowWelcomePopup(true)

            subscribeToLobby(newRoomId)
        } catch (error) {
            console.error('Fehler beim Erstellen der Playlist:', error)
            showToast('Die Playlist konnte nicht erstellt werden. Bitte versuch es nochmal.', 'bad')
        } finally {
            setBusyAction(null)
        }
    }

    // Lobby beitreten
    const handleJoinLobby = async (joinRoomId) => {
        if (!db || busyAction) return
        const name = commitName()
        if (!name) return
        const emoji = myEmoji

        const lobbyRef = doc(db, 'musicVoterLobbies', joinRoomId)

        setBusyAction(joinRoomId)
        try {
            const lobbySnap = await getDoc(lobbyRef)

            if (!lobbySnap.exists()) {
                showToast('Diese Playlist gibt es nicht mehr.', 'bad')
                setAvailableLobbies(prev => prev.filter(l => l.id !== joinRoomId))
                if (invite?.code === joinRoomId) setInvite({ code: joinRoomId, missing: true })
                return
            }

            const lobbyData = lobbySnap.data()

            if (lobbyData.players && lobbyData.players[name]) {
                showToast(`Den Namen „${name}“ gibt es in dieser Playlist schon. Wähl bitte einen anderen.`, 'bad')
                return
            }

            await updateDoc(lobbyRef, {
                [`players.${name}`]: { emoji, joinedAt: serverTimestamp() }
            })

            setRoomId(joinRoomId)
            setIsHost(false)
            sessionStorage.setItem('mv_roomId', joinRoomId)
            setStartNotice(null)
            dropInvite()
            setRoomView('main')
            setCurrentScreen('room')
            setShowWelcomePopup(true)

            subscribeToLobby(joinRoomId)
        } catch (error) {
            console.error('Fehler beim Beitreten:', error)
            showToast('Beitreten hat nicht geklappt. Bitte versuch es nochmal.', 'bad')
        } finally {
            setBusyAction(null)
        }
    }

    // Alle offenen Lobbies laden
    const loadAvailableLobbies = async () => {
        if (!db) return

        setIsLoadingLobbies(true)
        setLobbiesError(false)

        try {
            const lobbiesRef = collection(db, 'musicVoterLobbies')
            const q = query(lobbiesRef, where('status', '==', 'active'))
            const querySnapshot = await getDocs(q)

            const lobbies = []
            querySnapshot.forEach((doc) => {
                const data = doc.data()
                lobbies.push({
                    id: doc.id,
                    host: data.host,
                    playerCount: Object.keys(data.players || {}).length,
                    createdAt: data.createdAt,
                    playlist: data.playlist || []
                })
            })

            // Sortiere nach Erstellungszeit (neueste zuerst)
            lobbies.sort((a, b) => {
                if (!a.createdAt) return 1
                if (!b.createdAt) return -1
                return b.createdAt.toMillis() - a.createdAt.toMillis()
            })

            setAvailableLobbies(lobbies)
            log(`✅ ${lobbies.length} offene Lobbies geladen`)
        } catch (error) {
            console.error('Fehler beim Laden der Lobbies:', error)
            setAvailableLobbies([])
            setLobbiesError(true)
        } finally {
            setIsLoadingLobbies(false)
        }
    }

    // Die Seite "Beitreten" lädt die Liste beim Öffnen
    useEffect(() => {
        if (currentScreen === 'browse' && db) loadAvailableLobbies()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentScreen, db])

    // Einladungslink (#amplify/ABC123): direkt zur Beitreten-Seite mit dieser Playlist.
    // Der Code wandert aus der Adresse in die Sitzung, damit Zurück/Neuladen nicht wieder dorthin führen.
    useEffect(() => {
        if (!joinCode) return
        sessionStorage.setItem('mv_invite', joinCode)
        window.history.replaceState(window.history.state, '', '#amplify')
    }, [joinCode])
    useEffect(() => {
        const code = joinCode || sessionStorage.getItem('mv_invite')
        if (!db || !code) return
        if (sessionStorage.getItem('mv_roomId') === code) {   // schon dabei → Wiedereinstieg unten
            sessionStorage.removeItem('mv_invite')
            return
        }
        let cancelled = false
        getDoc(doc(db, 'musicVoterLobbies', code)).then((snap) => {
            if (cancelled) return
            if (snap.exists()) {
                const data = snap.data()
                setInvite({ code, host: data.host, playerCount: Object.keys(data.players || {}).length, songCount: (data.playlist || []).length })
            } else {
                setInvite({ code, missing: true })
            }
            setCurrentScreen('browse')
        }).catch(() => { if (!cancelled) setInvite({ code, missing: true }) })
        return () => { cancelled = true }
    }, [db, joinCode])

    // Einladung erledigt (beigetreten oder abgelehnt): Raumcode aus der Adresse nehmen
    const dropInvite = () => {
        setInvite(null)
        sessionStorage.removeItem('mv_invite')
    }

    // ALLE Lobbies löschen (nach Bestätigung im Sheet)
    const handleDeleteAllLobbies = async () => {
        if (!db) return
        try {
            // Lösche alle Lobbies parallel
            await Promise.all(availableLobbies.map(lobby =>
                deleteDoc(doc(db, 'musicVoterLobbies', lobby.id))
            ))
            log(`✅ Alle ${availableLobbies.length} Playlists gelöscht`)
            setAvailableLobbies([])
            showToast('Alle Playlists wurden gelöscht.')
        } catch (error) {
            console.error('Fehler beim Löschen aller Playlists:', error)
            showToast('Löschen hat nicht geklappt: ' + (error.message || 'Unbekannter Fehler'), 'bad')
            loadAvailableLobbies()
        }
    }

    // Lobby schließen (nur Host, nach Bestätigung im Sheet)
    const handleCloseLobby = async () => {
        if (!isHost || !db || !roomId) return
        closingRef.current = true
        try {
            await deleteDoc(doc(db, 'musicVoterLobbies', roomId))
            log('✅ Playlist geschlossen')
            handleSessionEnd()
        } catch (error) {
            closingRef.current = false
            console.error('Fehler beim Schließen:', error)
            showToast('Die Playlist konnte nicht geschlossen werden.', 'bad')
        }
    }

    // Lobby-Updates abonnieren
    const subscribeToLobby = (roomId) => {
        if (!db) return
        closingRef.current = false

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)

        const unsubscribe = onSnapshot(lobbyRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data()
                setLobbyData(data)
                setPlaylist(data.playlist || [])
                setIsHost(data.host === myNameRef.current)
            } else {
                // Lobby wurde gelöscht – Session vollständig beenden
                if (!closingRef.current) setStartNotice('Der Host hat die Playlist geschlossen.')
                handleSessionEnd()
            }
        })

        unsubscribeRef.current = unsubscribe
    }

    // Nur zurücknavigieren – Session bleibt erhalten, Spieler bleibt in der Lobby
    const handleGoBack = () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current()
            unsubscribeRef.current = null
        }
        closeAddModal()
        setSheet(null)
        setRoomView('main')
        setCurrentScreen('lobby')
    }

    // Zurück in den Room – Session wird wiederhergestellt
    const handleRejoinRoom = () => {
        if (roomId) {
            setStartNotice(null)
            dropInvite()
            setRoomView('main')
            setCurrentScreen('room')
            subscribeToLobby(roomId)
        }
    }

    // Session vollständig beenden (z. B. wenn Lobby gelöscht wurde) – der eigene Name bleibt
    const handleSessionEnd = () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current()
            unsubscribeRef.current = null
        }
        closeAddModal()
        setConfirm(null)
        setSheet(null)
        setShowWelcomePopup(false)
        setRoomView('main')
        setCurrentScreen('lobby')
        setRoomId('')
        setIsHost(false)
        setLobbyData(null)
        setPlaylist([])
        setNameDraft(myNameRef.current)
        sessionStorage.removeItem('mv_roomId')
    }

    // Lobby verlassen (Spieler wird aus der Lobby entfernt, Session endet)
    const handleLeaveLobby = async () => {
        if (db && roomId && myName) {
            const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
            try {
                await updateDoc(lobbyRef, {
                    [`players.${myName}`]: deleteField()
                })
            } catch (error) {
                console.error('Fehler beim Verlassen:', error)
            }
        }
        handleSessionEnd()
    }

    // Beim Laden: Wieder in die Lobby einsteigen, wenn Session vorhanden (z. B. nach Reload)
    useEffect(() => {
        const storedRoomId = sessionStorage.getItem('mv_roomId')
        const storedName = sessionStorage.getItem('mv_name')
        if (!db || !storedRoomId || !storedName?.trim()) return

        let cancelled = false
        const lobbyRef = doc(db, 'musicVoterLobbies', storedRoomId)
        getDoc(lobbyRef).then((snap) => {
            if (cancelled) return
            if (!snap.exists()) {
                sessionStorage.removeItem('mv_roomId')
                setRoomId('')
                return
            }
            const data = snap.data()
            if (!data.players?.[storedName]) {
                sessionStorage.removeItem('mv_roomId')
                setRoomId('')
                return
            }
            setRoomId(storedRoomId)
            setMyName(storedName)
            setNameDraft(storedName)
            setMyEmoji(sessionStorage.getItem('mv_emoji') || '😊')
            setIsHost(data.host === storedName)
            setCurrentScreen('room')
            subscribeToLobby(storedRoomId)
        }).catch(() => {
            if (!cancelled) sessionStorage.removeItem('mv_roomId')
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db])

    // Mehrere Songs auf einmal einreichen (Limit pro Person wird serverseitig nachgezählt)
    const addManyToPlaylist = async (items) => {
        if (!db || !roomId) return { added: 0, error: 'Keine Verbindung zur Playlist.' }
        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        try {
            const snap = await getDoc(lobbyRef)
            if (!snap.exists()) return { added: 0, error: 'Diese Playlist gibt es nicht mehr.' }
            const data = snap.data()
            if (data.lobbyPhase === 'abstimmung') return { added: 0, error: 'Während der Abstimmung können keine Songs hinzugefügt werden.' }
            const current = data.playlist || []
            const maxSongs = data.maxSongsPerPerson || 5
            let free = maxSongs - current.filter(p => p.addedBy === myName && p.queuedRound == null).length
            const toAdd = []
            let duplicates = 0
            let limitHit = false
            for (const item of items) {
                if (current.some(p => sameSong(p, item)) || toAdd.some(p => sameSong(p, item))) { duplicates++; continue }
                if (free <= 0) { limitHit = true; break }
                const fresh = { ...item, addedBy: myName, votes: {}, addedAt: Date.now() }
                delete fresh.queuedRound
                // Firestore mag keine undefined-Werte
                toAdd.push(Object.fromEntries(Object.entries(fresh).filter(([, v]) => v !== undefined)))
                free--
            }
            if (toAdd.length) await updateDoc(lobbyRef, { playlist: arrayUnion(...toAdd) })
            return { added: toAdd.length, duplicates, limitHit, maxSongs }
        } catch (error) {
            console.error('❌ Fehler beim Hinzufügen:', error)
            return { added: 0, error: 'Hinzufügen hat nicht geklappt: ' + (error.message || 'Unbekannter Fehler') }
        }
    }

    // Einen Song einreichen – true, wenn der Song danach in der Playlist ist
    const addToPlaylist = async (item) => {
        if (playlist.some(p => sameSong(p, item))) return true
        const res = await addManyToPlaylist([item])
        if (res.added || res.duplicates) return true
        if (res.error) showToast(res.error, 'bad')
        else if (res.limitHit) showToast(`Du hast schon ${res.maxSongs} Songs eingereicht. In der nächsten Runde geht’s weiter.`, 'bad')
        return false
    }

    const voteLimits = {
        up: lobbyData?.upvotesPerPerson ?? DEFAULT_UP,
        down: lobbyData?.downvotesPerPerson ?? DEFAULT_DOWN
    }

    // Vote für Song/Album (mit Stimmen-Budget pro Runde)
    const handleVote = async (itemId, voteType) => {
        if (!db || !roomId || !myName) return

        // Voting nur während Abstimmungs-Phase
        if (lobbyData?.lobbyPhase !== 'abstimmung') return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)

        try {
            const currentLobby = await getDoc(lobbyRef)
            const data = currentLobby.data()
            const currentPlaylist = data.playlist || []
            const target = currentPlaylist.find(i => i.id === itemId)
            if (!target) return
            const currentVote = target.votes?.[myName] || 0
            const wanted = voteType === 'up' ? 1 : -1
            const newVote = currentVote === wanted ? 0 : wanted

            if (newVote !== 0) {
                const limit = newVote === 1 ? (data.upvotesPerPerson ?? DEFAULT_UP) : (data.downvotesPerPerson ?? DEFAULT_DOWN)
                const used = currentPlaylist.filter(i => i.queuedRound == null && i.id !== itemId && i.votes?.[myName] === newVote).length
                if (limit !== UNLIMITED && used >= limit) {
                    const what = newVote === 1 ? 'Daumen hoch' : 'Daumen runter'
                    showToast(limit === 0
                        ? 'Daumen runter ist in dieser Playlist ausgeschaltet.'
                        : limit === 1
                            ? `Du hast deinen ${what} schon vergeben. Nimm ihn zurück, um umzuverteilen.`
                            : `Du hast alle ${limit} ${what} vergeben. Nimm einen zurück, um umzuverteilen.`, 'bad')
                    return
                }
            }

            const updatedPlaylist = currentPlaylist.map(item =>
                item.id === itemId ? { ...item, votes: { ...item.votes, [myName]: newVote } } : item
            )

            await updateDoc(lobbyRef, {
                playlist: updatedPlaylist
            })
        } catch (error) {
            console.error('Fehler beim Voten:', error)
        }
    }

    // Song/Album entfernen (nur Host oder Ersteller, nach Bestätigung im Sheet)
    const handleRemoveItem = async (itemId) => {
        if (!db || !roomId) return

        const item = playlist.find(i => i.id === itemId)
        if (!item) return
        if (!isHost && item.addedBy !== myName) return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)

        try {
            const updatedPlaylist = playlist.filter(i => i.id !== itemId)
            await updateDoc(lobbyRef, {
                playlist: updatedPlaylist
            })
        } catch (error) {
            console.error('Fehler beim Entfernen:', error)
            showToast('Der Song konnte nicht entfernt werden.', 'bad')
        }
    }

    // Album-Tracks laden
    const handleOpenAlbum = async (album) => {
        setIsLoadingAlbum(true)
        try {
            const data = await spotifyService.getAlbum(album.spotifyId)
            const tracks = (data.tracks?.items || []).map(t => ({
                id: `spotify_track_${t.id}`,
                spotifyId: t.id,
                title: t.name,
                artist: t.artists?.map(a => a.name).join(', ') || album.artist,
                album: album.title,
                type: 'song',
                source: 'spotify',
                imageUrl: album.imageUrl,
                duration: t.duration_ms,
                votes: {},
                addedAt: Date.now()
            }))
            setAlbumTracks({ album, tracks })
        } catch (e) {
            console.error('Fehler beim Laden des Albums:', e)
            showToast('Das Album konnte nicht geladen werden.', 'bad')
        } finally {
            setIsLoadingAlbum(false)
        }
    }

    // Spotify-Suche
    const handleSpotifySearch = async () => {
        const q = searchQuery.trim()
        if (!q) return

        setIsSearching(true)
        setSearchError(null)

        try {
            const results = await spotifyService.search(q, 10)
            setSearchResults(results)

            if (results.length === 0) {
                log('Keine Ergebnisse für:', q)
            }
        } catch (error) {
            console.error('Spotify Suche fehlgeschlagen:', error)
            setSearchError(error.message?.includes('Failed to get')
                ? 'Spotify ist gerade nicht erreichbar (Zugangsdaten). Bitte später nochmal versuchen.'
                : 'Prüf deine Internetverbindung und versuch es gleich nochmal.')
            setSearchResults([])
        } finally {
            setSearchedQuery(q)
            setIsSearching(false)
        }
    }

    // Suche startet automatisch kurz nach dem Tippen
    useEffect(() => {
        if (!showAddModal) return
        if (searchQuery.trim().length < 2) { setSearchResults([]); setSearchError(null); return }
        const id = setTimeout(() => handleSpotifySearch(), 500)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, showAddModal])

    const openAddModal = () => {
        setAddedInModalIds(new Set(playlist.flatMap(p => [p.spotifyId, p.id].filter(Boolean))))
        setShowAddModal(true)
    }

    function closeAddModal() {
        setAddedInModalIds(new Set())
        setAlbumTracks(null)
        setSearchResults([])
        setSearchQuery('')
        setSearchedQuery('')
        setSearchError(null)
        setShowAddModal(false)
    }

    const handleAddItem = async (item) => {
        if (addingId) return
        setAddingId(item.id)
        const ok = await addToPlaylist(item)
        setAddingId(null)
        if (ok) setAddedInModalIds(prev => new Set(prev).add(item.id).add(item.spotifyId))
    }

    // Zweite Chance: nicht gewählte Songs der letzten Runde erneut einreichen
    const handleReAddAll = async (items) => {
        if (busyAction) return
        setBusyAction('readd')
        const res = await addManyToPlaylist(items)
        setBusyAction(null)
        if (res.error) showToast(res.error, 'bad')
        else if (res.added && res.limitHit) showToast(`${res.added} von ${items.length} Songs eingereicht – dann war dein Limit von ${res.maxSongs} erreicht.`)
        else if (res.added) showToast(res.added === 1 ? 'Song erneut eingereicht.' : `${res.added} Songs erneut eingereicht.`)
        else if (res.limitHit) showToast(`Du hast schon ${res.maxSongs} Songs eingereicht.`, 'bad')
    }

    // Hilfsfunktionen
    const generateRoomCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        let code = ''
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return code
    }

    const calculateScore = (item) => {
        if (!item.votes) return 0
        return Object.values(item.votes).reduce((sum, vote) => sum + vote, 0)
    }

    const sortedPlaylist = [...playlist].sort((a, b) => {
        const scoreA = calculateScore(a)
        const scoreB = calculateScore(b)
        if (scoreB !== scoreA) return scoreB - scoreA
        return (a.addedAt || 0) - (b.addedAt || 0)
    })

    // Schon in dieser Playlist gelaufene Songs (Verlauf) – für die Warnung "Lief schon"
    const playedIds = new Set((lobbyData?.history || []).map(h => h.spotifyId).filter(Boolean))
    const wasPlayed = (item) => !!item.spotifyId && playedIds.has(item.spotifyId)

    // Host: Voting-Einstellungen aktualisieren
    const updateLobbyConfig = async (changes) => {
        if (!db || !roomId) return
        try {
            await updateDoc(doc(db, 'musicVoterLobbies', roomId), changes)
        } catch (e) {
            console.error('Fehler beim Aktualisieren der Lobby-Konfiguration:', e)
            showToast('Die Einstellung konnte nicht gespeichert werden.', 'bad')
        }
    }

    // Admin: Abstimmung manuell aus Songwahl-Phase starten
    const handleStartAbstimmung = async () => {
        if (!isHost || !db || !roomId) return
        const snap = await getDoc(doc(db, 'musicVoterLobbies', roomId))
        if (!snap.exists()) return
        const data = snap.data()
        if (data.lobbyPhase === 'abstimmung') return
        const durationSec = data.votingDurationSec || 120
        const newRound = (data.votingRound || 0) + 1
        await updateDoc(doc(db, 'musicVoterLobbies', roomId), {
            lobbyPhase: 'abstimmung',
            phaseEndsAt: Date.now() + durationSec * 1000,
            votingRound: newRound
        })
    }

    // Admin: Abstimmung vorzeitig beenden – der Phasenwechsel unten wertet sofort aus
    const handleEndVoting = async () => {
        if (!isHost || !db || !roomId || lobbyData?.lobbyPhase !== 'abstimmung') return
        await updateLobbyConfig({ phaseEndsAt: Date.now() })
    }

    // Host: Phase-Übergänge automatisch steuern
    useEffect(() => {
        if (!isHost || !db || !roomId || !lobbyData) return
        const phase = lobbyData.lobbyPhase
        if (!phase || !lobbyData.phaseEndsAt) return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)

        const transition = async () => {
            const snap = await getDoc(lobbyRef)
            if (!snap.exists()) return
            const data = snap.data()
            if (data.lobbyPhase !== phase) return // bereits gewechselt

            if (phase === 'songwahl') {
                // → Abstimmung
                const durationSec = data.votingDurationSec || 120
                const newRound = (data.votingRound || 0) + 1
                await updateDoc(lobbyRef, {
                    lobbyPhase: 'abstimmung',
                    phaseEndsAt: Date.now() + durationSec * 1000,
                    votingRound: newRound
                })
            } else if (phase === 'abstimmung') {
                // → Läuft: Top-N Songs auswählen und an Spotify schicken
                const batchSize = data.batchSize || 10
                const currentRound = data.votingRound || 0
                const currentPlaylist = data.playlist || []
                const candidates = currentPlaylist
                    .filter(i => i.source === 'spotify' && i.spotifyId && i.type === 'song' && i.queuedRound == null)
                    .sort((a, b) => {
                        const sA = calculateScore(a), sB = calculateScore(b)
                        if (sB !== sA) return sB - sA
                        return (a.addedAt || 0) - (b.addedAt || 0)
                    })
                const selected = candidates.slice(0, batchSize)
                const selectedIds = selected.map(i => i.spotifyId)
                // Nicht gewählte Songs verlassen den Pool und landen bei ihrer Person unter "Zweite Chance"
                const notChosen = currentPlaylist.filter(i => i.queuedRound == null && !selectedIds.includes(i.spotifyId))
                const leftovers = {}
                notChosen.forEach(i => {
                    const owner = i.addedBy || '?'
                    if (!leftovers[owner]) leftovers[owner] = []
                    leftovers[owner].push({ ...i, votes: {} })
                })
                const updatedPlaylist = currentPlaylist
                    .filter(i => !notChosen.includes(i))
                    .map(i => selectedIds.includes(i.spotifyId) ? { ...i, queuedRound: currentRound } : i)
                await updateDoc(lobbyRef, {
                    playlist: updatedPlaylist,
                    leftovers,
                    lobbyPhase: 'laeuft',
                    phaseEndsAt: null,
                    pendingBatch: selectedIds.length ? { round: currentRound, spotifyIds: selectedIds } : null
                })
            }
        }

        const remaining = lobbyData.phaseEndsAt - Date.now()
        if (remaining <= 0) { transition(); return }
        const id = setTimeout(transition, remaining + 100)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, db, roomId, lobbyData?.lobbyPhase, lobbyData?.phaseEndsAt])

    /** Millisekunden als "m:ss" formatieren */
    const formatPlaybackTime = (ms) => {
        if (ms == null || Number.isNaN(ms)) return '0:00'
        const total = Math.floor(Number(ms) / 1000)
        const m = Math.floor(total / 60)
        const s = total % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    // Now Playing: Aktuelle Position (läuft jede Sekunde wenn etwas spielt, für Anzeige)
    const [, setNowPlayingTick] = useState(0)
    const [phaseRemainingMs, setPhaseRemainingMs] = useState(0)
    const nowPlaying = lobbyData?.nowPlaying
    const nowPlayingPositionMs = nowPlaying
        ? (nowPlaying.isPlaying
            ? Math.min(
                (nowPlaying.positionMs || 0) + (Date.now() - (nowPlaying.updatedAt || 0)),
                nowPlaying.durationMs || 0
            )
            : (nowPlaying.positionMs || 0))
        : 0

    useEffect(() => {
        if (!nowPlaying?.isPlaying) return
        const id = setInterval(() => setNowPlayingTick((t) => t + 1), 1000)
        return () => clearInterval(id)
    }, [nowPlaying?.isPlaying])

    // Phasen-Countdown für alle Clients (nur Anzeige)
    useEffect(() => {
        if (!lobbyData?.phaseEndsAt || lobbyData.lobbyPhase === 'laeuft') {
            setPhaseRemainingMs(0)
            return
        }
        const update = () => {
            const remaining = lobbyData.phaseEndsAt - Date.now()
            setPhaseRemainingMs(remaining > 0 ? remaining : 0)
        }
        update()
        const id = setInterval(update, 500)
        return () => clearInterval(id)
    }, [lobbyData?.lobbyPhase, lobbyData?.phaseEndsAt])

    // Abstimmung beginnt, während "Song hinzufügen" offen ist → zurück in die Playlist
    useEffect(() => {
        if (showAddModal && lobbyData?.lobbyPhase === 'abstimmung') {
            closeAddModal()
            showToast('Die Abstimmung hat begonnen.')
        }
    }, [showAddModal, lobbyData?.lobbyPhase, showToast])

    // Host: Playback-Status regelmäßig in Firestore schreiben + abgespielte Songs in den Verlauf verschieben
    useEffect(() => {
        if (!isHost || !spotifyConnected || !db || !roomId) return
        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        const interval = setInterval(async () => {
            try {
                const state = await spotifyService.getPlaybackState()
                await updateDoc(lobbyRef, {
                    nowPlaying: state
                        ? {
                            trackId: state.trackId,
                            trackName: state.trackName,
                            artist: state.artist,
                            imageUrl: state.imageUrl,
                            positionMs: state.positionMs,
                            durationMs: state.durationMs,
                            isPlaying: state.isPlaying,
                            updatedAt: state.updatedAt
                        }
                        : null
                })
                // Wenn der Track gewechselt hat: vorherigen Song aus der Playlist in den Verlauf verschieben
                if (state?.trackId && lastPlayedTrackIdRef.current !== null && lastPlayedTrackIdRef.current !== state.trackId) {
                    try {
                        const snap = await getDoc(lobbyRef)
                        const currentPlaylist = snap.data()?.playlist || []
                        const played = currentPlaylist.find((i) => i.spotifyId === lastPlayedTrackIdRef.current)
                        if (played) {
                            const { up, down } = voteCounts(played)
                            const entry = {
                                spotifyId: played.spotifyId,
                                title: played.title || '',
                                artist: played.artist || '',
                                imageUrl: played.imageUrl || null,
                                addedBy: played.addedBy || '',
                                up, down, score: up - down,
                                round: played.queuedRound ?? null,
                                durationMs: lastDurationRef.current || played.duration || null,
                                playedAt: Date.now()
                            }
                            const updatedPlaylist = currentPlaylist.filter((i) => i.spotifyId !== lastPlayedTrackIdRef.current)
                            await updateDoc(lobbyRef, { playlist: updatedPlaylist, history: arrayUnion(entry) })
                            lastSentQueueOrderRef.current = null
                        }
                    } catch { /* nächster Durchlauf versucht es erneut */ }
                }
                if (state?.trackId) {
                    lastPlayedTrackIdRef.current = state.trackId
                    lastDurationRef.current = state.durationMs || null
                }
            } catch {
                // z.B. kein Token oder Player inaktiv – ignorieren
            }
        }, 2000)
        return () => clearInterval(interval)
    }, [isHost, spotifyConnected, db, roomId])

    // Spotify: Web Playback Player initialisieren, wenn Host verbunden
    useEffect(() => {
        if (!isHost || !spotifyConnected || spotifyPlayerReady) return
        setSpotifyError(null)
        spotifyService.initPlaybackPlayer(
            () => setSpotifyPlayerReady(true),
            (msg) => setSpotifyError(msg || 'Spotify-Fehler')
        )
        return () => {
            spotifyService.disconnectPlayer()
            setSpotifyPlayerReady(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, spotifyConnected])

    // Spotify: Geräteliste laden (Browser, Alexa, …), wenn verbunden
    useEffect(() => {
        if (!isHost || !spotifyConnected) return
        const load = async () => {
            try {
                const list = await spotifyService.getDevices()
                setSpotifyDevices(list)
            } catch { /* Liste bleibt wie sie ist */ }
        }
        load()
        const interval = setInterval(load, 10000)
        return () => clearInterval(interval)
    }, [isHost, spotifyConnected])

    const handleSpotifyConnect = async () => {
        try {
            sessionStorage.setItem('spotify_return_to', 'musicvoter')
            const url = await spotifyService.getAuthUrlWithPKCE()
            window.location.href = url
        } catch (e) {
            showToast('Spotify-Verbindung konnte nicht gestartet werden: ' + (e.message || 'Unbekannter Fehler'), 'bad')
        }
    }

    const handleSpotifyDisconnect = async () => {
        if (db && roomId && isHost) {
            try {
                await updateDoc(doc(db, 'musicVoterLobbies', roomId), { nowPlaying: null })
            } catch { /* Anzeige verschwindet spätestens beim nächsten Update */ }
        }
        spotifyService.clearUserTokens()
        spotifyService.disconnectPlayer()
        setSpotifyConnected(false)
        setSpotifyPlayerReady(false)
        setSpotifyPlaying(false)
        setSpotifyError(null)
    }

    const getSpotifyUris = () =>
        sortedPlaylist
            .filter((item) => item.source === 'spotify' && item.spotifyId && item.type === 'song')
            .map((item) => `spotify:track:${item.spotifyId}`)

    const handleStartPlayback = async () => {
        const spotifyUris = getSpotifyUris()
        if (spotifyUris.length === 0) {
            setSpotifyError('In der Playlist sind noch keine Songs. Füge zuerst Songs hinzu.')
            return
        }
        setSpotifyError(null)
        try {
            await spotifyService.playOnDevice(spotifyUris, selectedSpotifyDeviceId === 'active' ? 'active' : selectedSpotifyDeviceId)
            lastSentQueueOrderRef.current = sortedPlaylist
                .filter((i) => i.source === 'spotify' && i.spotifyId && i.type === 'song')
                .map((i) => i.spotifyId)
            setSpotifyPlaying(true)
        } catch (e) {
            setSpotifyError(e.message || 'Abspielen fehlgeschlagen')
        }
    }

    /** Playlist erneut auf das gewählte Gerät senden (z. B. nach Wechsel zu Alexa per Connect). */
    const handleResendPlaylist = async () => {
        const spotifyUris = getSpotifyUris()
        if (spotifyUris.length === 0) return
        setSpotifyError(null)
        try {
            await spotifyService.playOnDevice(spotifyUris, selectedSpotifyDeviceId === 'active' ? 'active' : selectedSpotifyDeviceId)
            lastSentQueueOrderRef.current = sortedPlaylist
                .filter((i) => i.source === 'spotify' && i.spotifyId && i.type === 'song')
                .map((i) => i.spotifyId)
            setSpotifyPlaying(true)
        } catch (e) {
            setSpotifyError(e.message || 'Fehler')
        }
    }

    // Host: Live-Umbauen der Spotify-Warteschlange deaktiviert – Updates passieren nur noch rundenweise,
    // wenn Voting abgeschlossen ist und keine Musik mehr läuft (siehe pendingBatch-Logik unten).

    const handlePausePlayback = async () => {
        try {
            if (nowPlaying?.isPlaying) {
                await spotifyService.pausePlayback()
                setSpotifyPlaying(false)
            } else {
                await spotifyService.resumePlayback()
                setSpotifyPlaying(true)
            }
        } catch (e) {
            console.error('Pause/Resume fehlgeschlagen:', e)
            setSpotifyError(e.message || 'Pause/Fortsetzen hat nicht geklappt')
        }
    }

    // Host: Pending-Batch erst an Spotify schicken, wenn keine Musik mehr läuft (kein Stocken während des Songs)
    useEffect(() => {
        const applyPendingBatch = async () => {
            if (!isHost || !spotifyConnected || !db || !roomId) return
            const pending = lobbyData?.pendingBatch
            if (!pending || !Array.isArray(pending.spotifyIds) || pending.spotifyIds.length === 0) return
            if (nowPlaying?.isPlaying) return

            const deviceId = selectedSpotifyDeviceId === 'active' ? 'active' : selectedSpotifyDeviceId
            const uris = pending.spotifyIds.map((id) => `spotify:track:${id}`)
            if (uris.length === 0) return

            try {
                // Queue-Gesamtdauer aus den gequeueten Songs berechnen
                const currentSnap = await getDoc(doc(db, 'musicVoterLobbies', roomId))
                const currentPlaylist = currentSnap.data()?.playlist || []
                const queuedSongs = currentPlaylist.filter(s => pending.spotifyIds.includes(s.spotifyId))
                const queueTotalDurationMs = queuedSongs.reduce((sum, s) => sum + (s.duration || 210000), 0)

                await spotifyService.playOnDevice(uris, deviceId)
                lastSentQueueOrderRef.current = pending.spotifyIds
                setSpotifyPlaying(true)
                await updateDoc(doc(db, 'musicVoterLobbies', roomId), {
                    pendingBatch: null,
                    queueStartedAt: Date.now(),
                    queueTotalDurationMs
                })
            } catch (e) {
                console.error('Fehler beim Senden der Batch an Spotify:', e)
            }
        }

        applyPendingBatch()
    }, [isHost, spotifyConnected, nowPlaying?.isPlaying, lobbyData?.pendingBatch, selectedSpotifyDeviceId, db, roomId])

    // Host: X Minuten vor Queue-Ende → Abstimmung für nächste Runde starten
    useEffect(() => {
        if (!isHost || !db || !roomId || !lobbyData) return
        if (lobbyData.lobbyPhase !== 'laeuft') return
        const { queueStartedAt, queueTotalDurationMs } = lobbyData
        if (!queueStartedAt || !queueTotalDurationMs) return

        const preMs = (lobbyData.preQueueVotingMinutes || 1) * 60 * 1000
        const delayMs = (queueStartedAt + queueTotalDurationMs - preMs) - Date.now()

        const triggerAbstimmung = async () => {
            const snap = await getDoc(doc(db, 'musicVoterLobbies', roomId))
            if (!snap.exists() || snap.data().lobbyPhase !== 'laeuft') return
            const data = snap.data()
            const newRound = (data.votingRound || 0) + 1
            await updateDoc(doc(db, 'musicVoterLobbies', roomId), {
                lobbyPhase: 'abstimmung',
                phaseEndsAt: Date.now() + (data.votingDurationSec || 120) * 1000,
                votingRound: newRound
            })
        }

        if (delayMs <= 0) { triggerAbstimmung(); return }
        const id = setTimeout(triggerAbstimmung, delayMs)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, db, roomId, lobbyData?.lobbyPhase, lobbyData?.queueStartedAt, lobbyData?.queueTotalDurationMs])

    // ─── Teilen ──────────────────────────────────────────────────────────────
    const copyText = async (text, doneMsg) => {
        try {
            await navigator.clipboard.writeText(text)
            showToast(doneMsg)
        } catch {
            showToast('Kopieren hat nicht geklappt. Halte den Link gedrückt, um ihn zu kopieren.', 'bad')
        }
    }
    const shareJoinLink = async () => {
        const url = joinLink(roomId)
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Amplify', text: `Mach mit bei unserer Playlist (Code ${roomId})`, url })
                return
            } catch (e) {
                if (e?.name === 'AbortError') return
            }
        }
        copyText(url, 'Einladungslink kopiert.')
    }

    // ─── Zurück-Taste des Browsers ───────────────────────────────────────────
    // Eine Ebene zurück; liefert true, wenn man danach noch in einer Unterseite ist.
    const goBackOneLevel = () => {
        if (confirm) { if (!confirmBusy) setConfirm(null); return true }
        if (sheet) { setSheet(null); return true }
        if (showWelcomePopup) { setShowWelcomePopup(false); return true }
        if (showAddModal) {
            if (albumTracks) setAlbumTracks(null)
            else closeAddModal()
            return true
        }
        if (currentScreen === 'room' && roomView === 'settings') { setRoomView('main'); return true }
        if (currentScreen === 'room') { handleGoBack(); return false }
        if (currentScreen !== 'lobby') { dropInvite(); setCurrentScreen('lobby'); return false }
        return false
    }
    const goBackRef = useRef(goBackOneLevel)
    useLayoutEffect(() => { goBackRef.current = goBackOneLevel })

    // Außerhalb der Startseite liegt ein Hilfseintrag im Verlauf: "Zurück" bleibt in Amplify
    const inSub = currentScreen !== 'lobby'
    const subActiveRef = useRef(false)   // Hilfseintrag stammt aus dieser Sitzung (nicht von vor einem Neuladen)
    useEffect(() => {
        if (!inSub) {
            if (subActiveRef.current && window.history.state?.mvSub) window.history.back()
            subActiveRef.current = false
            return
        }
        subActiveRef.current = true
        // Hilfseintrag nur einmal anlegen (React führt Effekte im Dev-Modus doppelt aus)
        if (!window.history.state?.mvSub) window.history.pushState({ mvSub: true }, '')
        const onPop = () => {
            if (window.history.state?.mvSub) return
            if (goBackRef.current()) window.history.pushState({ mvSub: true }, '')
        }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [inSub])

    // ─── Abgeleitete Werte für den Raum ──────────────────────────────────────
    const maxSongs = lobbyData?.maxSongsPerPerson || 5
    const myUnqueuedCount = playlist.filter(p => p.addedBy === myName && p.queuedRound == null).length
    const poolItems = sortedPlaylist.filter(i => i.queuedRound == null)
    const myUpUsed = poolItems.filter(i => i.votes?.[myName] === 1).length
    const myDownUsed = poolItems.filter(i => i.votes?.[myName] === -1).length
    const playerCount = Object.keys(lobbyData?.players || {}).length
    const voterCount = new Set(poolItems.flatMap(i => Object.entries(i.votes || {}).filter(([, v]) => v !== 0).map(([n]) => n))).size

    // ─── Sicherheitsabfragen ─────────────────────────────────────────────────
    const confirmConfig = (() => {
        if (!confirm) return null
        if (confirm.kind === 'close') return {
            title: 'Playlist schließen?', text: 'Die Playlist wird für alle beendet und alle Gäste werden entfernt.',
            cancelLabel: 'Weiter hören', confirmLabel: 'Playlist schließen', run: handleCloseLobby
        }
        if (confirm.kind === 'leave') return {
            title: 'Playlist verlassen?', text: 'Du wirst aus der Playlist entfernt. Deine eingereichten Songs bleiben drin.',
            cancelLabel: 'Bleiben', confirmLabel: 'Verlassen', run: handleLeaveLobby
        }
        if (confirm.kind === 'remove') return {
            title: 'Song entfernen?', text: `„${confirm.item.title}“ wird aus der Playlist entfernt.`,
            cancelLabel: 'Abbrechen', confirmLabel: 'Entfernen', run: () => handleRemoveItem(confirm.item.id)
        }
        if (confirm.kind === 'deleteAll') return {
            title: 'Alle Playlists löschen?', text: `Alle ${availableLobbies.length} offenen Playlists werden gelöscht und alle Gäste entfernt. Das kann nicht rückgängig gemacht werden.`,
            cancelLabel: 'Abbrechen', confirmLabel: 'Alle löschen', run: handleDeleteAllLobbies
        }
        if (confirm.kind === 'endVoting') return {
            title: 'Abstimmung beenden?', text: `${voterCount} von ${playerCount} haben abgestimmt. Die Top ${lobbyData?.batchSize || 10} Songs kommen sofort in die Warteschlange.`,
            cancelLabel: 'Weiter abstimmen', confirmLabel: 'Jetzt beenden', run: handleEndVoting
        }
        return null
    })()

    const closeConfirm = useCallback(() => setConfirm(null), [])
    const closeSheet = useCallback(() => setSheet(null), [])
    const runConfirm = async () => {
        if (!confirmConfig || confirmBusy) return
        setConfirmBusy(true)
        try {
            await confirmConfig.run()
        } finally {
            setConfirmBusy(false)
            setConfirm(null)
        }
    }

    // ─── Gemeinsame Bausteine der Oberfläche ─────────────────────────────────
    const rootClass = `${styles.mvRoot} ${isDark ? theme.dark : theme.light}`
    const themeLabel = isDark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'
    const themeBtn = (
        <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {isDark ? <IconSun /> : <IconMoon />}
        </button>
    )
    const subHeader = (title, onBackClick, extra = null) => (
        <header className={`${styles.mvSubHeader} ${styles.mvPad}`}>
            <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={onBackClick} aria-label="Zurück"><IconBack /></button>
            <h1 className={styles.mvSubTitle}>{title}</h1>
            {extra}
            {themeBtn}
        </header>
    )
    const playedChip = <span className={styles.mvPlayedChip}>Lief schon</span>

    // Hilfe-Text: Rolle + was man in der aktuellen Phase tun kann
    const helpText = (() => {
        const phase = lobbyData?.lobbyPhase
        const up = voteLimits.up === UNLIMITED ? 'beliebig viele' : voteLimits.up
        const down = voteLimits.down === UNLIMITED ? 'beliebig viele' : voteLimits.down
        const voteRule = voteLimits.down === 0 ? `Du hast ${up} Daumen hoch.` : `Du hast ${up} Daumen hoch und ${down} Daumen runter.`
        if (isHost) return {
            role: 'Du bist Host',
            intro: 'Du hast die Playlist erstellt. Die Gewinner-Songs laufen über dein Spotify, und du steuerst die Runden.',
            now: phase === 'abstimmung'
                ? `${voteRule} Wenn alle abgestimmt haben, kannst du die Abstimmung vorzeitig beenden.`
                : phase === 'laeuft'
                    ? 'Die Gewinner laufen. Das Gerät wählst du in den Einstellungen. Die nächste Abstimmung startet automatisch kurz vor Ende der Warteschlange.'
                    : `Reich bis zu ${maxSongs} Songs ein. Wenn alle fertig sind, starte die Abstimmung.`,
            extra: 'Über „Teilen“ lädst du Gäste ein und öffnest das Live-Board für einen Bildschirm.'
        }
        return {
            role: 'Du bist Gast',
            intro: 'Du schlägst Songs vor und stimmst mit ab. Der Host spielt die Gewinner über Spotify.',
            now: phase === 'abstimmung'
                ? `${voteRule} Die Songs mit den meisten Punkten kommen in die Warteschlange.`
                : phase === 'laeuft'
                    ? `Die Gewinner laufen gerade. Schlag schon bis zu ${maxSongs} Songs für die nächste Runde vor.`
                    : `Reich bis zu ${maxSongs} Songs ein. Der Host startet danach die Abstimmung.`,
            extra: 'Nicht gewählte Songs findest du nach der Abstimmung unter „Zweite Chance“.'
        }
    })()

    const shell = (content) => (
        <div className={rootClass}>
            <div className={styles.mvApp}>
                {content}

                <div role="status" aria-live="polite" className={styles.mvToastSlot}>
                    {toast && (
                        <div className={`${styles.mvToast} ${toast.tone === 'bad' ? styles.mvToastBad : ''}`}>
                            <span className={styles.mvToastIcon}>{toast.tone === 'bad' ? <IconAlert size={20} /> : <IconInfo />}</span>
                            <span className={styles.mvToastText}>{toast.text}</span>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvToastClose}`} onClick={() => setToast(null)} aria-label="Hinweis schließen"><IconX size={16} /></button>
                        </div>
                    )}
                </div>

                <ConfirmSheet
                    open={!!confirmConfig}
                    title={confirmConfig?.title}
                    text={confirmConfig?.text}
                    cancelLabel={confirmConfig?.cancelLabel}
                    confirmLabel={confirmConfig?.confirmLabel}
                    onCancel={closeConfirm}
                    onConfirm={runConfirm}
                    busy={confirmBusy}
                />

                <BottomSheet open={showWelcomePopup && currentScreen === 'room'} onClose={() => setShowWelcomePopup(false)} labelledBy="mv-welcome-title">
                    <h2 id="mv-welcome-title" className={styles.mvSheetTitle}>Willkommen bei Amplify!</h2>
                    <p className={styles.mvSheetText}>So läuft eine Runde:</p>
                    <ol className={styles.mvSteps}>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconPlus size={20} /></span>
                            <span><strong>Songs sammeln</strong>Füge bis zu {maxSongs} Songs zur Playlist hinzu.</span>
                        </li>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconBallot size={20} /></span>
                            <span><strong>Abstimmen</strong>Verteil deine Daumen – die besten Songs kommen in die Warteschlange.</span>
                        </li>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconPlay size={16} /></span>
                            <span><strong>Abspielen</strong>Die Playlist läuft. Währenddessen schlägst du Songs für die nächste Runde vor.</span>
                        </li>
                    </ol>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => setShowWelcomePopup(false)}>Los geht’s</button>
                </BottomSheet>

                <BottomSheet open={sheet === 'help' && currentScreen === 'room'} onClose={closeSheet} labelledBy="mv-help-title">
                    <h2 id="mv-help-title" className={styles.mvSheetTitle}>{helpText.role}</h2>
                    <p className={styles.mvSheetText}>{helpText.intro}</p>
                    <div className={styles.mvHelpNow}>
                        <span className={styles.mvLabelSm}>Jetzt gerade: {PHASE_INFO[lobbyData?.lobbyPhase]?.title || 'Songs sammeln'}</span>
                        <p>{helpText.now}</p>
                    </div>
                    <p className={styles.mvFine}>{helpText.extra}</p>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={closeSheet}>Verstanden</button>
                </BottomSheet>

                <BottomSheet open={sheet === 'share' && currentScreen === 'room' && !!roomId} onClose={closeSheet} labelledBy="mv-share-title">
                    <h2 id="mv-share-title" className={styles.mvSheetTitle}>Freunde einladen</h2>
                    <div className={styles.mvShareBox}>
                        {roomId && <QrCode text={joinLink(roomId)} size={132} label={`QR-Code zum Beitreten, Raumcode ${roomId}`} />}
                        <div className={styles.mvShareText}>
                            <span className={styles.mvLabelSm}>Raumcode</span>
                            <span className={styles.mvShareCode}>{roomId}</span>
                            <span className={styles.mvFine}>QR-Code scannen oder Link schicken – man landet direkt beim Beitreten.</span>
                        </div>
                    </div>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={shareJoinLink}><IconShare />Link teilen</button>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={() => copyText(joinLink(roomId), 'Einladungslink kopiert.')}><IconCopy />Link kopieren</button>
                    <div className={styles.mvBoardBox}>
                        <span className={styles.mvBoardIcon}><IconTv size={20} /></span>
                        <span className={styles.mvRowText}>
                            <span className={styles.mvRowName}>Live-Board</span>
                            <span className={styles.mvRowMeta}>Zum Zuschauen auf Tablet oder TV</span>
                        </span>
                        <a className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvOutlineSm}`} href={roomId ? boardLink(roomId) : undefined} target="_blank" rel="noopener noreferrer">Öffnen</a>
                        <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtnSm}`} onClick={() => copyText(boardLink(roomId), 'Board-Link kopiert.')} aria-label="Board-Link kopieren"><IconCopy size={16} /></button>
                    </div>
                </BottomSheet>
            </div>
        </div>
    )

    const nameError = roomId ? null : nameProblem(nameDraft)
    const nameField = (
        <div className={styles.mvField}>
            <label htmlFor="mv-name" className={styles.mvLabel}>Dein Name</label>
            <div className={styles.mvNameRow}>
                <span className={styles.mvAvatar} aria-hidden="true">{myEmoji}</span>
                <input id="mv-name" type="text" className={`${styles.mvInput} ${styles.mvInputPlain} ${nameError ? styles.mvInputBad : ''}`}
                    value={roomId ? myName : nameDraft}
                    onChange={(e) => { nameTouchedRef.current = true; setNameDraft(e.target.value) }}
                    readOnly={!!roomId} maxLength={24} autoComplete="nickname" spellCheck={false}
                    aria-invalid={!!nameError} aria-describedby="mv-name-hint" />
                {!roomId && (
                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={suggestName} aria-label="Zufälligen Namen vorschlagen" title="Zufälligen Namen vorschlagen"><IconDice /></button>
                )}
            </div>
            <p id="mv-name-hint" className={nameError ? styles.mvFieldError : styles.mvFieldHint}>
                {roomId ? 'Du bist gerade in einer Playlist – dein Name bleibt dort gleich.' : (nameError || 'So sehen dich die anderen. Du kannst ihn ändern.')}
            </p>
        </div>
    )

    const skeletons = (label) => (
        <div className={styles.mvSkeletons} role="status" aria-label={label}>
            {[150, 120, 170].map((w, i) => (
                <div key={w} className={styles.mvSkelRow} style={{ opacity: 1 - i * 0.25 }}>
                    <span className={styles.mvSkelCover} />
                    <span className={styles.mvSkelLines}><span style={{ width: w }} /><span style={{ width: w / 2 }} /></span>
                </div>
            ))}
        </div>
    )

    // ─── Start ───────────────────────────────────────────────────────────────
    if (currentScreen === 'lobby') {
        const checking = spotifyConnected === null
        return shell(
            <main className={`${styles.mvMain} ${styles.mvPad}`}>
                <div className={styles.mvHeader}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvTextBtn}`} onClick={onBack}>
                        <IconBack />Zum Menü
                    </button>
                    {themeBtn}
                </div>

                <div className={styles.mvHomeHero}>
                    <span className={styles.mvEmoji} aria-hidden="true">🎵</span>
                    <h1 className={styles.mvHeroTitle}>Amplify</h1>
                    <p className={styles.mvLead}>
                        Sammelt gemeinsam Songs und stimmt ab. Die beliebtesten laufen zuerst über Spotify.
                    </p>
                </div>

                <div className={styles.mvStack}>
                    {startNotice && (
                        <div className={styles.mvNotice} role="status">
                            <span className={styles.mvNoticeIcon}><IconInfo /></span>
                            <p className={styles.mvNoticeText}>{startNotice}</p>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvCloseSm}`} onClick={() => setStartNotice(null)} aria-label="Hinweis schließen"><IconX size={16} /></button>
                        </div>
                    )}

                    {roomId && (
                        <button type="button" className={`${styles.mvBtn} ${styles.mvRejoin}`} onClick={handleRejoinRoom}>
                            <span className={styles.mvLiveDot} aria-hidden="true" />
                            <span className={styles.mvRowText}>
                                <span className={styles.mvRowName}>Zurück zur Playlist</span>
                                <span className={styles.mvRowMeta}>{isHost ? 'Du bist Host' : 'Du bist Gast'} · Code {roomId}</span>
                            </span>
                            <IconNext />
                        </button>
                    )}

                    {!spotifyConnected && (
                        <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={handleSpotifyConnect} disabled={checking}>
                            <IconNote />{checking ? 'Verbindung wird geprüft …' : 'Spotify verbinden'}
                        </button>
                    )}
                    {spotifyConnected ? (
                        <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => setCurrentScreen('create')}>
                            <IconPlus />Playlist erstellen
                        </button>
                    ) : (
                        <button type="button" disabled aria-disabled="true" className={`${styles.mvBtn} ${styles.mvStartOff}`}>
                            <IconLock />Playlist erstellen
                        </button>
                    )}
                    <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={() => setCurrentScreen('browse')}>
                        Playlist beitreten
                    </button>

                    {spotifyConnected ? (
                        <p className={styles.mvStatus} role="status">
                            <span className={styles.mvStatusDot} aria-hidden="true" />Spotify verbunden
                            <span aria-hidden="true">·</span>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvStatusLink}`} onClick={handleSpotifyDisconnect}>Verbindung trennen</button>
                        </p>
                    ) : (
                        !checking && <p className={styles.mvFineRow}><IconInfo />Zum Erstellen brauchst du Spotify Premium. Beitreten geht ohne.</p>
                    )}
                </div>
            </main>
        )
    }

    // ─── Erstellen ───────────────────────────────────────────────────────────
    if (currentScreen === 'create') {
        const creating = busyAction === 'create'
        return shell(
            <main className={styles.mvMain}>
                {subHeader('Playlist erstellen', () => setCurrentScreen('lobby'))}
                <div className={styles.mvScroll}>
                    <p className={styles.mvInfo}>Du wirst Host: Du startest die Abstimmung, und die Gewinner-Songs laufen über dein Spotify.</p>
                    {nameField}
                    {!spotifyConnected && (
                        <div className={styles.mvAlert} role="alert">
                            <span className={styles.mvAlertIcon}><IconAlert size={20} /></span>
                            <p className={styles.mvAlertText}>Verbinde zuerst Spotify auf der Startseite.</p>
                        </div>
                    )}
                </div>
                <div className={styles.mvFooter}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={handleCreateLobby} disabled={creating || !db || !!nameError || !spotifyConnected}>
                        {creating ? 'Wird erstellt …' : 'Playlist erstellen'}
                    </button>
                </div>
            </main>
        )
    }

    // ─── Beitreten ───────────────────────────────────────────────────────────
    if (currentScreen === 'browse') {
        let view
        if (isLoadingLobbies) view = 'loading'
        else if (lobbiesError) view = 'error'
        else view = availableLobbies.length ? 'ok' : 'empty'
        const validInvite = invite && !invite.missing && invite.code !== roomId ? invite : null
        const others = availableLobbies.filter(l => l.id !== validInvite?.code)
        if (view === 'ok' && others.length === 0 && validInvite) view = 'none'
        return shell(
            <main className={styles.mvMain}>
                {subHeader('Beitreten', () => { dropInvite(); setCurrentScreen('lobby') })}
                <div className={`${styles.mvScroll} ${styles.mvScrollFix}`}>
                    {nameField}

                    {invite?.missing && (
                        <div className={styles.mvNotice} role="status">
                            <span className={styles.mvNoticeIcon}><IconInfo /></span>
                            <p className={styles.mvNoticeText}>Die Playlist {invite.code} gibt es nicht mehr. Vielleicht ist eine der offenen Playlists die richtige.</p>
                        </div>
                    )}
                    {validInvite && (
                        <section className={styles.mvInvite}>
                            <span className={styles.mvLabelSm}>Du wurdest eingeladen</span>
                            <div className={styles.mvInviteRow}>
                                <CoverArt seed={validInvite.code} size={52} radius={13} />
                                <span className={styles.mvRowText}>
                                    <span className={styles.mvRowName}>Playlist von {validInvite.host}</span>
                                    <span className={styles.mvRowMeta}>{validInvite.playerCount} dabei · {validInvite.songCount} Songs · Code {validInvite.code}</span>
                                </span>
                            </div>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => handleJoinLobby(validInvite.code)} disabled={!!busyAction || !!nameError}>
                                {busyAction === validInvite.code ? 'Tritt bei …' : 'Beitreten'}
                            </button>
                        </section>
                    )}

                    <div className={styles.mvListHead}>
                        <h2 className={styles.mvListTitle}>{validInvite ? 'Andere offene Playlists' : 'Offene Playlists'}</h2>
                        {view === 'ok' && <span className={styles.mvListCount}>{others.length}</span>}
                    </div>
                    <div className={styles.mvListBox}>
                        {view === 'loading' && skeletons('Playlists werden geladen')}
                        {view === 'error' && (
                            <div className={styles.mvEmpty} role="alert">
                                <span className={`${styles.mvEmptyIcon} ${styles.mvEmptyIconBad}`}><IconAlert size={24} /></span>
                                <p className={styles.mvEmptyTitle}>Playlists konnten nicht geladen werden</p>
                                <p className={styles.mvEmptyText}>Prüf deine Internetverbindung und versuch es gleich nochmal.</p>
                            </div>
                        )}
                        {view === 'empty' && (
                            <div className={styles.mvEmpty}>
                                <span className={styles.mvEmptyIcon}><IconNote size={24} /></span>
                                <p className={styles.mvEmptyTitle}>Keine offenen Playlists</p>
                                <p className={styles.mvEmptyText}>Erstell selbst eine oder schau gleich nochmal vorbei.</p>
                            </div>
                        )}
                        {view === 'none' && <p className={styles.mvFine}>Gerade keine weiteren.</p>}
                        {view === 'ok' && (
                            <ul className={styles.mvList}>
                                {others.map((lobby) => {
                                    const mine = lobby.id === roomId
                                    const joining = busyAction === lobby.id
                                    return (
                                        <li key={lobby.id}>
                                            <button type="button" className={`${styles.mvBtn} ${styles.mvRow} ${mine ? styles.mvRowOn : ''}`}
                                                onClick={() => (mine ? handleRejoinRoom() : handleJoinLobby(lobby.id))}
                                                disabled={!!busyAction || (!mine && !!nameError)}>
                                                <CoverArt seed={lobby.id} size={46} radius={11} />
                                                <span className={styles.mvRowText}>
                                                    <span className={styles.mvRowName}>Playlist von {lobby.host}</span>
                                                    <span className={styles.mvRowMeta}>
                                                        {mine ? 'Deine aktive Playlist' : `${lobby.playerCount} dabei · ${lobby.playlist.length} Songs`}
                                                    </span>
                                                </span>
                                                <span className={styles.mvRowEnd} aria-hidden="true">{joining ? <IconWave size={18} /> : <IconNext />}</span>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </div>
                <div className={styles.mvFooter}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={loadAvailableLobbies} disabled={isLoadingLobbies}>
                        <IconRetry />{isLoadingLobbies ? 'Lädt …' : 'Aktualisieren'}
                    </button>
                    {availableLobbies.length > 0 && (
                        <button type="button" className={`${styles.mvBtn} ${styles.mvDangerLink}`} onClick={() => setConfirm({ kind: 'deleteAll' })}>
                            <IconTrash size={16} />Alle Playlists löschen
                        </button>
                    )}
                </div>
            </main>
        )
    }

    // ─── Raum ────────────────────────────────────────────────────────────────
    if (currentScreen === 'room' && !lobbyData) {
        return shell(
            <main className={styles.mvMain}>
                {subHeader('Amplify', handleGoBack)}
                <div className={styles.mvScroll}>{skeletons('Playlist wird geladen')}</div>
            </main>
        )
    }

    if (currentScreen === 'room') {
        const phase = lobbyData.lobbyPhase

        // ── Song hinzufügen ──
        if (showAddModal) {
            const q = searchQuery.trim()
            let view
            if (albumTracks) view = 'album'
            else if (isLoadingAlbum) view = 'loading'
            else if (q.length < 2) view = 'prompt'
            else if (searchError && !isSearching) view = 'error'
            else if (isSearching || searchedQuery !== q) view = searchResults.length ? 'ok' : 'loading'
            else view = searchResults.length ? 'ok' : 'empty'
            const limitReached = myUnqueuedCount >= maxSongs
            const isAdded = (item) => addedInModalIds.has(item.id) || addedInModalIds.has(item.spotifyId)

            const songRow = (item) => {
                const added = isAdded(item)
                const adding = addingId === item.id
                const isAlbum = item.type === 'album'
                const blocked = !isAlbum && !added && limitReached
                const played = !isAlbum && wasPlayed(item)
                return (
                    <li key={item.id}>
                        <button type="button"
                            className={`${styles.mvBtn} ${styles.mvRow} ${added ? styles.mvRowAdded : ''}`}
                            onClick={() => (isAlbum ? handleOpenAlbum(item) : (!added && handleAddItem(item)))}
                            disabled={(!isAlbum && (added || blocked)) || !!addingId}
                            aria-label={isAlbum ? `Album ${item.title} von ${item.artist} öffnen` : (added ? `${item.title} ist in der Playlist` : `${item.title} von ${item.artist} hinzufügen${played ? ' (lief schon)' : ''}`)}>
                            {view !== 'album' && <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={46} radius={isAlbum ? 11 : 8} />}
                            <span className={styles.mvRowText}>
                                <span className={styles.mvRowName}>{item.title}</span>
                                <span className={styles.mvRowMeta}>{played && playedChip}{isAlbum ? `Album · ${item.artist}` : item.artist}</span>
                            </span>
                            <span className={`${styles.mvAddMark} ${added ? styles.mvAddMarkOn : ''} ${isAlbum ? styles.mvAddMarkPlain : ''}`} aria-hidden="true">
                                {isAlbum ? <IconNext /> : (adding ? <IconWave size={16} /> : (added ? <IconCheck size={16} /> : (blocked ? <IconLock size={16} /> : <IconPlus size={18} />)))}
                            </span>
                        </button>
                    </li>
                )
            }

            return shell(
                <main className={styles.mvMain}>
                    {subHeader(albumTracks ? 'Album' : 'Hinzufügen', () => (albumTracks ? setAlbumTracks(null) : closeAddModal()),
                        <span className={`${styles.mvCountChip} ${limitReached ? styles.mvCountChipFull : ''}`} aria-label={`Deine Songs: ${myUnqueuedCount} von ${maxSongs}`}>{myUnqueuedCount}/{maxSongs}</span>
                    )}
                    <div className={`${styles.mvScroll} ${styles.mvScrollFix}`}>
                        {albumTracks ? (
                            <section className={styles.mvAlbumHead}>
                                <CoverArt src={albumTracks.album.imageUrl} seed={albumTracks.album.spotifyId} size={64} radius={14} />
                                <span className={styles.mvRowText}>
                                    <span className={styles.mvAlbumTitle}>{albumTracks.album.title}</span>
                                    <span className={styles.mvRowMeta}>{albumTracks.album.artist} · {albumTracks.tracks.length} Songs</span>
                                </span>
                            </section>
                        ) : (
                            <div className={styles.mvField}>
                                <label htmlFor="mv-search" className={styles.mvLabel}>Song oder Album suchen</label>
                                <div className={styles.mvInputWrap}>
                                    <span className={styles.mvInputIcon}><IconSearch /></span>
                                    <input
                                        id="mv-search"
                                        ref={searchInputRef}
                                        type="search"
                                        className={styles.mvInput}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSpotifySearch() }}
                                        placeholder="z. B. Titel, Band oder Album"
                                        autoComplete="off"
                                        autoFocus
                                    />
                                    {searchQuery && (
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvInputClear}`} aria-label="Suche löschen"
                                            onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}>
                                            <IconX size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {limitReached && (
                            <p className={styles.mvHintLine}>Du hast {maxSongs} Songs eingereicht – mehr geht in dieser Runde nicht.</p>
                        )}

                        <div className={styles.mvListBox}>
                            {view === 'album' && <ul className={styles.mvList}>{albumTracks.tracks.map(songRow)}</ul>}
                            {view === 'ok' && <ul className={styles.mvList}>{searchResults.map(songRow)}</ul>}
                            {view === 'loading' && skeletons(isLoadingAlbum ? 'Album wird geladen' : 'Spotify wird durchsucht')}
                            {view === 'prompt' && (
                                <div className={styles.mvEmpty}>
                                    <span className={styles.mvEmptyIcon}><IconSearch size={24} /></span>
                                    <p className={styles.mvEmptyTitle}>Was soll laufen?</p>
                                    <p className={styles.mvEmptyText}>Such nach einem Song oder Album. Tippe auf einen Song, um ihn hinzuzufügen.</p>
                                </div>
                            )}
                            {view === 'empty' && (
                                <div className={styles.mvEmpty}>
                                    <span className={styles.mvEmptyIcon}><IconSearch size={24} /></span>
                                    <p className={styles.mvEmptyTitle}>Nichts gefunden</p>
                                    <p className={styles.mvEmptyText}>Zu „{q}“ gibt es keine Treffer. Versuch einen anderen Begriff.</p>
                                </div>
                            )}
                            {view === 'error' && (
                                <div className={styles.mvEmpty} role="alert">
                                    <span className={`${styles.mvEmptyIcon} ${styles.mvEmptyIconBad}`}><IconAlert size={24} /></span>
                                    <p className={styles.mvEmptyTitle}>Suche fehlgeschlagen</p>
                                    <p className={styles.mvEmptyText}>{searchError}</p>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvOutline}`} onClick={handleSpotifySearch}><IconRetry />Erneut versuchen</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={styles.mvFooter}>
                        <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={closeAddModal}>Fertig</button>
                    </div>
                </main>
            )
        }

        // ── Einstellungen (Host) ──
        if (roomView === 'settings' && isHost) {
            const hasSongs = sortedPlaylist.some((i) => i.source === 'spotify' && i.type === 'song')
            return shell(
                <main className={styles.mvMain}>
                    {subHeader('Einstellungen', () => setRoomView('main'))}
                    <div className={styles.mvScroll}>
                        <section className={styles.mvCard}>
                            <div className={styles.mvCardHead}>
                                <h2 className={styles.mvCardTitle}>Spotify</h2>
                                <span className={`${styles.mvChip} ${spotifyConnected ? styles.mvChipOk : styles.mvChipBad}`}>
                                    <span className={styles.mvChipDot} aria-hidden="true" />{spotifyConnected ? 'Verbunden' : 'Nicht verbunden'}
                                </span>
                            </div>
                            {spotifyError && (
                                <div className={styles.mvAlert} role="alert">
                                    <span className={styles.mvAlertIcon}><IconAlert size={20} /></span>
                                    <p className={styles.mvAlertText}>{spotifyError}</p>
                                </div>
                            )}
                            {!spotifyConnected ? (
                                <>
                                    <p className={styles.mvFine}>Verbinde dein Spotify-Konto (Premium), damit die Gewinner-Songs abgespielt werden.</p>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={handleSpotifyConnect}><IconNote size={20} />Spotify verbinden</button>
                                </>
                            ) : (
                                <>
                                    <div className={styles.mvField}>
                                        <label htmlFor="mv-device" className={styles.mvLabel}>Gerät</label>
                                        <div className={styles.mvInputWrap}>
                                            <span className={styles.mvInputIcon}><IconSpeaker /></span>
                                            <select id="mv-device" className={`${styles.mvInput} ${styles.mvSelect}`} value={selectedSpotifyDeviceId} onChange={(e) => setSelectedSpotifyDeviceId(e.target.value)}>
                                                <option value="active">Aktives Gerät</option>
                                                {spotifyDevices.map((d) => (
                                                    <option key={d.id} value={d.id}>{d.name}{d.is_active ? ' (aktiv)' : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    {!spotifyPlaying ? (
                                        <button type="button" className={`${styles.mvBtn} ${hasSongs ? styles.mvPrimary : styles.mvPrimaryOff}`} onClick={handleStartPlayback} disabled={!hasSongs}>
                                            <IconPlay size={18} />Abspielen
                                        </button>
                                    ) : (
                                        <div className={styles.mvBtnRow}>
                                            <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={handlePausePlayback}>
                                                {nowPlaying?.isPlaying ? <><IconPause size={16} />Pause</> : <><IconPlay size={16} />Fortsetzen</>}
                                            </button>
                                            <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={handleResendPlaylist}>
                                                <IconRetry size={16} />Neu senden
                                            </button>
                                        </div>
                                    )}
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvDangerLink}`} onClick={handleSpotifyDisconnect}>Spotify trennen</button>
                                </>
                            )}
                        </section>

                        <section className={styles.mvCard}>
                            <div className={styles.mvCardHead}>
                                <h2 className={styles.mvCardTitle}>Runden</h2>
                                <span className={styles.mvChip}>Runde {lobbyData.votingRound || 0}</span>
                            </div>
                            {ROOM_SETTINGS.map(s => (
                                <StepSlider key={s.id} id={`mv-${s.id}`} label={s.label} options={s.options}
                                    value={lobbyData[s.id] ?? s.fallback}
                                    onChange={(v) => updateLobbyConfig({ [s.id]: v })}
                                    valueText={s.text} tickText={s.tick} />
                            ))}
                            <p className={styles.mvFine}>Änderungen gelten sofort für alle. Stimmen-Limits zählen pro Abstimmungsrunde.</p>
                        </section>
                    </div>
                </main>
            )
        }

        // ── Playlist ──
        const info = PHASE_INFO[phase] || PHASE_INFO.songwahl
        const phaseSub = phase === 'abstimmung'
            ? (phaseRemainingMs > 0 ? `Die Top ${lobbyData.batchSize || 10} Songs kommen in die Warteschlange.` : 'Wird ausgewertet …')
            : phase === 'laeuft'
                ? 'Schlag schon Songs für die nächste Runde vor.'
                : (isHost ? 'Starte die Abstimmung, wenn alle fertig sind.' : 'Füge Songs hinzu. Der Host startet gleich die Abstimmung.')
        const queueItems = sortedPlaylist.filter(i => i.queuedRound != null && i.spotifyId !== nowPlaying?.trackId)
        const voteItems = poolItems
        const showVoting = phase === 'abstimmung'
        const canStartVoting = isHost && phase !== 'abstimmung'
        const progressPct = nowPlaying?.durationMs ? Math.min(100, (nowPlayingPositionMs / nowPlaying.durationMs) * 100) : 0
        const exitLabel = isHost ? 'Playlist schließen' : 'Playlist verlassen'
        const downAllowed = voteLimits.down !== 0
        const budgetText = (limit, used) => (limit === UNLIMITED ? 'unbegrenzt' : `${Math.max(0, limit - used)} von ${limit} übrig`)
        const upLeft = voteLimits.up === UNLIMITED || myUpUsed < voteLimits.up
        const downLeft = voteLimits.down === UNLIMITED || myDownUsed < voteLimits.down
        const myLeftovers = (lobbyData.leftovers?.[myName] || []).filter(i => !playlist.some(p => sameSong(p, i)) && !wasPlayed(i))
        const freeSlots = Math.max(0, maxSongs - myUnqueuedCount)

        return shell(
            <main className={styles.mvMain}>
                <header className={`${styles.mvSubHeader} ${styles.mvRoomHeader} ${styles.mvPad}`}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={handleGoBack} aria-label="Zur Startseite (du bleibst in der Playlist)" title="Zur Startseite"><IconBack /></button>
                    <div className={styles.mvRoomTitle}>
                        <h1 className={styles.mvSubTitle}>Amplify</h1>
                        <button type="button" className={`${styles.mvBtn} ${styles.mvRoleBtn}`} onClick={() => setSheet('help')} aria-label={`${isHost ? 'Host' : 'Gast'} – was kann ich tun?`}>
                            <span className={`${styles.mvRole} ${isHost ? styles.mvRoleHost : ''}`}>{isHost ? 'Host' : 'Gast'}</span>
                            <span className={styles.mvHelpDot} aria-hidden="true"><IconHelp size={12} /></span>
                        </button>
                    </div>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={() => setSheet('share')} aria-label="Teilen und Live-Board" title="Teilen"><IconShare /></button>
                    {themeBtn}
                    {isHost && (
                        <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={() => setRoomView('settings')} aria-label="Einstellungen" title="Einstellungen"><IconGear /></button>
                    )}
                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={() => setConfirm({ kind: isHost ? 'close' : 'leave' })} aria-label={exitLabel} title={exitLabel}><IconX /></button>
                </header>

                <div className={styles.mvScroll}>
                    <section className={styles.mvPhase}>
                        <div className={styles.mvPhaseRow}>
                            <span className={`${styles.mvPhaseDot} ${styles[info.dot]}`} aria-hidden="true" />
                            <div className={styles.mvRowText}>
                                <h2 className={styles.mvPhaseTitle}>{info.title}</h2>
                                <p className={styles.mvPhaseSub}>{phaseSub}</p>
                            </div>
                            {phase === 'abstimmung' && phaseRemainingMs > 0 && (
                                <span className={styles.mvTimer} role="timer" aria-label={`Noch ${formatPlaybackTime(phaseRemainingMs)} Minuten`}>{formatPlaybackTime(phaseRemainingMs)}</span>
                            )}
                            {phase === 'laeuft' && <span className={styles.mvLive}>LIVE</span>}
                        </div>
                        {showVoting && (
                            <div className={styles.mvVoteStats}>
                                <span className={`${styles.mvBudget} ${upLeft ? '' : styles.mvBudgetEmpty}`}><IconThumbUp size={16} />{budgetText(voteLimits.up, myUpUsed)}</span>
                                {downAllowed && <span className={`${styles.mvBudget} ${downLeft ? '' : styles.mvBudgetEmpty}`}><IconThumbDown size={16} />{budgetText(voteLimits.down, myDownUsed)}</span>}
                                <span className={styles.mvVoters}><IconUsers size={15} />{voterCount} von {playerCount} haben abgestimmt</span>
                            </div>
                        )}
                        {canStartVoting && (
                            <button type="button" className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvPhaseBtn}`} onClick={handleStartAbstimmung} disabled={voteItems.length === 0}>
                                <IconBallot size={20} />Abstimmung starten
                            </button>
                        )}
                        {isHost && showVoting && phaseRemainingMs > 0 && (
                            <button type="button" className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvPhaseBtn}`} onClick={() => setConfirm({ kind: 'endVoting' })}>
                                <IconCheck size={18} />Abstimmung jetzt beenden
                            </button>
                        )}
                    </section>

                    {nowPlaying && (
                        <section className={styles.mvNow} aria-label="Läuft gerade">
                            <div className={styles.mvNowRow}>
                                <CoverArt src={nowPlaying.imageUrl} seed={nowPlaying.trackId} size={60} radius={14} />
                                <div className={styles.mvRowText}>
                                    <span className={styles.mvNowLabel}>{nowPlaying.isPlaying ? 'LÄUFT GERADE' : 'PAUSIERT'}</span>
                                    <span className={styles.mvNowTitle}>{nowPlaying.trackName}</span>
                                    <span className={styles.mvNowArtist}>{nowPlaying.artist}</span>
                                </div>
                                {queueItems.length > 0 && (
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvQueueBtn} ${queueExpanded ? styles.mvQueueBtnOn : ''}`}
                                        onClick={() => setQueueExpanded(v => !v)} aria-expanded={queueExpanded} aria-controls="mv-queue"
                                        aria-label={`Warteschlange: ${queueItems.length} Songs`}>
                                        <IconQueue />{queueItems.length}
                                    </button>
                                )}
                            </div>
                            <div className={styles.mvNowBar} aria-hidden="true"><span style={{ width: `${progressPct}%` }} /></div>
                            <div className={styles.mvNowTimes}>
                                <span>{formatPlaybackTime(nowPlayingPositionMs)}</span><span>{formatPlaybackTime(nowPlaying.durationMs)}</span>
                            </div>
                            {queueExpanded && queueItems.length > 0 && (
                                <ol id="mv-queue" className={styles.mvQueue}>
                                    {queueItems.map((item, i) => (
                                        <li key={item.id} className={styles.mvQueueItem}>
                                            <span className={styles.mvQueueRank}>{i + 1}</span>
                                            <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={36} radius={8} />
                                            <span className={styles.mvRowText}>
                                                <span className={styles.mvQueueTitle}>{item.title}</span>
                                                <span className={styles.mvQueueArtist}>{item.artist}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    )}

                    {phase !== 'abstimmung' && myLeftovers.length > 0 && (
                        <section className={styles.mvCard}>
                            <div className={styles.mvCardHead}>
                                <h2 className={styles.mvCardTitle}>Zweite Chance</h2>
                                <span className={styles.mvChip}>{myLeftovers.length}</span>
                            </div>
                            <p className={styles.mvFine}>
                                {myLeftovers.length === 1 ? 'Dieser Song wurde' : 'Diese Songs wurden'} in der letzten Runde nicht gewählt. Reich {myLeftovers.length === 1 ? 'ihn' : 'sie'} für die nächste Runde erneut ein.
                            </p>
                            <ul className={styles.mvList}>
                                {myLeftovers.map(item => (
                                    <li key={item.id}>
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvRow} ${styles.mvRowFlat}`} onClick={() => handleAddItem(item)}
                                            disabled={!!addingId || freeSlots === 0} aria-label={`${item.title} erneut einreichen`}>
                                            <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={40} radius={8} />
                                            <span className={styles.mvRowText}>
                                                <span className={styles.mvRowName}>{item.title}</span>
                                                <span className={styles.mvRowMeta}>{item.artist}</span>
                                            </span>
                                            <span className={styles.mvAddMark} aria-hidden="true">{addingId === item.id ? <IconWave size={16} /> : <IconPlus size={18} />}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={() => handleReAddAll(myLeftovers)} disabled={!!busyAction || freeSlots === 0}>
                                <IconRetry size={18} />{busyAction === 'readd' ? 'Wird eingereicht …' : (freeSlots === 0 ? 'Dein Limit ist erreicht' : 'Alle erneut einreichen')}
                            </button>
                        </section>
                    )}

                    <div className={styles.mvListHead}>
                        <h2 className={styles.mvListTitle}>
                            {phase === 'abstimmung' ? 'Zur Abstimmung' : phase === 'laeuft' ? 'Nächste Runde' : 'Eingereichte Songs'}
                        </h2>
                        <span className={styles.mvListCount}>{voteItems.length}</span>
                    </div>

                    {voteItems.length === 0 ? (
                        <div className={styles.mvEmpty}>
                            <span className={styles.mvEmptyIcon}><IconNote size={24} /></span>
                            <p className={styles.mvEmptyTitle}>{phase === 'abstimmung' ? 'Keine Songs zum Abstimmen' : 'Noch keine Songs'}</p>
                            <p className={styles.mvEmptyText}>
                                {phase === 'abstimmung' ? 'Nach der Abstimmung kannst du wieder Songs hinzufügen.' : 'Tippe unten auf „Song hinzufügen“.'}
                            </p>
                        </div>
                    ) : (
                        <ul className={styles.mvList}>
                            {voteItems.map((item, index) => {
                                const score = calculateScore(item)
                                const myVote = item.votes?.[myName] || 0
                                const canRemove = (phase === 'songwahl' || phase === 'laeuft') && (isHost || item.addedBy === myName)
                                const played = wasPlayed(item)
                                return (
                                    <li key={item.id} className={`${styles.mvSong} ${showVoting && myVote === 1 ? styles.mvSongUp : ''} ${showVoting && myVote === -1 ? styles.mvSongDown : ''}`}>
                                        <span className={styles.mvCoverBox}>
                                            <CoverArt src={item.source === 'spotify' ? item.imageUrl : null} seed={item.spotifyId || item.id} size={46} radius={11} />
                                            <span className={styles.mvRank}>{index + 1}</span>
                                        </span>
                                        <span className={styles.mvRowText}>
                                            <span className={styles.mvRowName}>{item.title}</span>
                                            <span className={styles.mvRowMeta}>{played && playedChip}{item.artist} · von {item.addedBy === myName ? 'dir' : item.addedBy}</span>
                                        </span>
                                        {showVoting ? (
                                            <span className={styles.mvVote} role="group" aria-label={`Abstimmen für ${item.title}`}>
                                                <button type="button" className={`${styles.mvBtn} ${styles.mvVoteBtn} ${myVote === 1 ? styles.mvVoteUpOn : ''} ${myVote !== 1 && !upLeft ? styles.mvVoteBtnOff : ''}`}
                                                    onClick={() => handleVote(item.id, 'up')} aria-pressed={myVote === 1} aria-label="Gefällt mir"><IconThumbUp /></button>
                                                <span className={styles.mvScore}>{score > 0 ? '+' : ''}{score}</span>
                                                {downAllowed && (
                                                    <button type="button" className={`${styles.mvBtn} ${styles.mvVoteBtn} ${myVote === -1 ? styles.mvVoteDownOn : ''} ${myVote !== -1 && !downLeft ? styles.mvVoteBtnOff : ''}`}
                                                        onClick={() => handleVote(item.id, 'down')} aria-pressed={myVote === -1} aria-label="Gefällt mir nicht"><IconThumbDown /></button>
                                                )}
                                            </span>
                                        ) : canRemove && (
                                            <button type="button" className={`${styles.mvBtn} ${styles.mvRemoveBtn}`} onClick={() => setConfirm({ kind: 'remove', item })}
                                                aria-label={`„${item.title}“ entfernen`} title="Entfernen"><IconTrash /></button>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                {phase !== 'abstimmung' && (
                    <div className={styles.mvFooter}>
                        {myUnqueuedCount < maxSongs ? (
                            <button type="button" className={`${styles.mvBtn} ${styles.mvStart}`} onClick={openAddModal}>
                                <span className={styles.mvStartText}>
                                    <span className={styles.mvStartTitle}>Song hinzufügen</span>
                                    <span className={styles.mvStartSub}>Deine Songs: {myUnqueuedCount} von {maxSongs}</span>
                                </span>
                                <span className={styles.mvStartIcon}><IconPlus /></span>
                            </button>
                        ) : (
                            <button type="button" disabled aria-disabled="true" className={`${styles.mvBtn} ${styles.mvStartOff}`}>
                                <IconLock />Alle {maxSongs} Songs eingereicht
                            </button>
                        )}
                    </div>
                )}
            </main>
        )
    }

    return null
}

export default MusicVoter
