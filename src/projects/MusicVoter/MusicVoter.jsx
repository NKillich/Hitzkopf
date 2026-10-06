import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { getApp } from 'firebase/app'
import '../../firebase.js'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, runTransaction, serverTimestamp, deleteDoc, deleteField } from 'firebase/firestore'
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
    IconBallot, IconWave, IconSpeaker, IconInfo, IconShare, IconHelp, IconCopy, IconTv, IconDice, IconSkip,
    IconVolume, IconTrophy, IconLeave, IconChevron
} from '../../shared/ui/icons'
import { joinLink, boardLink } from './links'
import {
    UNLIMITED, DEFAULT_UP, DEFAULT_DOWN, PRESETS, DEFAULT_PRESET, activePresetId, voteCounts, byScore,
    cleanName, nameKey, sameSong, similarSong, seededOrder, queueRemainingMs, nextVotingInMs, mmss, nowPosition,
    DECADES, decadeLabel, ruleLabel, ruleHint, ruleEmoji, ruleSearchQuery, ruleProblem, finishRound,
    limitsFor, streakOf, isLastSong, STREAK_LEVELS, resultNotes, splitConfigChange, pendingLabels, liveNowPlaying, upcomingQueue, queueOrder
} from './amplifyLogic'
import ReactionPad from './ReactionPad'
import { deleteReactions } from './reactions'
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
const nameProblem = (s) => {
    const n = cleanName(s)
    if (n.length < 2) return 'Bitte mindestens 2 Zeichen.'
    if (n.length > 20) return 'Bitte höchstens 20 Zeichen.'
    if (!NAME_RE.test(n)) return 'Nur Buchstaben, Zahlen, Leerzeichen, - und _.'
    return null
}
const fromSpotifyName = (s) => cleanName(String(s || '').replace(/[^\p{L}\p{N} _-]/gu, '')).slice(0, 20)
const CODE_RE = /^[A-Z0-9]{4,10}$/
const isOpen = (data) => (data.status ?? 'active') === 'active'

const PHASE_INFO = {
    songwahl: { title: 'Songs sammeln', dot: 'mvDotCollect' },
    abstimmung: { title: 'Abstimmung läuft', dot: 'mvDotVote' },
    laeuft: { title: 'Playlist läuft', dot: 'mvDotLive' }
}

// Feineinstellungen (unter "Erweitert"); die drei Vorgaben stehen in amplifyLogic.js
const ROOM_SETTINGS = [
    { id: 'batchSize', label: 'Songs pro Runde', fallback: 6, options: [4, 6, 8, 10, 15, 20], tick: String, text: (v) => `Die besten ${v} kommen in die Warteschlange` },
    { id: 'maxSongsPerPerson', label: 'Songs pro Person', fallback: 3, options: [1, 2, 3, 4, 5, 10], tick: String, text: (v) => `Jeder reicht bis zu ${v} ${v === 1 ? 'Song' : 'Songs'} ein` },
    { id: 'votingDurationSec', label: 'Dauer der Abstimmung', fallback: 90, options: [60, 90, 120, 180, 300], tick: (v) => (v < 120 ? `${v}s` : `${v / 60}m`), text: (v) => (v < 120 ? `${v} Sekunden` : `${v / 60} Minuten`) },
    { id: 'preQueueVotingMinutes', label: 'Automatische Abstimmung', fallback: 3, options: [1, 2, 3, 4, 5], tick: String, text: (v) => `Startet, wenn noch ${v} ${v === 1 ? 'Minute' : 'Minuten'} Musik übrig ${v === 1 ? 'ist' : 'sind'} – spätestens beim letzten Song` },
    { id: 'upvotesPerPerson', label: 'Daumen hoch pro Person', fallback: DEFAULT_UP, options: [1, 2, 3, 5, 10, UNLIMITED], tick: (v) => (v === UNLIMITED ? '∞' : String(v)), text: (v) => (v === UNLIMITED ? 'Unbegrenzt viele' : `${v} pro Runde`) },
    { id: 'downvotesPerPerson', label: 'Daumen runter pro Person', fallback: DEFAULT_DOWN, options: [0, 1, 2, 3, 5, UNLIMITED], tick: (v) => (v === UNLIMITED ? '∞' : String(v)), text: (v) => (v === UNLIMITED ? 'Unbegrenzt viele' : v === 0 ? 'Aus – nur Daumen hoch' : `${v} pro Runde`) }
]

// Spotify-Fehler in verständliche Sätze übersetzen
const friendlySpotifyError = (e) => {
    const m = String(e?.message || e || '')
    if (e?.code === 'NO_DEVICE' || /no active device|kein aktives|device not found|kein spotify-gerät/i.test(m)) return 'Kein Spotify-Gerät aktiv. Öffne Spotify auf einem Gerät oder spiel hier im Browser ab.'
    if (e?.code === 'FORBIDDEN' || /premium|restriction/i.test(m)) return 'Spotify hat die Wiedergabe abgelehnt – dafür braucht es Spotify Premium.'
    if (/token|expired|nicht mit spotify verbunden|401/i.test(m)) return 'Die Spotify-Verbindung ist abgelaufen. Bitte Spotify neu verbinden.'
    return m || 'Wiedergabe fehlgeschlagen.'
}

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
    if (idx < 0) {
        // Unbekannter Wert (ältere Playlist): nächstliegende Stufe anzeigen
        const num = (v) => (v === UNLIMITED ? Infinity : v)
        idx = options.reduce((best, o, i) => (Math.abs(num(o) - num(draft)) < Math.abs(num(options[best]) - num(draft)) ? i : best), 0)
    }
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
    const [invite, setInvite] = useState(null)               // { code, host, playerCount, songCount } | { code, missing: true }
    const [codeDraft, setCodeDraft] = useState('')

    // Music State
    const [playlist, setPlaylist] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchedQuery, setSearchedQuery] = useState('')   // zuletzt abgeschlossene Suche
    const [searchError, setSearchError] = useState(null)
    const [showAddModal, setShowAddModal] = useState(false)

    // Im Hinzufügen-Modal gerade hinzugefügte IDs (Haken, bevor Firestore zurückmeldet)
    const [addedInModalIds, setAddedInModalIds] = useState(() => new Set())
    const [addingId, setAddingId] = useState(null)

    // Album-Track-Ansicht im Suchmodal
    const [albumTracks, setAlbumTracks] = useState(null) // { album, tracks }
    const [isLoadingAlbum, setIsLoadingAlbum] = useState(false)
    const [streakInfoOpen, setStreakInfoOpen] = useState(false)

    // Spotify (Pflicht nur für den Host)
    const [spotifyConnected, setSpotifyConnected] = useState(null)   // null = wird geprüft
    const [spotifyPlayerReady, setSpotifyPlayerReady] = useState(false)
    const [spotifyError, setSpotifyError] = useState(null)
    const [spotifyDevices, setSpotifyDevices] = useState([])
    const [selectedSpotifyDeviceId, setSelectedSpotifyDeviceId] = useState('active') // 'active' = automatisch | deviceId
    const [deviceProblem, setDeviceProblem] = useState(null)  // Banner im Raum, wenn die Gewinner nicht starten
    const [batchRetry, setBatchRetry] = useState(0)
    const [hostVolume, setHostVolume] = useState(null)

    // Oberfläche
    const { isDark, toggleTheme } = useTheme()
    const [roomView, setRoomView] = useState('main')         // main | settings
    const [toast, setToast] = useState(null)                 // { text, tone: 'info' | 'bad' }
    const [startNotice, setStartNotice] = useState(null)     // Hinweis auf der Startseite (z. B. Playlist geschlossen)
    const [confirm, setConfirm] = useState(null)             // { kind: 'leave' | 'remove' | 'endVoting' | 'kick', item?, name? }
    const [confirmBusy, setConfirmBusy] = useState(false)
    const [busyAction, setBusyAction] = useState(null)       // 'create' | 'readd' | 'close' | Raumcode beim Beitreten
    const [sheet, setSheet] = useState(null)                 // 'help' | 'share' | 'close'
    const [showPeople, setShowPeople] = useState(false)
    const [showAllQueue, setShowAllQueue] = useState(false)
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const [previewId, setPreviewId] = useState(null)         // Spotify-Vorschau (eingebetteter Player)
    const [reveal, setReveal] = useState(null)               // Gewinner-Enthüllung nach einer Abstimmung
    const [ruleTab, setRuleTab] = useState(null)             // Einstellungen: gewählter Runden-Modus-Reiter
    const [artistQuery, setArtistQuery] = useState('')
    const [artistResults, setArtistResults] = useState([])
    const [keywordDraft, setKeywordDraft] = useState('')

    // Refs
    const unsubscribeRef = useRef(null)
    const lastPlayedTrackIdRef = useRef(null) // für automatisches Entfernen abgespielter Songs
    const lastDurationRef = useRef(null)      // Länge des laufenden Songs (für den Verlauf)
    const closingRef = useRef(false)          // Host schließt selbst: kein "wurde geschlossen"-Hinweis
    const leavingRef = useRef(false)          // Gast verlässt selbst: kein "entfernt"-Hinweis
    const toastTimerRef = useRef(null)
    const searchInputRef = useRef(null)
    const volumeTimerRef = useRef(null)
    const volumeTouchedRef = useRef(0)
    const myNameRef = useRef(myName)
    useEffect(() => { myNameRef.current = myName }, [myName])
    const latestLobbyRef = useRef(null)
    useLayoutEffect(() => { latestLobbyRef.current = lobbyData })
    const [showWelcomePopup, setShowWelcomePopup] = useState(false)

    const showToast = useCallback((text, tone = 'info') => {
        clearTimeout(toastTimerRef.current)
        setToast({ text, tone })
        toastTimerRef.current = setTimeout(() => setToast(null), 5500)
    }, [])
    useEffect(() => () => { clearTimeout(toastTimerRef.current); clearTimeout(volumeTimerRef.current) }, [])

    // Lesen + Ändern + Schreiben als Transaktion: gleichzeitige Änderungen anderer gehen nicht verloren.
    // change(data) muss ohne Nebenwirkungen sein (Firestore wiederholt sie bei Konflikten) und liefert
    // { update, ...beliebige Rückgabewerte }; ohne update wird nichts geschrieben.
    const mutateLobby = useCallback(async (code, change) => {
        const ref = doc(db, 'musicVoterLobbies', code)
        return runTransaction(db, async (tx) => {
            const snap = await tx.get(ref)
            if (!snap.exists()) return { missing: true }
            const res = change(snap.data()) || {}
            if (res.update) tx.update(ref, { ...res.update, lastActiveAt: Date.now() })
            return res
        })
    }, [db])

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
            // Host-UID wird gespeichert (nur dieses Gerät darf löschen) – dafür muss der anonyme Login stehen
            const auth = getAuth(getApp())
            await auth.authStateReady()
            if (!auth.currentUser) await signInAnonymously(auth)
            await setDoc(lobbyRef, {
                host: name,
                hostUid: auth.currentUser.uid,   // erlaubt dem Host-Gerät das Löschen (Firestore-Regeln)
                createdAt: serverTimestamp(),
                lastActiveAt: Date.now(),
                players: {
                    [name]: { emoji, joinedAt: serverTimestamp(), uid: auth.currentUser.uid }
                },
                playlist: [],
                history: [],
                leftovers: {},
                status: 'active',
                // Vorgabe "Normal"; Feinheiten unter "Erweitert"
                ...DEFAULT_PRESET.values,
                upvotesPerPerson: DEFAULT_UP,
                downvotesPerPerson: DEFAULT_DOWN,
                roundRule: null,
                streakEnabled: false,
                streaks: {},
                // Sammelphase ohne Timer – Host startet manuell
                lobbyPhase: 'songwahl',
                phaseEndsAt: null,
                phaseStartedAt: null,
                votingRound: 0,
                pendingBatch: null,
                lastResult: null,
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
    const handleJoinLobby = async (rawCode) => {
        const joinRoomId = String(rawCode || '').trim().toUpperCase()
        if (!db || busyAction) return
        if (!CODE_RE.test(joinRoomId)) { showToast('Der Raumcode hat 4–10 Buchstaben oder Ziffern.', 'bad'); return }
        if (joinRoomId === roomId) { handleRejoinRoom(); return }
        const name = commitName()
        if (!name) return
        const emoji = myEmoji

        setBusyAction(joinRoomId)
        try {
            // Geräte-ID (anonymer Login): erkennt einen erneuten Beitritt vom selben Handy
            const auth = getAuth(getApp())
            await auth.authStateReady()
            if (!auth.currentUser) await signInAnonymously(auth)
            const uid = auth.currentUser.uid
            // Als Transaktion: zwei Leute mit demselben Namen (auch in anderer Schreibweise) rutschen nicht durch
            const res = await mutateLobby(joinRoomId, (data) => {
                if (!isOpen(data)) return { missing: true }
                const existing = Object.keys(data.players || {}).find(k => nameKey(k) === nameKey(name))
                if (existing) {
                    // Gleicher Name vom selben Gerät = Wiedereintritt (z. B. nach abgebrochenem Beitritt), sonst vergeben
                    return data.players[existing]?.uid === uid ? { rejoin: existing } : { taken: true }
                }
                return { update: { [`players.${name}`]: { emoji, joinedAt: Date.now(), uid } } }
            })

            if (res.missing) {
                showToast(`Eine Playlist mit dem Code ${joinRoomId} gibt es nicht (mehr).`, 'bad')
                if (invite?.code === joinRoomId) setInvite({ code: joinRoomId, missing: true })
                return
            }
            if (res.taken) {
                showToast(`Den Namen „${name}“ gibt es in dieser Playlist schon. Wähl bitte einen anderen.`, 'bad')
                return
            }
            if (res.rejoin && res.rejoin !== name) {
                // Schreibweise aus der Playlist übernehmen (sonst passt der Schlüssel players.<Name> nicht)
                sessionStorage.setItem('mv_name', res.rejoin)
                setMyName(res.rejoin)
                setNameDraft(res.rejoin)
                myNameRef.current = res.rejoin
            }

            setRoomId(joinRoomId)
            setIsHost(false)
            sessionStorage.setItem('mv_roomId', joinRoomId)
            setStartNotice(null)
            setCodeDraft('')
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
            if (snap.exists() && isOpen(snap.data())) {
                const data = snap.data()
                setInvite({ code, host: data.host, playerCount: Object.keys(data.players || {}).length, songCount: (data.playlist || []).length })
            } else {
                setInvite({ code, missing: true })
            }
            setCurrentScreen('browse')
        }).catch(() => { if (!cancelled) setInvite({ code, missing: true }) })
        return () => { cancelled = true }
    }, [db, joinCode])

    // Einladung erledigt (beigetreten oder abgelehnt)
    const dropInvite = () => {
        setInvite(null)
        sessionStorage.removeItem('mv_invite')
    }

    // Lobby schließen (nur Host)
    const handleCloseLobby = async () => {
        if (!isHost || !db || !roomId) return
        closingRef.current = true
        const ref = doc(db, 'musicVoterLobbies', roomId)
        try {
            try { await deleteReactions(db, roomId) } catch { /* Reste stören nicht */ }
            try {
                await deleteDoc(ref)
            } catch (e) {
                // Anderes Gerät als beim Erstellen (Regeln erlauben Löschen nur dem Host-Gerät): als geschlossen markieren
                if (e?.code !== 'permission-denied') throw e
                await updateDoc(ref, { status: 'closed', lastActiveAt: Date.now() })
            }
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
        leavingRef.current = false
        unsubscribeRef.current?.()   // nie zwei Abos gleichzeitig

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)

        // Erst wenn wir uns einmal in der Teilnehmerliste gesehen haben, kann ein Fehlen "entfernt" bedeuten
        let seenSelf = false
        const unsubscribe = onSnapshot(lobbyRef, (snapshot) => {
            // Firebase liefert zuerst evtl. eine gemerkte, veraltete Fassung (z. B. von der Einladungs-Vorschau) –
            // die darf weder "entfernt" noch "geschlossen" auslösen. Entscheidend ist der Stand vom Server.
            const fromCache = snapshot.metadata.fromCache
            if (snapshot.exists() && isOpen(snapshot.data())) {
                const data = snapshot.data()
                const me = myNameRef.current
                const present = !!data.players && Object.prototype.hasOwnProperty.call(data.players, me)
                if (present) seenSelf = true
                // Vom Host entfernt (oder anderswo verlassen)?
                if (!present) {
                    if (fromCache) return
                    if (!leavingRef.current) {
                        setStartNotice(seenSelf
                            ? 'Du bist nicht mehr in der Playlist – der Host hat dich entfernt.'
                            : 'Du bist nicht (mehr) in dieser Playlist. Tritt einfach erneut bei.')
                    }
                    handleSessionEnd()
                    return
                }
                setLobbyData(data)
                setPlaylist(data.playlist || [])
                setIsHost(data.host === me)
            } else {
                if (fromCache) return
                // Lobby wurde gelöscht – Session vollständig beenden
                if (!closingRef.current) setStartNotice('Der Host hat die Playlist geschlossen.')
                handleSessionEnd()
            }
        }, (error) => {
            console.error('Playlist-Abo fehlgeschlagen:', error)
            showToast('Die Verbindung zur Playlist ist abgerissen. Bitte lade die Seite neu.', 'bad')
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
        setPreviewId(null)
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
    function handleSessionEnd() {
        if (unsubscribeRef.current) {
            unsubscribeRef.current()
            unsubscribeRef.current = null
        }
        closeAddModal()
        setConfirm(null)
        setSheet(null)
        setReveal(null)
        setPreviewId(null)
        setShowWelcomePopup(false)
        setRoomView('main')
        setCurrentScreen('lobby')
        setRoomId('')
        setIsHost(false)
        setLobbyData(null)
        setPlaylist([])
        setDeviceProblem(null)
        setNameDraft(myNameRef.current)
        sessionStorage.removeItem('mv_roomId')
    }

    // Lobby verlassen (Spieler wird aus der Lobby entfernt, Session endet)
    const handleLeaveLobby = async () => {
        leavingRef.current = true
        if (db && roomId && myName) {
            try {
                await updateDoc(doc(db, 'musicVoterLobbies', roomId), {
                    [`players.${myName}`]: deleteField()
                })
            } catch (error) {
                console.error('Fehler beim Verlassen:', error)
            }
        }
        handleSessionEnd()
    }

    // Host: Gast entfernen
    const handleKick = async (name) => {
        if (!isHost || !db || !roomId || name === myName) return
        try {
            await mutateLobby(roomId, (data) => (data.players?.[name] ? { update: { [`players.${name}`]: deleteField() } } : null))
            showToast(`${name} wurde entfernt.`)
        } catch (e) {
            console.error('Entfernen fehlgeschlagen:', e)
            showToast('Entfernen hat nicht geklappt.', 'bad')
        }
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
            if (!snap.exists() || !isOpen(snap.data())) {
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

    // Mehrere Songs auf einmal einreichen (Limit, Duplikate, ähnliche Songs und Runden-Modus in der Transaktion)
    const addManyToPlaylist = async (items) => {
        if (!db || !roomId) return { added: 0, error: 'Keine Verbindung zur Playlist.' }
        try {
            const res = await mutateLobby(roomId, (data) => {
                if (data.lobbyPhase === 'abstimmung') return { added: 0, error: 'Während der Abstimmung können keine Songs hinzugefügt werden.' }
                const current = data.playlist || []
                const maxSongs = limitsFor(data, myName, { maxSongs: 3, up: DEFAULT_UP, down: DEFAULT_DOWN }).maxSongs
                let free = maxSongs - current.filter(p => p.addedBy === myName && p.queuedRound == null).length
                const toAdd = []
                let duplicates = 0
                let limitHit = false
                let similar = null
                let ruleMiss = null
                for (const item of items) {
                    if (current.some(p => sameSong(p, item)) || toAdd.some(p => sameSong(p, item))) { duplicates++; continue }
                    const twin = current.find(p => similarSong(p, item))
                    if (twin) { similar = similar || twin; continue }
                    const problem = ruleProblem(data.roundRule, item)
                    if (problem) { ruleMiss = ruleMiss || problem; continue }
                    if (free <= 0) { limitHit = true; break }
                    const fresh = { ...item, addedBy: myName, votes: {}, addedAt: Date.now() }
                    delete fresh.queuedRound
                    // Firestore mag keine undefined-Werte
                    toAdd.push(Object.fromEntries(Object.entries(fresh).filter(([, v]) => v !== undefined)))
                    free--
                }
                return {
                    update: toAdd.length ? { playlist: [...current, ...toAdd] } : null,
                    added: toAdd.length, duplicates, limitHit, maxSongs, similar, ruleMiss
                }
            })
            if (res.missing) return { added: 0, error: 'Diese Playlist gibt es nicht mehr.' }
            return res
        } catch (error) {
            console.error('❌ Fehler beim Hinzufügen:', error)
            return { added: 0, error: 'Hinzufügen hat nicht geklappt: ' + (error.message || 'Unbekannter Fehler') }
        }
    }

    // Einen Song einreichen – true, wenn der Song danach (von dir) in der Playlist ist
    const addToPlaylist = async (item) => {
        const res = await addManyToPlaylist([item])
        if (res.added || res.duplicates) return true
        if (res.error) showToast(res.error, 'bad')
        else if (res.similar) showToast(`Ein sehr ähnlicher Song ist schon drin: „${res.similar.title}“ von ${res.similar.addedBy === myName ? 'dir' : res.similar.addedBy}.`, 'bad')
        else if (res.ruleMiss) showToast(res.ruleMiss, 'bad')
        else if (res.limitHit) showToast(`Du hast schon ${res.maxSongs} Songs eingereicht. In der nächsten Runde geht’s weiter.`, 'bad')
        return false
    }

    const myLimits = limitsFor(lobbyData, myName, { maxSongs: 3, up: DEFAULT_UP, down: DEFAULT_DOWN })
    const voteLimits = { up: myLimits.up, down: myLimits.down }

    // Vote für einen Song (Stimmen-Budget pro Runde, keine Stimmen für eigene Songs, als Transaktion)
    const handleVote = async (itemId, voteType) => {
        if (!db || !roomId || !myName) return
        if (lobbyData?.lobbyPhase !== 'abstimmung') return

        try {
            const res = await mutateLobby(roomId, (data) => {
                if (data.lobbyPhase !== 'abstimmung') return null
                const currentPlaylist = data.playlist || []
                const target = currentPlaylist.find(i => i.id === itemId)
                if (!target) return null
                if (target.addedBy === myName) return { own: true }
                const currentVote = target.votes?.[myName] || 0
                const wanted = voteType === 'up' ? 1 : -1
                const newVote = currentVote === wanted ? 0 : wanted

                if (newVote !== 0) {
                    const lim = limitsFor(data, myName, { maxSongs: 3, up: DEFAULT_UP, down: DEFAULT_DOWN })
                    const limit = newVote === 1 ? lim.up : lim.down
                    const used = currentPlaylist.filter(i => i.queuedRound == null && i.id !== itemId && i.votes?.[myName] === newVote).length
                    if (limit !== UNLIMITED && used >= limit) return { blocked: { limit, what: newVote === 1 ? 'Daumen hoch' : 'Daumen runter' } }
                }

                return {
                    update: {
                        playlist: currentPlaylist.map(item =>
                            item.id === itemId ? { ...item, votes: { ...item.votes, [myName]: newVote } } : item
                        )
                    }
                }
            })
            if (res?.own) showToast('Für deine eigenen Songs kannst du nicht abstimmen.', 'bad')
            if (res?.blocked) {
                const { limit, what } = res.blocked
                showToast(limit === 0
                    ? 'Daumen runter ist in dieser Playlist ausgeschaltet.'
                    : limit === 1
                        ? `Du hast deinen ${what} schon vergeben. Nimm ihn zurück, um umzuverteilen.`
                        : `Du hast alle ${limit} ${what} vergeben. Nimm einen zurück, um umzuverteilen.`, 'bad')
            }
        } catch (error) {
            console.error('Fehler beim Voten:', error)
            showToast('Deine Stimme konnte nicht gespeichert werden. Bitte nochmal tippen.', 'bad')
        }
    }

    // Song entfernen (nur Host oder Ersteller, nach Bestätigung im Sheet)
    const handleRemoveItem = async (itemId) => {
        if (!db || !roomId) return
        try {
            await mutateLobby(roomId, (data) => {
                const current = data.playlist || []
                const item = current.find(i => i.id === itemId)
                if (!item || (data.host !== myName && item.addedBy !== myName)) return null
                return { update: { playlist: current.filter(i => i.id !== itemId) } }
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
            const releaseYear = parseInt(data.release_date, 10) || album.releaseYear || null
            const tracks = (data.tracks?.items || []).map(t => ({
                id: `spotify_track_${t.id}`,
                spotifyId: t.id,
                title: t.name,
                artist: t.artists?.map(a => a.name).join(', ') || album.artist,
                artistIds: t.artists?.map(a => a.id) || [],
                album: album.title,
                releaseYear,
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

    // Spotify-Suche (mit Filter des Runden-Modus)
    const handleSpotifySearch = async () => {
        const q = searchQuery.trim()
        if (!q && lobbyData?.roundRule?.type !== 'decade') return

        setIsSearching(true)
        setSearchError(null)

        try {
            const results = await spotifyService.search(ruleSearchQuery(lobbyData?.roundRule, q).trim(), 10)
            setSearchResults(results)
            if (results.length === 0) log('Keine Ergebnisse für:', q)
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

    // Jahrzehnt-Runde: ohne Suchwort gleich die beliebtesten Songs des Jahrzehnts zeigen
    const searchable = (q) => q.length >= 2 || (q.length === 0 && lobbyData?.roundRule?.type === 'decade')

    // Suche startet automatisch kurz nach dem Tippen
    useEffect(() => {
        if (!showAddModal) return
        if (!searchable(searchQuery.trim())) { setSearchResults([]); setSearchError(null); return }
        const id = setTimeout(() => handleSpotifySearch(), 500)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, showAddModal, lobbyData?.roundRule?.type, lobbyData?.roundRule?.artistId, lobbyData?.roundRule?.from])

    const openAddModal = () => {
        setAddedInModalIds(new Set())
        // Runden-Modus: Suche gleich passend vorausfüllen (Jahrzehnt: Treffer erscheinen auch ohne Suchwort)
        const r = lobbyData?.roundRule
        if (!searchQuery.trim() && r?.type === 'artist') setSearchQuery(r.artistName)
        if (!searchQuery.trim() && r?.type === 'keyword') setSearchQuery(r.word)
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

    // Eigenen, noch nicht gewählten Song in der Auswahl wieder abwählen
    const handleUnpick = async (item, existing) => {
        if (addingId) return
        setAddingId(item.id)
        await handleRemoveItem(existing.id)
        setAddingId(null)
        setAddedInModalIds(prev => { const next = new Set(prev); next.delete(item.id); next.delete(item.spotifyId); return next })
    }

    // Zweite Chance: nicht gewählte Songs der letzten Runde erneut einreichen
    const handleReAddAll = async (items) => {
        if (busyAction) return
        setBusyAction('readd')
        const res = await addManyToPlaylist(items)
        setBusyAction(null)
        if (res.error) showToast(res.error, 'bad')
        else if (res.added && (res.limitHit || res.ruleMiss || res.similar)) showToast(`${res.added} von ${items.length} Songs eingereicht${res.limitHit ? ` – dann war dein Limit von ${res.maxSongs} erreicht` : ' – der Rest passt gerade nicht'}.`)
        else if (res.added) showToast(res.added === 1 ? 'Song erneut eingereicht.' : `${res.added} Songs erneut eingereicht.`)
        else if (res.ruleMiss) showToast(res.ruleMiss, 'bad')
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

    const sortedPlaylist = [...playlist].sort(byScore)

    // Schon in dieser Playlist gelaufene Songs (Verlauf) – für die Warnung "Lief schon"
    const playedIds = new Set((lobbyData?.history || []).map(h => h.spotifyId).filter(Boolean))
    const wasPlayed = (item) => !!item.spotifyId && playedIds.has(item.spotifyId)

    // Host: Einstellungen aktualisieren
    // Strengere Regeln gelten ab der nächsten Runde, sobald schon Songs eingereicht sind (siehe splitConfigChange)
    const updateLobbyConfig = async (changes) => {
        if (!db || !roomId) return
        try {
            const res = await mutateLobby(roomId, (data) => {
                if ('pendingConfig' in changes) return { update: { pendingConfig: null, lastActiveAt: Date.now() } }   // Vorgemerktes zurücknehmen
                const { now, later } = splitConfigChange(data, changes, 3)
                const pending = { ...(data.pendingConfig || {}) }
                Object.keys(now).forEach(k => { delete pending[k] })   // sofort Geltendes hebt Vorgemerktes auf
                Object.assign(pending, later)
                return { update: { ...now, pendingConfig: Object.keys(pending).length ? pending : null, lastActiveAt: Date.now() }, deferred: Object.keys(later).length > 0 }
            })
            if (res?.deferred) showToast('Gilt ab der nächsten Runde – es sind schon Songs eingereicht.')
        } catch (e) {
            console.error('Fehler beim Aktualisieren der Lobby-Konfiguration:', e)
            showToast('Die Einstellung konnte nicht gespeichert werden.', 'bad')
        }
    }

    const startVotingUpdate = (data, now, maxMs = Infinity) => ({
        lobbyPhase: 'abstimmung',
        phaseStartedAt: now,
        phaseEndsAt: now + Math.min((data.votingDurationSec || 90) * 1000, maxMs),
        votingRound: (data.votingRound || 0) + 1
    })

    // Host: Abstimmung manuell starten (aus Sammeln oder während die Playlist läuft)
    const handleStartAbstimmung = async () => {
        if (!isHost || !db || !roomId) return
        try {
            await mutateLobby(roomId, (data) => {
                if (data.lobbyPhase === 'abstimmung') return null
                if (!(data.playlist || []).some(i => i.queuedRound == null)) return null
                return { update: startVotingUpdate(data, Date.now()) }
            })
        } catch (e) {
            console.error('Abstimmung starten fehlgeschlagen:', e)
            showToast('Die Abstimmung konnte nicht gestartet werden. Bitte nochmal versuchen.', 'bad')
        }
    }

    // Host: Nicht mehr Songs als Plätze → ohne Abstimmung alle in die Warteschlange
    const handleQueueAll = async () => {
        if (!isHost || !db || !roomId) return
        try {
            await mutateLobby(roomId, (data) => {
                if (data.lobbyPhase === 'abstimmung') return null
                if (!(data.playlist || []).some(i => i.queuedRound == null)) return null
                return { update: finishRound(data, Date.now(), { voted: false }) }
            })
        } catch (e) {
            console.error('Warteschlange füllen fehlgeschlagen:', e)
            showToast('Das hat nicht geklappt. Bitte nochmal versuchen.', 'bad')
        }
    }

    // Host: Abstimmung vorzeitig beenden – der Phasenwechsel unten wertet sofort aus
    const handleEndVoting = async () => {
        if (!isHost || !db || !roomId || lobbyData?.lobbyPhase !== 'abstimmung') return
        await updateLobbyConfig({ phaseEndsAt: Date.now() })
    }

    // Phasenwechsel nach Ablauf des Countdowns. Der Host wertet sofort aus; ist er weg (Handy im Standby),
    // übernimmt nach ein paar Sekunden jedes andere Gerät. Die Transaktion sorgt dafür, dass es nur einmal passiert.
    useEffect(() => {
        if (!db || !roomId || !lobbyData) return
        const phase = lobbyData.lobbyPhase
        if (phase !== 'abstimmung' || !lobbyData.phaseEndsAt) return

        const transition = async () => {
            try {
                await mutateLobby(roomId, (data) => {
                    if (data.lobbyPhase !== 'abstimmung' || !data.phaseEndsAt || data.phaseEndsAt > Date.now() + 1000) return null   // schon gewechselt / noch nicht fällig
                    return { update: finishRound(data, Date.now(), { voted: true }) }
                })
            } catch (e) {
                console.error('Phasenwechsel fehlgeschlagen:', e)
            }
        }

        const remaining = lobbyData.phaseEndsAt - Date.now()
        const delay = remaining + (isHost ? 100 : 6000)
        if (delay <= 0) { transition(); return }
        const id = setTimeout(transition, delay)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, db, roomId, lobbyData?.lobbyPhase, lobbyData?.phaseEndsAt])

    // Uhr für Fortschritt, Countdown und Restzeit (eine Sekunde reicht für die Anzeige)
    const [clock, setClock] = useState(() => Date.now())
    useEffect(() => {
        if (currentScreen !== 'room') return
        const id = setInterval(() => setClock(Date.now()), 1000)
        return () => clearInterval(id)
    }, [currentScreen])
    const rawNowPlaying = lobbyData?.nowPlaying            // so, wie der Host es zuletzt gemeldet hat
    const nowPlaying = liveNowPlaying(lobbyData, clock)    // für die Anzeige hochgerechnet, falls der Host im Hintergrund ist
    const nowPlayingPositionMs = nowPosition(nowPlaying, clock)
    const phaseRemainingMs = lobbyData?.lobbyPhase === 'abstimmung' && lobbyData.phaseEndsAt ? Math.max(0, lobbyData.phaseEndsAt - clock) : 0

    // Abstimmung beginnt, während "Song hinzufügen" offen ist → zurück in die Playlist
    useEffect(() => {
        if (showAddModal && lobbyData?.lobbyPhase === 'abstimmung') {
            closeAddModal()
            showToast('Die Abstimmung hat begonnen.')
        }
    }, [showAddModal, lobbyData?.lobbyPhase, showToast])

    // Gewinner-Enthüllung: einmal pro Runde und Gerät, nur kurz nach der Auswertung
    useEffect(() => {
        const res = lobbyData?.lastResult
        if (!res || !roomId) return
        const key = `mv_seen_result_${roomId}`
        if (Number(sessionStorage.getItem(key)) === res.round) return
        sessionStorage.setItem(key, String(res.round))
        if (Date.now() - res.at < 120000) setReveal(res)
    }, [lobbyData?.lastResult, roomId])

    // Gespielte Songs aus der Playlist in den Verlauf verschieben (Transaktion; schon verschoben → nichts passiert).
    // before: der neue Song – alles, was in der Warteschlange davor steht, ist inzwischen gelaufen
    // (mehrfach übersprungen oder gelaufen, während das Host-Gerät im Hintergrund war).
    const moveToHistory = useCallback(async (trackIds, { durations = {}, before = null } = {}) => {
        if (!db || !roomId) return
        try {
            await mutateLobby(roomId, (data) => {
                const current = data.playlist || []
                const done = new Set(trackIds.filter(Boolean))
                if (before) {
                    const order = queueOrder(data)
                    order.slice(0, Math.max(0, order.findIndex(i => i.spotifyId === before))).forEach(i => done.add(i.spotifyId))
                    done.delete(before)
                }
                const played = current.filter(i => done.has(i.spotifyId))
                if (!played.length) return null
                const now = Date.now()
                const entries = played.map(p => {
                    const { up, down } = voteCounts(p)
                    return {
                        spotifyId: p.spotifyId,
                        title: p.title || '',
                        artist: p.artist || '',
                        imageUrl: p.imageUrl || null,
                        addedBy: p.addedBy || '',
                        up, down, score: up - down,
                        round: p.queuedRound ?? null,
                        durationMs: durations[p.spotifyId] || p.duration || null,
                        playedAt: now
                    }
                })
                return { update: { playlist: current.filter(i => !done.has(i.spotifyId)), history: [...(data.history || []), ...entries] } }
            })
        } catch { /* nächster Durchlauf versucht es erneut */ }
    }, [db, roomId, mutateLobby])

    // Host: Playback-Status nach Firestore schreiben – nur bei Änderungen (Songwechsel, Pause, Sprung),
    // den Fortschritt rechnen alle Geräte selbst hoch. Abgespielte Songs wandern in den Verlauf.
    // Im Hintergrund drosselt der Browser den Takt – beim Zurückholen der App wird sofort nachgefragt.
    useEffect(() => {
        if (!isHost || !spotifyConnected || !db || !roomId) return
        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        let lastWrite = null                         // { trackId, isPlaying, pos, at }
        let lastBeat = Date.now()
        const progress = { trackId: null, maxPos: 0, duration: 0, moved: false }
        let busy = false
        const poll = async () => {
            if (busy) return
            busy = true
            try {
                const state = await spotifyService.getPlaybackState()
                const now = Date.now()
                const trackId = state?.trackId ?? null
                const isPlaying = !!state?.isPlaying
                if (state?.volumePercent != null && now - volumeTouchedRef.current > 4000) setHostVolume(state.volumePercent)
                const expectedPos = lastWrite ? lastWrite.pos + (lastWrite.isPlaying ? now - lastWrite.at : 0) : 0
                const changed = !lastWrite || trackId !== lastWrite.trackId || isPlaying !== lastWrite.isPlaying
                    || (state && Math.abs((state.positionMs || 0) - expectedPos) > 4000)
                if (changed || now - lastBeat > 5 * 60 * 1000) {
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
                            : null,
                        lastActiveAt: now     // Lebenszeichen
                    })
                    lastWrite = { trackId, isPlaying, pos: state?.positionMs || 0, at: now }
                    lastBeat = now
                }

                // Songwechsel: vorherigen Song in den Verlauf
                if (trackId && lastPlayedTrackIdRef.current && lastPlayedTrackIdRef.current !== trackId) {
                    const prev = lastPlayedTrackIdRef.current
                    await moveToHistory([prev], { durations: { [prev]: lastDurationRef.current }, before: trackId })
                }
                // Letzter Song der Warteschlange: Spotify stoppt, es kommt kein Wechsel mehr → Ende erkennen
                if (trackId !== progress.trackId) Object.assign(progress, { trackId, maxPos: 0, duration: state?.durationMs || 0, moved: false })
                progress.maxPos = Math.max(progress.maxPos, state?.positionMs || 0)
                if (trackId && !isPlaying && !progress.moved && progress.duration && progress.maxPos >= progress.duration * 0.9) {
                    progress.moved = true
                    await moveToHistory([trackId], { durations: { [trackId]: progress.duration } })
                }
                if (trackId) {
                    lastPlayedTrackIdRef.current = trackId
                    lastDurationRef.current = state.durationMs || null
                }
            } catch {
                // z.B. kein Token oder Player inaktiv – ignorieren
            } finally {
                busy = false
            }
        }
        const interval = setInterval(poll, 2000)
        const onVisible = () => { if (document.visibilityState === 'visible') poll() }
        document.addEventListener('visibilitychange', onVisible)
        return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
    }, [isHost, spotifyConnected, db, roomId, moveToHistory])

    // Spotify: Web Playback Player ("Amplify Host") initialisieren, wenn Host verbunden
    useEffect(() => {
        if (!isHost || !spotifyConnected || spotifyPlayerReady) return
        setSpotifyError(null)
        spotifyService.initPlaybackPlayer(
            () => setSpotifyPlayerReady(true),
            (msg) => setSpotifyError(friendlySpotifyError(msg || 'Spotify-Fehler'))
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
                setSpotifyDevices(await spotifyService.getDevices())
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
        setSpotifyError(null)
    }

    // Gerät finden: gewähltes → aktives → "Amplify Host" (dieser Browser) → erstes verfügbares
    const pickDevice = async (override) => {
        if (override) return override
        let list = []
        try { list = await spotifyService.getDevices() } catch { /* leer */ }
        setSpotifyDevices(list)
        if (selectedSpotifyDeviceId !== 'active' && list.some(d => d.id === selectedSpotifyDeviceId)) return selectedSpotifyDeviceId
        const active = list.find(d => d.is_active)
        if (active) return active.id
        const own = spotifyService.getDeviceId() || list.find(d => d.name === 'Amplify Host')?.id
        if (own) return own
        if (list[0]) return list[0].id
        const e = new Error('Kein Spotify-Gerät gefunden.')
        e.code = 'NO_DEVICE'
        throw e
    }

    // Abspielen = die Warteschlange (Gewinner), nicht der ungeprüfte Pool
    const queueSongs = queueOrder(lobbyData).filter((item) => item.source === 'spotify' && item.spotifyId && item.type === 'song')

    // Songs kommen immer in die Spotify-Warteschlange ("Als Nächstes"), nie als Abspielliste: dort wird hinten
    // angehängt, also können neue Gewinner jederzeit dazu – ohne den laufenden Song oder den Rest zu überholen.
    // Läuft gerade nichts von uns, startet der erste Song direkt. Vorher Abgleich, damit nichts doppelt landet.
    const playingOurs = !!rawNowPlaying?.isPlaying && playlist.some(i => i.spotifyId === rawNowPlaying.trackId)
    const pushToSpotify = async (ids, device) => {
        if (!ids.length) return
        let inSpotify = []
        try { inSpotify = await spotifyService.getQueueIds() } catch { /* ohne Abgleich weiter */ }
        let rest = ids
        if (!playingOurs) {
            await spotifyService.playOnDevice([`spotify:track:${ids[0]}`], device)
            rest = ids.slice(1)
        }
        for (const id of rest) {
            if (!inSpotify.includes(id)) await spotifyService.addToQueue(`spotify:track:${id}`, device)
        }
    }
    // Übergabe geschafft: zurück ins Einreichen – die Musik läuft, die nächste Abstimmung startet automatisch
    const handedOver = (data) => ({ pendingBatch: null, ...(data.lobbyPhase === 'laeuft' ? { lobbyPhase: 'songwahl', phaseStartedAt: Date.now() } : {}) })

    const sendQueueToSpotify = async (deviceOverride) => {
        if (queueSongs.length === 0) {
            setSpotifyError('Die Warteschlange ist leer. Starte eine Abstimmung – die Gewinner landen hier.')
            return
        }
        setSpotifyError(null)
        try {
            const device = await pickDevice(deviceOverride)
            await pushToSpotify(queueSongs.map(i => i.spotifyId), device)
            setDeviceProblem(null)
            await mutateLobby(roomId, (data) => (data.pendingBatch ? { update: handedOver(data) } : null))
        } catch (e) {
            const msg = friendlySpotifyError(e)
            setSpotifyError(msg)
            setDeviceProblem(msg)
        }
    }

    // "Hier im Browser abspielen": Browser-Player per Antippen freischalten (Autoplay-Regeln) und als Gerät nutzen
    const playHere = async () => {
        spotifyService.activateAudio()
        try {
            await spotifyService.ensurePlaybackPlayerReady({ name: 'Amplify Host' })
            const id = spotifyService.getDeviceId()
            if (!id) throw new Error('Der Browser-Player ist noch nicht bereit.')
            setSelectedSpotifyDeviceId(id)
            setDeviceProblem(null)
            if (lobbyData?.pendingBatch) setBatchRetry(n => n + 1)
            else if (queueSongs.length && !nowPlaying?.isPlaying) await sendQueueToSpotify(id)
        } catch (e) {
            showToast(friendlySpotifyError(e), 'bad')
        }
    }

    const handlePausePlayback = async () => {
        try {
            if (nowPlaying?.isPlaying) await spotifyService.pausePlayback()
            else await spotifyService.resumePlayback()
        } catch (e) {
            console.error('Pause/Resume fehlgeschlagen:', e)
            showToast(friendlySpotifyError(e), 'bad')
        }
    }

    const handleSkip = async () => {
        try { await spotifyService.skipNext() } catch (e) { showToast(friendlySpotifyError(e), 'bad') }
    }

    const handleVolume = (v) => {
        setHostVolume(v)
        volumeTouchedRef.current = Date.now()
        clearTimeout(volumeTimerRef.current)
        volumeTimerRef.current = setTimeout(() => { spotifyService.setVolume(v).catch(() => { /* egal */ }) }, 250)
    }

    // Host: Gewinner einer Runde sofort an Spotify übergeben (hinten an die Warteschlange). Danach spielt Spotify
    // sie von selbst – auch wenn das Host-Gerät inzwischen im Hintergrund ist.
    const batchSendingRef = useRef(false)
    useEffect(() => {
        const applyPendingBatch = async () => {
            if (!isHost || !spotifyConnected || !db || !roomId || batchSendingRef.current) return
            const pending = lobbyData?.pendingBatch
            if (!pending || !Array.isArray(pending.spotifyIds) || pending.spotifyIds.length === 0) return

            batchSendingRef.current = true
            try {
                const device = await pickDevice()
                await pushToSpotify(pending.spotifyIds, device)
                setSpotifyError(null)
                setDeviceProblem(null)
                await mutateLobby(roomId, (data) => (data.pendingBatch?.round === pending.round ? { update: handedOver(data) } : null))
            } catch (e) {
                console.error('Fehler beim Senden der Runde an Spotify:', e)
                const msg = friendlySpotifyError(e)
                setSpotifyError(msg)
                setDeviceProblem(msg)
            } finally {
                batchSendingRef.current = false
            }
        }

        applyPendingBatch()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, spotifyConnected, lobbyData?.pendingBatch, selectedSpotifyDeviceId, batchRetry, db, roomId])

    // Host: Bildschirm wach halten, solange die Playlist offen ist – ein gesperrtes Handy meldet keine Songwechsel
    useEffect(() => {
        if (!isHost || currentScreen !== 'room') return
        let lock = null
        const request = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* nicht unterstützt */ } }
        const onVisible = () => { if (document.visibilityState === 'visible') request() }
        request()
        document.addEventListener('visibilitychange', onVisible)
        return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release?.() }
    }, [isHost, currentScreen])

    // Wenn nur noch wenig Musik übrig ist → nächste Abstimmung starten (oder bei wenigen Songs direkt einreihen).
    // Der Host macht das sofort; die anderen Geräte springen nach 15 s ein, falls das Host-Gerät im Hintergrund ist.
    // Die Transaktion prüft die Runde – starten zwei Geräte gleichzeitig, passiert nichts doppelt.
    const autoRoundRef = useRef(null)
    const emptyNoticeRef = useRef(null)
    const dueSinceRef = useRef(null)
    useEffect(() => {
        if (!db || !roomId || lobbyData?.lobbyPhase === 'abstimmung') return
        const id = setInterval(async () => {
            const data = latestLobbyRef.current
            if (!data || data.lobbyPhase === 'abstimmung') return
            const wait = nextVotingInMs(data, Date.now())
            if (wait == null || wait > 0) { dueSinceRef.current = null; return }
            if (!isHost) {
                dueSinceRef.current ??= Date.now()
                if (Date.now() - dueSinceRef.current < 15000) return
            }
            const round = data.votingRound || 0
            if (autoRoundRef.current === round) return
            autoRoundRef.current = round
            try {
                const res = await mutateLobby(roomId, (d) => {
                    if (d.lobbyPhase === 'abstimmung' || (d.votingRound || 0) !== round) return null
                    const pool = (d.playlist || []).filter(i => i.queuedRound == null)
                    if (!pool.length) return { empty: true }
                    if (pool.length <= (d.batchSize || 10)) return { update: finishRound(d, Date.now(), { voted: false }), skipped: pool.length }
                    // Abstimmung soll fertig sein, bevor die Musik ausgeht (Rest minus 20 s, mindestens 45 s)
                    const rem = queueRemainingMs(d, Date.now())
                    return { update: startVotingUpdate(d, Date.now(), rem != null ? Math.max(45000, rem - 20000) : Infinity) }
                })
                if (res?.empty) {
                    autoRoundRef.current = null   // weiter prüfen – sobald Songs da sind, geht's los
                    if (!isHost) dueSinceRef.current = Date.now()   // Gäste prüfen dann seltener
                    else if (emptyNoticeRef.current !== round) {
                        emptyNoticeRef.current = round
                        showToast('Die Warteschlange endet bald – es fehlen neue Songs für die nächste Runde.')
                    }
                }
                if (res?.skipped && isHost) showToast(`${res.skipped} ${res.skipped === 1 ? 'Song kommt' : 'Songs kommen'} ohne Abstimmung in die Warteschlange – es gab nicht mehr Songs als Plätze.`)
            } catch (e) {
                autoRoundRef.current = null
                console.error('Nächste Runde starten fehlgeschlagen:', e)
            }
        }, 3000)
        return () => clearInterval(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, db, roomId, lobbyData?.lobbyPhase])

    // ─── Runden-Modus: Künstlersuche ─────────────────────────────────────────
    useEffect(() => {
        if (ruleTab !== 'artist' || artistQuery.trim().length < 2) { setArtistResults([]); return }
        let cancelled = false
        const id = setTimeout(() => {
            spotifyService.searchArtists(artistQuery.trim())
                .then((list) => { if (!cancelled) setArtistResults(list) })
                .catch(() => { if (!cancelled) setArtistResults([]) })
        }, 400)
        return () => { cancelled = true; clearTimeout(id) }
    }, [artistQuery, ruleTab])

    const setRoundRule = async (rule) => {
        await updateLobbyConfig({ roundRule: rule })
        showToast(rule ? `${ruleEmoji(rule)} ${ruleLabel(rule)} – gilt für alle neuen Songs.` : 'Freie Runde – alle Songs erlaubt.')
        setArtistQuery('')
        setArtistResults([])
        setKeywordDraft('')
    }

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
        if (reveal) { setReveal(null); return true }
        if (sheet) { setSheet(null); return true }
        if (previewId) { setPreviewId(null); return true }
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
    const phase = lobbyData?.lobbyPhase || 'songwahl'
    const batchSize = lobbyData?.batchSize || 10
    const maxSongs = myLimits.maxSongs
    const streakBonusActive = myLimits.bonus.active
    const rule = lobbyData?.roundRule || null
    const myUnqueuedCount = playlist.filter(p => p.addedBy === myName && p.queuedRound == null).length
    const poolItems = sortedPlaylist.filter(i => i.queuedRound == null)
    const myUpUsed = poolItems.filter(i => i.votes?.[myName] === 1).length
    const myDownUsed = poolItems.filter(i => i.votes?.[myName] === -1).length
    const players = Object.entries(lobbyData?.players || {})
        .map(([name, p]) => ({ name, emoji: p?.emoji || '🙂' }))
        .sort((a, b) => (a.name === lobbyData?.host ? -1 : b.name === lobbyData?.host ? 1 : a.name.localeCompare(b.name, 'de')))
    const playerCount = players.length
    const activeNames = new Set([
        ...playlist.flatMap(i => [i.addedBy, ...Object.entries(i.votes || {}).filter(([, v]) => v !== 0).map(([n]) => n)]),
        ...(lobbyData?.history || []).map(h => h.addedBy),
        ...Object.keys(lobbyData?.leftovers || {})
    ])
    const voterNames = new Set(poolItems.flatMap(i => Object.entries(i.votes || {}).filter(([, v]) => v !== 0).map(([n]) => n)))
    const voterCount = voterNames.size
    const queueItems = lobbyData ? upcomingQueue(lobbyData, clock) : []
    const remainingMusic = lobbyData ? queueRemainingMs(lobbyData, clock) : null
    // Musik läuft: Gewinner werden übergeben ("laeuft") oder schon in der Warteschlange, während neue Songs gesammelt werden
    const musicOn = phase === 'laeuft' || (phase === 'songwahl' && remainingMusic != null)
    const nextVoting = lobbyData ? nextVotingInMs(lobbyData, clock) : null

    // ─── Sicherheitsabfragen ─────────────────────────────────────────────────
    const confirmConfig = (() => {
        if (!confirm) return null
        if (confirm.kind === 'leave') return {
            title: 'Playlist verlassen?', text: 'Du wirst aus der Playlist entfernt. Deine eingereichten Songs bleiben drin.',
            cancelLabel: 'Bleiben', confirmLabel: 'Verlassen', run: handleLeaveLobby
        }
        if (confirm.kind === 'remove') return {
            title: 'Song entfernen?', text: `„${confirm.item.title}“ wird aus der Playlist entfernt.`,
            cancelLabel: 'Abbrechen', confirmLabel: 'Entfernen', run: () => handleRemoveItem(confirm.item.id)
        }
        if (confirm.kind === 'endVoting') return {
            title: 'Abstimmung beenden?', text: `${voterCount} von ${playerCount} haben abgestimmt. Die Top ${batchSize} Songs kommen sofort in die Warteschlange.`,
            cancelLabel: 'Weiter abstimmen', confirmLabel: 'Jetzt beenden', run: handleEndVoting
        }
        if (confirm.kind === 'kick') return {
            title: `${confirm.name} entfernen?`, text: 'Die Person fliegt aus der Playlist. Ihre Songs bleiben drin.',
            cancelLabel: 'Abbrechen', confirmLabel: 'Entfernen', run: () => handleKick(confirm.name)
        }
        return null
    })()

    const closeConfirm = useCallback(() => setConfirm(null), [])
    const closeSheet = useCallback(() => setSheet(null), [])
    const closeReveal = useCallback(() => setReveal(null), [])
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
    const closeLobbyNow = async () => {
        setBusyAction('close')
        setSheet(null)
        await handleCloseLobby()
        setBusyAction(null)
    }

    // ─── Gemeinsame Bausteine der Oberfläche ─────────────────────────────────
    const rootClass = `${styles.mvRoot} ${isDark ? theme.dark : theme.light}`
    const themeLabel = isDark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'
    const themeBtn = (
        <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {isDark ? <IconSun /> : <IconMoon />}
        </button>
    )
    const subHeader = (title, onBackClick, extra = null, withTheme = true) => (
        <header className={`${styles.mvSubHeader} ${styles.mvPad}`}>
            <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={onBackClick} aria-label="Zurück"><IconBack /></button>
            <h1 className={styles.mvSubTitle}>{title}</h1>
            {extra}
            {withTheme && themeBtn}
        </header>
    )
    const playedChip = <span className={styles.mvPlayedChip}>Lief schon</span>
    const previewBtn = (item) => (
        item.spotifyId && item.type !== 'album' ? (
            <button type="button" className={`${styles.mvBtn} ${styles.mvCoverBtn} ${previewId === item.spotifyId ? styles.mvCoverBtnOn : ''}`}
                onClick={() => setPreviewId(previewId === item.spotifyId ? null : item.spotifyId)}
                aria-label={previewId === item.spotifyId ? `Vorschau von ${item.title} schließen` : `Vorschau von ${item.title} anhören`}>
                <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={46} radius={10} />
                <span className={styles.mvCoverPlay} aria-hidden="true">{previewId === item.spotifyId ? <IconWave size={16} /> : <IconPlay size={14} />}</span>
            </button>
        ) : <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={46} radius={10} />
    )

    // Hilfe-Text: Rolle + was man in der aktuellen Phase tun kann
    const helpText = (() => {
        const up = voteLimits.up === UNLIMITED ? 'beliebig viele' : voteLimits.up
        const down = voteLimits.down === UNLIMITED ? 'beliebig viele' : voteLimits.down
        const voteRule = voteLimits.down === 0 ? `Du hast ${up} Daumen hoch.` : `Du hast ${up} Daumen hoch und ${down} Daumen runter.`
        if (isHost) return {
            role: 'Du bist Host',
            intro: 'Du hast die Playlist erstellt. Die Gewinner-Songs laufen über dein Spotify, und du steuerst die Runden.',
            now: phase === 'abstimmung'
                ? `${voteRule} Die Punkte sieht man erst am Ende. Wenn alle abgestimmt haben, kannst du die Abstimmung vorzeitig beenden.`
                : phase === 'laeuft'
                    ? 'Die Gewinner werden gerade an Spotify übergeben.'
                    : musicOn
                        ? 'Die Musik läuft. Die nächste Abstimmung startet automatisch, wenn nur noch wenig Musik übrig ist – du kannst sie auch früher starten, die Gewinner werden dann hinten angehängt.'
                        : `Reich bis zu ${maxSongs} Songs ein. Wenn alle fertig sind, starte die Abstimmung.`,
            extra: 'Teilen lädt Gäste ein und öffnet das Live-Board. In den Einstellungen findest du Gerät, Runden-Modus und Teilnehmer-Optionen.'
        }
        return {
            role: 'Du bist Gast',
            intro: 'Du schlägst Songs vor und stimmst mit ab. Der Host spielt die Gewinner über Spotify.',
            now: phase === 'abstimmung'
                ? `${voteRule} Für eigene Songs kannst du nicht stimmen. Die Punkte gibt’s erst am Ende.`
                : musicOn
                    ? `Die Musik läuft. Schlag schon bis zu ${maxSongs} Songs für die nächste Runde vor.`
                    : `Reich bis zu ${maxSongs} Songs ein. Der Host startet danach die Abstimmung.`,
            extra: `Nicht gewählte Songs findest du nach der Abstimmung unter „Zweite Chance“. Tippe auf ein Cover für eine Hörprobe.${lobbyData?.streakEnabled ? ' Streak ist an: Landet ein Song von dir auf Platz 1, bekommst du für die nächste Runde einen Bonus – und mehr, je öfter es in Folge klappt.' : ''}`
        }
    })()

    const shell = (content) => (
        <div className={rootClass}>
            <div className={styles.mvApp}>
                {content}

                {previewId && (
                    <div className={styles.mvPreview} role="region" aria-label="Hörprobe">
                        <iframe key={previewId} title="Spotify-Hörprobe" src={`https://open.spotify.com/embed/track/${previewId}?utm_source=generator&theme=0`}
                            width="100%" height="80" frameBorder="0" loading="lazy"
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
                        <button type="button" className={`${styles.mvBtn} ${styles.mvPreviewClose}`} onClick={() => setPreviewId(null)} aria-label="Hörprobe schließen"><IconX size={16} /></button>
                    </div>
                )}

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

                <BottomSheet open={sheet === 'close' && currentScreen === 'room'} onClose={closeSheet} labelledBy="mv-close-title" busy={busyAction === 'close'}>
                    <h2 id="mv-close-title" className={styles.mvSheetTitle}>Playlist beenden?</h2>
                    <p className={styles.mvSheetText}>Die Playlist wird für alle beendet und alle Gäste werden entfernt.</p>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={closeLobbyNow} disabled={busyAction === 'close'}>Playlist beenden</button>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={closeSheet} disabled={busyAction === 'close'}>Abbrechen</button>
                </BottomSheet>

                <BottomSheet open={showWelcomePopup && currentScreen === 'room'} onClose={() => setShowWelcomePopup(false)} labelledBy="mv-welcome-title">
                    <h2 id="mv-welcome-title" className={styles.mvSheetTitle}>Willkommen bei Amplify!</h2>
                    <p className={styles.mvSheetText}>So läuft eine Runde:</p>
                    <ol className={styles.mvSteps}>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconPlus size={20} /></span>
                            <span><strong>Songs sammeln</strong>Füge bis zu {maxSongs} Songs hinzu. Tippe aufs Cover für eine Hörprobe.</span>
                        </li>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconBallot size={20} /></span>
                            <span><strong>Abstimmen</strong>Verteil deine Daumen – die Punkte werden erst am Ende aufgedeckt.</span>
                        </li>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconPlay size={16} /></span>
                            <span><strong>Abspielen</strong>Die Gewinner laufen. Währenddessen schlägst du Songs für die nächste Runde vor.</span>
                        </li>
                    </ol>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => setShowWelcomePopup(false)}>Los geht’s</button>
                </BottomSheet>

                <BottomSheet open={sheet === 'help' && currentScreen === 'room'} onClose={closeSheet} labelledBy="mv-help-title">
                    <h2 id="mv-help-title" className={styles.mvSheetTitle}>{helpText.role}</h2>
                    <p className={styles.mvSheetText}>{helpText.intro}</p>
                    <div className={styles.mvHelpNow}>
                        <span className={styles.mvLabelSm}>Jetzt gerade: {PHASE_INFO[phase]?.title}</span>
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
                            <span className={styles.mvFine}>QR-Code scannen, Link schicken oder den Code unter „Beitreten“ eingeben.</span>
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

                <BottomSheet open={!!reveal && currentScreen === 'room'} onClose={closeReveal} labelledBy="mv-reveal-title">
                    {reveal && (
                        <>
                            <span className={styles.mvRevealKicker}><IconTrophy size={18} />Runde {reveal.round} ist entschieden</span>
                            <h2 id="mv-reveal-title" className={styles.mvSheetTitle}>Die Gewinner</h2>
                            <ol className={styles.mvReveal}>
                                {[...reveal.top].reverse().map((t, i, arr) => {
                                    const place = t.place ?? arr.length - i
                                    const mine = t.addedBy === myName
                                    return (
                                        <li key={t.spotifyId || i} className={`${styles.mvRevealItem} ${place === 1 ? styles.mvRevealFirst : ''} ${mine ? styles.mvRevealMine : ''}`}
                                            style={{ animationDelay: `${0.35 + i * 0.7}s` }}>
                                            <span className={styles.mvRevealPlace}>{place}</span>
                                            <CoverArt src={t.imageUrl} seed={t.spotifyId || t.title} size={place === 1 ? 64 : 48} radius={12} />
                                            <span className={styles.mvRowText}>
                                                <span className={styles.mvRowName}>{t.title}</span>
                                                <span className={styles.mvRowMeta}>{mine ? <strong className={styles.mvRevealYou}>Dein Song!</strong> : <>von <strong>{t.addedBy}</strong></>} · {t.artist}</span>
                                            </span>
                                            <span className={styles.mvRevealScore}>{t.score > 0 ? '+' : ''}{t.score}</span>
                                        </li>
                                    )
                                })}
                            </ol>
                            {resultNotes(reveal).map(n => <p key={n} className={styles.mvRevealNote}><IconDice size={16} />{n}</p>)}
                            {lobbyData?.streakEnabled && reveal.top.some(t => t.place === 1 && t.addedBy === myName && t.score > 0) && (
                                <p className={styles.mvStreakChip}>🔥 Platz-1-Hit! Dein Bonus für die nächste Runde: {myLimits.bonus.label}</p>
                            )}
                            <p className={styles.mvFine}>{reveal.total > reveal.top.length ? `Insgesamt standen ${reveal.total} Songs zur Wahl. ` : ''}Die Gewinner laufen gleich.</p>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={closeReveal}>Weiter</button>
                        </>
                    )}
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
                                <span className={styles.mvRowName}>Zurück zu deiner Playlist</span>
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
                        Mit Code beitreten
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

    // ─── Beitreten (nur per Code, QR-Code oder Link – keine öffentliche Liste) ─
    if (currentScreen === 'browse') {
        const validInvite = invite && !invite.missing && invite.code !== roomId ? invite : null
        const code = codeDraft.trim().toUpperCase()
        const joining = busyAction && busyAction === code
        return shell(
            <main className={styles.mvMain}>
                {subHeader('Beitreten', () => { dropInvite(); setCurrentScreen('lobby') })}
                <div className={styles.mvScroll}>
                    {nameField}

                    {invite?.missing && (
                        <div className={styles.mvNotice} role="status">
                            <span className={styles.mvNoticeIcon}><IconInfo /></span>
                            <p className={styles.mvNoticeText}>Die Playlist {invite.code} gibt es nicht mehr. Frag den Host nach dem aktuellen Code.</p>
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

                    {roomId && (
                        <button type="button" className={`${styles.mvBtn} ${styles.mvRejoin}`} onClick={handleRejoinRoom}>
                            <span className={styles.mvLiveDot} aria-hidden="true" />
                            <span className={styles.mvRowText}>
                                <span className={styles.mvRowName}>Zurück zu deiner Playlist</span>
                                <span className={styles.mvRowMeta}>Code {roomId}</span>
                            </span>
                            <IconNext />
                        </button>
                    )}

                    <form className={styles.mvField} onSubmit={(e) => { e.preventDefault(); handleJoinLobby(code) }}>
                        <label htmlFor="mv-code" className={styles.mvLabel}>{validInvite ? 'Oder anderen Raumcode eingeben' : 'Raumcode'}</label>
                        <div className={styles.mvNameRow}>
                            <input id="mv-code" type="text" className={`${styles.mvInput} ${styles.mvInputPlain} ${styles.mvCodeInput}`}
                                value={codeDraft} onChange={(e) => setCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                placeholder="z. B. 3RUCTD" maxLength={10} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" />
                        </div>
                        <p className={styles.mvFieldHint}>Den Code zeigt der Host unter „Teilen“ – oder einfach seinen QR-Code scannen.</p>
                        <button type="submit" className={`${styles.mvBtn} ${CODE_RE.test(code) && !nameError ? styles.mvPrimary : styles.mvPrimaryOff}`} disabled={!CODE_RE.test(code) || !!nameError || !!busyAction}>
                            {joining ? 'Tritt bei …' : 'Beitreten'}
                        </button>
                    </form>
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
        // ── Song hinzufügen ──
        if (showAddModal) {
            const q = searchQuery.trim()
            let view
            if (albumTracks) view = 'album'
            else if (isLoadingAlbum) view = 'loading'
            else if (!searchable(q)) view = 'prompt'
            else if (searchError && !isSearching) view = 'error'
            else if (isSearching || searchedQuery !== q) view = searchResults.length ? 'ok' : 'loading'
            else view = searchResults.length ? 'ok' : 'empty'
            const limitReached = myUnqueuedCount >= maxSongs

            const songRow = (item) => {
                const isAlbum = item.type === 'album'
                const exact = !isAlbum ? playlist.find(p => sameSong(p, item)) : null
                const twin = !isAlbum && !exact ? playlist.find(p => similarSong(p, item)) : null   // andere Version desselben Songs
                const existing = exact || twin
                const justAdded = addedInModalIds.has(item.id) || addedInModalIds.has(item.spotifyId)
                const mine = justAdded || (!!exact && exact.addedBy === myName)
                const takenByOther = !!existing && !mine
                const adding = addingId === item.id
                const problem = !isAlbum && !existing && !justAdded ? ruleProblem(rule, item) : null
                const blocked = !isAlbum && !existing && !justAdded && (limitReached || !!problem)
                const removable = mine && !!exact && exact.queuedRound == null   // noch nicht in der Warteschlange
                const played = !isAlbum && wasPlayed(item)
                let meta = isAlbum ? `Album · ${item.artist}` : item.artist
                if (twin && !justAdded) meta = `Ähnlicher Song schon drin („${twin.title}“ von ${twin.addedBy === myName ? 'dir' : twin.addedBy})`
                else if (takenByOther) meta = existing.queuedRound != null ? 'Schon in der Warteschlange' : `Schon drin · von ${existing.addedBy}`
                else if (mine) meta = removable ? 'Von dir eingereicht · nochmal tippen zum Entfernen' : 'Von dir eingereicht'
                else if (problem) meta = problem
                return (
                    <li key={item.id} className={`${styles.mvResult} ${mine ? styles.mvRowAdded : ''} ${takenByOther || problem ? styles.mvResultMuted : ''}`}>
                        {previewBtn(item)}
                        <button type="button"
                            className={`${styles.mvBtn} ${styles.mvResultMain}`}
                            onClick={() => (isAlbum ? handleOpenAlbum(item) : removable ? handleUnpick(item, exact) : (!existing && !justAdded && handleAddItem(item)))}
                            disabled={(!isAlbum && !removable && (!!existing || justAdded || blocked)) || !!addingId}
                            aria-pressed={!isAlbum && mine ? true : undefined}
                            aria-label={isAlbum ? `Album ${item.title} von ${item.artist} öffnen` : removable ? `${item.title} wieder entfernen` : (existing || justAdded ? `${item.title}: ${meta}` : `${item.title} von ${item.artist} hinzufügen${played ? ' (lief schon)' : ''}`)}>
                            <span className={styles.mvRowText}>
                                <span className={styles.mvRowName}>{item.title}</span>
                                <span className={`${styles.mvRowMeta} ${problem ? styles.mvMetaBad : ''}`}>{played && !existing && playedChip}{meta}</span>
                            </span>
                            <span className={`${styles.mvAddMark} ${mine ? styles.mvAddMarkOn : ''} ${isAlbum || takenByOther ? styles.mvAddMarkPlain : ''}`} aria-hidden="true">
                                {isAlbum ? <IconNext /> : (adding ? <IconWave size={16} /> : (mine ? <IconCheck size={16} /> : (takenByOther ? <IconUsers size={16} /> : (blocked ? <IconLock size={16} /> : <IconPlus size={18} />))))}
                            </span>
                        </button>
                    </li>
                )
            }

            return shell(
                <main className={`${styles.mvMain} ${previewId ? styles.mvWithPreview : ''}`}>
                    {subHeader(albumTracks ? 'Album' : 'Hinzufügen', () => (albumTracks ? setAlbumTracks(null) : closeAddModal()),
                        <span className={`${styles.mvCountChip} ${limitReached ? styles.mvCountChipFull : ''}`} aria-label={`Deine Songs: ${myUnqueuedCount} von ${maxSongs}`}>{myUnqueuedCount}/{maxSongs}</span>
                    )}
                    <div className={`${styles.mvScroll} ${styles.mvScrollFix}`}>
                        {rule && <p className={styles.mvRuleBanner}><span aria-hidden="true">{ruleEmoji(rule)}</span>{ruleHint(rule)}</p>}
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
                                <label htmlFor="mv-search" className={styles.mvLabel}>{rule?.type === 'artist' ? `Song von ${rule.artistName} suchen` : 'Song oder Album suchen'}</label>
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
                            {view === 'loading' && skeletons(isLoadingAlbum ? 'Wird geladen' : 'Spotify wird durchsucht')}
                            {view === 'prompt' && (
                                <div className={styles.mvEmpty}>
                                    <span className={styles.mvEmptyIcon}><IconSearch size={24} /></span>
                                    <p className={styles.mvEmptyTitle}>Was soll laufen?</p>
                                    <p className={styles.mvEmptyText}>Such nach einem Song oder Album. Tippe auf einen Song, um ihn hinzuzufügen – aufs Cover für eine Hörprobe.</p>
                                </div>
                            )}
                            {view === 'empty' && (
                                <div className={styles.mvEmpty}>
                                    <span className={styles.mvEmptyIcon}><IconSearch size={24} /></span>
                                    <p className={styles.mvEmptyTitle}>Nichts gefunden</p>
                                    <p className={styles.mvEmptyText}>Zu „{q}“ gibt es {rule ? 'in dieser Runde ' : ''}keine Treffer. Versuch einen anderen Begriff.</p>
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

        // ── Einstellungen (für alle; Host sieht mehr) ──
        if (roomView === 'settings') {
            const hasQueue = queueSongs.length > 0
            const pending = lobbyData.pendingConfig || {}
            const planned = { ...lobbyData, ...pending }                       // so, wie es ab der nächsten Runde gilt
            const plannedRule = 'roundRule' in pending ? pending.roundRule : rule
            const presetId = activePresetId(planned)
            const currentRuleTab = ruleTab ?? plannedRule?.type ?? null
            const pendingNotice = pendingLabels(lobbyData).length > 0 && (
                <div className={styles.mvPendingNote} role="status">
                    <span>⏳ Gilt ab der nächsten Runde: <strong>{pendingLabels(lobbyData).join(' · ')}</strong></span>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvInlineLink}`} onClick={() => updateLobbyConfig({ pendingConfig: null })}>Zurücknehmen</button>
                </div>
            )
            return shell(
                <main className={`${styles.mvMain} ${previewId ? styles.mvWithPreview : ''}`}>
                    {subHeader('Einstellungen', () => setRoomView('main'), null, false)}
                    <div className={styles.mvScroll}>
                        <section className={styles.mvCard}>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvMenuRow}`} onClick={toggleTheme}>
                                <span className={styles.mvBoardIcon}>{isDark ? <IconMoon /> : <IconSun />}</span>
                                <span className={styles.mvRowText}>
                                    <span className={styles.mvRowName}>Design</span>
                                    <span className={styles.mvRowMeta}>{isDark ? 'Dunkel' : 'Hell'} – tippen zum Wechseln</span>
                                </span>
                                <span className={`${styles.mvSwitch} ${isDark ? styles.mvSwitchOn : ''}`} aria-hidden="true"><span /></span>
                            </button>
                        </section>

                        {isHost && (
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
                                                <select id="mv-device" className={`${styles.mvInput} ${styles.mvSelect}`} value={selectedSpotifyDeviceId} onChange={(e) => { setSelectedSpotifyDeviceId(e.target.value); setDeviceProblem(null) }}>
                                                    <option value="active">Automatisch (aktives Gerät, sonst dieser Browser)</option>
                                                    {spotifyDevices.map((d) => (
                                                        <option key={d.id} value={d.id}>{d.name}{d.is_active ? ' (aktiv)' : ''}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={playHere}><IconSpeaker />Hier im Browser abspielen</button>
                                        <button type="button" className={`${styles.mvBtn} ${hasQueue ? styles.mvPrimary : styles.mvPrimaryOff}`} onClick={() => sendQueueToSpotify()} disabled={!hasQueue}>
                                            <IconPlay size={18} />{nowPlaying?.isPlaying ? 'Warteschlange neu senden' : 'Warteschlange abspielen'}
                                        </button>
                                        {!hasQueue && <p className={styles.mvFine}>Die Warteschlange ist leer. Nach einer Abstimmung starten die Gewinner automatisch.</p>}
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvDangerLink}`} onClick={handleSpotifyDisconnect}>Spotify trennen</button>
                                    </>
                                )}
                            </section>
                        )}

                        {isHost && (
                            <section className={styles.mvCard}>
                                <div className={styles.mvCardHead}>
                                    <h2 className={styles.mvCardTitle}>Runden</h2>
                                    <span className={styles.mvChip}>Runde {lobbyData.votingRound || 0}</span>
                                </div>
                                {'maxSongsPerPerson' in pending && pendingNotice}
                                <div className={styles.mvPresets} role="radiogroup" aria-label="Vorgabe">
                                    {PRESETS.map(p => (
                                        <button key={p.id} type="button" role="radio" aria-checked={presetId === p.id}
                                            className={`${styles.mvBtn} ${styles.mvPreset} ${presetId === p.id ? styles.mvPresetOn : ''}`}
                                            onClick={() => updateLobbyConfig(p.values)}>
                                            <span className={styles.mvRowName}>{p.label}</span>
                                            <span className={styles.mvPresetSub}>{p.sub}</span>
                                        </button>
                                    ))}
                                </div>
                                {presetId === 'custom' && <p className={styles.mvFine}>Eigene Einstellung (siehe „Erweitert“).</p>}
                                <button type="button" className={`${styles.mvBtn} ${styles.mvExpand}`} onClick={() => setAdvancedOpen(o => !o)} aria-expanded={advancedOpen}>
                                    Erweitert<IconChevron open={advancedOpen} />
                                </button>
                                {advancedOpen && ROOM_SETTINGS.map(s => (
                                    <StepSlider key={s.id} id={`mv-${s.id}`} label={s.label} options={s.options}
                                        value={planned[s.id] ?? s.fallback}
                                        onChange={(v) => updateLobbyConfig({ [s.id]: v })}
                                        valueText={s.text} tickText={s.tick} />
                                ))}
                            </section>
                        )}

                        {isHost && (
                            <section className={styles.mvCard}>
                                <button type="button" className={`${styles.mvBtn} ${styles.mvMenuRow}`} onClick={() => updateLobbyConfig({ streakEnabled: !lobbyData.streakEnabled })} aria-pressed={!!lobbyData.streakEnabled}>
                                    <span className={styles.mvBoardIcon} aria-hidden="true">🔥</span>
                                    <span className={styles.mvRowText}>
                                        <span className={styles.mvRowName}>Streak</span>
                                        <span className={styles.mvRowMeta}>{lobbyData.streakEnabled ? 'An – Platz-1-Hits werden belohnt' : 'Aus'}</span>
                                    </span>
                                    <span className={`${styles.mvSwitch} ${lobbyData.streakEnabled ? styles.mvSwitchOn : ''}`} aria-hidden="true"><span /></span>
                                </button>
                                <button type="button" className={`${styles.mvBtn} ${styles.mvExpand}`} onClick={() => setStreakInfoOpen(o => !o)} aria-expanded={streakInfoOpen}>
                                    Was ist eine Streak?<IconChevron open={streakInfoOpen} />
                                </button>
                                {streakInfoOpen && (
                                    <p className={styles.mvFine}>
                                        Landet ein Song von dir auf Platz 1 (auch geteilt), beginnt deine Streak – der Bonus gilt gleich in der nächsten Runde.
                                        Je mehr Runden in Folge, desto größer: {STREAK_LEVELS.slice(1).map((l, i) => `${i + 1}× ${l.label}`).join(' · ')} (mehr gibt es nicht).
                                        Hast du Songs in einer Runde, aber keinen auf Platz 1, endet die Streak. Reichst du nichts ein, pausiert sie nur. Runden ohne Abstimmung zählen nicht.
                                    </p>
                                )}
                            </section>
                        )}

                        {isHost && (
                            <section className={styles.mvCard}>
                                <div className={styles.mvCardHead}>
                                    <h2 className={styles.mvCardTitle}>Runden-Modus</h2>
                                    {rule && <span className={`${styles.mvChip} ${styles.mvChipOk}`}>{ruleEmoji(rule)} aktiv</span>}
                                </div>
                                <p className={styles.mvFine}>{rule ? `Jetzt: ${ruleLabel(rule)} – ${ruleHint(rule)}.` : 'Jetzt: freie Runde – alle Songs erlaubt.'} Ein neuer Modus gilt sofort, solange noch keine Songs eingereicht sind – sonst ab der nächsten Runde.</p>
                                {'roundRule' in pending && pendingNotice}
                                <div className={styles.mvSegments} role="tablist" aria-label="Modus">
                                    {[[null, 'Frei'], ['artist', 'Künstler'], ['decade', 'Jahrzehnt'], ['keyword', 'Stichwort']].map(([id, label]) => (
                                        <button key={label} type="button" role="tab" aria-selected={currentRuleTab === id}
                                            className={`${styles.mvBtn} ${styles.mvSegment} ${currentRuleTab === id ? styles.mvSegmentOn : ''}`}
                                            onClick={() => { setRuleTab(id); if (id === null && (rule || plannedRule)) setRoundRule(null) }}>{label}</button>
                                    ))}
                                </div>
                                {currentRuleTab === 'artist' && (
                                    <div className={styles.mvField}>
                                        <label htmlFor="mv-artist" className={styles.mvLabel}>Künstler suchen</label>
                                        <div className={styles.mvInputWrap}>
                                            <span className={styles.mvInputIcon}><IconSearch /></span>
                                            <input id="mv-artist" type="search" className={styles.mvInput} value={artistQuery} onChange={(e) => setArtistQuery(e.target.value)}
                                                placeholder={plannedRule?.type === 'artist' ? plannedRule.artistName : 'z. B. Helene Fischer'} autoComplete="off" />
                                        </div>
                                        {artistResults.length > 0 && (
                                            <ul className={styles.mvList}>
                                                {artistResults.map(a => (
                                                    <li key={a.id}>
                                                        <button type="button" className={`${styles.mvBtn} ${styles.mvRow} ${styles.mvRowFlat} ${plannedRule?.artistId === a.id ? styles.mvRowOn : ''}`}
                                                            onClick={() => setRoundRule({ type: 'artist', artistId: a.id, artistName: a.name })}>
                                                            <CoverArt src={a.imageUrl} seed={a.id} size={40} radius={20} />
                                                            <span className={styles.mvRowText}><span className={styles.mvRowName}>{a.name}</span></span>
                                                            {plannedRule?.artistId === a.id && <IconCheck size={16} />}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                                {currentRuleTab === 'decade' && (
                                    <div className={styles.mvDecades}>
                                        {DECADES.map(d => (
                                            <button key={d} type="button" className={`${styles.mvBtn} ${styles.mvDecade} ${plannedRule?.type === 'decade' && plannedRule.from === d ? styles.mvDecadeOn : ''}`}
                                                onClick={() => setRoundRule({ type: 'decade', from: d })} aria-pressed={plannedRule?.type === 'decade' && plannedRule.from === d}>{decadeLabel(d)}</button>
                                        ))}
                                    </div>
                                )}
                                {currentRuleTab === 'keyword' && (
                                    <form className={styles.mvNameRow} onSubmit={(e) => { e.preventDefault(); const w = keywordDraft.trim(); if (w.length >= 2) setRoundRule({ type: 'keyword', word: w.slice(0, 30) }) }}>
                                        <input type="text" className={`${styles.mvInput} ${styles.mvInputPlain}`} value={keywordDraft} onChange={(e) => setKeywordDraft(e.target.value)}
                                            placeholder={plannedRule?.type === 'keyword' ? plannedRule.word : 'z. B. Love, Summer, Nacht'} aria-label="Stichwort im Songtitel" maxLength={30} />
                                        <button type="submit" className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvOutlineSm}`} disabled={keywordDraft.trim().length < 2}>Übernehmen</button>
                                    </form>
                                )}
                            </section>
                        )}

                        <button type="button" className={`${styles.mvBtn} ${styles.mvLeaveBtn}`} onClick={() => (isHost ? setSheet('close') : setConfirm({ kind: 'leave' }))}>
                            <IconLeave size={18} />{isHost ? 'Playlist beenden' : 'Playlist verlassen'}
                        </button>
                    </div>
                </main>
            )
        }

        // ── Playlist ──
        const info = PHASE_INFO[phase] || PHASE_INFO.songwahl
        const showVoting = phase === 'abstimmung'
        const phaseSub = showVoting
            ? (phaseRemainingMs > 0 ? `Die Top ${batchSize} kommen weiter. Die Punkte gibt’s erst am Ende.` : 'Wird ausgewertet …')
            : phase === 'laeuft'
                ? 'Die Gewinner kommen gleich in die Warteschlange.'
                : musicOn
                    ? 'Schlag Songs für die nächste Runde vor – die Abstimmung startet automatisch.'
                    : (isHost ? 'Starte die Abstimmung, wenn alle fertig sind.' : 'Füge Songs hinzu. Der Host startet dann die Abstimmung.')
        const downAllowed = voteLimits.down !== 0
        const budgetText = (limit, used) => (limit === UNLIMITED ? 'unbegrenzt' : `${Math.max(0, limit - used)} von ${limit} übrig`)
        const upLeft = voteLimits.up === UNLIMITED || myUpUsed < voteLimits.up
        const downLeft = voteLimits.down === UNLIMITED || myDownUsed < voteLimits.down
        const myLeftovers = (lobbyData.leftovers?.[myName] || []).filter(i => !playlist.some(p => sameSong(p, i)) && !wasPlayed(i))
        const freeSlots = Math.max(0, maxSongs - myUnqueuedCount)
        // Während der Abstimmung: feste, pro Person gemischte Reihenfolge; sonst nach Einreichung
        const displayPool = showVoting
            ? seededOrder(poolItems, `${myName}|${lobbyData.votingRound || 0}`)
            : [...poolItems].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
        const progressPct = nowPlaying?.durationMs ? Math.min(100, (nowPlayingPositionMs / nowPlaying.durationMs) * 100) : 0
        const waitingForSpotify = !!lobbyData.pendingBatch
        const lastSong = musicOn && !waitingForSpotify && isLastSong(lobbyData, clock)
        const fewSongs = poolItems.length > 0 && poolItems.length <= batchSize

        return shell(
            <main className={`${styles.mvMain} ${previewId ? styles.mvWithPreview : ''}`}>
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
                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={() => setRoomView('settings')} aria-label="Einstellungen" title="Einstellungen"><IconGear /></button>
                </header>

                <div className={styles.mvScroll}>
                    {isHost && deviceProblem && (
                        <div className={styles.mvDeviceBanner} role="alert">
                            <div className={styles.mvPhaseRow}>
                                <span className={styles.mvAlertIcon}><IconSpeaker size={20} /></span>
                                <p className={styles.mvAlertText}><strong>Spotify spielt nicht.</strong> {deviceProblem}</p>
                            </div>
                            <div className={styles.mvBtnRow}>
                                <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={playHere}><IconPlay size={16} />Hier abspielen</button>
                                <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={() => setRoomView('settings')}><IconSpeaker size={16} />Gerät wählen</button>
                            </div>
                        </div>
                    )}

                    <section className={styles.mvPhase}>
                        <div className={styles.mvPhaseRow}>
                            <span className={`${styles.mvPhaseDot} ${styles[info.dot]}`} aria-hidden="true" />
                            <div className={styles.mvRowText}>
                                <h2 className={styles.mvPhaseTitle}>{info.title}</h2>
                                <p className={styles.mvPhaseSub}>{phaseSub}</p>
                            </div>
                            {showVoting && phaseRemainingMs > 0 && (
                                <span className={styles.mvTimer} role="timer" aria-label={`Noch ${mmss(phaseRemainingMs)} Minuten`}>{mmss(phaseRemainingMs)}</span>
                            )}
                            {musicOn && <span className={styles.mvLive}>LIVE</span>}
                        </div>
                        {rule && <p className={styles.mvRuleBanner}><span aria-hidden="true">{ruleEmoji(rule)}</span>{ruleLabel(rule)} · {ruleHint(rule)}</p>}
                        {pendingLabels(lobbyData).length > 0 && <p className={styles.mvNextRule}>Ab der nächsten Runde: {pendingLabels(lobbyData).join(' · ')}</p>}
                        {lastSong && (
                            <p className={`${styles.mvLastSong} ${poolItems.length === 0 ? styles.mvLastSongUrgent : ''}`} role="status">
                                {poolItems.length === 0 ? '⏳ Letzter Song! Jetzt Songs für die nächste Runde einreichen.' : '🎶 Bald geht’s weiter – die nächste Runde wird gerade gewählt.'}
                            </p>
                        )}
                        {streakBonusActive && (
                            <p className={styles.mvStreakChip}>
                                🔥 {myLimits.bonus.streak}× Platz 1 in Folge – dein Bonus: {myLimits.bonus.label}
                                {myLimits.bonus.next && <span className={styles.mvStreakNext}>Nächste Runde wieder Platz 1: {myLimits.bonus.next}</span>}
                            </p>
                        )}
                        {musicOn && (
                            <p className={styles.mvTimes}>
                                {waitingForSpotify
                                    ? (nowPlaying?.isPlaying ? 'Die Gewinner stehen fest und kommen gleich in die Warteschlange …' : 'Die Gewinner warten auf Spotify …')
                                    : <>{nextVoting != null && (nextVoting > 0
                                        ? <span>Nächste Abstimmung in <strong>{mmss(nextVoting)}</strong></span>
                                        : <span>Nächste Abstimmung <strong>{poolItems.length ? 'gleich' : 'sobald Songs da sind'}</strong></span>)}</>}
                            </p>
                        )}
                        {showVoting && (
                            <div className={styles.mvVoteStats}>
                                <span className={`${styles.mvBudget} ${upLeft ? '' : styles.mvBudgetEmpty}`}><IconThumbUp size={16} />{budgetText(voteLimits.up, myUpUsed)}</span>
                                {downAllowed && <span className={`${styles.mvBudget} ${downLeft ? '' : styles.mvBudgetEmpty}`}><IconThumbDown size={16} />{budgetText(voteLimits.down, myDownUsed)}</span>}
                            </div>
                        )}
                        <button type="button" className={`${styles.mvBtn} ${styles.mvPeopleToggle}`} onClick={() => setShowPeople(v => !v)} aria-expanded={showPeople} aria-controls="mv-people">
                            <IconUsers size={16} />
                            {showVoting ? `${voterCount} von ${playerCount} haben abgestimmt` : `${playerCount} ${playerCount === 1 ? 'Person' : 'Leute'} dabei`}
                            <IconChevron open={showPeople} />
                        </button>
                        {showPeople && (
                            <ul id="mv-people" className={styles.mvPeople}>
                                {players.map(p => (
                                    <li key={p.name} className={styles.mvPerson}>
                                        <span className={styles.mvPersonEmoji} aria-hidden="true">{p.emoji}</span>
                                        <span className={styles.mvPersonName}>{p.name}{p.name === myName ? ' (du)' : ''}{p.name === lobbyData.host ? ' · Host' : ''}{lobbyData.streakEnabled && streakOf(lobbyData, p.name) > 0 ? ` · 🔥 ${streakOf(lobbyData, p.name)}` : ''}</span>
                                        {!showVoting && p.name !== lobbyData.host && p.name !== myName && !activeNames.has(p.name) && <span className={styles.mvNotVoted}>noch nicht aktiv</span>}
                                        {showVoting && (voterNames.has(p.name)
                                            ? <span className={styles.mvVoted}><IconCheck size={14} />abgestimmt</span>
                                            : <span className={styles.mvNotVoted}>noch nicht</span>)}
                                        {isHost && p.name !== myName && (
                                            <button type="button" className={`${styles.mvBtn} ${styles.mvKickBtn}`} onClick={() => setConfirm({ kind: 'kick', name: p.name })} aria-label={`${p.name} entfernen`}><IconX size={14} /></button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {isHost && !showVoting && (
                            poolItems.length === 0 ? (
                                <p className={styles.mvFine}>Sobald Songs eingereicht sind, kannst du die Abstimmung starten.</p>
                            ) : fewSongs ? (
                                <>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvPhaseBtn}`} onClick={handleQueueAll}>
                                        <IconQueue size={18} />Alle {poolItems.length} in die Warteschlange
                                    </button>
                                    <p className={styles.mvFine}>Es gibt nicht mehr Songs als Plätze ({batchSize}) – eine Abstimmung ist nicht nötig. <button type="button" className={`${styles.mvBtn} ${styles.mvInlineLink}`} onClick={handleStartAbstimmung}>Trotzdem abstimmen</button></p>
                                </>
                            ) : (
                                <button type="button" className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvPhaseBtn}`} onClick={handleStartAbstimmung}>
                                    <IconBallot size={20} />Abstimmung starten
                                </button>
                            )
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
                            </div>
                            <div className={styles.mvNowBar} aria-hidden="true"><span style={{ width: `${progressPct}%` }} /></div>
                            <div className={styles.mvNowTimes}>
                                <span>{mmss(nowPlayingPositionMs)}</span><span>{mmss(nowPlaying.durationMs)}</span>
                            </div>
                            {isHost && (
                                <div className={styles.mvControls}>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvCtrlBtn}`} onClick={handlePausePlayback} aria-label={nowPlaying.isPlaying ? 'Pause' : 'Weiter abspielen'}>
                                        {nowPlaying.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                                    </button>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvCtrlBtn}`} onClick={handleSkip} aria-label="Song überspringen"><IconSkip size={18} /></button>
                                    <span className={styles.mvVolume}>
                                        <IconVolume size={18} />
                                        <input type="range" min={0} max={100} step={5} value={hostVolume ?? 50} onChange={(e) => handleVolume(Number(e.target.value))}
                                            aria-label="Lautstärke" className={styles.mvVolumeSlider} style={{ '--pct': `${hostVolume ?? 50}%` }} />
                                    </span>
                                </div>
                            )}
                        </section>
                    )}

                    {queueItems.length > 0 && (
                        <section className={styles.mvCard} aria-label="Warteschlange">
                            <div className={styles.mvCardHead}>
                                <h2 className={styles.mvCardTitle}>{waitingForSpotify ? 'Wartet auf Spotify' : 'Als Nächstes'}</h2>
                                <span className={styles.mvChip}>{queueItems.length}</span>
                            </div>
                            {waitingForSpotify && !isHost && <p className={styles.mvFine}>Die Gewinner stehen fest und starten, sobald der Host abspielt.</p>}
                            <ol className={styles.mvQueueList}>
                                {(showAllQueue ? queueItems : queueItems.slice(0, 5)).map((item, i) => (
                                    <li key={item.id} className={styles.mvQueueItem}>
                                        <span className={styles.mvQueueRank}>{i + 1}</span>
                                        <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={36} radius={8} />
                                        <span className={styles.mvRowText}>
                                            <span className={styles.mvQueueTitle}>{item.title}</span>
                                            <span className={styles.mvQueueArtist}>{item.artist} · von {item.addedBy === myName ? 'dir' : item.addedBy}</span>
                                        </span>
                                        {item.queueDrawn && <span className={styles.mvDrawn} title="Gleich viele Stimmen – Reihenfolge ausgelost"><IconDice size={14} />ausgelost</span>}
                                    </li>
                                ))}
                            </ol>
                            {queueItems.length > 5 && (
                                <button type="button" className={`${styles.mvBtn} ${styles.mvExpand}`} onClick={() => setShowAllQueue(v => !v)} aria-expanded={showAllQueue}>
                                    {showAllQueue ? 'Weniger anzeigen' : `Alle ${queueItems.length} anzeigen`}<IconChevron open={showAllQueue} />
                                </button>
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
                            {showVoting ? 'Zur Abstimmung' : musicOn ? 'Für die nächste Runde' : 'Eingereichte Songs'}
                        </h2>
                        <span className={styles.mvListCount}>{displayPool.length}</span>
                    </div>

                    {displayPool.length === 0 ? (
                        <div className={styles.mvEmpty}>
                            <span className={styles.mvEmptyIcon}><IconNote size={24} /></span>
                            <p className={styles.mvEmptyTitle}>{showVoting ? 'Keine Songs zum Abstimmen' : 'Noch keine Songs'}</p>
                            <p className={styles.mvEmptyText}>
                                {showVoting ? 'Nach der Abstimmung kannst du wieder Songs hinzufügen.' : 'Tippe unten auf „Song hinzufügen“.'}
                            </p>
                        </div>
                    ) : (
                        <ul className={styles.mvList}>
                            {displayPool.map((item) => {
                                const myVote = item.votes?.[myName] || 0
                                const own = item.addedBy === myName
                                const canRemove = !showVoting && (isHost || own)
                                const played = wasPlayed(item)
                                return (
                                    <li key={item.id} className={`${styles.mvSong} ${showVoting && myVote === 1 ? styles.mvSongUp : ''} ${showVoting && myVote === -1 ? styles.mvSongDown : ''} ${showVoting ? styles.mvSongVoting : ''}`}>
                                        {previewBtn(item)}
                                        <span className={styles.mvRowText}>
                                            <span className={`${styles.mvRowName} ${showVoting ? styles.mvRowNameWrap : ''}`}>{item.title}</span>
                                            <span className={styles.mvRowMeta}>{played && playedChip}{item.artist} · von {own ? 'dir' : item.addedBy}</span>
                                        </span>
                                        {showVoting ? (
                                            own ? <span className={styles.mvOwnTag}>Dein Song</span> : (
                                                <span className={styles.mvVote} role="group" aria-label={`Abstimmen für ${item.title}`}>
                                                    <button type="button" className={`${styles.mvBtn} ${styles.mvVoteBtn} ${myVote === 1 ? styles.mvVoteUpOn : ''} ${myVote !== 1 && !upLeft ? styles.mvVoteBtnOff : ''}`}
                                                        onClick={() => handleVote(item.id, 'up')} aria-pressed={myVote === 1} aria-label="Gefällt mir"><IconThumbUp /></button>
                                                    {downAllowed && (
                                                        <button type="button" className={`${styles.mvBtn} ${styles.mvVoteBtn} ${myVote === -1 ? styles.mvVoteDownOn : ''} ${myVote !== -1 && !downLeft ? styles.mvVoteBtnOff : ''}`}
                                                            onClick={() => handleVote(item.id, 'down')} aria-pressed={myVote === -1} aria-label="Gefällt mir nicht"><IconThumbDown /></button>
                                                    )}
                                                </span>
                                            )
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

                <ReactionPad db={db} roomId={roomId} myName={myName} raised={phase !== 'abstimmung'} />

                {phase !== 'abstimmung' && (
                    <div className={styles.mvFooter}>
                        {myUnqueuedCount < maxSongs ? (
                            <button type="button" className={`${styles.mvBtn} ${styles.mvStart}`} onClick={openAddModal}>
                                <span className={styles.mvStartText}>
                                    <span className={styles.mvStartTitle}>Song hinzufügen</span>
                                    <span className={styles.mvStartSub}>Deine Songs: {myUnqueuedCount} von {maxSongs}{rule ? ` · ${ruleLabel(rule)}` : ''}</span>
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
