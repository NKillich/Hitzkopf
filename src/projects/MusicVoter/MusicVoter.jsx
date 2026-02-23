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

const MusicVoter = ({ onBack }) => {
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
    const [roomId, setRoomId] = useState('')
    const [isHost, setIsHost] = useState(false)
    const [lobbyData, setLobbyData] = useState(null)
    const [availableLobbies, setAvailableLobbies] = useState([])
    const [isLoadingLobbies, setIsLoadingLobbies] = useState(false)
    
    // Music State
    const [playlist, setPlaylist] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [addMode, setAddMode] = useState(null) // 'spotify' or 'manual'
    const [showAddModal, setShowAddModal] = useState(false)
    
    // Manual Add State
    const [manualTitle, setManualTitle] = useState('')
    const [manualArtist, setManualArtist] = useState('')
    const [manualType, setManualType] = useState('song') // 'song' or 'album'

    // Refs
    const unsubscribeRef = useRef(null)
    const lobbiesUnsubscribeRef = useRef(null)
    const emojiGalleryRef = useRef(null)
    const isScrollingRef = useRef(false)
    const touchStartRef = useRef({ x: 0, y: 0, time: 0 })

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

    // Emoji Gallery Scroll Handler
    useEffect(() => {
        const gallery = emojiGalleryRef.current
        if (!gallery) return

        const handleScroll = () => {
            isScrollingRef.current = true
            const scrollLeft = gallery.scrollLeft
            const itemWidth = gallery.scrollWidth / (availableEmojis.length + 2)
            const index = Math.round(scrollLeft / itemWidth)
            const clampedIndex = Math.max(0, Math.min(index, availableEmojis.length - 1))
            setEmojiScrollIndex(clampedIndex)
            setMyEmoji(availableEmojis[clampedIndex])
            
            setTimeout(() => {
                isScrollingRef.current = false
            }, 100)
        }

        gallery.addEventListener('scroll', handleScroll)
        
        const centerEmoji = () => {
            const itemWidth = gallery.scrollWidth / (availableEmojis.length + 2)
            gallery.scrollLeft = emojiScrollIndex * itemWidth
        }
        setTimeout(centerEmoji, 100)

        return () => gallery.removeEventListener('scroll', handleScroll)
    }, [emojiScrollIndex])

    // Initial center when browse screen opens
    useEffect(() => {
        if (currentScreen === 'browse' && emojiGalleryRef.current) {
            const gallery = emojiGalleryRef.current
            setTimeout(() => {
                const itemWidth = gallery.scrollWidth / (availableEmojis.length + 2)
                gallery.scrollLeft = emojiScrollIndex * itemWidth
            }, 150)
        }
    }, [currentScreen])

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
                status: 'active'
            })

            setMyName(name)
            setMyEmoji(emoji)
            setRoomId(newRoomId)
            setIsHost(true)
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
            } else {
                alert('Playlist wurde geschlossen')
                handleLeaveLobby()
            }
        })

        unsubscribeRef.current = unsubscribe
    }

    // Lobby verlassen (NICHT löschen!)
    const handleLeaveLobby = async () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current()
        }

        if (db && roomId && myName) {
            const lobbyRef = doc(db, 'musicVoterLobbies', roomId)
            
            try {
                // Entferne nur den Spieler, NICHT die ganze Lobby
                await updateDoc(lobbyRef, {
                    [`players.${myName}`]: deleteField()
                })
                
                console.log(`👋 ${myName} hat die Lobby verlassen`)
            } catch (error) {
                console.error('Fehler beim Verlassen:', error)
            }
        }

        setCurrentScreen('lobby')
        setRoomId('')
        setMyName('')
        setMyEmoji('')
        setIsHost(false)
        setLobbyData(null)
        setPlaylist([])
    }

    // Song/Album hinzufügen (Manuell)
    const handleAddManual = async () => {
        if (!manualTitle.trim()) {
            alert('Bitte gib einen Titel ein!')
            return
        }

        const newItem = {
            id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: manualTitle,
            artist: manualArtist || 'Unbekannt',
            type: manualType,
            source: 'manual',
            votes: {},
            addedBy: myName,
            addedAt: Date.now()
        }

        await addToPlaylist(newItem)
        
        setManualTitle('')
        setManualArtist('')
        setShowAddModal(false)
    }

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
                                            <button
                                                className={styles.lobbyCardDelete}
                                                onClick={(e) => handleDeleteLobbyFromBrowser(lobby.id, lobby.host, e)}
                                                title="Playlist löschen"
                                            >
                                                ×
                                            </button>

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
                        <div className={styles.headerLeft}>
                            <h1 className={styles.roomTitle}>
                                <span className={styles.emoji}>🎵</span>
                                Amplify
                            </h1>
                        </div>
                        <div className={styles.headerButtons}>
                            {isHost && (
                                <button 
                                    className={styles.closeButton}
                                    onClick={handleCloseLobby}
                                    title="Playlist schließen"
                                >
                                    Schließen
                                </button>
                            )}
                            <button 
                                className={styles.leaveButton}
                                onClick={handleLeaveLobby}
                            >
                                Verlassen
                            </button>
                        </div>
                    </div>

                    {/* Players */}
                    <div className={styles.playersSection}>
                        <h3 className={styles.sectionTitle}>
                            Zuhörer ({Object.keys(lobbyData.players || {}).length})
                        </h3>
                        <div className={styles.playersList}>
                            {Object.entries(lobbyData.players || {}).map(([name, data]) => (
                                <div key={name} className={styles.playerChip}>
                                    <span className={styles.playerEmoji}>{data.emoji}</span>
                                    <span className={styles.playerName}>{name}</span>
                                    {name === lobbyData.host && (
                                        <span className={styles.hostBadge}>👑</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Add Button */}
                    <div className={styles.addSection}>
                        <button 
                            className={styles.addButton}
                            onClick={() => setShowAddModal(true)}
                        >
                            + Song/Album hinzufügen
                        </button>
                    </div>

                    {/* Playlist */}
                    <div className={styles.playlistSection}>
                        <h3 className={styles.sectionTitle}>
                            Playlist ({sortedPlaylist.length})
                        </h3>
                        
                        {sortedPlaylist.length === 0 ? (
                            <div className={styles.emptyPlaylist}>
                                <div className={styles.emptyIcon}>🎵</div>
                                <p>Noch keine Songs in der Playlist</p>
                                <p className={styles.emptyHint}>
                                    Füge Songs hinzu, um abzustimmen!
                                </p>
                            </div>
                        ) : (
                            <div className={styles.playlistItems}>
                                {sortedPlaylist.map((item, index) => {
                                    const score = calculateScore(item)
                                    const myVote = item.votes?.[myName] || 0

                                    return (
                                        <div 
                                            key={item.id} 
                                            className={styles.playlistItem}
                                            style={{ '--item-color': getVoteColor(myVote) }}
                                        >
                                            {/* Entfernen-Button ganz links */}
                                            {(isHost || item.addedBy === myName) && (
                                                <button
                                                    className={styles.removeButton}
                                                    onClick={() => handleRemoveItem(item.id)}
                                                    title="Entfernen"
                                                >
                                                    ×
                                                </button>
                                            )}
                                            
                                            <div className={styles.itemRank}>#{index + 1}</div>
                                            
                                            <div className={styles.itemInfo}>
                                                <div className={styles.itemTitle}>
                                                    {item.type === 'album' && '📀 '}
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
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Modal */}
            {showAddModal && (
                <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Hinzufügen</h2>
                        
                        {!addMode && (
                            <div className={styles.addModeButtons}>
                                <button
                                    className={styles.addModeButton}
                                    onClick={() => setAddMode('spotify')}
                                >
                                    <span className={styles.addModeIcon}>🎵</span>
                                    <span>Spotify</span>
                                    <p className={styles.addModeDesc}>Suche nach Songs auf Spotify</p>
                                </button>
                                <button
                                    className={styles.addModeButton}
                                    onClick={() => setAddMode('manual')}
                                >
                                    <span className={styles.addModeIcon}>✏️</span>
                                    <span>Manuell</span>
                                    <p className={styles.addModeDesc}>Eigenen Song eingeben</p>
                                </button>
                            </div>
                        )}

                        {addMode === 'manual' && (
                            <div className={styles.manualForm}>
                                <select
                                    value={manualType}
                                    onChange={(e) => setManualType(e.target.value)}
                                    className={styles.input}
                                >
                                    <option value="song">Song</option>
                                    <option value="album">Album</option>
                                </select>
                                
                                <input
                                    type="text"
                                    value={manualTitle}
                                    onChange={(e) => setManualTitle(e.target.value)}
                                    placeholder="Titel"
                                    className={styles.input}
                                />
                                
                                <input
                                    type="text"
                                    value={manualArtist}
                                    onChange={(e) => setManualArtist(e.target.value)}
                                    placeholder="Künstler (optional)"
                                    className={styles.input}
                                />

                                <button
                                    className={styles.btnPrimary}
                                    onClick={handleAddManual}
                                >
                                    Hinzufügen
                                </button>
                            </div>
                        )}

                        {addMode === 'spotify' && (
                            <div className={styles.spotifySearch}>
                                <div className={styles.searchBox}>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSpotifySearch()
                                            }
                                        }}
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

                                {isSearching && (
                                    <div className={styles.searchLoading}>
                                        <div className={styles.spinner}></div>
                                        <p>Durchsuche Spotify...</p>
                                    </div>
                                )}

                                {!isSearching && searchResults.length > 0 && (
                                    <div className={styles.searchResults}>
                                        {searchResults.map((item) => (
                                            <div 
                                                key={item.id} 
                                                className={styles.searchResultItem}
                                                onClick={async () => {
                                                    try {
                                                        const itemToAdd = {
                                                            ...item,
                                                            addedBy: myName,
                                                            votes: {}
                                                        }
                                                        
                                                        console.log('🎵 Füge hinzu:', item.title)
                                                        await addToPlaylist(itemToAdd)
                                                        
                                                        // Modal schließen und aufräumen
                                                        setShowAddModal(false)
                                                        setAddMode(null)
                                                        setSearchQuery('')
                                                        setSearchResults([])
                                                    } catch (error) {
                                                        console.error('Fehler beim Klick:', error)
                                                    }
                                                }}
                                            >
                                                {item.imageUrl && (
                                                    <img 
                                                        src={item.imageUrl} 
                                                        alt={item.title}
                                                        className={styles.resultImage}
                                                    />
                                                )}
                                                <div className={styles.resultInfo}>
                                                    <div className={styles.resultTitle}>
                                                        {item.type === 'album' && '📀 '}
                                                        {item.title}
                                                    </div>
                                                    <div className={styles.resultArtist}>
                                                        {item.artist}
                                                    </div>
                                                    {item.album && item.type === 'song' && (
                                                        <div className={styles.resultAlbum}>
                                                            {item.album}
                                                        </div>
                                                    )}
                                                </div>
                                                <button className={styles.addResultButton}>
                                                    +
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!isSearching && searchQuery && searchResults.length === 0 && (
                                    <div className={styles.noResults}>
                                        <p>Keine Ergebnisse gefunden</p>
                                        <p className={styles.noResultsHint}>
                                            Versuche einen anderen Suchbegriff
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={styles.modalButtons}>
                            {addMode && (
                                <button
                                    className={styles.btnSecondary}
                                    onClick={() => setAddMode(null)}
                                >
                                    Zurück
                                </button>
                            )}
                            <button
                                className={styles.btnSecondary}
                                onClick={() => {
                                    setShowAddModal(false)
                                    setAddMode(null)
                                    setManualTitle('')
                                    setManualArtist('')
                                }}
                            >
                                Abbrechen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default MusicVoter
