import { useState, useEffect, useRef } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, serverTimestamp, deleteDoc, deleteField, collection, query, where, getDocs } from 'firebase/firestore'
import LobbySystem from '../../shared/LobbySystem'
import spotifyService from '../../services/spotifyService'
import styles from './MusicVoter.module.css'

// Emojis für Charakter-Auswahl
const baseEmojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']
const availableEmojis = (() => {
    const shuffled = [...baseEmojis]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
})()

// Firebase Config (gleiche wie Hitzkopf)
const firebaseConfig = {
    apiKey: "AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA",
    authDomain: "hitzkopf-f0ea6.firebaseapp.com",
    projectId: "hitzkopf-f0ea6",
    storageBucket: "hitzkopf-f0ea6.firebasestorage.app",
    messagingSenderId: "828164655874",
    appId: "1:828164655874:web:1cab759bdb03bfb736101b"
}

const MusicVoter = ({ onBack, spotifyCallbackDone }) => {
    // Firebase
    const [app, setApp] = useState(null)
    const [db, setDb] = useState(null)
    const [auth, setAuth] = useState(null)

    // State
    const [currentScreen, setCurrentScreen] = useState('lobby')
    const [myName, setMyName] = useState(sessionStorage.getItem('mv_name') || '')
    const [myEmoji, setMyEmoji] = useState(() => {
        const saved = sessionStorage.getItem('mv_emoji')
        if (saved) return saved
        const middleIndex = Math.floor(availableEmojis.length / 2)
        return availableEmojis[middleIndex]
    })
    const [emojiScrollIndex, setEmojiScrollIndex] = useState(() => {
        const saved = sessionStorage.getItem('mv_emoji')
        if (saved) {
            const index = availableEmojis.indexOf(saved)
            return index !== -1 ? index : Math.floor(availableEmojis.length / 2)
        }
        return Math.floor(availableEmojis.length / 2)
    })
    const [roomId, setRoomId] = useState(sessionStorage.getItem('mv_roomId') || '')
    const [isHost, setIsHost] = useState(false)
    const [lobbyData, setLobbyData] = useState(null)
    const [availableLobbies, setAvailableLobbies] = useState([])
    const [isLoadingLobbies, setIsLoadingLobbies] = useState(false)
    
    // Music State
    const [playlist, setPlaylist] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)

    // Im Hinzufügen-Modal bereits hinzugefügte IDs (für grünen Haken)
    const [addedInModalIds, setAddedInModalIds] = useState(() => new Set())

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

    // Refs
    const unsubscribeRef = useRef(null)
    const lobbiesUnsubscribeRef = useRef(null)
    const emojiGalleryRef = useRef(null)
    const isScrollingRef = useRef(false)
    const touchStartRef = useRef({ x: 0, y: 0, time: 0 })
    const lastPlayedTrackIdRef = useRef(null) // für automatisches Entfernen abgespielter Songs
    const lastSentQueueOrderRef = useRef(null) // letzte an Spotify gesendete Warteschlangen-Reihenfolge (Spotify-IDs)
    const queueSyncTimeoutRef = useRef(null)
    const pendingQueueSyncRef = useRef(null) // Daten für debounced Queue-Sync
    const myNameRef = useRef(myName)
    useEffect(() => { myNameRef.current = myName }, [myName])
    const [showHostSettings, setShowHostSettings] = useState(false)

    // Firebase Initialisierung
    useEffect(() => {
        const firebaseApp = initializeApp(firebaseConfig)
        const firebaseAuth = getAuth(firebaseApp)
        const firebaseDb = getFirestore(firebaseApp)
        
        setApp(firebaseApp)
        setAuth(firebaseAuth)
        setDb(firebaseDb)

        signInAnonymously(firebaseAuth).catch(console.error)

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current()
            }
        }
    }, [])

    // Emoji-Galerie: Scroll-Listener + Zentrierung wie bei Hitzkopf (ausgewählter Charakter in der Mitte, optisch hervorgehoben)
    useEffect(() => {
        const gallery = emojiGalleryRef.current
        if (!gallery || currentScreen !== 'browse') return

        const handleScroll = () => {
            isScrollingRef.current = true
            const viewportCenter = gallery.scrollLeft + gallery.clientWidth / 2
            const cards = gallery.querySelectorAll('[data-emoji-index]')
            let closestIndex = 0
            let closestDist = Infinity
            cards.forEach((card) => {
                const idx = parseInt(card.getAttribute('data-emoji-index'), 10)
                const cardCenter = card.offsetLeft + card.offsetWidth / 2
                const dist = Math.abs(cardCenter - viewportCenter)
                if (dist < closestDist) {
                    closestDist = dist
                    closestIndex = idx
                }
            })
            const clampedIndex = Math.max(0, Math.min(closestIndex, availableEmojis.length - 1))
            setEmojiScrollIndex(clampedIndex)
            setMyEmoji(availableEmojis[clampedIndex])
            setTimeout(() => {
                isScrollingRef.current = false
            }, 100)
        }

        gallery.addEventListener('scroll', handleScroll)

        const centerEmoji = () => {
            const card = gallery.querySelector(`[data-emoji-index="${emojiScrollIndex}"]`)
            if (!card) return
            isScrollingRef.current = true
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const galleryWidth = gallery.clientWidth
                    const cardWidth = card.offsetWidth || 80
                    const cardLeft = card.offsetLeft
                    const scrollPosition = cardLeft - galleryWidth / 2 + cardWidth / 2
                    const finalScrollPosition = Math.max(0, Math.min(scrollPosition, gallery.scrollWidth - gallery.clientWidth))
                    gallery.scrollLeft = finalScrollPosition
                    setTimeout(() => {
                        if (Math.abs(gallery.scrollLeft - finalScrollPosition) > 10) {
                            gallery.scrollLeft = finalScrollPosition
                        }
                        setTimeout(() => {
                            isScrollingRef.current = false
                        }, 100)
                    }, 50)
                })
            })
        }
        const t = setTimeout(centerEmoji, 150)

        return () => {
            gallery.removeEventListener('scroll', handleScroll)
            clearTimeout(t)
        }
    }, [currentScreen, emojiScrollIndex])

    // Handler-Funktionen für Browse-Screen
    const handleNameChange = (e) => {
        const name = e.target.value.slice(0, 20)
        setMyName(name)
        sessionStorage.setItem('mv_name', name)
    }

    const selectEmoji = (emoji) => {
        const index = availableEmojis.indexOf(emoji)
        setEmojiScrollIndex(index)
        setMyEmoji(emoji)
        sessionStorage.setItem('mv_emoji', emoji)
        // Im Browse-Screen übernimmt der useEffect die Zentrierung (wie bei Hitzkopf)
        if (currentScreen === 'browse') return
        const gallery = emojiGalleryRef.current
        if (gallery) {
            const itemWidth = gallery.scrollWidth / (availableEmojis.length + 2)
            gallery.scrollTo({
                left: index * itemWidth,
                behavior: 'smooth'
            })
        }
    }

    const handleJoinLobbyFromBrowser = (lobbyId) => {
        if (!myName.trim()) {
            alert('Bitte gib einen Namen ein!')
            return
        }
        sessionStorage.setItem('mv_name', myName)
        sessionStorage.setItem('mv_emoji', myEmoji)
        handleJoinLobby({ name: myName, emoji: myEmoji, roomId: lobbyId })
    }

    // Lobby erstellen
    const handleCreateLobby = async ({ name, emoji }) => {
        if (!db) return

        const newRoomId = generateRoomCode()
        const lobbyRef = doc(db, 'musicVoterLobbies', newRoomId)

        try {
            await setDoc(lobbyRef, {
                host: name,
                createdAt: serverTimestamp(),
                players: {
                    [name]: { emoji, joinedAt: serverTimestamp() }
                },
                playlist: [],
                status: 'active',
                // Batch-Voting-Konfiguration (Standardwerte, vom Host änderbar)
                batchSize: 10,
                votingDurationSec: 120,
                votingActive: false,
                votingEndsAt: null,
                votingRound: 0,
                pendingBatch: null
            })

            setMyName(name)
            setMyEmoji(emoji)
            setRoomId(newRoomId)
            setIsHost(true)
            sessionStorage.setItem('mv_roomId', newRoomId)
            setCurrentScreen('room')
            
            subscribeToLobby(newRoomId)
        } catch (error) {
            console.error('Fehler beim Erstellen der Playlist:', error)
            alert('Fehler beim Erstellen der Playlist')
        }
    }

    // Lobby beitreten
    const handleJoinLobby = async ({ name, emoji, roomId: joinRoomId }) => {
        if (!db) return

        const lobbyRef = doc(db, 'musicVoterLobbies', joinRoomId)

        try {
            const lobbySnap = await getDoc(lobbyRef)
            
            if (!lobbySnap.exists()) {
                alert('Playlist nicht gefunden!')
                return
            }

            const lobbyData = lobbySnap.data()
            
            if (lobbyData.players && lobbyData.players[name]) {
                alert('Dieser Name ist bereits vergeben!')
                return
            }

            await updateDoc(lobbyRef, {
                [`players.${name}`]: { emoji, joinedAt: serverTimestamp() }
            })

            setMyName(name)
            setMyEmoji(emoji)
            setRoomId(joinRoomId)
            setIsHost(false)
            sessionStorage.setItem('mv_roomId', joinRoomId)
            setCurrentScreen('room')
            
            subscribeToLobby(joinRoomId)
        } catch (error) {
            console.error('Fehler beim Beitreten:', error)
            alert('Fehler beim Beitreten der Playlist')
        }
    }

    // Alle offenen Lobbies laden
    const loadAvailableLobbies = async () => {
        if (!db) return

        setIsLoadingLobbies(true)
        
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
            console.log(`✅ ${lobbies.length} offene Lobbies geladen`)
        } catch (error) {
            console.error('Fehler beim Laden der Lobbies:', error)
            setAvailableLobbies([])
        } finally {
            setIsLoadingLobbies(false)
        }
    }

    // Lobby aus Browser löschen
    const handleDeleteLobbyFromBrowser = async (lobbyId, lobbyHost, e) => {
        // Verhindere dass onClick der Card gefeuert wird
        e.stopPropagation()

        const confirmDelete = window.confirm(
            `Playlist von ${lobbyHost} (${lobbyId}) wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!`
        )
        
        if (!confirmDelete) return

        if (!db) return

        const lobbyRef = doc(db, 'musicVoterLobbies', lobbyId)
        
        try {
            await deleteDoc(lobbyRef)
            console.log(`✅ Playlist ${lobbyId} gelöscht`)
            
            // Aktualisiere die Lobby-Liste
            setAvailableLobbies(prev => prev.filter(l => l.id !== lobbyId))
        } catch (error) {
            console.error('Fehler beim Löschen:', error)
            alert('Fehler beim Löschen der Playlist: ' + (error.message || 'Unbekannter Fehler'))
        }
    }

    // ALLE Lobbies löschen
    const handleDeleteAllLobbies = async () => {
        const confirmDelete = window.confirm(
            `ALLE ${availableLobbies.length} Playlists wirklich löschen?\n\n⚠️ WARNUNG: Diese Aktion kann NICHT rückgängig gemacht werden!\nAlle Zuhörer werden entfernt!`
        )
        
        if (!confirmDelete) return

        // Zweite Bestätigung
        const reallyConfirm = window.confirm(
            'Bist du dir WIRKLICH sicher?\n\nDies wird alle Playlists unwiderruflich löschen!'
        )
        
        if (!reallyConfirm) return

        if (!db) return

        try {
            // Lösche alle Lobbies parallel
            const deletePromises = availableLobbies.map(lobby => 
                deleteDoc(doc(db, 'musicVoterLobbies', lobby.id))
            )
            
            await Promise.all(deletePromises)
            
            console.log(`✅ Alle ${availableLobbies.length} Playlists gelöscht`)
            setAvailableLobbies([])
            alert('Alle Playlists wurden gelöscht!')
        } catch (error) {
            console.error('Fehler beim Löschen aller Playlists:', error)
            alert('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'))
            // Aktualisiere die Liste
            loadAvailableLobbies()
        }
    }

    // Lobby schließen (nur Host)
    const handleCloseLobby = async () => {
        if (!isHost || !db || !roomId) {
            alert('Nur der Host kann die Playlist schließen!')
            return
        }

        const confirmClose = window.confirm(
            'Playlist wirklich schließen? Alle Zuhörer werden entfernt!'
        )
        
        if (!confirmClose) return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        
        try {
            await deleteDoc(lobbyRef)
            console.log('✅ Playlist geschlossen')
            
            // Cleanup
            if (unsubscribeRef.current) {
                unsubscribeRef.current()
            }
            
            setCurrentScreen('lobby')
            setRoomId('')
            setMyName('')
            setMyEmoji('')
            setIsHost(false)
            setLobbyData(null)
            setPlaylist([])
            sessionStorage.removeItem('mv_roomId')
        } catch (error) {
            console.error('Fehler beim Schließen:', error)
            alert('Fehler beim Schließen der Playlist')
        }
    }

    // Lobby-Updates abonnieren
    const subscribeToLobby = (roomId) => {
        if (!db) return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        
        const unsubscribe = onSnapshot(lobbyRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data()
                setLobbyData(data)
                setPlaylist(data.playlist || [])
                setIsHost(data.host === myNameRef.current)
            } else {
                // Lobby wurde vom Host gelöscht – Session vollständig beenden
                alert('Playlist wurde geschlossen')
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
        setCurrentScreen('lobby')
    }

    // Zurück in den Room – Session wird wiederhergestellt
    const handleRejoinRoom = () => {
        if (roomId) {
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
        setCurrentScreen('lobby')
        setRoomId('')
        setMyName('')
        setMyEmoji('')
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
                return
            }
            const data = snap.data()
            if (!data.players?.[storedName]) {
                sessionStorage.removeItem('mv_roomId')
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
    }, [db])

    // Song/Album zur Playlist hinzufügen
    const addToPlaylist = async (item) => {
        if (!db || !roomId) {
            console.error('❌ Hinzufügen fehlgeschlagen: DB oder RoomID fehlt', { db: !!db, roomId })
            alert('Fehler: Nicht mit Lobby verbunden')
            return
        }

        console.log('➕ Versuche Song hinzuzufügen:', item.title)

        // Bereinige das Item: Entferne alle undefined Werte
        const cleanItem = Object.keys(item).reduce((acc, key) => {
            if (item[key] !== undefined) {
                acc[key] = item[key]
            }
            return acc
        }, {})

        console.log('🧹 Bereinigtes Item:', cleanItem)

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        
        try {
            await updateDoc(lobbyRef, {
                playlist: arrayUnion(cleanItem)
            })
            console.log('✅ Song erfolgreich hinzugefügt:', item.title)
        } catch (error) {
            console.error('❌ Fehler beim Hinzufügen:', error)
            console.error('Fehler Details:', {
                code: error.code,
                message: error.message,
                roomId,
                item: item.title
            })
            alert('Fehler beim Hinzufügen: ' + (error.message || 'Unbekannter Fehler'))
        }
    }

    // Vote für Song/Album
    const handleVote = async (itemId, voteType) => {
        if (!db || !roomId || !myName) return

        // Voting nur während aktiver Voting-Phase
        if (!lobbyData?.votingActive || !lobbyData?.votingEndsAt || lobbyData.votingEndsAt <= Date.now()) {
            alert('Voting ist aktuell nicht aktiv. Warte bis der nächste Voting-Timer startet.')
            return
        }

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

    // Song/Album entfernen (nur Host oder Ersteller)
    const handleRemoveItem = async (itemId) => {
        if (!db || !roomId) return

        const item = playlist.find(i => i.id === itemId)
        if (!item) return

        if (!isHost && item.addedBy !== myName) {
            alert('Nur der Host oder der Ersteller kann diesen Eintrag löschen!')
            return
        }

        // Sicherheitsabfrage
        const confirmDelete = window.confirm(
            `"${item.title}" wirklich aus der Playlist entfernen?`
        )
        
        if (!confirmDelete) return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        
        try {
            const updatedPlaylist = playlist.filter(i => i.id !== itemId)
            await updateDoc(lobbyRef, {
                playlist: updatedPlaylist
            })
        } catch (error) {
            console.error('Fehler beim Entfernen:', error)
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
        } finally {
            setIsLoadingAlbum(false)
        }
    }

    // Spotify-Suche
    const handleSpotifySearch = async () => {
        if (!searchQuery.trim()) return

        setIsSearching(true)
        
        try {
            const results = await spotifyService.search(searchQuery, 10)
            setSearchResults(results)
            
            if (results.length === 0) {
                console.log('Keine Ergebnisse für:', searchQuery)
            }
        } catch (error) {
            console.error('Spotify Suche fehlgeschlagen:', error)
            
            // Detaillierte Fehlermeldung
            let errorMessage = 'Spotify Suche fehlgeschlagen.\n\n'
            
            if (error.message?.includes('Failed to get')) {
                errorMessage += 'Credentials Problem:\n'
                errorMessage += '1. Überprüfe .env.local Datei\n'
                errorMessage += '2. Dev-Server neu starten (wichtig!)\n'
                errorMessage += '3. Spotify Developer Dashboard prüfen'
            } else if (error.message?.includes('network')) {
                errorMessage += 'Netzwerkproblem - Internetverbindung prüfen'
            } else {
                errorMessage += 'Fehler: ' + error.message
            }
            
            alert(errorMessage)
            setSearchResults([])
        } finally {
            setIsSearching(false)
        }
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

    const getVoteColor = (vote) => {
        if (vote === 1) return '#51cf66'
        if (vote === -1) return '#ff6b6b'
        return 'transparent'
    }

    // Host: Voting-Einstellungen aktualisieren
    const updateLobbyConfig = async (changes) => {
        if (!db || !roomId) return
        try {
            await updateDoc(doc(db, 'musicVoterLobbies', roomId), changes)
        } catch (e) {
            console.error('Fehler beim Aktualisieren der Lobby-Konfiguration:', e)
        }
    }

    const handleStartVotingRound = async () => {
        if (!isHost || !db || !roomId) {
            alert('Nur der Host kann die Voting-Runde starten!')
            return
        }
        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
        const durationSec = lobbyData?.votingDurationSec || 120
        const newRound = (lobbyData?.votingRound || 0) + 1
        const endsAt = Date.now() + durationSec * 1000
        try {
            await updateDoc(lobbyRef, {
                votingActive: true,
                votingEndsAt: endsAt,
                votingRound: newRound
            })
        } catch (e) {
            console.error('Fehler beim Starten der Voting-Runde:', e)
        }
    }

    // Host: Wenn Voting abgelaufen ist, Top-N-Songs für nächste Batch bestimmen
    useEffect(() => {
        if (!isHost || !db || !roomId || !lobbyData) return
        if (!lobbyData.votingActive || !lobbyData.votingEndsAt) return

        const lobbyRef = doc(db, 'musicVoterLobbies', roomId)

        const finalizeRound = async () => {
            try {
                // Verhindern, dass mehrfach ausgeführt wird
                const snap = await getDoc(lobbyRef)
                if (!snap.exists()) return
                const data = snap.data()
                if (!data.votingActive) return

                const batchSize = data.batchSize || 10
                const currentRound = data.votingRound || 0
                const currentPlaylist = data.playlist || []

                // Nur Spotify-Songs, die noch keiner Runde zugeordnet wurden
                const candidates = currentPlaylist
                    .filter(
                        (item) =>
                            item.source === 'spotify' &&
                            item.spotifyId &&
                            item.type === 'song' &&
                            (item.queuedRound === undefined || item.queuedRound === null)
                    )
                    .sort((a, b) => {
                        const scoreA = calculateScore(a)
                        const scoreB = calculateScore(b)
                        if (scoreB !== scoreA) return scoreB - scoreA
                        return (a.addedAt || 0) - (b.addedAt || 0)
                    })

                const selected = candidates.slice(0, batchSize)
                const selectedIds = selected.map((i) => i.spotifyId)

                // Markiere ausgewählte Songs mit queuedRound
                const updatedPlaylist = currentPlaylist.map((item) =>
                    selectedIds.includes(item.spotifyId)
                        ? { ...item, queuedRound: currentRound }
                        : item
                )

                await updateDoc(lobbyRef, {
                    playlist: updatedPlaylist,
                    votingActive: false,
                    pendingBatch: selectedIds.length
                        ? { round: currentRound, spotifyIds: selectedIds }
                        : null
                })
            } catch (e) {
                console.error('Fehler beim Finalisieren der Voting-Runde:', e)
            }
        }

        const remaining = lobbyData.votingEndsAt - Date.now()
        if (remaining <= 0) {
            finalizeRound()
            return
        }
        const id = setTimeout(finalizeRound, remaining + 100)
        return () => clearTimeout(id)
    }, [isHost, db, roomId, lobbyData?.votingActive, lobbyData?.votingEndsAt])

    /** Millisekunden als "m:ss" formatieren */
    const formatPlaybackTime = (ms) => {
        if (ms == null || Number.isNaN(ms)) return '0:00'
        const total = Math.floor(Number(ms) / 1000)
        const m = Math.floor(total / 60)
        const s = total % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    // Now Playing: Aktuelle Position (läuft jede Sekunde wenn etwas spielt, für Anzeige)
    const [nowPlayingTick, setNowPlayingTick] = useState(0)
    const [votingRemainingMs, setVotingRemainingMs] = useState(0)
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

    // Voting-Countdown für alle Clients (nur Anzeige, Host steuert Logik)
    useEffect(() => {
        if (!lobbyData?.votingActive || !lobbyData?.votingEndsAt) {
            setVotingRemainingMs(0)
            return
        }
        const update = () => {
            const remaining = lobbyData.votingEndsAt - Date.now()
            setVotingRemainingMs(remaining > 0 ? remaining : 0)
        }
        update()
        const id = setInterval(update, 500)
        return () => clearInterval(id)
    }, [lobbyData?.votingActive, lobbyData?.votingEndsAt])

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
                    } catch (_) {}
                }
                if (state?.trackId) lastPlayedTrackIdRef.current = state.trackId
            } catch (_) {
                // z.B. kein Token oder Player inaktiv – ignorieren
            }
        }, 2000)
        return () => clearInterval(interval)
    }, [isHost, spotifyConnected, db, roomId])

    // Spotify: Login-Status prüfen (Host), auch nach OAuth-Callback
    useEffect(() => {
        if (!isHost) return
        spotifyService.isUserLoggedIn().then(setSpotifyConnected)
    }, [isHost, spotifyCallbackDone])

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
    }, [isHost, spotifyConnected])

    // Spotify: Geräteliste laden (Browser, Alexa, …), wenn verbunden
    useEffect(() => {
        if (!isHost || !spotifyConnected) return
        const load = async () => {
            try {
                const list = await spotifyService.getDevices()
                setSpotifyDevices(list)
            } catch (_) {}
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
            alert('Spotify-Verbindung starten fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler'))
        }
    }

    const handleSpotifyDisconnect = async () => {
        if (db && roomId && isHost) {
            try {
                await updateDoc(doc(db, 'musicVoterLobbies', roomId), { nowPlaying: null })
            } catch (_) {}
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
            alert('In der Playlist sind keine Spotify-Songs. Füge zuerst Songs über die Spotify-Suche hinzu.')
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
            alert('Spotify abspielen: ' + (e.message || 'Fehler'))
        }
    }

    /** Warteschlange bei Spotify an neue Vote-Reihenfolge anpassen (aktueller Song läuft weiter). Nutzt Ref-Daten. */
    const syncQueueToSpotifyFromRefs = async () => {
        const pending = pendingQueueSyncRef.current
        if (!pending) return
        try {
            const state = await spotifyService.getPlaybackState()
            if (!state || state.trackId !== pending.currentTrackId) return
            const uris = [`spotify:track:${state.trackId}`, ...pending.queueOrder.map((id) => `spotify:track:${id}`)]
            await spotifyService.playOnDevice(uris, pending.deviceId, state.positionMs)
            lastSentQueueOrderRef.current = pending.queueOrder
        } catch (_) {}
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
            await spotifyService.pausePlayback()
            setSpotifyPlaying(false)
        } catch (e) {
            console.error('Pause fehlgeschlagen:', e)
        }
    }

    // Host: Pending-Batch erst an Spotify schicken, wenn keine Musik mehr läuft (kein Stocken während des Songs)
    useEffect(() => {
        const applyPendingBatch = async () => {
            if (!isHost || !spotifyConnected || !db || !roomId) return
            const pending = lobbyData?.pendingBatch
            if (!pending || !Array.isArray(pending.spotifyIds) || pending.spotifyIds.length === 0) return
            // Nur updaten, wenn gerade nichts spielt
            if (nowPlaying?.isPlaying) return

            const deviceId = selectedSpotifyDeviceId === 'active' ? 'active' : selectedSpotifyDeviceId
            const uris = pending.spotifyIds.map((id) => `spotify:track:${id}`)
            if (uris.length === 0) return

            try {
                await spotifyService.playOnDevice(uris, deviceId)
                lastSentQueueOrderRef.current = pending.spotifyIds
                setSpotifyPlaying(true)
                await updateDoc(doc(db, 'musicVoterLobbies', roomId), {
                    pendingBatch: null
                })
            } catch (e) {
                console.error('Fehler beim Senden der Batch an Spotify:', e)
            }
        }

        applyPendingBatch()
    }, [isHost, spotifyConnected, nowPlaying?.isPlaying, lobbyData?.pendingBatch, selectedSpotifyDeviceId, db, roomId])

    return (
        <div className={styles.musicVoter}>
            <div className={styles.backgroundOverlay}></div>

            {/* Lobby Screen */}
            {currentScreen === 'lobby' && (
                <div className={styles.lobbyStartScreen}>
                    <div className={styles.lobbyStartCard}>
                        <h1 className={styles.lobbyStartTitle}>
                            <span className={styles.emoji}>🎵</span>
                            Amplify
                        </h1>
                        <p className={styles.lobbyStartSlogan}>Gemeinsam den Ton angeben</p>

                        {/* Aktive Session – Zurück zur Playlist */}
                        {roomId && (
                            <button
                                className={styles.rejoinButton}
                                onClick={handleRejoinRoom}
                            >
                                <span className={styles.rejoinDot} />
                                <span className={styles.rejoinText}>
                                    <span className={styles.rejoinLabel}>Aktive Playlist</span>
                                    <span className={styles.rejoinSub}>
                                        {isHost ? 'Host' : 'Zuhörer'} · {roomId}
                                    </span>
                                </span>
                                <span className={styles.rejoinArrow}>→</span>
                            </button>
                        )}
                        
                        <div className={styles.lobbyStartButtons}>
                            <button
                                className={styles.lobbyStartButton}
                                onClick={() => setCurrentScreen('create')}
                            >
                                <span className={styles.lobbyStartIcon}>➕</span>
                                <span>Playlist erstellen</span>
                            </button>
                            
                            <button
                                className={styles.lobbyStartButton}
                                onClick={() => {
                                    setCurrentScreen('browse')
                                    loadAvailableLobbies()
                                }}
                            >
                                <span className={styles.lobbyStartIcon}>🔍</span>
                                <span>Playlist beitreten</span>
                            </button>
                        </div>
                    </div>
                    
                    <button
                        onClick={onBack}
                        className={styles.backButtonBottom}
                    >
                        ← Zurück
                    </button>
                </div>
            )}

            {/* Create Lobby Screen */}
            {currentScreen === 'create' && (
                <LobbySystem
                    onCreateLobby={handleCreateLobby}
                    onJoinLobby={() => {}}
                    storagePrefix="mv"
                    title="Playlist erstellen"
                    buttonText="Playlist erstellen"
                    accentColor="#4ecdc4"
                    onBack={() => setCurrentScreen('lobby')}
                />
            )}

            {/* Browse Lobbies Screen */}
            {currentScreen === 'browse' && (
                <div className={styles.lobbySystem} style={{ '--accent-color': '#4ecdc4' }}>
                    <div className={styles.screen}>
                        <h1 className={styles.title}>Playlist beitreten</h1>
                        
                        <input 
                            type="text" 
                            value={myName}
                            onChange={handleNameChange}
                            placeholder="Dein Name" 
                            maxLength={20} 
                            autoComplete="name"
                            className={styles.nameInput}
                        />
                        
                        <div className={styles.emojiGalleryWrapper}>
                            <div 
                                ref={emojiGalleryRef}
                                className={styles.emojiGallery}
                            >
                                <div className={styles.emojiSpacer}></div>
                                
                                {availableEmojis.map((emoji, index) => {
                                    const isSelected = index === emojiScrollIndex
                                    
                                    return (
                                        <div
                                            key={`${emoji}-${index}`}
                                            data-emoji-index={index}
                                            className={`${styles.emojiCard} ${isSelected ? styles.selected : ''}`}
                                            onClick={() => {
                                                if (!isScrollingRef.current) {
                                                    selectEmoji(emoji)
                                                }
                                            }}
                                            onTouchStart={(e) => {
                                                touchStartRef.current = {
                                                    x: e.touches[0].clientX,
                                                    y: e.touches[0].clientY,
                                                    time: Date.now()
                                                }
                                            }}
                                            onTouchMove={(e) => {
                                                if (touchStartRef.current.x !== 0) {
                                                    const deltaX = Math.abs(e.touches[0].clientX - touchStartRef.current.x)
                                                    const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y)
                                                    if (deltaX > 10 || deltaY > 10) {
                                                        isScrollingRef.current = true
                                                    }
                                                }
                                            }}
                                            onTouchEnd={() => {
                                                setTimeout(() => {
                                                    touchStartRef.current = { x: 0, y: 0, time: 0 }
                                                }, 50)
                                            }}
                                        >
                                            <div className={styles.emojiCharacter}>{emoji}</div>
                                        </div>
                                    )
                                })}
                                
                                <div className={styles.emojiSpacer}></div>
                            </div>
                        </div>

                        {/* Lobby Liste */}
                        <div className={styles.lobbyListSection}>
                            <h2 className={styles.lobbyListTitle}>Offene Playlists</h2>
                            
                            {isLoadingLobbies && (
                                <div className={styles.browseLoading}>
                                    <div className={styles.spinner}></div>
                                    <p>Lade Playlists...</p>
                                </div>
                            )}

                            {!isLoadingLobbies && availableLobbies.length === 0 && (
                                <div className={styles.browseEmpty}>
                                    <div className={styles.browseEmptyIcon}>🎵</div>
                                    <p>Keine Playlists gefunden</p>
                                </div>
                            )}

                            {!isLoadingLobbies && availableLobbies.length > 0 && (
                                <div className={styles.lobbyList}>
                                    {availableLobbies.map((lobby) => (
                                        <div
                                            key={lobby.id}
                                            className={styles.lobbyCard}
                                            onClick={() => handleJoinLobbyFromBrowser(lobby.id)}
                                        >
                                            <div className={styles.lobbyCardHeader}>
                                                <div className={styles.lobbyCardTitle}>
                                                    <span className={styles.lobbyCardIcon}>🎵</span>
                                                    <span>Playlist von {lobby.host}</span>
                                                </div>
                                            </div>
                                            
                                            <div className={styles.lobbyCardInfo}>
                                                <div className={styles.lobbyCardStat}>
                                                    <span>👥</span>
                                                    <span>{lobby.playerCount} Zuhörer</span>
                                                </div>
                                                <div className={styles.lobbyCardStat}>
                                                    <span>🎵</span>
                                                    <span>{lobby.playlist.length} Songs</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Buttons */}
                        <div className={styles.buttonGroup}>
                            <button
                                className={styles.refreshButton}
                                onClick={loadAvailableLobbies}
                                disabled={isLoadingLobbies}
                            >
                                🔄 Aktualisieren
                            </button>
                            
                            {availableLobbies.length > 0 && (
                                <button
                                    className={styles.deleteAllButton}
                                    onClick={handleDeleteAllLobbies}
                                >
                                    🗑️ Alle Playlists löschen
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <button
                        onClick={() => setCurrentScreen('lobby')}
                        className={styles.backButtonBottom}
                    >
                        ← Zurück
                    </button>
                </div>
            )}

            {/* Room Screen */}
            {currentScreen === 'room' && lobbyData && (
                <div className={styles.roomContainer}>
                    {/* Header */}
                    <div className={styles.header}>
                        <button
                            className={styles.headerBack}
                            onClick={handleGoBack}
                            aria-label="Zurück"
                        >
                            ←
                        </button>
                        <div className={styles.headerCenter}>
                            <p className={styles.headerSubtitle}>Playlist</p>
                            <h1 className={styles.roomTitle}>Amplify</h1>
                        </div>
                        <div className={styles.headerActions}>
                            {isHost && (
                                <button
                                    type="button"
                                    className={`${styles.headerIconBtn} ${showHostSettings ? styles.headerIconBtnActive : ''}`}
                                    onClick={() => setShowHostSettings(v => !v)}
                                    aria-label="Einstellungen"
                                >
                                    ⚙
                                </button>
                            )}
                            {isHost && (
                                <button
                                    className={styles.closeButton}
                                    onClick={handleCloseLobby}
                                    title="Playlist schließen"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Settings-Panel (Host only, ausklappbar) */}
                    {isHost && showHostSettings && (
                        <div className={styles.settingsPanel}>

                            {/* Spotify */}
                            <div className={styles.settingsPanelSection}>
                                <div className={styles.settingsPanelSectionHeader}>
                                    <span className={styles.settingsPanelIcon}>&#127925;</span>
                                    <span className={styles.settingsPanelSectionTitle}>Spotify</span>
                                    {spotifyConnected && (
                                        <span className={styles.settingsBadgeGreen}>Verbunden</span>
                                    )}
                                </div>
                                {spotifyError && (
                                    <p className={styles.spotifyError}>{spotifyError}</p>
                                )}
                                {!spotifyConnected ? (
                                    <div className={styles.settingsPanelBody}>
                                        <p className={styles.settingsHint}>
                                            Verbinde dich über den <strong>+ Song/Album</strong> Button mit Spotify.
                                        </p>
                                    </div>
                                ) : (
                                    <div className={styles.settingsPanelBody}>
                                        <div className={styles.settingsRow}>
                                            <span className={styles.settingsRowLabel}>Gerät</span>
                                            <select
                                                className={styles.settingsRowSelect}
                                                value={selectedSpotifyDeviceId}
                                                onChange={(e) => setSelectedSpotifyDeviceId(e.target.value)}
                                            >
                                                <option value="active">Aktives Gerät</option>
                                                {spotifyDevices.map((d) => (
                                                    <option key={d.id} value={d.id}>
                                                        {d.name}{d.is_active ? ' aktiv' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className={styles.settingsButtonRow}>
                                            {!spotifyPlaying ? (
                                                <button
                                                    type="button"
                                                    className={styles.settingsPrimaryBtn}
                                                    onClick={handleStartPlayback}
                                                    disabled={sortedPlaylist.filter((i) => i.source === 'spotify' && i.type === 'song').length === 0}
                                                >
                                                    Abspielen
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={styles.settingsPrimaryBtn}
                                                        onClick={handlePausePlayback}
                                                    >
                                                        Pause
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.settingsSecondaryBtn}
                                                        onClick={handleResendPlaylist}
                                                    >
                                                        Neu senden
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                type="button"
                                                className={styles.settingsDangerBtn}
                                                onClick={handleSpotifyDisconnect}
                                            >
                                                Trennen
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Voting */}
                            <div className={styles.settingsPanelSection}>
                                <div className={styles.settingsPanelSectionHeader}>
                                    <span className={styles.settingsPanelIcon}>&#128499;</span>
                                    <span className={styles.settingsPanelSectionTitle}>Voting-Runden</span>
                                    <span className={styles.settingsBadgeMuted}>Runde {lobbyData.votingRound || 0}</span>
                                </div>
                                <div className={styles.settingsPanelBody}>
                                    <div className={styles.settingsRow}>
                                        <span className={styles.settingsRowLabel}>Songs / Runde</span>
                                        <select
                                            className={styles.settingsRowSelect}
                                            value={lobbyData.batchSize || 10}
                                            onChange={(e) =>
                                                updateLobbyConfig({ batchSize: Number(e.target.value) || 10 })
                                            }
                                        >
                                            <option value={5}>5</option>
                                            <option value={10}>10</option>
                                            <option value={15}>15</option>
                                            <option value={20}>20</option>
                                        </select>
                                    </div>
                                    <div className={styles.settingsRow}>
                                        <span className={styles.settingsRowLabel}>Voting-Dauer</span>
                                        <select
                                            className={styles.settingsRowSelect}
                                            value={lobbyData.votingDurationSec || 120}
                                            onChange={(e) =>
                                                updateLobbyConfig({ votingDurationSec: Number(e.target.value) || 120 })
                                            }
                                        >
                                            <option value={60}>1 Min</option>
                                            <option value={120}>2 Min</option>
                                            <option value={180}>3 Min</option>
                                            <option value={300}>5 Min</option>
                                        </select>
                                    </div>
                                    <div className={styles.settingsButtonRow}>
                                        <button
                                            type="button"
                                            className={styles.settingsPrimaryBtn}
                                            onClick={handleStartVotingRound}
                                        >
                                            Voting starten
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* Timer-Banner (wenn Voting aktiv) */}
                    {lobbyData.votingActive && votingRemainingMs > 0 && (
                        <div className={styles.timerBanner}>
                            <div className={styles.timerBannerLeft}>
                                <span className={styles.timerBannerDot} />
                                <span className={styles.timerBannerLabel}>Voting läuft</span>
                            </div>
                            <span className={styles.timerBannerTime}>
                                {formatPlaybackTime(votingRemainingMs)}
                            </span>
                        </div>
                    )}

                    {/* Now Playing (für alle sichtbar, wenn Host Spotify abspielt) */}
                    {nowPlaying && (
                        <div className={styles.nowPlayingSection}>
                            <h3 className={styles.sectionTitle}>Now Playing</h3>
                            <div className={styles.nowPlayingCard}>
                                {nowPlaying.imageUrl && (
                                    <img
                                        src={nowPlaying.imageUrl}
                                        alt=""
                                        className={styles.nowPlayingImage}
                                    />
                                )}
                                <div className={styles.nowPlayingInfo}>
                                    <div className={styles.nowPlayingTrack}>{nowPlaying.trackName}</div>
                                    <div className={styles.nowPlayingArtist}>{nowPlaying.artist}</div>
                                    <div className={styles.nowPlayingTime}>
                                        {formatPlaybackTime(nowPlayingPositionMs)} / {formatPlaybackTime(nowPlaying.durationMs)}
                                    </div>
                                </div>
                                {nowPlaying.isPlaying && (
                                    <span className={styles.nowPlayingBadge} title="Läuft">▶</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Add Button */}
                    <div className={styles.addSection}>
                        <button 
                            className={styles.addButton}
                            onClick={() => setShowAddModal(true)}
                        >
                            + Song/Album hinzufügen
                        </button>
                    </div>

                    {/* Playlist (aktuell laufender Song wird ausgeblendet, nur in Now Playing sichtbar) */}
                    {(() => {
                        const playlistQueue = sortedPlaylist.filter((item) => item.spotifyId !== nowPlaying?.trackId)
                        return (
                    <div className={styles.playlistSection}>
                        <h3 className={styles.sectionTitle}>
                            Playlist ({playlistQueue.length}{nowPlaying?.trackId ? ' + 1 läuft' : ''})
                        </h3>
                        
                        {playlistQueue.length === 0 ? (
                            <div className={styles.emptyPlaylist}>
                                <div className={styles.emptyIcon}>🎵</div>
                                <p>{nowPlaying?.trackId ? 'Keine weiteren Songs in der Warteschlange' : 'Noch keine Songs in der Playlist'}</p>
                                <p className={styles.emptyHint}>
                                    {nowPlaying?.trackId ? 'Der aktuelle Song läuft oben bei Now Playing.' : 'Füge Songs hinzu, um abzustimmen!'}
                                </p>
                            </div>
                        ) : (
                            <div className={styles.playlistItems}>
                                {playlistQueue.map((item, index) => {
                                    const score = calculateScore(item)
                                    const myVote = item.votes?.[myName] || 0

                                    return (
                                        <div 
                                            key={item.id} 
                                            className={styles.playlistItem}
                                            style={{ '--item-color': getVoteColor(myVote) }}
                                        >
                                            <div className={styles.playlistArtwork}>
                                                {item.imageUrl && item.source === 'spotify' ? (
                                                    <img
                                                        src={item.imageUrl}
                                                        alt={item.title}
                                                    />
                                                ) : (
                                                    <div className={styles.playlistArtworkPlaceholder}>
                                                        {item.type === 'album' ? '📀' : '♪'}
                                                    </div>
                                                )}
                                                <div className={styles.itemRankBadge}>{index + 1}</div>
                                            </div>

                                            <div className={styles.itemInfo}>
                                                <div className={styles.itemTitle}>
                                                    {item.title}
                                                </div>
                                                <div className={styles.itemArtist}>{item.artist}</div>
                                                <div className={styles.itemMeta}>
                                                    von {item.addedBy}
                                                    {item.source === 'spotify' && ' • Spotify'}
                                                </div>
                                            </div>

                                            <div className={styles.itemVoting}>
                                                <button
                                                    className={`${styles.voteButton} ${myVote === 1 ? styles.voted : ''}`}
                                                    onClick={() => handleVote(item.id, 'up')}
                                                >
                                                    👍
                                                </button>
                                                <div className={styles.voteScore}>{score > 0 ? '+' : ''}{score}</div>
                                                <button
                                                    className={`${styles.voteButton} ${myVote === -1 ? styles.voted : ''}`}
                                                    onClick={() => handleVote(item.id, 'down')}
                                                >
                                                    👎
                                                </button>
                                                {(isHost || item.addedBy === myName) && (
                                                    <button
                                                        className={styles.removeButton}
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        title="Entfernen"
                                                    >
                                                        ⋮
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                        )
                    })()}
                </div>
            )}

            {/* Add Modal */}
            {showAddModal && (
                <div className={styles.modalOverlay} onClick={() => { setAddedInModalIds(new Set()); setAlbumTracks(null); setSearchResults([]); setSearchQuery(''); setShowAddModal(false) }}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Song hinzufügen</h2>
                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                onClick={() => {
                                    setAddedInModalIds(new Set())
                                    setAlbumTracks(null)
                                    setSearchResults([])
                                    setSearchQuery('')
                                    setShowAddModal(false)
                                }}
                                title="Schließen"
                                aria-label="Schließen"
                            >
                                ×
                            </button>
                        </div>

                        {/* Host: Spotify-Verbindung nötig */}
                        {isHost && !spotifyConnected ? (
                            <div className={styles.spotifyConnectPrompt}>
                                <div className={styles.spotifyConnectPromptIcon}>🎵</div>
                                <h3 className={styles.spotifyConnectPromptTitle}>Spotify verbinden</h3>
                                <p className={styles.spotifyConnectPromptText}>
                                    Als Host musst du dich einmalig mit Spotify verbinden, damit Songs gesucht und abgespielt werden können.
                                </p>
                                {spotifyError && (
                                    <p className={styles.spotifyError}>{spotifyError}</p>
                                )}
                                <button
                                    type="button"
                                    className={styles.spotifyConnectButton}
                                    onClick={handleSpotifyConnect}
                                >
                                    Mit Spotify verbinden
                                </button>
                            </div>
                        ) : (
                            <div className={styles.spotifySearch}>
                                {/* Album-Track-Ansicht */}
                                {albumTracks ? (
                                    <>
                                        <div className={styles.albumHeader}>
                                            <button
                                                type="button"
                                                className={styles.albumBackButton}
                                                onClick={() => setAlbumTracks(null)}
                                            >
                                                ← Zurück
                                            </button>
                                            <div className={styles.albumHeaderInfo}>
                                                {albumTracks.album.imageUrl && (
                                                    <img src={albumTracks.album.imageUrl} alt="" className={styles.albumHeaderImage} />
                                                )}
                                                <div>
                                                    <div className={styles.albumHeaderTitle}>{albumTracks.album.title}</div>
                                                    <div className={styles.albumHeaderArtist}>{albumTracks.album.artist}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.searchResults}>
                                            {albumTracks.tracks.map((track) => {
                                                const isAdded = addedInModalIds.has(track.id)
                                                return (
                                                    <div
                                                        key={track.id}
                                                        className={styles.searchResultItem}
                                                        onClick={async (e) => {
                                                            if (isAdded) return
                                                            if (e.target.closest('button')) return
                                                            await addToPlaylist({ ...track, addedBy: myName, votes: {} })
                                                            setAddedInModalIds(prev => new Set(prev).add(track.id))
                                                        }}
                                                    >
                                                        <div className={styles.resultInfo}>
                                                            <div className={styles.resultTitle}>{track.title}</div>
                                                            <div className={styles.resultArtist}>{track.artist}</div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className={`${styles.addResultButton} ${isAdded ? styles.addResultButtonAdded : ''}`}
                                                            onClick={async (e) => {
                                                                e.stopPropagation()
                                                                if (isAdded) return
                                                                await addToPlaylist({ ...track, addedBy: myName, votes: {} })
                                                                setAddedInModalIds(prev => new Set(prev).add(track.id))
                                                            }}
                                                            disabled={isAdded}
                                                        >
                                                            {isAdded ? '✓' : '+'}
                                                        </button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className={styles.searchBox}>
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyPress={(e) => { if (e.key === 'Enter') handleSpotifySearch() }}
                                                placeholder="Song oder Album suchen..."
                                                className={styles.input}
                                            />
                                            <button
                                                className={styles.searchButton}
                                                onClick={handleSpotifySearch}
                                                disabled={isSearching || !searchQuery.trim()}
                                            >
                                                {isSearching ? '🔍 Suche...' : '🔍 Suchen'}
                                            </button>
                                        </div>

                                        {isLoadingAlbum && (
                                            <div className={styles.searchLoading}>
                                                <div className={styles.spinner}></div>
                                                <p>Lade Album...</p>
                                            </div>
                                        )}

                                        {isSearching && (
                                            <div className={styles.searchLoading}>
                                                <div className={styles.spinner}></div>
                                                <p>Durchsuche Spotify...</p>
                                            </div>
                                        )}

                                        {!isSearching && !isLoadingAlbum && searchResults.length > 0 && (
                                            <div className={styles.searchResults}>
                                                {searchResults.map((item) => {
                                                    const isAdded = addedInModalIds.has(item.id)
                                                    const isAlbum = item.type === 'album'
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className={styles.searchResultItem}
                                                            onClick={async (e) => {
                                                                if (e.target.closest('button')) return
                                                                if (isAlbum) {
                                                                    handleOpenAlbum(item)
                                                                    return
                                                                }
                                                                if (isAdded) return
                                                                await addToPlaylist({ ...item, addedBy: myName, votes: {} })
                                                                setAddedInModalIds(prev => new Set(prev).add(item.id))
                                                            }}
                                                        >
                                                            {item.imageUrl && (
                                                                <img src={item.imageUrl} alt={item.title} className={styles.resultImage} />
                                                            )}
                                                            <div className={styles.resultInfo}>
                                                                <div className={styles.resultTitle}>{item.title}</div>
                                                                <div className={styles.resultArtist}>
                                                                    {isAlbum ? `Album · ${item.artist}` : item.artist}
                                                                </div>
                                                                {item.album && !isAlbum && (
                                                                    <div className={styles.resultAlbum}>{item.album}</div>
                                                                )}
                                                            </div>
                                                            {isAlbum ? (
                                                                <button
                                                                    type="button"
                                                                    className={styles.albumArrowButton}
                                                                    onClick={() => handleOpenAlbum(item)}
                                                                    title="Songs des Albums anzeigen"
                                                                >
                                                                    ›
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className={`${styles.addResultButton} ${isAdded ? styles.addResultButtonAdded : ''}`}
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation()
                                                                        if (isAdded) return
                                                                        await addToPlaylist({ ...item, addedBy: myName, votes: {} })
                                                                        setAddedInModalIds(prev => new Set(prev).add(item.id))
                                                                    }}
                                                                    disabled={isAdded}
                                                                    title={isAdded ? 'Bereits hinzugefügt' : 'Zur Playlist hinzufügen'}
                                                                >
                                                                    {isAdded ? '✓' : '+'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}

                                        {!isSearching && searchQuery && searchResults.length === 0 && (
                                            <div className={styles.noResults}>
                                                <p>Keine Ergebnisse gefunden</p>
                                                <p className={styles.noResultsHint}>Versuche einen anderen Suchbegriff</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default MusicVoter