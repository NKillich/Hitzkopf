import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { getApp } from 'firebase/app'
import '../../firebase.js'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion, serverTimestamp, deleteDoc, deleteField, collection, query, where, getDocs } from 'firebase/firestore'
import { generateRandomName } from '../../shared/randomName'
import spotifyService from '../../services/spotifyService'
import { log } from '../../utils/logger.js'
import CoverArt from '../../shared/ui/CoverArt'
import { BottomSheet, ConfirmSheet } from '../../shared/ui/BottomSheet'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import {
    IconMoon, IconSun, IconBack, IconNext, IconCheck, IconX, IconLock, IconPlay, IconPause, IconNote, IconSearch,
    IconRetry, IconAlert, IconPlus, IconTrash, IconUsers, IconGear, IconThumbUp, IconThumbDown, IconQueue,
    IconBallot, IconWave, IconSpeaker, IconInfo
} from '../../shared/ui/icons'
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

const PHASE_INFO = {
    songwahl: { title: 'Songs sammeln', dot: 'mvDotCollect' },
    abstimmung: { title: 'Abstimmung läuft', dot: 'mvDotVote' },
    laeuft: { title: 'Playlist läuft', dot: 'mvDotLive' }
}

const MusicVoter = ({ onBack }) => {
    // Firebase
    const [db, setDb] = useState(null)

    // State
    const [currentScreen, setCurrentScreen] = useState('lobby')   // lobby | create | browse | room
    const [myName, setMyName] = useState(getOrCreateName)
    const [myEmoji, setMyEmoji] = useState(getOrCreateEmoji)
    const [roomId, setRoomId] = useState(sessionStorage.getItem('mv_roomId') || '')
    const [isHost, setIsHost] = useState(false)
    const [lobbyData, setLobbyData] = useState(null)
    const [availableLobbies, setAvailableLobbies] = useState([])
    const [isLoadingLobbies, setIsLoadingLobbies] = useState(false)
    const [lobbiesError, setLobbiesError] = useState(false)

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

    // Spotify Playback (nur Host)
    const [spotifyConnected, setSpotifyConnected] = useState(false)
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
    const [confirm, setConfirm] = useState(null)             // { kind: 'close' | 'leave' | 'remove' | 'deleteAll', item? }
    const [confirmBusy, setConfirmBusy] = useState(false)
    const [busyAction, setBusyAction] = useState(null)       // 'create' oder die ID der Playlist, der gerade beigetreten wird

    // Refs
    const unsubscribeRef = useRef(null)
    const lastPlayedTrackIdRef = useRef(null) // für automatisches Entfernen abgespielter Songs
    const lastSentQueueOrderRef = useRef(null) // letzte an Spotify gesendete Warteschlangen-Reihenfolge (Spotify-IDs)
    const closingRef = useRef(false)          // Host schließt selbst: kein "wurde geschlossen"-Hinweis
    const toastTimerRef = useRef(null)
    const searchInputRef = useRef(null)
    const myNameRef = useRef(myName)
    useEffect(() => { myNameRef.current = myName }, [myName])
    const [queueExpanded, setQueueExpanded] = useState(false)
    const [showWelcomePopup, setShowWelcomePopup] = useState(false)
    const [spotifyReadyForLobby, setSpotifyReadyForLobby] = useState(false)

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
                    if (!cancelled) spotifyService.isUserLoggedIn().then(setSpotifyReadyForLobby)
                }
            })()
            return () => { cancelled = true }
        } else {
            spotifyService.isUserLoggedIn().then(setSpotifyReadyForLobby)
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

    // Neuen Zufallsnamen würfeln (nur ohne aktive Playlist, sonst klappt das Wiedereinsteigen nicht)
    const rerollName = () => {
        const newName = generateRandomName()
        const newEmoji = getRandomEmoji()
        sessionStorage.setItem('mv_name', newName)
        sessionStorage.setItem('mv_emoji', newEmoji)
        setMyName(newName)
        setMyEmoji(newEmoji)
        myNameRef.current = newName
    }

    // Lobby erstellen
    const handleCreateLobby = async () => {
        if (!db || busyAction) return
        const name = myName
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
                status: 'active',
                // Phasen-Konfiguration
                batchSize: 10,
                maxSongsPerPerson: 5,
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
        const name = myName
        const emoji = myEmoji

        const lobbyRef = doc(db, 'musicVoterLobbies', joinRoomId)

        setBusyAction(joinRoomId)
        try {
            const lobbySnap = await getDoc(lobbyRef)

            if (!lobbySnap.exists()) {
                showToast('Diese Playlist gibt es nicht mehr.', 'bad')
                setAvailableLobbies(prev => prev.filter(l => l.id !== joinRoomId))
                return
            }

            const lobbyData = lobbySnap.data()

            if (lobbyData.players && lobbyData.players[name]) {
                showToast(`Der Name „${name}“ ist in dieser Playlist schon vergeben. Würfel dir oben einen neuen.`, 'bad')
                return
            }

            await updateDoc(lobbyRef, {
                [`players.${name}`]: { emoji, joinedAt: serverTimestamp() }
            })

            setRoomId(joinRoomId)
            setIsHost(false)
            sessionStorage.setItem('mv_roomId', joinRoomId)
            setStartNotice(null)
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
        setRoomView('main')
        setCurrentScreen('lobby')
    }

    // Zurück in den Room – Session wird wiederhergestellt
    const handleRejoinRoom = () => {
        if (roomId) {
            setStartNotice(null)
            setRoomView('main')
            setCurrentScreen('room')
            subscribeToLobby(roomId)
        }
    }

    // Session vollständig beenden (z. B. wenn Lobby gelöscht wurde)
    const handleSessionEnd = () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current()
            unsubscribeRef.current = null
        }
        rerollName()
        closeAddModal()
        setConfirm(null)
        setShowWelcomePopup(false)
        setRoomView('main')
        setCurrentScreen('lobby')
        setRoomId('')
        setIsHost(false)
        setLobbyData(null)
        setPlaylist([])
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

    // Song/Album zur Playlist hinzufügen – true, wenn der Song danach in der Playlist ist
    const addToPlaylist = async (item) => {
        if (!db || !roomId) {
            showToast('Keine Verbindung zur Playlist.', 'bad')
            return false
        }

        // Während Abstimmung nicht hinzufügen
        if (lobbyData?.lobbyPhase === 'abstimmung') {
            showToast('Während der Abstimmung können keine Songs hinzugefügt werden.', 'bad')
            return false
        }

        // Duplikat-Schutz: Song bereits in der Playlist?
        const isDuplicate = playlist.some(
            (p) => (p.spotifyId && p.spotifyId === item.spotifyId) || p.id === item.id
        )
        if (isDuplicate) return true

        // Song-Limit pro Person
        const maxSongs = lobbyData?.maxSongsPerPerson || 5
        const myCount = playlist.filter(p => p.addedBy === myName && p.queuedRound == null).length
        if (myCount >= maxSongs) {
            showToast(`Du hast schon ${maxSongs} Songs eingereicht. In der nächsten Runde geht’s weiter.`, 'bad')
            return false
        }

        // Bereinige das Item: Entferne alle undefined Werte
        const cleanItem = Object.keys(item).reduce((acc, key) => {
            if (item[key] !== undefined) acc[key] = item[key]
            return acc
        }, {})

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        try {
            // Lese aktuelle Playlist für serverseitigen Duplikat-Check
            const snap = await getDoc(lobbyRef)
            if (!snap.exists()) return false
            const currentPlaylist = snap.data().playlist || []
            const alreadyExists = currentPlaylist.some(
                (p) => (p.spotifyId && p.spotifyId === item.spotifyId) || p.id === item.id
            )
            if (alreadyExists) return true

            await updateDoc(lobbyRef, { playlist: arrayUnion(cleanItem) })
            return true
        } catch (error) {
            console.error('❌ Fehler beim Hinzufügen:', error)
            showToast('Hinzufügen hat nicht geklappt: ' + (error.message || 'Unbekannter Fehler'), 'bad')
            return false
        }
    }

    // Vote für Song/Album
    const handleVote = async (itemId, voteType) => {
        if (!db || !roomId || !myName) return

        // Voting nur während Abstimmungs-Phase
        if (lobbyData?.lobbyPhase !== 'abstimmung') return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)

        try {
            const currentLobby = await getDoc(lobbyRef)
            const currentPlaylist = currentLobby.data().playlist || []

            const updatedPlaylist = currentPlaylist.map(item => {
                if (item.id === itemId) {
                    const currentVote = item.votes?.[myName] || 0
                    const newVote = voteType === 'up' ? 1 : (voteType === 'down' ? -1 : 0)

                    return {
                        ...item,
                        votes: {
                            ...item.votes,
                            [myName]: currentVote === newVote ? 0 : newVote
                        }
                    }
                }
                return item
            })

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
        const ok = await addToPlaylist({ ...item, addedBy: myName, votes: {} })
        setAddingId(null)
        if (ok) setAddedInModalIds(prev => new Set(prev).add(item.id).add(item.spotifyId))
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
                const updatedPlaylist = currentPlaylist.map(i =>
                    selectedIds.includes(i.spotifyId) ? { ...i, queuedRound: currentRound } : i
                )
                await updateDoc(lobbyRef, {
                    playlist: updatedPlaylist,
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

    // Host: Playback-Status regelmäßig in Firestore schreiben + abgespielte Songs aus Playlist entfernen
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
                // Wenn der Track gewechselt hat: vorherigen Song aus der Playlist entfernen
                if (state?.trackId && lastPlayedTrackIdRef.current !== null && lastPlayedTrackIdRef.current !== state.trackId) {
                    try {
                        const snap = await getDoc(lobbyRef)
                        const currentPlaylist = snap.data()?.playlist || []
                        const stillHasTrack = currentPlaylist.some((i) => i.spotifyId === lastPlayedTrackIdRef.current)
                        if (stillHasTrack) {
                            const updatedPlaylist = currentPlaylist.filter((i) => i.spotifyId !== lastPlayedTrackIdRef.current)
                            await updateDoc(lobbyRef, { playlist: updatedPlaylist })
                            lastSentQueueOrderRef.current = null
                        }
                    } catch { /* nächster Durchlauf versucht es erneut */ }
                }
                if (state?.trackId) lastPlayedTrackIdRef.current = state.trackId
            } catch {
                // z.B. kein Token oder Player inaktiv – ignorieren
            }
        }, 2000)
        return () => clearInterval(interval)
    }, [isHost, spotifyConnected, db, roomId])

    // Spotify: Login-Status prüfen (Host), auch nach OAuth-Callback
    useEffect(() => {
        if (!isHost) return
        spotifyService.isUserLoggedIn().then(setSpotifyConnected)
    }, [isHost, spotifyReadyForLobby])

    // Spotify: Nach Verbindung den Spotify-Displaynamen als Spielernamen übernehmen
    useEffect(() => {
        if (!isHost || !spotifyConnected || !db || !roomId) return
        const applySpotifyName = async () => {
            try {
                const profile = await spotifyService.getUserProfile()
                if (!profile?.displayName) return
                const spotifyName = profile.displayName.trim()
                if (!spotifyName || spotifyName === myNameRef.current) return

                const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
                const snap = await getDoc(lobbyRef)
                if (!snap.exists()) return
                const data = snap.data()
                const oldName = myNameRef.current

                if (data.players?.[spotifyName]) return

                const playerData = data.players?.[oldName] || { joinedAt: serverTimestamp() }
                const updatedPlaylist = (data.playlist || []).map(item =>
                    item.addedBy === oldName ? { ...item, addedBy: spotifyName } : item
                )

                await updateDoc(lobbyRef, {
                    host: spotifyName,
                    [`players.${spotifyName}`]: playerData,
                    [`players.${oldName}`]: deleteField(),
                    playlist: updatedPlaylist
                })

                sessionStorage.setItem('mv_name', spotifyName)
                setMyName(spotifyName)
                myNameRef.current = spotifyName
            } catch { /* Name bleibt dann der Zufallsname */ }
        }
        applySpotifyName()
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
        setSpotifyReadyForLobby(false)
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

    // ─── Zurück-Taste des Browsers ───────────────────────────────────────────
    // Eine Ebene zurück; liefert true, wenn man danach noch in einer Unterseite ist.
    const goBackOneLevel = () => {
        if (confirm) { if (!confirmBusy) setConfirm(null); return true }
        if (showWelcomePopup) { setShowWelcomePopup(false); return true }
        if (showAddModal) {
            if (albumTracks) setAlbumTracks(null)
            else closeAddModal()
            return true
        }
        if (currentScreen === 'room' && roomView === 'settings') { setRoomView('main'); return true }
        if (currentScreen === 'room') { handleGoBack(); return false }
        if (currentScreen !== 'lobby') { setCurrentScreen('lobby'); return false }
        return false
    }
    const goBackRef = useRef(goBackOneLevel)
    useLayoutEffect(() => { goBackRef.current = goBackOneLevel })

    // Außerhalb der Startseite liegt ein Hilfseintrag im Verlauf: "Zurück" bleibt in Amplify
    const inSub = currentScreen !== 'lobby'
    useEffect(() => {
        if (!inSub) {
            if (window.history.state?.mvSub) window.history.back()
            return
        }
        // Hilfseintrag nur einmal anlegen (React führt Effekte im Dev-Modus doppelt aus)
        if (!window.history.state?.mvSub) window.history.pushState({ mvSub: true }, '')
        const onPop = () => {
            if (window.history.state?.mvSub) return
            if (goBackRef.current()) window.history.pushState({ mvSub: true }, '')
        }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [inSub])

    // ─── Sicherheitsabfragen ─────────────────────────────────────────────────
    const confirmConfig = (() => {
        if (!confirm) return null
        if (confirm.kind === 'close') return {
            title: 'Playlist schließen?', text: 'Die Playlist wird für alle beendet und alle Zuhörer werden entfernt.',
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
            title: 'Alle Playlists löschen?', text: `Alle ${availableLobbies.length} offenen Playlists werden gelöscht und alle Zuhörer entfernt. Das kann nicht rückgängig gemacht werden.`,
            cancelLabel: 'Abbrechen', confirmLabel: 'Alle löschen', run: handleDeleteAllLobbies
        }
        return null
    })()

    const closeConfirm = useCallback(() => setConfirm(null), [])
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
    const maxSongs = lobbyData?.maxSongsPerPerson || 5
    const myUnqueuedCount = playlist.filter(p => p.addedBy === myName && p.queuedRound == null).length

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
                            <span><strong>Abstimmen</strong>Daumen hoch oder runter – die besten Songs kommen in die Warteschlange.</span>
                        </li>
                        <li className={styles.mvStep}>
                            <span className={styles.mvStepIcon}><IconPlay size={16} /></span>
                            <span><strong>Abspielen</strong>Die Playlist läuft. Währenddessen schlägst du Songs für die nächste Runde vor.</span>
                        </li>
                    </ol>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => setShowWelcomePopup(false)}>Los geht’s</button>
                </BottomSheet>
            </div>
        </div>
    )

    const nameCard = (
        <section className={styles.mvNameCard}>
            <span className={styles.mvAvatar} aria-hidden="true">{myEmoji}</span>
            <span className={styles.mvRowText}>
                <span className={styles.mvLabelSm}>Dein Name</span>
                <span className={styles.mvRowName}>{myName}</span>
            </span>
            {!roomId && (
                <button type="button" className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvOutlineSm}`} onClick={rerollName} aria-label="Neuen Namen würfeln">
                    <IconRetry size={16} />Neu
                </button>
            )}
        </section>
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
                                <span className={styles.mvRowMeta}>{isHost ? 'Du bist Host' : 'Du hörst zu'} · Code {roomId}</span>
                            </span>
                            <IconNext />
                        </button>
                    )}

                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={() => setCurrentScreen('create')}>
                        <IconPlus />Playlist erstellen
                    </button>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={() => setCurrentScreen('browse')}>
                        Playlist beitreten
                    </button>
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
                    <p className={styles.mvInfo}>Du wirst Host: Du startest die Abstimmung und spielst die Gewinner-Songs über Spotify ab.</p>
                    {nameCard}
                    <section className={styles.mvCard}>
                        <div className={styles.mvCardHead}>
                            <h2 className={styles.mvCardTitle}>Spotify</h2>
                            <span className={`${styles.mvChip} ${spotifyReadyForLobby ? styles.mvChipOk : ''}`}>
                                <span className={styles.mvChipDot} aria-hidden="true" />{spotifyReadyForLobby ? 'Verbunden' : 'Nicht verbunden'}
                            </span>
                        </div>
                        {spotifyReadyForLobby ? (
                            <p className={styles.mvFine}>Die Songs laufen über dein Spotify-Konto. Das Gerät wählst du später in den Einstellungen.</p>
                        ) : (
                            <>
                                <p className={styles.mvFine}>Zum Abspielen brauchst du Spotify Premium. Du kannst Spotify auch später in den Einstellungen verbinden.</p>
                                <button type="button" className={`${styles.mvBtn} ${styles.mvSecondary}`} onClick={handleSpotifyConnect}>
                                    <IconNote size={20} />Spotify verbinden
                                </button>
                            </>
                        )}
                    </section>
                </div>
                <div className={styles.mvFooter}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvPrimary}`} onClick={handleCreateLobby} disabled={creating || !db}>
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
        return shell(
            <main className={styles.mvMain}>
                {subHeader('Beitreten', () => setCurrentScreen('lobby'))}
                <div className={`${styles.mvScroll} ${styles.mvScrollFix}`}>
                    {nameCard}
                    <div className={styles.mvListHead}>
                        <h2 className={styles.mvListTitle}>Offene Playlists</h2>
                        {view === 'ok' && <span className={styles.mvListCount}>{availableLobbies.length}</span>}
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
                        {view === 'ok' && (
                            <ul className={styles.mvList}>
                                {availableLobbies.map((lobby) => {
                                    const mine = lobby.id === roomId
                                    const joining = busyAction === lobby.id
                                    return (
                                        <li key={lobby.id}>
                                            <button type="button" className={`${styles.mvBtn} ${styles.mvRow} ${mine ? styles.mvRowOn : ''}`}
                                                onClick={() => (mine ? handleRejoinRoom() : handleJoinLobby(lobby.id))}
                                                disabled={!!busyAction}>
                                                <CoverArt seed={lobby.id} size={46} radius={11} />
                                                <span className={styles.mvRowText}>
                                                    <span className={styles.mvRowName}>Playlist von {lobby.host}</span>
                                                    <span className={styles.mvRowMeta}>
                                                        {mine ? 'Deine aktive Playlist' : `${lobby.playerCount} Zuhörer · ${lobby.playlist.length} Songs`}
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
                return (
                    <li key={item.id}>
                        <button type="button"
                            className={`${styles.mvBtn} ${styles.mvRow} ${added ? styles.mvRowAdded : ''}`}
                            onClick={() => (isAlbum ? handleOpenAlbum(item) : (!added && handleAddItem(item)))}
                            disabled={(!isAlbum && (added || blocked)) || !!addingId}
                            aria-label={isAlbum ? `Album ${item.title} von ${item.artist} öffnen` : (added ? `${item.title} ist in der Playlist` : `${item.title} von ${item.artist} hinzufügen`)}>
                            {view !== 'album' && <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={46} radius={isAlbum ? 11 : 8} />}
                            <span className={styles.mvRowText}>
                                <span className={styles.mvRowName}>{item.title}</span>
                                <span className={styles.mvRowMeta}>{isAlbum ? `Album · ${item.artist}` : item.artist}</span>
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
            const selects = [
                { id: 'batchSize', label: 'Songs pro Runde', value: lobbyData.batchSize || 10, fallback: 10, options: [[5, '5'], [10, '10'], [15, '15'], [20, '20']] },
                { id: 'maxSongsPerPerson', label: 'Max. Songs pro Person', value: lobbyData.maxSongsPerPerson || 5, fallback: 5, options: [[2, '2'], [3, '3'], [5, '5'], [10, '10']] },
                { id: 'votingDurationSec', label: 'Dauer der Abstimmung', value: lobbyData.votingDurationSec || 120, fallback: 120, options: [[60, '1 Minute'], [120, '2 Minuten'], [180, '3 Minuten'], [300, '5 Minuten']] },
                { id: 'preQueueVotingMinutes', label: 'Nächste Abstimmung startet', value: lobbyData.preQueueVotingMinutes || 1, fallback: 1, options: [[1, '1 Minute vor Ende'], [2, '2 Minuten vor Ende'], [3, '3 Minuten vor Ende'], [5, '5 Minuten vor Ende']] }
            ]
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
                            {selects.map(s => (
                                <div key={s.id} className={styles.mvField}>
                                    <label htmlFor={`mv-${s.id}`} className={styles.mvLabel}>{s.label}</label>
                                    <select id={`mv-${s.id}`} className={`${styles.mvInput} ${styles.mvSelect} ${styles.mvSelectPlain}`} value={s.value}
                                        onChange={(e) => updateLobbyConfig({ [s.id]: Number(e.target.value) || s.fallback })}>
                                        {s.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                </div>
                            ))}
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
        const voteItems = sortedPlaylist.filter(i => i.queuedRound == null)
        const showVoting = phase === 'abstimmung'
        const canStartVoting = isHost && phase !== 'abstimmung'
        const progressPct = nowPlaying?.durationMs ? Math.min(100, (nowPlayingPositionMs / nowPlaying.durationMs) * 100) : 0
        const exitLabel = isHost ? 'Playlist schließen' : 'Playlist verlassen'

        return shell(
            <main className={styles.mvMain}>
                <header className={`${styles.mvSubHeader} ${styles.mvRoomHeader} ${styles.mvPad}`}>
                    <button type="button" className={`${styles.mvBtn} ${styles.mvIconBtn}`} onClick={handleGoBack} aria-label="Zur Startseite (du bleibst in der Playlist)" title="Zur Startseite"><IconBack /></button>
                    <div className={styles.mvRoomTitle}>
                        <h1 className={styles.mvSubTitle}>Amplify</h1>
                        <span className={styles.mvRoomCode}>{isHost ? 'Host' : 'Zuhörer'} · {roomId}</span>
                    </div>
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
                        {canStartVoting && (
                            <button type="button" className={`${styles.mvBtn} ${styles.mvOutline} ${styles.mvPhaseBtn}`} onClick={handleStartAbstimmung} disabled={voteItems.length === 0}>
                                <IconBallot size={20} />Abstimmung starten
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
                                return (
                                    <li key={item.id} className={`${styles.mvSong} ${showVoting && myVote === 1 ? styles.mvSongUp : ''} ${showVoting && myVote === -1 ? styles.mvSongDown : ''}`}>
                                        <span className={styles.mvCoverBox}>
                                            <CoverArt src={item.source === 'spotify' ? item.imageUrl : null} seed={item.spotifyId || item.id} size={46} radius={11} />
                                            <span className={styles.mvRank}>{index + 1}</span>
                                        </span>
                                        <span className={styles.mvRowText}>
                                            <span className={styles.mvRowName}>{item.title}</span>
                                            <span className={styles.mvRowMeta}>{item.artist} · von {item.addedBy === myName ? 'dir' : item.addedBy}</span>
                                        </span>
                                        {showVoting ? (
                                            <span className={styles.mvVote} role="group" aria-label={`Abstimmen für ${item.title}`}>
                                                <button type="button" className={`${styles.mvBtn} ${styles.mvVoteBtn} ${myVote === 1 ? styles.mvVoteUpOn : ''}`}
                                                    onClick={() => handleVote(item.id, 'up')} aria-pressed={myVote === 1} aria-label="Gefällt mir"><IconThumbUp /></button>
                                                <span className={styles.mvScore}>{score > 0 ? '+' : ''}{score}</span>
                                                <button type="button" className={`${styles.mvBtn} ${styles.mvVoteBtn} ${myVote === -1 ? styles.mvVoteDownOn : ''}`}
                                                    onClick={() => handleVote(item.id, 'down')} aria-pressed={myVote === -1} aria-label="Gefällt mir nicht"><IconThumbDown /></button>
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
