import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { getApp } from 'firebase/app'
import '../../firebase.js'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, runTransaction, serverTimestamp, deleteDoc, deleteField } from 'firebase/firestore'
import spotifyService from '../../services/spotifyService'
import { log } from '../../utils/logger.js'
import CoverArt from '../../shared/ui/CoverArt'
import QrCode from '../../shared/ui/QrCode'
import { BottomSheet, ConfirmSheet } from '../../shared/ui/BottomSheet'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import {
    IconMoon, IconSun, IconBack, IconNext, IconCheck, IconX, IconLock, IconPlay, IconPause, IconNote, IconSearch,
    IconRetry, IconAlert, IconPlus, IconTrash, IconUsers, IconGear, IconThumbUp, IconThumbDown,
    IconWave, IconSpeaker, IconInfo, IconShare, IconHelp, IconCopy, IconTv, IconSkip, IconQueue,
    IconVolume, IconTrophy, IconLeave, IconChevron
} from '../../shared/ui/icons'
import { joinLink, boardLink } from './links'
import {
    UNLIMITED, DEFAULT_UP, DEFAULT_DOWN, DEFAULT_MAX_SONGS, LOCK_BEFORE_END_MS, byScore, scoreOf,
    cleanName, nameKey, sameSong, similarSong, mmss, nowPosition, isEarnedHit,
    DECADES, decadeLabel, ruleLabel, ruleHint, ruleEmoji, ruleSearchQuery, ruleProblem, finishRound,
    limitsFor, streakOf, STREAK_LEVELS, liveNowPlaying, upcomingQueue, queueOrder, voteCounts,
    staleItems, dropUpdate, DEFAULT_DROP_BELOW, DEFAULT_DROP_AFTER, poolOf, isPaused, activePoolOf, usedVotes
} from './amplifyLogic'
import ReactionPad from './ReactionPad'
import Marquee from './Marquee'
import SwipeRow from './SwipeRow'
import { parseSpotifyLink, looksLikeSpotifyLink, LIKED_SONGS_URL } from './spotifyLinks'
import { loadSongMemory, rememberSong, memoryToSong } from './songMemory'
import useFlip from './useFlip'
import Confetti from './Confetti'
import { IconArrowUp, IconArrowDown } from './icons'
import { deleteReactions } from './reactions'
import styles from './Amplify2.module.css'

// Profilbild zum Antippen (kein Zufallsname: jeder tippt seinen eigenen Namen, damit man sich erkennt)
const AVATARS = [
    '😎', '🤩', '🥳', '😜', '🤠', '👽', '🤖', '👻', '🦄', '🐶', '🐱', '🦊', '🐻', '🐼', '🐸',
    '🐵', '🦁', '🐯', '🐙', '🦖', '🎸', '🎤', '🎧', '🥁', '🎷', '🕺', '💃', '🍕', '🍹', '🔥'
]
// Spotify-Login in neuem Tab zurück (?code=…): Raum, Name und Profilbild aus der kurzen Sicherung übernehmen,
// sonst landet man auf der Startseite. Der Wiedereintritt klappt im selben Browser (gleiche Geräte-Kennung).
const A2_LOGIN_BACKUP = 'a2_login_backup'
try {
    if (new URLSearchParams(window.location.search).has('code')) {
        const backup = JSON.parse(localStorage.getItem(A2_LOGIN_BACKUP) || 'null')
        if (backup && Date.now() - backup.at < 15 * 60000 && !sessionStorage.getItem('a2_roomId')) {
            for (const [key, value] of Object.entries(backup.session || {})) if (value) sessionStorage.setItem(key, value)
        }
        localStorage.removeItem(A2_LOGIN_BACKUP)
    }
} catch { /* ohne Speicher geht es nur im selben Tab */ }

const getStoredName = () => sessionStorage.getItem('a2_name') || ''
const getOrCreateEmoji = () => {
    const stored = sessionStorage.getItem('a2_emoji')
    if (stored) return stored
    const emoji = AVATARS[Math.floor(Math.random() * AVATARS.length)]
    sessionStorage.setItem('a2_emoji', emoji)
    return emoji
}

// Der Name ist Schlüssel in der Lobby (players.<Name>) – daher nur einfache Zeichen, kein Punkt
const NAME_RE = /^[\p{L}\p{N} _-]+$/u
const nameProblem = (s) => {
    const n = cleanName(s)
    if (!n) return 'Bitte gib deinen Namen ein.'
    if (n.length < 2) return 'Bitte mindestens 2 Zeichen.'
    if (n.length > 20) return 'Bitte höchstens 20 Zeichen.'
    if (!NAME_RE.test(n)) return 'Nur Buchstaben, Zahlen, Leerzeichen, - und _.'
    return null
}
const CODE_RE = /^[A-Z0-9]{4,10}$/
const isOpen = (data) => (data.status ?? 'active') === 'active'
// Lesen erlauben die Firestore-Regeln erst nach dem anonymen Login – vorher abgelehnt, sähe es wie "gibt es nicht" aus
const signedIn = async () => {
    const auth = getAuth(getApp())
    await auth.authStateReady()
    if (!auth.currentUser) await signInAnonymously(auth)
}

// Einstellungen des Hosts – gelten sofort (schon eingereichte Songs bleiben drin)
const thumbsText = (v, what) => (v === UNLIMITED ? 'Unbegrenzt viele' : v === 0 ? 'Aus – nur Daumen hoch' : `${v} ${what} gleichzeitig – kommt zurück, wenn der Song läuft`)
const ROOM_SETTINGS = [
    { id: 'maxSongsPerPerson', label: 'Songs pro Person', fallback: DEFAULT_MAX_SONGS, options: [1, 2, 3, 4, 5, 10], tick: String, text: (v) => `Jeder hat bis zu ${v} ${v === 1 ? 'Song' : 'Songs'} gleichzeitig im Rennen` },
    { id: 'upvotesPerPerson', label: 'Daumen hoch pro Person', fallback: DEFAULT_UP, options: [1, 2, 3, 5, 10, UNLIMITED], tick: (v) => (v === UNLIMITED ? '∞' : String(v)), text: (v) => thumbsText(v, 'Daumen hoch') },
    { id: 'downvotesPerPerson', label: 'Daumen runter pro Person', fallback: DEFAULT_DOWN, options: [0, 1, 2, 3, 5, UNLIMITED], tick: (v) => (v === UNLIMITED ? '∞' : String(v)), text: (v) => thumbsText(v, 'Daumen runter') }
]

// Ladenhüter: Songs, die nicht ankommen, fliegen raus – sonst blockieren sie Song-Limits und Daumen
const DROP_SETTINGS = [
    { id: 'dropBelow', label: 'Raus bei zu vielen Daumen runter', fallback: DEFAULT_DROP_BELOW, options: [0, 2, 3, 4, 5], tick: (v) => (v === 0 ? 'aus' : `−${v}`), text: (v) => (v === 0 ? 'Aus – kein Song fliegt wegen Stimmen raus' : `Ein Song fliegt raus, sobald er bei −${v} steht`) },
    { id: 'dropAfterMin', label: 'Raus nach Zeit im Rennen', fallback: DEFAULT_DROP_AFTER, options: [0, 30, 45, 60, 90, 120], tick: (v) => (v === 0 ? 'aus' : `${v}m`), text: (v) => (v === 0 ? 'Aus – Songs bleiben, bis sie laufen' : `Wer nach ${v} Minuten noch nicht dran war, fliegt raus`) }
]

const LIMIT_DEFAULTS = { maxSongs: DEFAULT_MAX_SONGS, up: DEFAULT_UP, down: DEFAULT_DOWN }
const VOTE_MOVE_DELAY = 700   // ms: nach der eigenen Stimme erst die Farbe, dann rückt der Song an seinen Platz

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

const Amplify2 = ({ onBack, joinCode }) => {
    // Firebase
    const [db, setDb] = useState(null)

    // State
    const [currentScreen, setCurrentScreen] = useState('lobby')   // lobby | create | browse | room
    const [myName, setMyName] = useState(getStoredName)
    const [myEmoji, setMyEmoji] = useState(getOrCreateEmoji)
    const [nameDraft, setNameDraft] = useState(myName)
    const [avatarOpen, setAvatarOpen] = useState(false)
    const [roomId, setRoomId] = useState(sessionStorage.getItem('a2_roomId') || '')
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
    const [toast, setToast] = useState(null)                 // { text, tone: 'info' | 'bad', action?: { label, run } }
    const [startNotice, setStartNotice] = useState(null)     // Hinweis auf der Startseite (z. B. Playlist geschlossen)
    const [confirm, setConfirm] = useState(null)             // { kind: 'leave' | 'remove' | 'endVoting' | 'kick', item?, name? }
    const [confirmBusy, setConfirmBusy] = useState(false)
    const [busyAction, setBusyAction] = useState(null)       // 'create' | 'readd' | 'close' | Raumcode beim Beitreten
    const [sheet, setSheet] = useState(null)                 // 'help' | 'share' | 'close'
    const [previewId, setPreviewId] = useState(null)         // Spotify-Vorschau (eingebetteter Player)
    const [confetti, setConfetti] = useState(null)           // Konfetti beim eigenen Nummer-1-Hit (key)
    const [ruleTab, setRuleTab] = useState(null)             // Einstellungen: gewählter Runden-Modus-Reiter
    const [artistQuery, setArtistQuery] = useState('')
    const [artistResults, setArtistResults] = useState([])
    const [keywordDraft, setKeywordDraft] = useState('')
    const [backupPicker, setBackupPicker] = useState(null)   // null = zu | { list, loading, error }
    const [backupFilter, setBackupFilter] = useState('')

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

    const showToast = useCallback((text, tone = 'info', action = null) => {
        clearTimeout(toastTimerRef.current)
        setToast({ text, tone, action })
        toastTimerRef.current = setTimeout(() => setToast(null), action ? 7000 : 5500)
    }, [])
    useEffect(() => () => { clearTimeout(toastTimerRef.current); clearTimeout(volumeTimerRef.current) }, [])

    // Lesen + Ändern + Schreiben als Transaktion: gleichzeitige Änderungen anderer gehen nicht verloren.
    // change(data) muss ohne Nebenwirkungen sein (Firestore wiederholt sie bei Konflikten) und liefert
    // { update, ...beliebige Rückgabewerte }; ohne update wird nichts geschrieben.
    const mutateLobby = useCallback(async (code, change) => {
        const ref = doc(db, 'amplify2Lobbies', code)
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
                    // Auch nach „cancelled“ (StrictMode im Dev-Modus): nur dieser Lauf hat den Code getauscht
                    spotifyService.isUserLoggedIn().then(setSpotifyConnected)
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

    // ─── Name ───────────────────────────────────────────────────────────────
    const pickAvatar = (emoji) => {
        sessionStorage.setItem('a2_emoji', emoji)
        setMyEmoji(emoji)
        setAvatarOpen(false)
    }

    // Eingegebenen Namen übernehmen; liefert den Namen oder null (Fehler steht dann am Feld)
    const commitName = () => {
        if (roomId) return myName
        const n = cleanName(nameDraft)
        if (nameProblem(n)) return null
        if (n !== myName) {
            sessionStorage.setItem('a2_name', n)
            setMyName(n)
            myNameRef.current = n
        }
        setNameDraft(n)
        return n
    }

    // Lobby erstellen
    const handleCreateLobby = async () => {
        if (!db || busyAction) return
        const name = commitName()
        if (!name) return
        const emoji = myEmoji

        const newRoomId = generateRoomCode()
        const lobbyRef = doc(db, 'amplify2Lobbies', newRoomId)

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
                status: 'active',
                // Keine Phasen: Einreichen und Abstimmen gehen immer, die besten N gehen rundenweise an Spotify
                maxSongsPerPerson: DEFAULT_MAX_SONGS,
                upvotesPerPerson: DEFAULT_UP,
                downvotesPerPerson: DEFAULT_DOWN,
                dropBelow: DEFAULT_DROP_BELOW,
                dropAfterMin: DEFAULT_DROP_AFTER,
                dropped: [],
                roundRule: null,
                streakEnabled: false,
                streaks: {},
                votingRound: 0,      // Anzahl Songs, die schon aus dem Voting an Spotify gingen
                pendingBatch: null,
                lastResult: null
            })

            setRoomId(newRoomId)
            setIsHost(true)
            sessionStorage.setItem('a2_roomId', newRoomId)
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
                sessionStorage.setItem('a2_name', res.rejoin)
                setMyName(res.rejoin)
                setNameDraft(res.rejoin)
                myNameRef.current = res.rejoin
            }

            setRoomId(joinRoomId)
            setIsHost(false)
            sessionStorage.setItem('a2_roomId', joinRoomId)
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

    // Einladungslink (#amplify2/ABC123): direkt zur Beitreten-Seite mit dieser Playlist.
    // Der Code wandert aus der Adresse in die Sitzung, damit Zurück/Neuladen nicht wieder dorthin führen.
    useEffect(() => {
        if (!joinCode) return
        sessionStorage.setItem('a2_invite', joinCode)
        window.history.replaceState(window.history.state, '', '#amplify2')
    }, [joinCode])
    useEffect(() => {
        const code = joinCode || sessionStorage.getItem('a2_invite')
        if (!db || !code) return
        if (sessionStorage.getItem('a2_roomId') === code) {   // schon dabei → Wiedereinstieg unten
            sessionStorage.removeItem('a2_invite')
            return
        }
        let cancelled = false
        signedIn().then(() => getDoc(doc(db, 'amplify2Lobbies', code))).then((snap) => {
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
        sessionStorage.removeItem('a2_invite')
    }

    // Lobby schließen (nur Host)
    const handleCloseLobby = async () => {
        if (!isHost || !db || !roomId) return
        closingRef.current = true
        const ref = doc(db, 'amplify2Lobbies', roomId)
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

        const lobbyRef = doc(db, 'amplify2Lobbies', roomId)

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
        setConfetti(null)
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
        sessionStorage.removeItem('a2_roomId')
    }

    // Lobby verlassen (Spieler wird aus der Lobby entfernt, Session endet)
    const handleLeaveLobby = async () => {
        leavingRef.current = true
        if (db && roomId && myName) {
            try {
                await updateDoc(doc(db, 'amplify2Lobbies', roomId), {
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
        const storedRoomId = sessionStorage.getItem('a2_roomId')
        const storedName = sessionStorage.getItem('a2_name')
        if (!db || !storedRoomId || !storedName?.trim()) return

        let cancelled = false
        const lobbyRef = doc(db, 'amplify2Lobbies', storedRoomId)
        signedIn().then(() => getDoc(lobbyRef)).then((snap) => {
            if (cancelled) return
            if (!snap.exists() || !isOpen(snap.data())) {
                sessionStorage.removeItem('a2_roomId')
                setRoomId('')
                return
            }
            const data = snap.data()
            if (!data.players?.[storedName]) {
                sessionStorage.removeItem('a2_roomId')
                setRoomId('')
                return
            }
            setRoomId(storedRoomId)
            setMyName(storedName)
            setNameDraft(storedName)
            setMyEmoji(sessionStorage.getItem('a2_emoji') || '😊')
            setIsHost(data.host === storedName)
            setCurrentScreen('room')
            subscribeToLobby(storedRoomId)
        }).catch(() => {
            if (!cancelled) sessionStorage.removeItem('a2_roomId')
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db])

    // Mehrere Songs auf einmal einreichen (Limit, Duplikate, ähnliche Songs und Runden-Modus in der Transaktion)
    const addManyToPlaylist = async (items) => {
        if (!db || !roomId) return { added: 0, error: 'Keine Verbindung zur Playlist.' }
        try {
            const res = await mutateLobby(roomId, (data) => {
                const current = data.playlist || []
                const maxSongs = limitsFor(data, myName, LIMIT_DEFAULTS).maxSongs
                let free = maxSongs - activePoolOf(data).filter(p => p.addedBy === myName).length   // pausierte zählen nicht
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
        if (res.added) rememberSong(item, 'added')
        if (res.added || res.duplicates) return true
        if (res.error) showToast(res.error, 'bad')
        else if (res.similar) showToast(`Ein sehr ähnlicher Song ist schon drin: „${res.similar.title}“ von ${res.similar.addedBy === myName ? 'dir' : res.similar.addedBy}.`, 'bad')
        else if (res.ruleMiss) showToast(res.ruleMiss, 'bad')
        else if (res.limitHit) showToast(`Du hast schon ${res.maxSongs} Songs im Rennen. Sobald einer läuft, ist wieder Platz.`, 'bad')
        return false
    }

    const myLimits = limitsFor(lobbyData, myName, LIMIT_DEFAULTS)
    const voteLimits = { up: myLimits.up, down: myLimits.down }

    // Vote für einen Song – jederzeit. Ein Daumen steckt im Song und kommt zurück, sobald der Song an Spotify
    // geht oder rausfliegt (gezählt werden nur Songs im Rennen). Keine Stimmen für eigene Songs, als Transaktion.
    // Eigene Stimme: Farbe sofort (vor der Bestätigung), die Reihenfolge bleibt noch kurz stehen und gleitet dann
    const [pendingVotes, setPendingVotes] = useState({})   // itemId → 1 | -1 | 0, bis Firestore bestätigt
    const [heldOrder, setHeldOrder] = useState(null)       // ids in der Reihenfolge vor dem Klick
    const holdTimerRef = useRef(null)
    const holdOrder = (ids) => {
        clearTimeout(holdTimerRef.current)
        setHeldOrder(prev => prev || ids)
    }
    const releaseOrder = () => {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = setTimeout(() => setHeldOrder(null), VOTE_MOVE_DELAY)
    }
    useEffect(() => () => clearTimeout(holdTimerRef.current), [])

    // Namensfeld: ohne Namen auf „Beitreten“/„Erstellen“ getippt → Hinweis
    const [nameNudged, setNameNudged] = useState(false)
    const nameInputRef = useRef(null)

    const handleVote = async (itemId, voteType) => {
        if (!db || !roomId || !myName) return
        const item = (lobbyData?.playlist || []).find(i => i.id === itemId)
        const before = item ? (pendingVotes[itemId] ?? (item.votes?.[myName] || 0)) : 0
        const wantedNow = voteType === 'up' ? 1 : -1
        const optimistic = before === wantedNow ? 0 : wantedNow
        const free = optimistic === 1 ? upLeft : optimistic === -1 ? downLeft : true
        if (item && free) setPendingVotes(p => ({ ...p, [itemId]: optimistic }))
        holdOrder(displayIds)

        try {
            const res = await mutateLobby(roomId, (data) => {
                const currentPlaylist = data.playlist || []
                const target = currentPlaylist.find(i => i.id === itemId)
                if (!target || target.queuedRound != null) return null
                if (target.addedBy === myName) return { own: true }
                if (isPaused(data, target)) return { paused: true }
                const currentVote = target.votes?.[myName] || 0
                const wanted = voteType === 'up' ? 1 : -1
                const newVote = currentVote === wanted ? 0 : wanted

                if (newVote !== 0) {
                    const lim = limitsFor(data, myName, LIMIT_DEFAULTS)
                    const limit = newVote === 1 ? lim.up : lim.down
                    const used = usedVotes(data, myName, newVote, itemId)
                    if (limit !== UNLIMITED && used >= limit) return { blocked: { limit, what: newVote === 1 ? 'Daumen hoch' : 'Daumen runter' } }
                }

                const next = { ...data, playlist: currentPlaylist.map(item =>
                    item.id === itemId ? { ...item, votes: { ...item.votes, [myName]: newVote } } : item
                ) }
                // Zu weit im Minus → Ladenhüter fliegt sofort raus (die Daumen darauf werden wieder frei)
                const stale = staleItems(next, Date.now()).filter(i => i.id === itemId)
                return { update: dropUpdate(next, Date.now(), stale) || { playlist: next.playlist }, dropped: stale.length > 0 }
            })
            if (res?.update && optimistic === 1 && item) rememberSong(item, 'liked')
            if (res?.dropped) showToast('Der Song ist als Ladenhüter rausgeflogen – dein Daumen ist wieder frei.')
            if (res?.own) showToast('Für deine eigenen Songs kannst du nicht abstimmen.', 'bad')
            if (res?.paused) showToast('Der Song ist pausiert – er passt nicht zur aktuellen Runde.', 'bad')
            if (res?.blocked) {
                const { limit, what } = res.blocked
                showToast(limit === 0
                    ? 'Daumen runter ist in dieser Playlist ausgeschaltet.'
                    : limit === 1
                        ? `Dein ${what} steckt schon in einem Song. Nimm ihn zurück – oder warte, bis der Song läuft.`
                        : `Alle ${limit} ${what} stecken in Songs. Nimm einen zurück – oder warte, bis einer läuft.`, 'bad')
            }
        } catch (error) {
            console.error('Fehler beim Voten:', error)
            showToast('Deine Stimme konnte nicht gespeichert werden. Bitte nochmal tippen.', 'bad')
        } finally {
            setPendingVotes(p => { const n = { ...p }; delete n[itemId]; return n })
            releaseOrder()
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
            if (!album.title) {
                album = { ...album, title: data.name, artist: data.artists?.map(a => a.name).join(', ') || '', imageUrl: data.images?.[0]?.url || null }
            }
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
    // ─── Songs aus Spotify holen: „Teilen → Link kopieren“, zurück, „Einfügen“ (oder Link ins Suchfeld) ─────
    // Song → sofort hinzufügen (mit „Rückgängig“), Album → Songliste, Künstler → Suche, Playlist → geht nicht.
    const [linkBusy, setLinkBusy] = useState(false)
    const [clipOffer, setClipOffer] = useState(null)   // Android: Link in der Zwischenablage beim Zurückkommen
    const [linkHintOpen, setLinkHintOpen] = useState(() => { try { return !localStorage.getItem('a2_link_hint_seen') } catch { return true } })
    const lastClipRef = useRef((() => { try { return sessionStorage.getItem('a2_last_clip') || '' } catch { return '' } })())
    const rememberClip = (text) => {
        lastClipRef.current = text
        try { sessionStorage.setItem('a2_last_clip', text) } catch { /* egal */ }
    }
    // Link → was ist es? { kind: 'none' | 'unresolved' | 'playlist' | 'track' | 'album' | 'artist', … }
    const readSpotifyLink = async (text) => {
        let link = parseSpotifyLink(text)
        if (!link) return { kind: 'none' }
        if (link.short) {
            const long = await spotifyService.resolveShortLink(link.short).catch(() => null)
            link = long ? parseSpotifyLink(long) : null
            if (!link || link.short) return { kind: 'unresolved' }
        }
        if (link.type === 'track') return { kind: 'track', item: await spotifyService.getSongById(link.id) }
        if (link.type === 'album') return { kind: 'album', id: link.id }
        if (link.type === 'artist') return { kind: 'artist', artist: await spotifyService.getArtist(link.id) }
        return { kind: 'playlist' }
    }
    const undoLinkAdd = async (item) => {
        const mine = (latestLobbyRef.current?.playlist || []).find(p => sameSong(p, item) && p.addedBy === myName && p.queuedRound == null)
        if (!mine) return
        await handleRemoveItem(mine.id)
        setAddedInModalIds(prev => { const next = new Set(prev); next.delete(item.id); next.delete(item.spotifyId); return next })
        showToast(`„${item.title}“ wieder entfernt.`)
    }
    const addFromLink = async (text) => {
        if (linkBusy) return
        setLinkBusy(true)
        setClipOffer(null)
        rememberClip(text)
        try {
            const r = await readSpotifyLink(text)
            if (r.kind === 'none') showToast('Da ist kein Spotify-Link. In Spotify beim Song: ⋯ → Teilen → Link kopieren.', 'bad')
            else if (r.kind === 'unresolved') showToast('Diesen Spotify-Link konnte Amplify nicht öffnen. Kopier ihn nochmal oder such den Song.', 'bad')
            else if (r.kind === 'playlist') showToast('Playlists gibt Spotify leider nicht heraus – teile einzelne Songs oder ein Album.', 'bad')
            else if (r.kind === 'album') await handleOpenAlbum({ spotifyId: r.id, title: '', artist: '' })
            else if (r.kind === 'artist') { setSearchQuery(r.artist.name); showToast(`Songs von ${r.artist.name}`) }
            else {
                const item = r.item
                const existing = (latestLobbyRef.current?.playlist || []).find(p => sameSong(p, item))
                if (existing) {
                    showToast(existing.addedBy === myName ? `„${item.title}“ hast du schon drin.` : `„${item.title}“ ist schon drin – von ${existing.addedBy}.`, 'bad')
                } else if (await addToPlaylist(item)) {
                    setAddedInModalIds(prev => new Set(prev).add(item.id).add(item.spotifyId))
                    showToast(`„${item.title}“ hinzugefügt`, 'info', { label: 'Rückgängig', run: () => undoLinkAdd(item) })
                }
            }
            if (r.kind !== 'none') {
                setLinkHintOpen(false)
                try { localStorage.setItem('a2_link_hint_seen', '1') } catch { /* egal */ }
            }
        } catch (e) {
            console.error('Spotify-Link fehlgeschlagen:', e)
            showToast('Der Song konnte gerade nicht geladen werden. Bitte nochmal versuchen.', 'bad')
        } finally {
            setLinkBusy(false)
        }
    }
    const pasteFromClipboard = async () => {
        let text = null
        try { text = await navigator.clipboard.readText() } catch { text = null }
        if (text == null) {
            showToast('Einfügen ging nicht automatisch – halte ins Suchfeld gedrückt und wähle „Einfügen“.', 'bad')
            searchInputRef.current?.focus()
            return
        }
        await addFromLink(text)
    }
    // Android/Chrome: Darf Amplify die Zwischenablage lesen (einmal erlaubt), bietet es beim Zurückkommen aus Spotify
    // einen neu kopierten Link direkt an. iPhone erlaubt das nicht – dort bleibt der Knopf „Einfügen“.
    useEffect(() => {
        if (!showAddModal) return
        let cancelled = false
        const check = async () => {
            if (document.visibilityState !== 'visible') return
            try {
                const perm = await navigator.permissions?.query({ name: 'clipboard-read' })
                if (perm?.state !== 'granted') return
                const text = await navigator.clipboard.readText()
                if (cancelled || !text || text === lastClipRef.current || !parseSpotifyLink(text)) return
                rememberClip(text)
                const r = await readSpotifyLink(text)
                if (cancelled) return
                if (r.kind === 'track') setClipOffer({ text, title: r.item.title, artist: r.item.artist })
                else if (r.kind === 'album') setClipOffer({ text, title: 'Album aus Spotify', artist: 'Songliste öffnen' })
            } catch { /* nicht erlaubt oder nicht unterstützt */ }
        }
        check()
        document.addEventListener('visibilitychange', check)
        window.addEventListener('focus', check)
        return () => { cancelled = true; document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check) }
    }, [showAddModal])

    // Reiter in „Song vorschlagen“ und Jahrzehnt-Filter aus „Inspiration“ (Runden-Modus geht vor)
    const [addTab, setAddTab] = useState('search')       // 'search' | 'inspiration'
    const [decadeFilter, setDecadeFilter] = useState(null)
    const [songMemory, setSongMemory] = useState([])
    const searchRule = lobbyData?.roundRule || (decadeFilter ? { type: 'decade', from: decadeFilter } : null)

    const handleSpotifySearch = async () => {
        const q = searchQuery.trim()
        if (!q && searchRule?.type !== 'decade') return

        setIsSearching(true)
        setSearchError(null)

        try {
            const results = await spotifyService.search(ruleSearchQuery(searchRule, q).trim(), 10)
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
    const searchable = (q) => q.length >= 2 || (q.length === 0 && searchRule?.type === 'decade')

    // Suche startet automatisch kurz nach dem Tippen
    useEffect(() => {
        if (!showAddModal) return
        if (!searchable(searchQuery.trim())) { setSearchResults([]); setSearchError(null); return }
        const id = setTimeout(() => handleSpotifySearch(), 500)
        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, showAddModal, searchRule?.type, searchRule?.artistId, searchRule?.from])

    const openAddModal = () => {
        setAddedInModalIds(new Set())
        setSongMemory(loadSongMemory())
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
        setDecadeFilter(null)
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

    // Host: Einstellungen aktualisieren – gelten sofort, schon eingereichte Songs bleiben drin
    const updateLobbyConfig = async (changes) => {
        if (!db || !roomId) return
        try {
            await updateDoc(doc(db, 'amplify2Lobbies', roomId), { ...changes, lastActiveAt: Date.now() })
        } catch (e) {
            console.error('Fehler beim Aktualisieren der Lobby-Konfiguration:', e)
            showToast('Die Einstellung konnte nicht gespeichert werden.', 'bad')
        }
    }

    // Nächster Song: Platz 1 kommt in die Warteschlange. round = erwartete Nummer – nichts passiert doppelt.
    const lockNextSong = useCallback(async (round) => {
        if (!db || !roomId) return null
        return mutateLobby(roomId, (d) => {
            if ((d.votingRound || 0) !== round || d.pendingBatch || upcomingQueue(d, Date.now()).length) return null
            const update = finishRound(d, Date.now())
            return update ? { update } : null
        })
    }, [db, roomId, mutateLobby])

    // ── Backup-Playlist: läuft, wenn keine Songs aus dem Voting in der Warteschlange sind ──
    // Startet an einer zufälligen Stelle; neue Runden kommen per Warteschlange davor (Spotify spielt die Warteschlange zuerst).
    const backupBusyRef = useRef(0)
    const startBackup = async ({ manual = false } = {}) => {
        const backup = latestLobbyRef.current?.backupPlaylist
        if (!backup?.uri || Date.now() - backupBusyRef.current < 15000) return false
        backupBusyRef.current = Date.now()
        try {
            const device = await pickDevice()
            const offset = backup.trackCount > 1 ? Math.floor(Math.random() * backup.trackCount) : 0
            try {
                await spotifyService.playContextAtOffset(backup.uri, offset, device)
            } catch (e) {
                if (offset === 0) throw e
                await spotifyService.playContextAtOffset(backup.uri, 0, device)   // Stelle gibt es nicht (mehr) → von vorn
            }
            if (!latestLobbyRef.current?.musicStarted) updateLobbyConfig({ musicStarted: true })
            setDeviceProblem(null)
            return true
        } catch (e) {
            console.error('Backup-Playlist starten fehlgeschlagen:', e)
            if (manual) showToast(friendlySpotifyError(e), 'bad')
            else setDeviceProblem(`Die Backup-Playlist ließ sich nicht starten: ${friendlySpotifyError(e)}`)
            return false
        }
    }
    const startBackupRef = useRef(startBackup)
    useLayoutEffect(() => { startBackupRef.current = startBackup })
    const lockNextSongRef = useRef(lockNextSong)
    useLayoutEffect(() => { lockNextSongRef.current = lockNextSong })
    const remainingRef = useRef(null)          // Restzeit des laufenden Songs (Host), für den Abfrage-Takt
    const skipAfterPushRef = useRef(false)     // fremde Musik lief → nach dem Anstellen überspringen

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

    // Eigener Song beginnt zu laufen → Toast; verdienter Nummer-1-Hit (mind. eine Stimme hoch) zusätzlich mit Konfetti
    const celebratedRef = useRef(null)
    const playingId = liveNowPlaying(lobbyData, clock)?.trackId || null
    useEffect(() => {
        if (!playingId || celebratedRef.current === playingId) return
        celebratedRef.current = playingId
        const item = (lobbyData?.playlist || []).find(i => i.spotifyId === playingId)
        if (!item || item.addedBy !== myNameRef.current) return
        if (isEarnedHit(item)) {
            const streak = lobbyData?.streakEnabled ? lobbyData.streaks?.[myNameRef.current]?.current || 0 : 0
            showToast(`🎉 Nummer-1-Hit! „${item.title}“ läuft jetzt${streak ? ` · 🔥 Streak ${streak}` : ''}`)
            setConfetti(Date.now())
        } else {
            showToast(`🎶 Dein Song „${item.title}“ läuft jetzt`)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playingId])
    useEffect(() => {
        if (!confetti) return
        const id = setTimeout(() => setConfetti(null), 4500)
        return () => clearTimeout(id)
    }, [confetti])

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
        const lobbyRef = doc(db, 'amplify2Lobbies', roomId)
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
                                contextUri: state.contextUri || null,
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

                // Platz 1 an Spotify, sobald nichts mehr von uns ansteht:
                //  - läuft nichts (Ende erreicht, keine Pause mitten im Song) → sofort
                //  - läuft etwas → erst 5 s vor Ende (bis dahin zählt jede Stimme)
                //  - läuft fremde Musik (Spotify-Autoplay, weil der Moment verpasst wurde) → anstellen und überspringen
                // Ohne Songs im Voting übernimmt die Backup-Playlist. Eine Pause mitten im Song bleibt in Ruhe.
                const data = latestLobbyRef.current
                const backup = data?.backupPlaylist
                remainingRef.current = isPlaying && state.durationMs ? state.durationMs - state.positionMs : null
                if (data && !data.pendingBatch && upcomingQueue(data, now).length === 0) {
                    const ours = !!trackId && (data.playlist || []).some(i => i.spotifyId === trackId)
                    const onBackup = !!backup?.uri && state?.contextUri === backup.uri
                    const ended = !isPlaying && (!trackId || progress.moved || (state.durationMs && state.positionMs >= state.durationMs - 3000))
                    const foreign = isPlaying && !!trackId && !ours && !onBackup
                    const hasSongs = activePoolOf(data).some(i => i.spotifyId && i.type === 'song')   // pausierte zählen nicht
                    if (hasSongs) {
                        const mode = ended ? 'now' : (isPlaying && remainingRef.current <= LOCK_BEFORE_END_MS) ? 'end' : foreign ? 'skip' : null
                        if (mode) {
                            skipAfterPushRef.current = mode === 'skip'
                            await lockNextSongRef.current(data.votingRound || 0)
                        }
                    } else if (backup?.uri && (data.musicStarted || (data.votingRound || 0) > 0) && (ended || foreign)) {
                        await startBackupRef.current()
                    }
                }
            } catch {
                // z.B. kein Token oder Player inaktiv – ignorieren
            } finally {
                busy = false
            }
        }
        // Alle 2 s – in den letzten 15 s eines Songs jede halbe Sekunde, damit der 5-s-Moment sicher getroffen wird
        let timer = null
        let stopped = false
        const loop = async () => {
            await poll()
            if (stopped) return
            const rem = remainingRef.current
            timer = setTimeout(loop, rem != null && rem < 15000 ? 500 : 2000)
        }
        loop()
        const onVisible = () => { if (document.visibilityState === 'visible') poll() }
        document.addEventListener('visibilitychange', onVisible)
        return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
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
            sessionStorage.setItem('spotify_return_to', 'amplify2')
            try {
                const session = Object.fromEntries(['a2_roomId', 'a2_name', 'a2_emoji'].map(k => [k, sessionStorage.getItem(k)]))
                localStorage.setItem(A2_LOGIN_BACKUP, JSON.stringify({ session, at: Date.now() }))
            } catch { /* egal – dann nur im selben Tab */ }
            const url = await spotifyService.getAuthUrlWithPKCE()
            window.location.href = url
        } catch (e) {
            showToast('Spotify-Verbindung konnte nicht gestartet werden: ' + (e.message || 'Unbekannter Fehler'), 'bad')
        }
    }

    const handleSpotifyDisconnect = async () => {
        if (db && roomId && isHost) {
            try {
                await updateDoc(doc(db, 'amplify2Lobbies', roomId), { nowPlaying: null })
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
    // Läuft gerade gar nichts, startet der erste Song direkt; läuft etwas (auch die Backup-Playlist), wird nur
    // angestellt – der laufende Song spielt zu Ende. Vorher Abgleich, damit nichts doppelt landet (nicht während
    // der Backup-Playlist: deren eigene nächste Songs stehen auch in der Liste).
    const pushToSpotify = async (ids, device) => {
        if (!ids.length) return false
        let inSpotify = []
        const onBackup = !!lobbyData?.backupPlaylist?.uri && rawNowPlaying?.contextUri === lobbyData.backupPlaylist.uri
        if (!onBackup) { try { inSpotify = await spotifyService.getQueueIds() } catch { /* ohne Abgleich weiter */ } }
        let rest = ids
        const startNow = !rawNowPlaying?.isPlaying
        if (startNow) {
            await spotifyService.playOnDevice([`spotify:track:${ids[0]}`], device)
            rest = ids.slice(1)
        }
        for (const id of rest) {
            if (!inSpotify.includes(id)) await spotifyService.addToQueue(`spotify:track:${id}`, device)
        }
        return startNow   // true = läuft schon direkt, nichts mehr zu überspringen
    }
    // Übergabe geschafft – die Runde liegt bei Spotify
    const handedOver = () => ({ pendingBatch: null })

    const sendQueueToSpotify = async (deviceOverride) => {
        if (queueSongs.length === 0) {
            setSpotifyError('Die Warteschlange ist leer. Platz 1 aus dem Voting landet hier kurz vor Ende des laufenden Songs.')
            return
        }
        setSpotifyError(null)
        try {
            const device = await pickDevice(deviceOverride)
            await pushToSpotify(queueSongs.map(i => i.spotifyId), device)
            setDeviceProblem(null)
            await mutateLobby(roomId, (data) => (data.pendingBatch ? { update: handedOver() } : null))
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

    // Überspringen: Steht noch nichts von uns bei Spotify an (Platz 1 wird sonst erst 5 s vor Songende festgelegt),
    // würde Spotify einfach weiterspielen (Backup-Playlist/Autoplay). Dann zuerst Platz 1 festlegen und anstellen –
    // übersprungen wird nach der Übergabe (applyPendingBatch).
    const handleSkip = async () => {
        try {
            const data = latestLobbyRef.current
            const queued = data ? upcomingQueue(data, Date.now()).length > 0 : true
            const hasSongs = !!data && activePoolOf(data).some(i => i.spotifyId && i.type === 'song')
            if (data?.pendingBatch) { skipAfterPushRef.current = true; return }   // Übergabe läuft schon
            if (!queued && hasSongs) {
                skipAfterPushRef.current = true
                const res = await lockNextSong(data.votingRound || 0)
                if (res?.update) return
                skipAfterPushRef.current = false   // nichts festgelegt (z. B. gerade schon passiert) → normal springen
            }
            await spotifyService.skipNext()
        } catch (e) {
            skipAfterPushRef.current = false
            showToast(friendlySpotifyError(e), 'bad')
        }
    }

    const handleVolume = (v) => {
        setHostVolume(v)
        volumeTouchedRef.current = Date.now()
        clearTimeout(volumeTimerRef.current)
        volumeTimerRef.current = setTimeout(() => { spotifyService.setVolume(v).catch(() => { /* egal */ }) }, 250)
    }

    // Host: Songs einer Runde sofort an Spotify übergeben (hinten an die Warteschlange). Danach spielt Spotify
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
                const started = await pushToSpotify(pending.spotifyIds, device)
                if (skipAfterPushRef.current) {
                    skipAfterPushRef.current = false
                    if (!started) {
                        try { await spotifyService.skipNext() } catch { /* dann läuft er nach dem laufenden Song */ }
                    }
                }
                setSpotifyError(null)
                setDeviceProblem(null)
                await mutateLobby(roomId, (data) => (data.pendingBatch?.round === pending.round ? { update: handedOver() } : null))
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

    // Runden-Modus gestartet/beendet → Hinweis an alle (nicht beim ersten Laden der Lobby)
    const ruleKeyRef = useRef(undefined)
    const ruleKey = lobbyData ? JSON.stringify(lobbyData.roundRule || null) : undefined
    useEffect(() => {
        if (ruleKey === undefined) { ruleKeyRef.current = undefined; return }   // keine Lobby → nächste startet neu
        const prev = ruleKeyRef.current
        ruleKeyRef.current = ruleKey
        if (prev === undefined || prev === ruleKey) return
        const data = latestLobbyRef.current
        const r = data?.roundRule
        if (!r) { showToast('🎉 Freie Runde – alle Songs sind wieder dabei.'); return }
        const paused = poolOf(data).filter(i => isPaused(data, i)).length
        showToast(`${ruleEmoji(r)} ${ruleLabel(r)}! ${ruleHint(r)} – schlag passende vor.${paused ? ` ${paused === 1 ? 'Ein Song pausiert' : `${paused} Songs pausieren`} bis zum Ende der Runde.` : ''}`)
    }, [ruleKey, showToast])

    // Ladenhüter nach Zeit (oder nach geänderter Einstellung) aufräumen – jedes Gerät, die Transaktion prüft erneut
    useEffect(() => {
        if (!db || !roomId) return
        const id = setInterval(() => {
            const data = latestLobbyRef.current
            if (!data || !staleItems(data, Date.now()).length) return
            mutateLobby(roomId, (d) => {
                const update = dropUpdate(d, Date.now(), staleItems(d, Date.now()))
                return update ? { update } : null
            }).catch(() => { /* nächster Takt versucht es erneut */ })
        }, 3000)
        return () => clearInterval(id)
    }, [db, roomId, mutateLobby])

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
        setArtistQuery('')
        setArtistResults([])
        setKeywordDraft('')
    }

    // ─── Backup-Playlist wählen (eigene und gefolgte Playlists des Hosts) ─────
    const openBackupPicker = async () => {
        setBackupFilter('')
        setBackupPicker({ list: [], loading: true, error: null })
        try {
            setBackupPicker({ list: await spotifyService.getMyPlaylists(50), loading: false, error: null })
        } catch (e) {
            setBackupPicker({ list: [], loading: false, error: e.message || 'Die Playlists konnten nicht geladen werden.' })
        }
    }
    const chooseBackup = async (pl) => {
        await updateLobbyConfig({ backupPlaylist: pl ? { uri: pl.uri, name: pl.name || '', imageUrl: pl.imageUrl || null, trackCount: pl.trackCount || 0 } : null })
        setBackupPicker(null)
        showToast(pl ? `🎵 „${pl.name}“ läuft, wenn nichts aus dem Voting dran ist.` : 'Keine Backup-Playlist – dann übernimmt Spotify-Autoplay.')
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
    const maxSongs = myLimits.maxSongs
    const streakBonusActive = myLimits.bonus.active
    const rule = lobbyData?.roundRule || null
    const round = lobbyData?.votingRound || 0
    // Pausierte Songs (passen nicht zum Runden-Modus) zählen weder fürs Song-Limit noch fürs Stimmen-Budget
    const poolItems = sortedPlaylist.filter(i => i.queuedRound == null)   // Live-Rangliste
    const activeItems = poolItems.filter(i => !isPaused(lobbyData, i))
    const pausedItems = poolItems.filter(i => isPaused(lobbyData, i))
    const myUnqueuedCount = activeItems.filter(p => p.addedBy === myName).length
    const myUpUsed = lobbyData ? usedVotes(lobbyData, myName, 1) : 0
    const myDownUsed = lobbyData ? usedVotes(lobbyData, myName, -1) : 0
    const upLeft = voteLimits.up === UNLIMITED || voteLimits.up - myUpUsed > 0
    const downLeft = voteLimits.down === UNLIMITED || voteLimits.down - myDownUsed > 0
    // Kurz nach der eigenen Stimme bleibt die alte Reihenfolge stehen (neue Songs hinten dran)
    if (heldOrder) {
        const pos = new Map(heldOrder.map((id, i) => [id, i]))
        activeItems.sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity))
    }
    const displayIds = activeItems.map(i => i.id)
    const setRowRef = useFlip(displayIds.join('|'))
    const players = Object.entries(lobbyData?.players || {})
        .map(([name, p]) => ({ name, emoji: p?.emoji || '🙂' }))
        .sort((a, b) => (a.name === lobbyData?.host ? -1 : b.name === lobbyData?.host ? 1 : a.name.localeCompare(b.name, 'de')))
    const playerCount = players.length
    const queueItems = lobbyData ? upcomingQueue(lobbyData, clock) : []

    // ─── Sicherheitsabfragen ─────────────────────────────────────────────────
    const confirmConfig = (() => {
        if (!confirm) return null
        if (confirm.kind === 'leave') return {
            title: 'Playlist verlassen?', text: 'Du wirst aus der Playlist entfernt. Deine eingereichten Songs bleiben drin.',
            cancelLabel: 'Bleiben', confirmLabel: 'Verlassen', run: handleLeaveLobby
        }
        if (confirm.kind === 'remove') return {
            title: `„${confirm.item.title}“ entfernen?`, text: confirm.item.addedBy === myName ? 'Dein Song fliegt aus dem Rennen – dafür hast du wieder Platz für einen anderen.' : `Der Song von ${confirm.item.addedBy} fliegt aus dem Rennen.`,
            cancelLabel: 'Abbrechen', confirmLabel: 'Entfernen', run: () => handleRemoveItem(confirm.item.id)
        }
        if (confirm.kind === 'kick') return {
            title: `${confirm.name} entfernen?`, text: 'Die Person fliegt aus der Playlist. Ihre Songs bleiben drin.',
            cancelLabel: 'Abbrechen', confirmLabel: 'Entfernen', run: () => handleKick(confirm.name)
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

    // Cover ohne Abzeichen (ein 🔥 auf dem Cover sah aus wie „heißer Song“) – das Emoji steht beim Namen
    const emojiOf = (name) => lobbyData?.players?.[name]?.emoji || '🙂'
    const songCover = (src, seed, size = 52) => (
        <span className={styles.mvCoverWrap} style={{ width: size, height: size }}>
            <CoverArt src={src} seed={seed} size={size} radius={Math.round(size * 0.22)} />
        </span>
    )

    // Hilfe-Text: Rolle + wie es läuft
    // Lange drücken (0,5 s) → „Song entfernen?“ von unten. Host: jeder Song, sonst nur eigene.
    // Bewegt sich der Finger (Scrollen), bricht es ab; Knöpfe in der Zeile lösen es nicht aus.
    const pressRef = useRef(null)
    const cancelPress = () => {
        const p = pressRef.current
        if (!p) return
        clearTimeout(p.timer)
        p.el.classList.remove(styles.mvPressing)
        pressRef.current = null
    }
    useEffect(() => () => clearTimeout(pressRef.current?.timer), [])
    const longPressRemove = (item) => ({
        onPointerDown: (e) => {
            if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button')) return
            cancelPress()
            const el = e.currentTarget
            el.classList.add(styles.mvPressing)
            pressRef.current = {
                el, x: e.clientX, y: e.clientY,
                timer: setTimeout(() => {
                    cancelPress()
                    navigator.vibrate?.(15)
                    // Der Klick beim Loslassen würde sonst auf dem Hintergrund des neuen Sheets landen und es schließen
                    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation() }
                    window.addEventListener('click', swallow, { capture: true, once: true })
                    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 800)
                    setConfirm({ kind: 'remove', item })
                }, 500)
            }
        },
        onPointerMove: (e) => {
            const p = pressRef.current
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress()
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onPointerLeave: cancelPress,
        onContextMenu: (e) => e.preventDefault()
    })

    const helpText = (() => {
        const up = voteLimits.up === UNLIMITED ? 'beliebig viele' : voteLimits.up
        const down = voteLimits.down === UNLIMITED ? 'beliebig viele' : voteLimits.down
        const voteRule = voteLimits.down === 0 ? `Du hast ${up} Daumen hoch.` : `Du hast ${up} Daumen hoch und ${down} Daumen runter.`
        const how = `Reich jederzeit bis zu ${maxSongs} Songs ein und stimm jederzeit ab. ${voteRule} Eine Stimme steckt im Song und kommt zurück, sobald der Song läuft. Kurz bevor der laufende Song endet, kommt Platz 1 dran – bis dahin zählt jede Stimme.`
        if (isHost) return {
            role: 'Du bist Host',
            intro: 'Du hast die Playlist erstellt. Die Songs laufen über dein Spotify – lass die App am besten offen.',
            now: round === 0 ? `${how} Die erste Runde startest du selbst, danach geht es automatisch weiter.` : how,
            extra: 'Einen Song entfernst du, indem du ihn lange gedrückt hältst – eigene auch über 🗑. Teilen lädt Gäste ein und öffnet das Live-Board. In den Einstellungen findest du Gerät, Runden-Modus und Teilnehmer-Optionen.'
        }
        return {
            role: 'Du bist Gast',
            intro: 'Du schlägst Songs vor und stimmst nebenbei ab. Der Host spielt die besten Songs über Spotify.',
            now: `${how} Für eigene Songs kannst du nicht stimmen – dafür entfernst du sie mit 🗑 oder indem du sie lange gedrückt hältst.`,
            extra: `Tippe auf ein Cover für eine Hörprobe.${lobbyData?.streakEnabled ? ' Streak ist an: Läuft dein Song mit mindestens einer Stimme hoch, ist das ein Nummer-1-Hit – und du bekommst einen Bonus.' : ''}`
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
                            {toast.action && (
                                <button type="button" className={`${styles.mvBtn} ${styles.mvToastAction}`} onClick={() => { setToast(null); toast.action.run() }}>{toast.action.label}</button>
                            )}
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
                    <ol className={styles.mvSteps}>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconPlus size={20} /></span>
                            <span><strong>Schlag Songs vor</strong>Bis zu {maxSongs} gleichzeitig.</span>
                        </li>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconArrowUp size={20} /></span>
                            <span><strong>Vote hoch oder runter</strong>Wann immer du willst.</span>
                        </li>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconPlay size={16} /></span>
                            <span><strong>Platz 1 läuft als Nächstes</strong>Gewählt wird bis kurz vor Ende des laufenden Songs.</span>
                        </li>
                    </ol>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => setShowWelcomePopup(false)}>Los geht’s</button>
                </BottomSheet>

                <BottomSheet open={sheet === 'help' && currentScreen === 'room'} onClose={closeSheet} labelledBy="mv-help-title">
                    <h2 id="mv-help-title" className={styles.mvSheetTitle}>{helpText.role}</h2>
                    <p className={styles.mvSheetText}>{helpText.intro}</p>
                    <div className={styles.mvHelpNow}>
                        <span className={styles.mvLabelSm}>So funktioniert’s</span>
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

                {confetti && <Confetti key={confetti} seed={confetti} />}
            </div>
        </div>
    )

    const nameError = roomId ? null : nameProblem(nameDraft)
    const nameEmpty = !roomId && !cleanName(nameDraft)   // leer: noch kein roter Fehler, aber kein Weiter
    // Ohne Namen weiter getippt → Feld wackelt kurz, bekommt den Fokus und sagt, was fehlt
    const nudgeName = () => {
        setNameNudged(true)
        const el = nameInputRef.current
        if (!el) return
        el.classList.remove(styles.mvShake)
        void el.offsetWidth   // Animation neu starten
        el.classList.add(styles.mvShake)
        el.focus()
    }
    const nameBlocks = !!nameError && !nameEmpty   // leerer Name sperrt nicht – der Klick zeigt aufs Feld
    const nameField = (
        <div className={styles.mvField}>
            <label htmlFor="mv-name" className={styles.mvLabel}>Dein Name</label>
            <div className={styles.mvNameRow}>
                {roomId ? (
                    <span className={styles.mvAvatar} aria-hidden="true">{myEmoji}</span>
                ) : (
                    <button type="button" className={`${styles.mvBtn} ${styles.mvAvatar} ${styles.mvAvatarBtn}`} onClick={() => setAvatarOpen(o => !o)}
                        aria-expanded={avatarOpen} aria-controls="mv-avatars" aria-label={`Profilbild ${myEmoji} – tippen zum Ändern`} title="Profilbild ändern">{myEmoji}</button>
                )}
                <input id="mv-name" ref={nameInputRef} type="text" className={`${styles.mvInput} ${styles.mvInputPlain} ${nameError && !nameEmpty ? styles.mvInputBad : ''} ${nameEmpty ? styles.mvInputAttn : ''}`}
                    value={roomId ? myName : nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    readOnly={!!roomId} maxLength={24} autoComplete="nickname" spellCheck={false}
                    placeholder="Wie heißt du?"
                    aria-invalid={!!nameError && !nameEmpty} aria-describedby="mv-name-hint" />
            </div>
            {avatarOpen && !roomId && (
                <div id="mv-avatars" className={styles.mvAvatarGrid} role="radiogroup" aria-label="Profilbild wählen">
                    {AVATARS.map(e => (
                        <button key={e} type="button" role="radio" aria-checked={e === myEmoji}
                            className={`${styles.mvBtn} ${styles.mvAvatarPick} ${e === myEmoji ? styles.mvAvatarPickOn : ''}`}
                            onClick={() => pickAvatar(e)}>{e}</button>
                    ))}
                </div>
            )}
            <p id="mv-name-hint" className={(nameError && !nameEmpty) || (nameEmpty && nameNudged) ? styles.mvFieldError : styles.mvFieldHint}>
                {roomId
                    ? 'Du bist gerade in einer Playlist – dein Name bleibt dort gleich.'
                    : nameEmpty && nameNudged
                        ? 'Gib zuerst deinen Namen ein.'
                        : nameEmpty
                        ? 'So sehen dich die anderen – auch auf dem Live-Board. Tipp aufs Bild, um es zu ändern.'
                        : (nameError || 'So sehen dich die anderen – auch auf dem Live-Board.')}
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
                    <h1 className={styles.mvHeroTitle}>Amplify 2.0</h1>
                    <p className={styles.mvLead}>
                        Songs einreichen und abstimmen – ganz nebenbei. Die beliebtesten laufen zuerst über Spotify.
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
                    <p className={styles.mvInfo}>Du wirst Host: Die beliebtesten Songs laufen über dein Spotify.</p>
                    {nameField}
                    {!spotifyConnected && (
                        <div className={styles.mvAlert} role="alert">
                            <span className={styles.mvAlertIcon}><IconAlert size={20} /></span>
                            <p className={styles.mvAlertText}>Verbinde zuerst Spotify auf der Startseite.</p>
                        </div>
                    )}
                </div>
                <div className={styles.mvFooter}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => (nameEmpty ? nudgeName() : handleCreateLobby())} disabled={creating || !db || nameBlocks || !spotifyConnected}>
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
                            <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => (nameEmpty ? nudgeName() : handleJoinLobby(validInvite.code))} disabled={!!busyAction || nameBlocks}>
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

                    <form className={styles.mvField} onSubmit={(e) => { e.preventDefault(); if (nameEmpty) nudgeName(); else handleJoinLobby(code) }}>
                        <label htmlFor="mv-code" className={styles.mvLabel}>{validInvite ? 'Oder anderen Raumcode eingeben' : 'Raumcode'}</label>
                        <div className={styles.mvNameRow}>
                            <input id="mv-code" type="text" className={`${styles.mvInput} ${styles.mvInputPlain} ${styles.mvCodeInput}`}
                                value={codeDraft} onChange={(e) => setCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                placeholder="z. B. 3RUCTD" maxLength={10} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" />
                        </div>
                        <p className={styles.mvFieldHint}>Den Code zeigt der Host unter „Teilen“ – oder einfach seinen QR-Code scannen.</p>
                        <button type="submit" className={`${styles.mvBtn} ${CODE_RE.test(code) && !nameBlocks ? styles.mvPrimary : styles.mvPrimaryOff}`} disabled={!CODE_RE.test(code) || nameBlocks || !!busyAction}>
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
                // Nach rechts wischen = hinzufügen (wie das ➕); gesperrte Treffer federn zurück und sagen warum
                const swipeMode = isAlbum || mine ? 'off' : (existing || blocked) ? 'blocked' : 'add'
                const blockedReason = limitReached && !existing && !problem
                    ? `Du hast schon ${maxSongs} Songs drin – sobald einer läuft, ist wieder Platz.`
                    : meta
                return (
                    <SwipeRow key={item.id} mode={swipeMode} onAdd={() => handleAddItem(item)} onBlocked={() => showToast(blockedReason, 'bad')}
                        className={`${styles.mvResult} ${mine ? styles.mvRowAdded : ''} ${takenByOther || problem ? styles.mvResultMuted : ''}`}>
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
                    </SwipeRow>
                )
            }

            // Reiter „Inspiration“: zuerst deine Songs (auf diesem Gerät), dann Mehr von … und Jahrzehnte – alles ohne Login
            const inspirationContent = () => {
                const added = songMemory.filter(e => e.added).map(memoryToSong)
                const liked = songMemory.filter(e => e.liked && !e.added).map(memoryToSong)
                // Künstler aus Warteschlange und „Läuft“ – die häufigsten zuerst
                const counts = new Map()
                for (const name of [...playlist.map(i => i.artist), nowPlaying?.artist]) {
                    const first = String(name || '').split(',')[0].trim()
                    if (first) counts.set(first, (counts.get(first) || 0) + 1)
                }
                const artists = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n)
                const searchFor = (q, decade = null) => { setDecadeFilter(decade); setSearchQuery(q); setAddTab('search') }
                const section = (title, items) => items.length > 0 && (
                    <section className={styles.mvInspoSection}>
                        <h3 className={styles.mvInspoTitle}>{title}</h3>
                        <ul className={styles.mvList}>{items.slice(0, 30).map(songRow)}</ul>
                    </section>
                )
                return (
                    <div className={styles.mvListBox}>
                        {section('Von dir vorgeschlagen', added)}
                        {section('Gefiel dir', liked)}
                        {!added.length && !liked.length && (
                            <p className={styles.mvFine}>Hier sammeln sich deine Songs – alles, was du vorschlägst oder hochvotest, merkt sich Amplify auf diesem Handy. Beim nächsten Mal bist du so mit einem Tipp dabei.</p>
                        )}
                        {artists.length > 0 && (
                            <section className={styles.mvInspoSection}>
                                <h3 className={styles.mvInspoTitle}>Mehr von …</h3>
                                <div className={styles.mvChips}>
                                    {artists.map(a => <button key={a} type="button" className={`${styles.mvBtn} ${styles.mvChipBtn}`} onClick={() => searchFor(a)}>{a}</button>)}
                                </div>
                            </section>
                        )}
                        {!rule && (
                            <section className={styles.mvInspoSection}>
                                <h3 className={styles.mvInspoTitle}>Jahrzehnte</h3>
                                <div className={styles.mvChips}>
                                    {DECADES.map(d => <button key={d} type="button" className={`${styles.mvBtn} ${styles.mvChipBtn}`} onClick={() => searchFor('', d)}>📼 {decadeLabel(d)}</button>)}
                                </div>
                            </section>
                        )}
                    </div>
                )
            }

            return shell(
                <main className={`${styles.mvMain} ${previewId ? styles.mvWithPreview : ''}`}>
                    {subHeader(albumTracks ? 'Album' : 'Song vorschlagen', () => (albumTracks ? setAlbumTracks(null) : closeAddModal()),
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
                        ) : (<>
                            {clipOffer && (
                                <div className={styles.mvClipOffer} role="status">
                                    <span className={styles.mvClipIcon} aria-hidden="true">🎵</span>
                                    <span className={styles.mvRowText}>
                                        <span className={styles.mvRowName}>{clipOffer.title}</span>
                                        <span className={styles.mvRowMeta}>{clipOffer.artist} · aus Spotify kopiert</span>
                                    </span>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvClipAdd}`} onClick={() => addFromLink(clipOffer.text)} disabled={linkBusy}>Hinzufügen</button>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtnSm}`} onClick={() => setClipOffer(null)} aria-label="Nicht hinzufügen"><IconX size={16} /></button>
                                </div>
                            )}
                            <section className={styles.mvLinkBox} aria-label="Songs aus Spotify holen">
                                <div className={styles.mvLinkRow}>
                                    <a className={`${styles.mvBtn} ${styles.mvLinkBtn}`} href={LIKED_SONGS_URL} target="_blank" rel="noopener noreferrer">
                                        <span className={styles.mvLinkHeart} aria-hidden="true">♥</span>Lieblingssongs in Spotify
                                    </a>
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvLinkBtn} ${styles.mvLinkPaste}`} onClick={pasteFromClipboard} disabled={linkBusy}>
                                        {linkBusy ? <IconWave size={18} /> : <IconCopy size={18} />}Einfügen
                                    </button>
                                </div>
                                <button type="button" className={`${styles.mvBtn} ${styles.mvLinkHelp}`} onClick={() => setLinkHintOpen(o => !o)} aria-expanded={linkHintOpen}>
                                    <IconInfo size={14} />So holst du Songs aus Spotify<IconChevron open={linkHintOpen} />
                                </button>
                                {linkHintOpen && (
                                    <ol className={styles.mvLinkSteps}>
                                        <li>In Spotify beim Song auf <strong>⋯</strong> → <strong>Teilen</strong> → <strong>Link kopieren</strong></li>
                                        <li>Zurück zu Amplify wechseln</li>
                                        <li><strong>Einfügen</strong> tippen – fertig. Geht auch mit Alben.</li>
                                    </ol>
                                )}
                            </section>
                            <div className={`${styles.mvSegments} ${styles.mvSegments2}`} role="tablist" aria-label="Songs finden">
                                {[['search', 'Suche', <IconSearch key="i" size={16} />], ['inspiration', 'Inspiration', <span key="i" aria-hidden="true">✨</span>]].map(([id, label, icon]) => (
                                    <button key={id} type="button" role="tab" aria-selected={addTab === id}
                                        className={`${styles.mvBtn} ${styles.mvSegment} ${addTab === id ? styles.mvSegmentOn : ''}`}
                                        onClick={() => setAddTab(id)}>{icon}{label}</button>
                                ))}
                            </div>
                            {addTab === 'search' && <div className={styles.mvField}>
                                <label htmlFor="mv-search" className={styles.mvLabel}>{rule?.type === 'artist' ? `Oder Song von ${rule.artistName} suchen` : 'Oder Song bzw. Album suchen'}</label>
                                <div className={styles.mvInputWrap}>
                                    <span className={styles.mvInputIcon}><IconSearch /></span>
                                    <input
                                        id="mv-search"
                                        ref={searchInputRef}
                                        type="search"
                                        className={styles.mvInput}
                                        value={searchQuery}
                                        onChange={(e) => {
                                            // Spotify-Link eingefügt → direkt übernehmen statt danach zu suchen
                                            if (looksLikeSpotifyLink(e.target.value)) { setSearchQuery(''); addFromLink(e.target.value) } else setSearchQuery(e.target.value)
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSpotifySearch() }}
                                        placeholder="Titel, Band, Album oder Link"
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
                            {decadeFilter && !rule && (
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvFilterChip}`} onClick={() => setDecadeFilter(null)} aria-label={`Filter ${decadeLabel(decadeFilter)} entfernen`}>
                                        📼 {decadeLabel(decadeFilter)}<IconX size={14} />
                                    </button>
                                )}
                            </div>}
                        </>)}

                        {limitReached && (
                            <p className={styles.mvHintLine}>Du hast {maxSongs} Songs im Rennen – sobald einer läuft, ist wieder Platz.</p>
                        )}

                        {addTab === 'inspiration' && !albumTracks ? inspirationContent() : <div className={styles.mvListBox}>
                            {view === 'album' && <ul className={styles.mvList}>{albumTracks.tracks.map(songRow)}</ul>}
                            {view === 'ok' && <ul className={styles.mvList}>{searchResults.map(songRow)}</ul>}
                            {view === 'loading' && skeletons(isLoadingAlbum ? 'Wird geladen' : 'Spotify wird durchsucht')}
                            {view === 'prompt' && (
                                <div className={styles.mvEmpty}>
                                    <span className={styles.mvEmptyIcon}><IconSearch size={24} /></span>
                                    <p className={styles.mvEmptyTitle}>Was soll laufen?</p>
                                    <p className={styles.mvEmptyText}>Hol dir Songs aus Spotify (oben) oder such hier. Tippe auf einen Song, um ihn vorzuschlagen – aufs Cover für eine Hörprobe.</p>
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
                        </div>}
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
            const currentRuleTab = ruleTab ?? rule?.type ?? null
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

                        <section className={styles.mvCard}>
                            <button type="button" className={`${styles.mvBtn} ${styles.mvMenuRow}`} onClick={() => setSheet('help')}>
                                <span className={styles.mvBoardIcon}><IconHelp size={18} /></span>
                                <span className={styles.mvRowText}>
                                    <span className={styles.mvRowName}>So funktioniert’s</span>
                                    <span className={styles.mvRowMeta}>{isHost ? 'Du bist Host' : 'Du bist Gast'} · kurz erklärt</span>
                                </span>
                                <IconNext />
                            </button>
                        </section>

                        <section className={styles.mvCard}>
                            <div className={styles.mvCardHead}>
                                <h2 className={styles.mvCardTitle}>Dabei</h2>
                                <span className={styles.mvChip}>{playerCount}</span>
                            </div>
                            <ul className={styles.mvPeople}>
                                {players.map(p => (
                                    <li key={p.name} className={styles.mvPerson}>
                                        <span className={styles.mvPersonEmoji} aria-hidden="true">{p.emoji}</span>
                                        <span className={styles.mvPersonName}>{p.name}{p.name === myName ? ' (du)' : ''}{p.name === lobbyData.host ? ' · Host' : ''}{lobbyData.streakEnabled && streakOf(lobbyData, p.name) > 0 ? ` · 🔥 ${streakOf(lobbyData, p.name)}` : ''}</span>
                                        {isHost && p.name !== myName && (
                                            <button type="button" className={`${styles.mvBtn} ${styles.mvKickBtn}`} onClick={() => setConfirm({ kind: 'kick', name: p.name })} aria-label={`${p.name} entfernen`}><IconX size={14} /></button>
                                        )}
                                    </li>
                                ))}
                            </ul>
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
                                        <div className={styles.mvField}>
                                            <span className={styles.mvLabel}>Lautstärke</span>
                                            <span className={styles.mvVolume}>
                                                <IconVolume size={18} />
                                                <input type="range" min={0} max={100} step={5} value={hostVolume ?? 50} onChange={(e) => handleVolume(Number(e.target.value))}
                                                    aria-label="Lautstärke" className={styles.mvVolumeSlider} style={{ '--pct': `${hostVolume ?? 50}%` }} />
                                            </span>
                                        </div>
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={playHere}><IconSpeaker />Hier im Browser abspielen</button>
                                        <button type="button" className={`${styles.mvBtn} ${hasQueue ? styles.mvPrimary : styles.mvPrimaryOff}`} onClick={() => sendQueueToSpotify()} disabled={!hasQueue}>
                                            <IconPlay size={18} />{nowPlaying?.isPlaying ? 'Warteschlange neu senden' : 'Warteschlange abspielen'}
                                        </button>
                                        {!hasQueue && <p className={styles.mvFine}>Die Warteschlange ist leer. Die besten Songs kommen mit der nächsten Runde.</p>}
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvDangerLink}`} onClick={handleSpotifyDisconnect}>Spotify trennen</button>
                                    </>
                                )}
                            </section>
                        )}

                        {isHost && (
                            <section className={styles.mvCard}>
                                <div className={styles.mvCardHead}>
                                    <h2 className={styles.mvCardTitle}>Backup-Playlist</h2>
                                    {lobbyData.backupPlaylist?.uri && <span className={`${styles.mvChip} ${styles.mvChipOk}`}>aktiv</span>}
                                </div>
                                <p className={styles.mvFine}>Läuft, wenn kein Song in der Warteschlange ist. Kommt ein neuer Song dazu, spielt er nach dem laufenden Backup-Song.</p>
                                {lobbyData.backupPlaylist?.uri && (
                                    <div className={styles.mvBackupNow}>
                                        <CoverArt src={lobbyData.backupPlaylist.imageUrl} seed={lobbyData.backupPlaylist.uri} size={46} radius={10} />
                                        <span className={styles.mvRowText}>
                                            <span className={styles.mvRowName}>{lobbyData.backupPlaylist.name}</span>
                                            <span className={styles.mvRowMeta}>{lobbyData.backupPlaylist.trackCount ? `${lobbyData.backupPlaylist.trackCount} Songs · ` : ''}startet an zufälliger Stelle</span>
                                        </span>
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvKickBtn}`} onClick={() => chooseBackup(null)} aria-label="Backup-Playlist entfernen"><IconX size={14} /></button>
                                    </div>
                                )}
                                {!backupPicker ? (
                                    <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={openBackupPicker} disabled={!spotifyConnected}>
                                        <IconQueue size={18} />{lobbyData.backupPlaylist?.uri ? 'Andere Playlist wählen' : 'Playlist wählen'}
                                    </button>
                                ) : (
                                    <>
                                        <div className={styles.mvInputWrap}>
                                            <span className={styles.mvInputIcon}><IconSearch /></span>
                                            <input type="search" className={styles.mvInput} value={backupFilter} onChange={(e) => setBackupFilter(e.target.value)}
                                                placeholder="Deine Playlists durchsuchen" aria-label="Deine Playlists durchsuchen" autoComplete="off" />
                                        </div>
                                        {backupPicker.loading && skeletons('Playlists werden geladen')}
                                        {backupPicker.error && <p className={styles.mvFieldError}>{backupPicker.error}</p>}
                                        {!backupPicker.loading && !backupPicker.error && (() => {
                                            const f = backupFilter.trim().toLocaleLowerCase('de')
                                            const list = backupPicker.list.filter(pl => !f || `${pl.name} ${pl.owner}`.toLocaleLowerCase('de').includes(f))
                                            return list.length ? (
                                                <ul className={`${styles.mvList} ${styles.mvBackupList}`}>
                                                    {list.map(pl => (
                                                        <li key={pl.id}>
                                                            <button type="button" className={`${styles.mvBtn} ${styles.mvRow} ${styles.mvRowFlat} ${lobbyData.backupPlaylist?.uri === pl.uri ? styles.mvRowOn : ''}`} onClick={() => chooseBackup(pl)}>
                                                                <CoverArt src={pl.imageUrl} seed={pl.id} size={40} radius={8} />
                                                                <span className={styles.mvRowText}>
                                                                    <span className={styles.mvRowName}>{pl.name}</span>
                                                                    <span className={styles.mvRowMeta}>{pl.owner}{pl.trackCount ? ` · ${pl.trackCount} Songs` : ''}</span>
                                                                </span>
                                                                {lobbyData.backupPlaylist?.uri === pl.uri && <IconCheck size={16} />}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <p className={styles.mvFine}>{f ? `Keine Playlist mit „${backupFilter.trim()}“.` : 'Keine Playlists gefunden.'}</p>
                                        })()}
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvExpand}`} onClick={() => setBackupPicker(null)}>Schließen</button>
                                    </>
                                )}
                            </section>
                        )}

                        {isHost && (
                            <section className={styles.mvCard}>
                                <div className={styles.mvCardHead}>
                                    <h2 className={styles.mvCardTitle}>Runden</h2>
                                    <span className={styles.mvChip}>Runde {round}</span>
                                </div>
                                <p className={styles.mvFine}>Gilt sofort. Schon eingereichte Songs und gesetzte Daumen bleiben.</p>
                                {ROOM_SETTINGS.map(s => (
                                    <StepSlider key={s.id} id={`mv-${s.id}`} label={s.label} options={s.options}
                                        value={lobbyData[s.id] ?? s.fallback}
                                        onChange={(v) => updateLobbyConfig({ [s.id]: v })}
                                        valueText={s.text} tickText={s.tick} />
                                ))}
                            </section>
                        )}

                        {isHost && (
                            <section className={styles.mvCard}>
                                <div className={styles.mvCardHead}>
                                    <h2 className={styles.mvCardTitle}>Ladenhüter</h2>
                                </div>
                                <p className={styles.mvFine}>Songs, die nicht ankommen, fliegen raus – so werden Plätze und Daumen wieder frei. Die Person bekommt einen kurzen Hinweis.</p>
                                {DROP_SETTINGS.map(s => (
                                    <StepSlider key={s.id} id={`mv-${s.id}`} label={s.label} options={s.options}
                                        value={lobbyData[s.id] ?? s.fallback}
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
                                        Läuft dein Song als Platz 1 mit mindestens einer Stimme hoch, ist das ein Nummer-1-Hit – der Bonus gilt sofort.
                                        Je mehr Hits, desto größer: {STREAK_LEVELS.slice(1).map((l, i) => `${i + 1}× ${l.label}`).join(' · ')} (mehr gibt es nicht).
                                        Songs, die ohne Stimme auf Platz 1 rutschen, laufen auch – zählen aber nicht.
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
                                <p className={styles.mvFine}>{rule ? `Jetzt: ${ruleLabel(rule)} – ${ruleHint(rule)}.` : 'Jetzt: freie Runde – alle Songs erlaubt.'} Songs, die nicht passen, pausieren bis zum Ende der Runde – ihre Stimmen sind solange gutgeschrieben.</p>
                                <div className={styles.mvSegments} role="tablist" aria-label="Modus">
                                    {[[null, 'Frei'], ['artist', 'Künstler'], ['decade', 'Jahrzehnt'], ['keyword', 'Stichwort']].map(([id, label]) => (
                                        <button key={label} type="button" role="tab" aria-selected={currentRuleTab === id}
                                            className={`${styles.mvBtn} ${styles.mvSegment} ${currentRuleTab === id ? styles.mvSegmentOn : ''}`}
                                            onClick={() => { setRuleTab(id); if (id === null && rule) setRoundRule(null) }}>{label}</button>
                                    ))}
                                </div>
                                {currentRuleTab === 'artist' && (
                                    <div className={styles.mvField}>
                                        <label htmlFor="mv-artist" className={styles.mvLabel}>Künstler suchen</label>
                                        <div className={styles.mvInputWrap}>
                                            <span className={styles.mvInputIcon}><IconSearch /></span>
                                            <input id="mv-artist" type="search" className={styles.mvInput} value={artistQuery} onChange={(e) => setArtistQuery(e.target.value)}
                                                placeholder={rule?.type === 'artist' ? rule.artistName : 'z. B. Helene Fischer'} autoComplete="off" />
                                        </div>
                                        {artistResults.length > 0 && (
                                            <ul className={styles.mvList}>
                                                {artistResults.map(a => (
                                                    <li key={a.id}>
                                                        <button type="button" className={`${styles.mvBtn} ${styles.mvRow} ${styles.mvRowFlat} ${rule?.artistId === a.id ? styles.mvRowOn : ''}`}
                                                            onClick={() => setRoundRule({ type: 'artist', artistId: a.id, artistName: a.name })}>
                                                            <CoverArt src={a.imageUrl} seed={a.id} size={40} radius={20} />
                                                            <span className={styles.mvRowText}><span className={styles.mvRowName}>{a.name}</span></span>
                                                            {rule?.artistId === a.id && <IconCheck size={16} />}
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
                                            <button key={d} type="button" className={`${styles.mvBtn} ${styles.mvDecade} ${rule?.type === 'decade' && rule.from === d ? styles.mvDecadeOn : ''}`}
                                                onClick={() => setRoundRule({ type: 'decade', from: d })} aria-pressed={rule?.type === 'decade' && rule.from === d}>{decadeLabel(d)}</button>
                                        ))}
                                    </div>
                                )}
                                {currentRuleTab === 'keyword' && (
                                    <form className={styles.mvNameRow} onSubmit={(e) => { e.preventDefault(); const w = keywordDraft.trim(); if (w.length >= 2) setRoundRule({ type: 'keyword', word: w.slice(0, 30) }) }}>
                                        <input type="text" className={`${styles.mvInput} ${styles.mvInputPlain}`} value={keywordDraft} onChange={(e) => setKeywordDraft(e.target.value)}
                                            placeholder={rule?.type === 'keyword' ? rule.word : 'z. B. Love, Summer, Nacht'} aria-label="Stichwort im Songtitel" maxLength={30} />
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

        // ── Playlist: Läuft → Warteschlange (Platz 1 über der gestrichelten Linie läuft als Nächstes) ──
        const downAllowed = voteLimits.down !== 0
        const upFree = voteLimits.up === UNLIMITED ? null : Math.max(0, voteLimits.up - myUpUsed)
        const downFree = voteLimits.down === UNLIMITED ? null : Math.max(0, voteLimits.down - myDownUsed)
        const progressPct = nowPlaying?.durationMs ? Math.min(100, (nowPlayingPositionMs / nowPlaying.durationMs) * 100) : 0
        // Ein fremder Song (z. B. Spotify-Autoplay), der rechnerisch zu Ende ist, bleibt sonst bei 4:42 / 4:42 stehen
        const showNow = !!nowPlaying && !(nowPlaying.isPlaying && nowPlaying.durationMs && nowPlayingPositionMs >= nowPlaying.durationMs)
        const nowItem = showNow ? playlist.find(i => i.spotifyId === nowPlaying.trackId) : null
        const live = showNow && nowPlaying.isPlaying
        const full = myUnqueuedCount >= maxSongs
        const onBackup = showNow && !nowItem && !!lobbyData.backupPlaylist?.uri && nowPlaying.contextUri === lobbyData.backupPlaylist.uri
        // Grün = kommt sicher weiter: die besten N mit Saldo ≥ +1 (sie stehen durch die Sortierung immer oben)
        // Steht Platz 1 schon fest (bei Spotify angestellt), bleibt er mit Schloss oben in der Liste – keine eigene Sektion
        const lockedCount = queueItems.length
        const byName = (name) => `${emojiOf(name)} ${name === myName ? 'du' : name}`
        const scoreNum = (n) => <span className={styles.mvNum}>{n < 0 && <span className={styles.mvSign}>−</span>}{Math.abs(n)}</span>

        return shell(
            <main className={`${styles.mvMain} ${previewId ? styles.mvWithPreview : ''}`}>
                <header className={`${styles.mvSubHeader} ${styles.mvRoomHeader} ${styles.mvPad}`}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={handleGoBack} aria-label="Zur Startseite (du bleibst in der Playlist)" title="Zur Startseite"><IconBack /></button>
                    <div className={styles.mvRoomTitle}>
                        <h1 className={styles.mvSubTitle}>Amplify</h1>
                        <span className={styles.mvRoomSub}><span className={`${styles.mvRoomDot} ${live ? styles.mvRoomDotLive : ''}`} aria-hidden="true" />Gemeinsame Playlist{live ? ' · Live' : ''}</span>
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
                    {isHost && !showNow && queueItems.length === 0 && (lobbyData.backupPlaylist?.uri ? (
                        <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => startBackup({ manual: true })}>
                            <IconPlay size={18} />Backup-Playlist starten
                        </button>
                    ) : (
                        <p className={styles.mvHintLine}>Die Musik startet mit dem ersten Song in der Warteschlange. Tipp: Wähl in den Einstellungen eine Backup-Playlist – die läuft, solange keiner da ist.</p>
                    ))}
                    {rule && <p className={styles.mvRuleBanner}><span aria-hidden="true">{ruleEmoji(rule)}</span>{ruleLabel(rule)} · {ruleHint(rule)}</p>}
                    {streakBonusActive && <p className={styles.mvStreakChip}>🔥 {myLimits.bonus.streak} Nummer-1-{myLimits.bonus.streak === 1 ? 'Hit' : 'Hits'} – Bonus: {myLimits.bonus.label}</p>}

                    {showNow && (
                        <section className={styles.mvNowCard} aria-label="Läuft gerade">
                            <div className={styles.mvNowCardRow}>
                                {songCover(nowPlaying.imageUrl, nowPlaying.trackId, 76)}
                                <div className={styles.mvRowText}>
                                    <span className={styles.mvNowTag}>{nowPlaying.isPlaying ? <><IconWave size={14} />Läuft</> : <><IconPause size={12} />Pausiert</>}</span>
                                    <Marquee className={styles.mvNowCardTitle}>{nowPlaying.trackName}</Marquee>
                                    <Marquee className={styles.mvRowMeta}>{nowPlaying.artist}</Marquee>
                                    {nowItem?.addedBy && <span className={styles.mvByLine}>{byName(nowItem.addedBy)}</span>}
                                    {onBackup && <span className={styles.mvByLine}>🎵 Backup-Playlist</span>}
                                </div>
                                {isHost && (
                                    <span className={styles.mvNowCtrls}>
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvNowPlayBtn}`} onClick={handlePausePlayback} aria-label={nowPlaying.isPlaying ? 'Pause' : 'Weiter abspielen'}>
                                            {nowPlaying.isPlaying ? <IconPause size={20} /> : <IconPlay size={20} />}
                                        </button>
                                        <button type="button" className={`${styles.mvBtn} ${styles.mvNowSkipBtn}`} onClick={handleSkip} aria-label="Song überspringen"><IconSkip size={18} /></button>
                                    </span>
                                )}
                            </div>
                            <div className={styles.mvNowProgress}>
                                <span>{mmss(nowPlayingPositionMs)}</span>
                                <span className={styles.mvNowCardBar} aria-hidden="true"><span style={{ width: `${progressPct}%` }} /></span>
                                <span>{mmss(nowPlaying.durationMs)}</span>
                            </div>
                        </section>
                    )}

                    <section aria-label="Warteschlange">
                        <div className={styles.mvSecHead}>
                            <h2 className={styles.mvSecTitle}>Warteschlange</h2>
                            <span className={styles.mvSecMeta} aria-label={`Verfügbare Votes: ${upFree ?? 'unbegrenzt'} hoch${downAllowed ? `, ${downFree ?? 'unbegrenzt'} runter` : ''}`}>
                                <span className={styles.mvFreeLabel}>Verfügbare Votes:</span>
                                <span className={`${styles.mvFreeUp} ${upLeft ? '' : styles.mvFreeEmpty}`}><IconArrowUp size={15} />{upFree ?? '∞'}</span>
                                {downAllowed && <span className={`${styles.mvFreeDown} ${downLeft ? '' : styles.mvFreeEmpty}`}><IconArrowDown size={15} />{downFree ?? '∞'}</span>}
                            </span>
                        </div>
                        {poolItems.length === 0 && lockedCount === 0 ? (
                            <div className={styles.mvEmpty}>
                                <span className={styles.mvEmptyIcon}><IconNote size={24} /></span>
                                <p className={styles.mvEmptyTitle}>Noch keine Songs in der Warteschlange</p>
                                <p className={styles.mvEmptyText}>Schlag unten den ersten vor.</p>
                            </div>
                        ) : (
                            <ol className={styles.mvPlaylist}>
                                {queueItems.map(item => (
                                    <li key={item.id} className={styles.mvTrack}>
                                        {songCover(item.imageUrl, item.spotifyId || item.id)}
                                        <span className={`${styles.mvRowText} ${styles.mvTrackText}`}>
                                            <Marquee className={styles.mvRowName}>{item.title}</Marquee>
                                            <Marquee className={styles.mvRowMeta}>{item.artist}</Marquee>
                                            <span className={styles.mvByLine}>{byName(item.addedBy)}</span>
                                        </span>
                                        <span className={styles.mvLocked} title="Steht fest – ist schon bei Spotify" aria-label="Steht fest"><IconLock size={18} /></span>
                                    </li>
                                ))}
                                {lockedCount > 0 && <li className={styles.mvCutLine}><span><IconArrowUp size={14} />Platz 1 läuft als Nächstes</span></li>}
                                {activeItems.length === 0 && (
                                    <li className={styles.mvPausedEmpty}>{pausedItems.length ? 'Noch kein passender Song in der Warteschlange – schlag unten einen vor.' : 'Noch kein weiterer Song in der Warteschlange – schlag unten einen vor.'}</li>
                                )}
                                {[...activeItems, ...pausedItems].map((item, idx) => {
                                    const paused = idx >= activeItems.length
                                    const myVote = pendingVotes[item.id] ?? (item.votes?.[myName] || 0)
                                    const own = item.addedBy === myName
                                    const canRemove = isHost || own
                                    const score = scoreOf(item)
                                    const { up, down } = voteCounts(item)
                                    const text = (
                                        <>
                                            <Marquee className={styles.mvRowName}>{item.title}</Marquee>
                                            <Marquee className={styles.mvRowMeta}>{wasPlayed(item) && playedChip}{item.artist}</Marquee>
                                            <span className={styles.mvByLine}>{byName(item.addedBy)}</span>
                                        </>
                                    )
                                    return (
                                        <Fragment key={item.id}>
                                            {idx === 1 && !paused && !lockedCount && <li className={styles.mvCutLine}><span><IconArrowUp size={14} />Platz 1 läuft als Nächstes</span></li>}
                                            {paused && idx === activeItems.length && rule && (
                                                <li className={styles.mvCutLine}><span>Pausiert – passt nicht zur {ruleLabel(rule)}</span></li>
                                            )}
                                            <li ref={setRowRef(item.id)} className={`${styles.mvTrack} ${paused ? styles.mvTrackPaused : ''} ${canRemove ? styles.mvTrackHold : ''}`}
                                                {...(canRemove ? longPressRemove(item) : {})}>
                                                {songCover(item.imageUrl, item.spotifyId || item.id)}
                                                <span className={`${styles.mvRowText} ${styles.mvTrackText}`}>{text}</span>
                                                {own ? (
                                                    // Eigener Song: statt Pfeilen die Punktzahl und ein Mülleimer (dort, wo sonst ↓ ist)
                                                    <span className={styles.mvPill}>
                                                        <span className={styles.mvPillGap} aria-hidden="true" />
                                                        <span className={styles.mvPillScore} title={`${up}× hoch · ${down}× runter`} aria-label={`${score} Punkte`}>{scoreNum(score)}</span>
                                                        <button type="button" className={`${styles.mvBtn} ${styles.mvPillBtn}`} onClick={() => setConfirm({ kind: 'remove', item })} aria-label={`${item.title} entfernen`}><IconTrash size={18} /></button>
                                                    </span>
                                                ) : paused ? (
                                                    <span className={styles.mvScoreOnly} title={`${up}× hoch · ${down}× runter`} aria-label={`${score} Punkte`}>{scoreNum(score)}</span>
                                                ) : (
                                                    <span className={styles.mvPill} role="group" aria-label={`Abstimmen für ${item.title}`}>
                                                        <button type="button" className={`${styles.mvBtn} ${styles.mvPillBtn} ${myVote === 1 ? styles.mvPillUpOn : ''} ${myVote !== 1 && !upLeft ? styles.mvPillOff : ''}`}
                                                            onClick={() => handleVote(item.id, 'up')} aria-pressed={myVote === 1} aria-label="Hochvoten"><IconArrowUp /></button>
                                                        <span className={styles.mvPillScore} title={`${up}× hoch · ${down}× runter`} aria-label={`${score} Punkte`}>{scoreNum(score)}</span>
                                                        {downAllowed && (
                                                            <button type="button" className={`${styles.mvBtn} ${styles.mvPillBtn} ${myVote === -1 ? styles.mvPillDownOn : ''} ${myVote !== -1 && !downLeft ? styles.mvPillOff : ''}`}
                                                                onClick={() => handleVote(item.id, 'down')} aria-pressed={myVote === -1} aria-label="Runtervoten"><IconArrowDown /></button>
                                                        )}
                                                    </span>
                                                )}
                                            </li>
                                        </Fragment>
                                    )
                                })}
                            </ol>
                        )}
                    </section>
                </div>

                <div className={styles.mvFooter}>
                    <div className={styles.mvFooterRow}>
                        <button type="button" className={`${styles.mvBtn} ${styles.mvSuggest}`} onClick={openAddModal} disabled={full} aria-disabled={full}
                            title={full ? 'Sobald einer deiner Songs läuft, ist wieder Platz' : undefined}>
                            <IconPlus size={20} />Song vorschlagen<span className={styles.mvSuggestCount}>{myUnqueuedCount}/{maxSongs}</span>
                        </button>
                        <ReactionPad db={db} roomId={roomId} myName={myName} inline />
                    </div>
                </div>
            </main>
        )
    }

    return null
}


export default Amplify2
