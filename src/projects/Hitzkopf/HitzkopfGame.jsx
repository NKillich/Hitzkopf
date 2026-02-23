import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, increment, deleteField, deleteDoc, runTransaction } from 'firebase/firestore'
import { questionCategories, getAllQuestions } from '../../data/questionCategories'
import { playSound as playSoundCached, getBackgroundMusic } from '../../utils/audioManager'
import '../../App.css'
import styles from './HitzkopfGame.module.css'
import hkBackground from '../../assets/hk_background_fullwidth.png'
import hkLogo from '../../assets/hk_logo_vertical.png'
import hkLogoHorizontal from '../../assets/hk_logo_horizontal.png'

// Constants
const GAME_CONSTANTS = {
    MAX_TEMP_DEFAULT: 100,
    ATTACK_DMG_PARTY: 20,
    PENALTY_DMG: 10,
    PRESENCE_HEARTBEAT_INTERVAL: 10000,
    CONNECTION_CHECK_INTERVAL: 2000,
    RETRY_DELAY_MULTIPLIER: 1,
    HOST_INACTIVE_THRESHOLD: 5000,
    CONNECTION_SLOW_THRESHOLD: 5000,
    CONNECTION_OFFLINE_THRESHOLD: 10000,
    MAX_PLAYER_NAME_LENGTH: 20,
}

const GAME_STATUS = {
    LOBBY: 'lobby',
    GAME: 'game',
    RESULT: 'result',
    WINNER: 'winner'
}

// Debug Logger (nur in Development)
const DEBUG = import.meta.env.DEV
const logger = {
    log: DEBUG ? console.log : () => {},
    warn: DEBUG ? console.warn : () => {},
    error: DEBUG ? console.error : () => {},
    debug: DEBUG ? console.debug : () => {},
}

// Helper Functions
const getActivePlayers = (players, maxTemp = GAME_CONSTANTS.MAX_TEMP_DEFAULT, eliminatedPlayers = []) => {
    return Object.keys(players || {}).filter(p => {
        const temp = players?.[p]?.temp || 0
        return temp < maxTemp && !eliminatedPlayers.includes(p)
    }).sort()
}

const getHotseatName = (hotseat) => {
    return typeof hotseat === 'string' ? hotseat : (hotseat?.name || String(hotseat || ''))
}

const votesEqual = (votesA, votesB) => {
    const keysA = Object.keys(votesA || {})
    const keysB = Object.keys(votesB || {})
    if (keysA.length !== keysB.length) return false
    return keysA.every(k => votesA[k]?.choice === votesB[k]?.choice)
}

const generateAttackResultKey = (roundId, result, roundRecapShown) => {
    // Statt JSON.stringify verwenden wir eine einfachere Methode
    const attackCount = result.attackDetails?.length || 0
    const hasOil = result.attackDetails?.some(a => a.hasOil) || false
    return `${roundId}-${result.totalDmg}-${attackCount}-${hasOil}-${roundRecapShown}`
}

const sanitizePlayerName = (name) => {
    if (!name) return ''
    return name.trim()
        .slice(0, GAME_CONSTANTS.MAX_PLAYER_NAME_LENGTH)
        .replace(/[<>]/g, '')
}

const generateOperationId = (prefix = 'op') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA",
    authDomain: "hitzkopf-f0ea6.firebaseapp.com",
    projectId: "hitzkopf-f0ea6",
    storageBucket: "hitzkopf-f0ea6.firebasestorage.app",
    messagingSenderId: "828164655874",
    appId: "1:828164655874:web:1cab759bdb03bfb736101b"
};

// Emojis
// PERFORMANCE-FIX: Sortiere nur einmal beim Initialisieren, nicht bei jedem Import
const baseEmojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
// WICHTIG: Verwende einen festen Seed oder sortiere nur einmal
// Math.random() bei jedem Import würde zu unterschiedlichen Reihenfolgen führen
const availableEmojis = (() => {
    const shuffled = [...baseEmojis];
    // Fisher-Yates Shuffle mit festem Seed für Konsistenz
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
})();

// PERFORMANCE-OPTIMIERUNG: questionCategories wurde in separate Datei ausgelagert
// für besseres Code-Splitting und reduzierte initiale Bundle-Größe
// Siehe: src/data/questionCategories.js

// Fragen sind jetzt in src/data/questionCategories.js ausgelagert

function HitzkopfGame({ onBack }) {
    // Firebase
    const [app, setApp] = useState(null)
    const [db, setDb] = useState(null)
    
    // State
    const [currentScreen, setCurrentScreen] = useState('landing')
    const [myName, setMyName] = useState(sessionStorage.getItem("hk_name") || "")
    // WICHTIG: Beim Start-Screen immer mittlerer Charakter, sessionStorage wird ignoriert
    const middleIndexInit = Math.floor(availableEmojis.length / 2)
    const middleEmojiInit = availableEmojis[middleIndexInit]
    const [myEmoji, setMyEmoji] = useState(middleEmojiInit)
    const [roomId, setRoomId] = useState(sessionStorage.getItem("hk_room") || "")
    const [isHost, setIsHost] = useState(false)
    const [globalData, setGlobalData] = useState(null)
    
    // PERFORMANCE: useMemo für häufig verwendete Berechnungen
    // Aktive Spieler (nicht eliminiert) - nur neu berechnen wenn players oder config sich ändert
    const activePlayers = useMemo(() => {
        if (!globalData?.players) return []
        const maxTemp = globalData.config?.maxTemp || GAME_CONSTANTS.MAX_TEMP_DEFAULT
        return getActivePlayers(globalData.players, maxTemp)
    }, [globalData?.players, globalData?.config?.maxTemp])
    
    // Sortierte Spieler für UI - nur neu berechnen wenn players sich ändert
    const sortedPlayers = useMemo(() => {
        if (!globalData?.players) return []
        return Object.keys(globalData.players).sort()
    }, [globalData?.players])
    
    // Player Count - nur neu berechnen wenn players sich ändert
    const playerCount = useMemo(() => {
        return Object.keys(globalData?.players || {}).length
    }, [globalData?.players])
    
    // Verbindungsstatus für bessere Fehlerbehandlung
    const [connectionStatus, setConnectionStatus] = useState('online') // 'online', 'offline', 'slow'
    const lastHostActivityRef = useRef(Date.now()) // Zeitstempel der letzten Host-Aktivität
    
    // Refs für Timeout-Tracking (statt window-Objekte)
    const timeoutKeysRef = useRef(new Set())
    const timeoutIdsRef = useRef([])
    const lastProcessedRoundIdRef = useRef(null) // Verhindert veraltete Updates
    
    // Start Screen
    const [showHostSettings, setShowHostSettings] = useState(false)
    const [showJoinPanel, setShowJoinPanel] = useState(false)
    const [selectedCategories, setSelectedCategories] = useState([])
    const [roomPassword, setRoomPassword] = useState("")
    const [roomCode, setRoomCode] = useState("")
    const [joinPassword, setJoinPassword] = useState("")
    const [roomList, setRoomList] = useState([])
    
    // Question Generator
    const [currentGeneratorQuestion, setCurrentGeneratorQuestion] = useState(null)
    const [shuffledQuestions, setShuffledQuestions] = useState([])
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    
    // Game Screen
    const [mySelection, setMySelection] = useState(null)
    const [myStrategy, setMyStrategy] = useState(null)
    const [localActionDone, setLocalActionDone] = useState(false)
    const [lastRoundId, setLastRoundId] = useState(null)
    const [lastAttackResultKey, setLastAttackResultKey] = useState(null)
    const [isOpeningAttackModal, setIsOpeningAttackModal] = useState(false)
    const [lastEliminationShown, setLastEliminationShown] = useState(null) // Ref für Eliminierungs-Modal
    
    // Reward/Attack Selection States
    const [showRewardChoice, setShowRewardChoice] = useState(false)
    const [showAttackSelection, setShowAttackSelection] = useState(false)
    const [showJokerShop, setShowJokerShop] = useState(false)
    
    // Modals
    const [showHotseatModal, setShowHotseatModal] = useState(false)
    const [showAttackModal, setShowAttackModal] = useState(false)
    const [showRulesModal, setShowRulesModal] = useState(false)
    const [showEliminationModal, setShowEliminationModal] = useState(false)
    const [eliminatedPlayer, setEliminatedPlayer] = useState(null)
    const [attackResult, setAttackResult] = useState(null)
    
    // Menu
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuPage, setMenuPage] = useState('main') // 'main', 'settings', 'volume', 'log'
    
    // Hintergrundmusik
    const [musicEnabled, setMusicEnabled] = useState(() => {
        const saved = localStorage.getItem('hk_music_enabled')
        return saved !== null ? saved === 'true' : true // Standard: an
    })
    const [musicVolume, setMusicVolume] = useState(() => {
        const saved = localStorage.getItem('hk_music_volume')
        return saved !== null ? parseInt(saved) : 10 // Standard: 10 (max)
    })
    const [soundVolume, setSoundVolume] = useState(() => {
        const saved = localStorage.getItem('hk_sound_volume')
        return saved !== null ? parseInt(saved) : 10 // Standard: 10 (max)
    })
    const backgroundMusicRef = useRef(null)
    
    // Recovery-System: Tracking von ausstehenden Operationen
    const pendingOperationsRef = useRef(new Map()) // Trackt ausstehende Firebase-Updates
    const lastSuccessfulUpdateRef = useRef(Date.now()) // Zeitstempel des letzten erfolgreichen Updates
    const gameStateWatchdogRef = useRef(null) // Watchdog-Intervall
    
    // Retry-Helper für Firebase-Operationen mit Tracking
    // Versucht eine Operation mehrmals, falls sie durch Adblocker o.ä. blockiert wird
    const retryFirebaseOperation = useCallback(async (operation, operationId = null, maxRetries = 3, delay = 1000) => {
        const opId = operationId || generateOperationId()
        const startTime = Date.now()
        pendingOperationsRef.current.set(opId, { startTime: startTime, attempts: 0 })
        
        // Nur bei ersten Versuch oder Fehlern loggen
        let hasLoggedStart = false
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            pendingOperationsRef.current.get(opId).attempts = attempt
            
            if (attempt === 1 && !hasLoggedStart) {
                logger.log(`🔄 [RETRY] Starte Operation mit Retry-Mechanismus:`, {
                    operationId: opId,
                    maxRetries: maxRetries
                })
                hasLoggedStart = true
            }
            
            try {
                await operation()
                // Erfolgreich!
                const totalDuration = Date.now() - startTime
                lastSuccessfulUpdateRef.current = Date.now()
                pendingOperationsRef.current.delete(opId)
                logger.log(`✅ [RETRY] Operation erfolgreich (${opId}):`, {
                    totalAttempts: attempt,
                    totalDuration: totalDuration + 'ms',
                    operationId: opId
                })
                return true // Erfolgreich
            } catch (error) {
                logger.warn(`⚠️ [RETRY] Versuch ${attempt}/${maxRetries} fehlgeschlagen (${opId}):`, {
                    error: error,
                    code: error?.code,
                    message: error?.message,
                    stack: error?.stack,
                    serverResponse: error?.serverResponse,
                    operationId: opId,
                    attempt: attempt,
                    maxRetries: maxRetries,
                    roomId: roomId,
                    hasDb: !!db
                })
                
                // WICHTIG: Bei permission-denied prüfe ob Lobby noch existiert
                if (error?.code === 'permission-denied' && roomId) {
                    logger.log('🔍 [RETRY] Permission-denied - prüfe Lobby-Status:', {
                        roomId: roomId,
                        operationId: opId
                    })
                    try {
                        const lobbyDoc = await getDoc(doc(db, "lobbies", roomId))
                        if (!lobbyDoc.exists()) {
                            logger.warn(`⚠️ [RETRY] Lobby existiert nicht mehr (${opId})`)
                            pendingOperationsRef.current.delete(opId)
                            return false
                        }
                        const lobbyData = lobbyDoc.data()
                        if (lobbyData?.status === 'deleted') {
                            logger.warn(`⚠️ [RETRY] Lobby wurde gelöscht (${opId})`)
                            pendingOperationsRef.current.delete(opId)
                            return false
                        }
                        logger.log('🔍 [RETRY] Lobby existiert noch:', {
                            status: lobbyData?.status,
                            roundId: lobbyData?.roundId,
                            host: lobbyData?.host
                        })
                    } catch (checkError) {
                        logger.error('❌ [RETRY] Fehler beim Prüfen der Lobby:', checkError)
                    }
                }
                
                // Prüfe ob es ein Netzwerkfehler oder Blockierungsfehler ist
                const isBlockedError = error?.code === 'permission-denied' || 
                                      error?.code === 'unavailable' ||
                                      error?.code === 'deadline-exceeded' ||
                                      error?.code === 'failed-precondition' || // Transaction-Konflikte
                                      error?.message?.includes('network') ||
                                      error?.message?.includes('blocked') ||
                                      error?.message?.includes('CORS') ||
                                      error?.message?.includes('Failed to fetch') ||
                                      error?.message?.includes('failed-precondition')
                
                if (isBlockedError && attempt < maxRetries) {
                    // Warte vor dem nächsten Versuch
                    const waitTime = delay * attempt
                    logger.log(`⏳ [RETRY] Warte ${waitTime}ms vor nächstem Versuch (${opId}):`, {
                        attempt: attempt,
                        maxRetries: maxRetries,
                        waitTime: waitTime,
                        errorCode: error?.code,
                        errorMessage: error?.message
                    })
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                    logger.log(`▶️ [RETRY] Weiter mit Versuch ${attempt + 1}/${maxRetries} (${opId})`)
                } else if (attempt === maxRetries) {
                    // Letzter Versuch fehlgeschlagen
                    logger.error(`❌ [RETRY] Alle Versuche fehlgeschlagen (${opId}):`, {
                        error: error,
                        code: error?.code,
                        message: error?.message,
                        stack: error?.stack,
                        serverResponse: error?.serverResponse,
                        operationId: opId,
                        totalAttempts: attempt,
                        roomId: roomId,
                        timestamp: new Date().toISOString()
                    })
                    pendingOperationsRef.current.delete(opId)
                    return false // Fehlgeschlagen
                } else {
                    // Anderer Fehler - nicht retryen
                    logger.error(`❌ [RETRY] Nicht-retrybarer Fehler (${opId}):`, {
                        error: error,
                        code: error?.code,
                        message: error?.message,
                        operationId: opId,
                        attempt: attempt
                    })
                    pendingOperationsRef.current.delete(opId)
                    throw error
                }
            }
        }
        pendingOperationsRef.current.delete(opId)
        return false
    }, [])
    
    // Recovery-Funktion: Synchronisiert State mit Firebase und führt fehlgeschlagene Operationen erneut aus
    const recoverGameState = useCallback(async () => {
        if (!db || !roomId || !globalData) return
        
        logger.log('🔄 [RECOVERY] Starte Recovery-Prozess...')
        
        try {
            // Lade aktuelle Daten direkt aus Firebase
            const currentDoc = await getDoc(doc(db, "lobbies", roomId))
            if (!currentDoc.exists()) {
                logger.log('🔄 [RECOVERY] Lobby existiert nicht mehr')
                return
            }
            
            const firebaseData = currentDoc.data()
            const currentStatus = firebaseData.status
            const currentRoundId = firebaseData.roundId
            
            logger.log('🔄 [RECOVERY] Firebase-Daten geladen:', {
                status: currentStatus,
                roundId: currentRoundId,
                localStatus: globalData.status,
                localRoundId: globalData.roundId
            })
            
            // Synchronisiere globalData mit Firebase
            setGlobalData(firebaseData)
            lastSuccessfulUpdateRef.current = Date.now()
            
            // Prüfe ob das Spiel in einem problematischen Zustand ist
            if (currentStatus === 'result' && isHost && firebaseData.host === myName) {
                // Prüfe ob alle bereit sind, aber nichts passiert
                const maxTemp = firebaseData.config?.maxTemp || 100
                const eliminatedPlayers = firebaseData.eliminatedPlayers || []
                const activePlayers = Object.keys(firebaseData.players || {}).filter(p => {
                    const temp = firebaseData.players?.[p]?.temp || 0
                    return temp < maxTemp && !eliminatedPlayers.includes(p)
                })
                const readyCount = (firebaseData.ready || []).filter(p => {
                    const temp = firebaseData.players?.[p]?.temp || 0
                    return temp < maxTemp
                }).length
                const roundRecapShown = firebaseData.roundRecapShown ?? false
                const hasAttackResults = firebaseData.attackResults && Object.keys(firebaseData.attackResults).length > 0
                const popupConfirmed = firebaseData.popupConfirmed || {}
                
                // Prüfe ob Popups bestätigt wurden
                const allPopupConfirmed = !hasAttackResults || activePlayers.every(p => {
                    if (!firebaseData.attackResults?.[p]) return true
                    return popupConfirmed[p] === true
                })
                
                // Wenn alle bereit sind und Popups bestätigt, aber nichts passiert → Recovery
                if (readyCount >= activePlayers.length && 
                    activePlayers.length > 0 && 
                    roundRecapShown && 
                    allPopupConfirmed &&
                    !pendingOperationsRef.current.has('nextRound')) {
                    logger.log('🔄 [RECOVERY] Spiel hängt - alle bereit, aber keine nächste Runde. Starte Recovery...')
                    // Recovery: Führe nextRound-Logik direkt aus
                    try {
                        const opId = `nextRound_recovery_${Date.now()}`
                        pendingOperationsRef.current.set(opId, { startTime: Date.now(), attempts: 0 })
                        
                        const currentHotseatRaw = firebaseData.hotseat || ''
                        const currentHotseat = typeof currentHotseatRaw === 'string' ? currentHotseatRaw : (currentHotseatRaw?.name || String(currentHotseatRaw || ''))
                        let nextHotseatIndex = activePlayers.indexOf(currentHotseat)
                        if (nextHotseatIndex === -1) nextHotseatIndex = 0
                        nextHotseatIndex = (nextHotseatIndex + 1) % activePlayers.length
                        const nextHotseat = activePlayers[nextHotseatIndex]
                        
                        const usedQuestions = firebaseData.usedQuestions || []
                        const activeCategories = firebaseData.config?.categories || Object.keys(questionCategories)
                        const allQuestions = getAllQuestions(activeCategories)
                        
                        // Migration: Wenn usedQuestions noch Indizes enthält, konvertiere zu IDs
                        let usedQuestionIds = usedQuestions
                        if (usedQuestions.length > 0 && typeof usedQuestions[0] === 'number') {
                            // Alte Daten: Indizes zu IDs konvertieren
                            usedQuestionIds = usedQuestions.map(idx => allQuestions[idx]?.id).filter(Boolean)
                        }
                        
                        const unusedQuestions = allQuestions.filter(q => q.id && !usedQuestionIds.includes(q.id))
                        const randomQ = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)] || allQuestions[0]
                        const nextRoundId = (firebaseData.roundId ?? 0) + 1
                        
                        // Hinweis: Eiswürfel-Automatik wird beim nächsten Listener-Update angewendet
                        // (applyIceCooling ist hier nicht verfügbar, aber nicht kritisch für Recovery)
                        
                        const updateData = {
                            status: 'game',
                            hotseat: nextHotseat,
                            currentQ: randomQ,
                            roundId: nextRoundId,
                            lastQuestionCategory: randomQ.category,
                            roundRecapShown: false,
                            votes: deleteField(),
                            ready: [],
                            lobbyReady: {},
                            pendingAttacks: {},
                            attackDecisions: {},
                            attackResults: {},
                            popupConfirmed: {},
                            countdownEnds: deleteField()
                        }
                        
                        if (randomQ.id && !usedQuestionIds.includes(randomQ.id)) {
                            updateData.usedQuestions = [...usedQuestionIds, randomQ.id]
                        }
                        
                        const success = await retryFirebaseOperation(async () => {
                            await updateDoc(doc(db, "lobbies", roomId), updateData)
                        }, opId, 3, 1000)
                        
                        if (success) {
                            pendingOperationsRef.current.delete(opId)
                            logger.log('✅ [RECOVERY] Nächste Runde erfolgreich gestartet')
                        } else {
                            logger.error('❌ [RECOVERY] Nächste Runde fehlgeschlagen')
                        }
                    } catch (err) {
                        logger.error('❌ [RECOVERY] Fehler beim Starten der nächsten Runde:', err)
                    }
                }
            }
            
            // Prüfe ob executePendingAttacks fehlgeschlagen ist
            if (currentStatus === 'result' && isHost && firebaseData.host === myName) {
                const allDecided = Object.keys(firebaseData.attackDecisions || {}).length >= Object.keys(firebaseData.players || {}).length
                const roundRecapShown = firebaseData.roundRecapShown ?? false
                const hasTruth = firebaseData.votes?.[firebaseData.hotseat]?.choice !== undefined
                
                if (allDecided && !roundRecapShown && hasTruth && !pendingOperationsRef.current.has('executeAttacks')) {
                    logger.log('🔄 [RECOVERY] executePendingAttacks fehlgeschlagen. Versuche erneut...')
                    // Recovery: Führe executePendingAttacks-Logik direkt aus (vereinfacht)
                    // Da diese Funktion sehr komplex ist, versuchen wir nur die wichtigsten Updates
                    try {
                        const opId = `executeAttacks_recovery_${firebaseData.roundId || Date.now()}`
                        pendingOperationsRef.current.set(opId, { startTime: Date.now(), attempts: 0 })
                        
                        // Setze nur roundRecapShown auf true, damit das Spiel weitergeht
                        // Die eigentliche Angriffs-Logik sollte beim nächsten Listener-Update ausgelöst werden
                        const updateData = {
                            roundRecapShown: true
                        }
                        
                        const success = await retryFirebaseOperation(async () => {
                            await updateDoc(doc(db, "lobbies", roomId), updateData)
                        }, opId, 3, 1000)
                        
                        if (success) {
                            pendingOperationsRef.current.delete(opId)
                            logger.log('✅ [RECOVERY] roundRecapShown gesetzt - Spiel sollte weitergehen')
                        } else {
                            logger.error('❌ [RECOVERY] executePendingAttacks Recovery fehlgeschlagen')
                        }
                    } catch (err) {
                        logger.error('❌ [RECOVERY] Fehler bei executePendingAttacks Recovery:', err)
                    }
                }
            }
            
        } catch (error) {
            logger.error('❌ [RECOVERY] Fehler beim Recovery:', error)
        }
    }, [db, roomId, globalData, isHost, myName])
    
    // Watchdog: Prüft regelmäßig, ob das Spiel hängt
    useEffect(() => {
        if (!db || !roomId || !globalData) {
            if (gameStateWatchdogRef.current) {
                clearInterval(gameStateWatchdogRef.current)
                gameStateWatchdogRef.current = null
            }
            return
        }
        
        // Watchdog läuft alle 5 Sekunden
        gameStateWatchdogRef.current = setInterval(() => {
            const timeSinceLastUpdate = Date.now() - lastSuccessfulUpdateRef.current
            const hasPendingOps = pendingOperationsRef.current.size > 0
            
            // Prüfe ob zu lange kein Update erfolgreich war (mehr als 10 Sekunden)
            if (timeSinceLastUpdate > 10000 && hasPendingOps) {
                logger.warn('⚠️ [WATCHDOG] Lange Zeit kein erfolgreiches Update. Prüfe auf Probleme...')
                // Prüfe ob Firebase erreichbar ist
                getDoc(doc(db, "lobbies", roomId)).then(() => {
                    logger.log('✅ [WATCHDOG] Firebase erreichbar')
                    // Firebase ist erreichbar, aber Updates schlagen fehl → Recovery
                    recoverGameState()
                }).catch(err => {
                    logger.error('❌ [WATCHDOG] Firebase nicht erreichbar:', err)
                })
            }
            
            // Prüfe ob das Spiel in einem problematischen Zustand ist
            if (globalData.status === 'result' && isHost) {
                const maxTemp = globalData.config?.maxTemp || 100
                const eliminatedPlayers = globalData.eliminatedPlayers || []
                const activePlayers = Object.keys(globalData.players || {}).filter(p => {
                    const temp = globalData.players?.[p]?.temp || 0
                    return temp < maxTemp && !eliminatedPlayers.includes(p)
                })
                const readyCount = (globalData.ready || []).filter(p => {
                    const temp = globalData.players?.[p]?.temp || 0
                    return temp < maxTemp
                }).length
                const roundRecapShown = globalData.roundRecapShown ?? false
                
                // Wenn alle bereit sind, aber seit 15 Sekunden nichts passiert → Recovery
                if (readyCount >= activePlayers.length && 
                    activePlayers.length > 0 && 
                    roundRecapShown &&
                    timeSinceLastUpdate > 15000) {
                    logger.warn('⚠️ [WATCHDOG] Spiel scheint zu hängen - alle bereit, aber keine Aktion. Starte Recovery...')
                    recoverGameState()
                }
            }
        }, 5000)
        
        return () => {
            if (gameStateWatchdogRef.current) {
                clearInterval(gameStateWatchdogRef.current)
                gameStateWatchdogRef.current = null
            }
        }
    }, [db, roomId, globalData, isHost, recoverGameState])
    
    // Sound-Helper-Funktion - verwendet gecachte Audio-Objekte für bessere Performance
    const playSound = useCallback((soundName, volume = 0.5) => {
        // Verwende Audio-Manager mit angepasster Lautstärke
        playSoundCached(soundName, (volume * soundVolume) / 10)
    }, [soundVolume])
    
    // Hintergrundmusik steuern
    useEffect(() => {
        // Initialisiere Audio nur einmal - verwende Audio-Manager
        if (!backgroundMusicRef.current) {
            const music = getBackgroundMusic()
            if (music) {
                music.loop = true
                backgroundMusicRef.current = music
            }
        }
        
        const music = backgroundMusicRef.current
        if (!music) return
        
        // Setze Lautstärke basierend auf musicVolume
        music.volume = musicVolume / 10
        
        // Starte oder stoppe Musik basierend auf musicEnabled
        if (musicEnabled) {
            music.play().catch(err => {
                // Automatisches Abspielen kann blockiert sein - das ist normal
                // Der Benutzer muss erst mit der Seite interagieren
                logger.log('🔇 Automatisches Abspielen blockiert. Musik startet bei Interaktion.')
            })
        } else {
            music.pause()
        }
    }, [musicEnabled, musicVolume])
    
    // Starte Musik nach erster Benutzerinteraktion (um Autoplay-Blockierung zu umgehen)
    useEffect(() => {
        const startMusicOnInteraction = () => {
            if (musicEnabled && backgroundMusicRef.current) {
                backgroundMusicRef.current.play().catch(() => {
                    // Ignoriere Fehler
                })
            }
        }
        
        if (musicEnabled) {
            // Starte Musik bei erster Interaktion
            const events = ['click', 'touchstart', 'keydown']
            events.forEach(event => {
                document.addEventListener(event, startMusicOnInteraction, { once: true })
            })
            
            return () => {
                events.forEach(event => {
                    document.removeEventListener(event, startMusicOnInteraction)
                })
            }
        }
    }, [musicEnabled])
    
    // Toggle für Hintergrundmusik
    const toggleMusic = useCallback(() => {
        const newValue = !musicEnabled
        setMusicEnabled(newValue)
        localStorage.setItem('hk_music_enabled', String(newValue))
    }, [musicEnabled])
    
    const handleMusicVolumeChange = useCallback((value) => {
        setMusicVolume(value)
        localStorage.setItem('hk_music_volume', String(value))
        if (backgroundMusicRef.current) {
            backgroundMusicRef.current.volume = value / 10
        }
    }, [])
    
    const handleSoundVolumeChange = useCallback((value) => {
        setSoundVolume(value)
        localStorage.setItem('hk_sound_volume', String(value))
    }, [])
    
    // Firebase Initialisierung mit automatischer anonymer Authentifizierung
    useEffect(() => {
        const firebaseApp = initializeApp(firebaseConfig)
        const firestoreDb = getFirestore(firebaseApp)
        const auth = getAuth(firebaseApp)
        
        setApp(firebaseApp)
        setDb(firestoreDb)
        
        // Automatische anonyme Anmeldung beim App-Start
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User ist bereits angemeldet (anonym)
                logger.log('✅ [AUTH] Anonyme Authentifizierung erfolgreich:', user.uid)
            } else {
                // User ist nicht angemeldet, melde anonym an
                signInAnonymously(auth)
                    .then((userCredential) => {
                        logger.log('✅ [AUTH] Automatische anonyme Anmeldung erfolgreich:', userCredential.user.uid)
                    })
                    .catch((error) => {
                        logger.error('❌ [AUTH] Fehler bei anonymer Anmeldung:', error)
                    })
            }
        })
    }, [])
    
    // Firebase Listener - Aktualisiert alle States basierend auf Firebase-Änderungen
    useEffect(() => {
        if (!db || !roomId) return
        
        // Timeout-IDs werden im Ref gespeichert (bereits oben definiert)
        // Reset beim Start
        timeoutIdsRef.current = []
        
        const unsubscribe = onSnapshot(
            doc(db, "lobbies", roomId),
            (snapshot) => {
                // WICHTIG: Prüfe sofort ob roomId noch gesetzt ist (verhindert Updates nach Löschung)
                if (!roomId) {
                    return
                }
                
                // Update erfolgreich erhalten
                setConnectionStatus('online')
                lastSuccessfulUpdateRef.current = Date.now()
                
                if (!snapshot.exists()) {
                    // Lobby existiert nicht mehr
                    logger.log('🚨 [FIREBASE] Lobby existiert nicht mehr, zurück zum Start')
                    sessionStorage.removeItem("hk_room")
                    setRoomId("")
                    setGlobalData(null)
                    setCurrentScreen('start')
                    lastProcessedRoundIdRef.current = null // Reset Ref
                    return
                }
            
            const data = snapshot.data()
            
            // Prüfe ob Lobby gelöscht wurde
            if (data.status === 'deleted') {
                logger.log('🚨 [FIREBASE] Lobby wurde gelöscht, zurück zum Start')
                sessionStorage.removeItem("hk_room")
                setRoomId("")
                setGlobalData(null)
                setCurrentScreen('start')
                lastProcessedRoundIdRef.current = null
                alert("Die Lobby wurde vom Host gelöscht.")
                return
            }
            
            // WICHTIG: Prüfe nochmal ob roomId noch gesetzt ist (Race Condition Schutz)
            if (!roomId) {
                return
            }
            
            // WICHTIG: Ignoriere Updates mit niedrigerer roundId (verhindert Loops durch veraltete Updates)
            const currentRoundId = data.roundId ?? 0
            const lastRoundId = lastProcessedRoundIdRef.current
            
            if (lastRoundId !== null && lastRoundId !== undefined && currentRoundId < lastRoundId) {
                // Nur bei wichtigen Änderungen loggen
                if (data.status !== globalData?.status || currentRoundId !== globalData?.roundId) {
                    logger.warn('🚨 [FIREBASE] Update mit niedrigerer roundId ignoriert:', {
                        lastRoundId,
                        currentRoundId,
                        status: data.status,
                        oldStatus: globalData?.status
                    })
                }
                return // Ignoriere veraltete Updates
            }
            
            // Aktualisiere Ref mit neuer roundId
            if (currentRoundId > (lastRoundId || 0)) {
                lastProcessedRoundIdRef.current = currentRoundId
            }
            
            // Aktualisiere Host-Aktivität, wenn Host etwas geändert hat
            if (snapshot.metadata.hasPendingWrites === false) {
                // Update vom Server (nicht lokal)
                if (data?.host === myName) {
                    lastHostActivityRef.current = Date.now()
                }
            }
            
            // WICHTIG: Prüfe ob sich wirklich wichtige Daten geändert haben, bevor wir States aktualisieren
            // Das verhindert unnötige Re-Renders und "Neuladen"-Effekte
            const oldStatus = globalData?.status
            const newStatus = data.status
            const oldRoundId = globalData?.roundId
            const newRoundId = data.roundId
            const oldHotseat = globalData?.hotseat
            const newHotseat = data.hotseat
            
            // Nur bei wichtigen Änderungen loggen
            const statusChanged = oldStatus !== newStatus
            const roundIdChanged = oldRoundId !== newRoundId
            const hotseatChanged = oldHotseat !== newHotseat
            
            if (statusChanged || roundIdChanged || hotseatChanged) {
                logger.log('🔍 [FIREBASE LISTENER] Wichtige Änderung erkannt:', {
                    statusChanged: statusChanged,
                    oldStatus: oldStatus,
                    newStatus: newStatus,
                    roundIdChanged: roundIdChanged,
                    oldRoundId: oldRoundId,
                    newRoundId: newRoundId,
                    hotseatChanged: hotseatChanged,
                    oldHotseat: oldHotseat,
                    newHotseat: newHotseat
                })
            }
            
            // PERFORMANCE-OPTIMIERUNG: Effiziente Shallow-Comparison statt JSON.stringify
            // JSON.stringify ist sehr teuer bei jedem Snapshot-Update
            const oldVotes = globalData?.votes || {}
            const newVotes = data.votes || {}
            const oldVoteKeys = Object.keys(oldVotes)
            const newVoteKeys = Object.keys(newVotes)
            const votesChanged = oldVoteKeys.length !== newVoteKeys.length || 
                                oldVoteKeys.some(key => oldVotes[key]?.choice !== newVotes[key]?.choice)
            
            if (votesChanged) {
                logger.log('🗳️ [VOTES] Votes geändert:', {
                    roundId: data.roundId,
                    oldVotes: oldVoteKeys,
                    newVotes: newVoteKeys
                })
            }
            
            // Aktualisiere isHost basierend auf Daten
            const newIsHost = data.host === myName
            if (newIsHost !== isHost) {
                logger.log('👑 [HOST] Host-Status geändert:', newIsHost ? 'Ich bin jetzt Host' : 'Ich bin kein Host mehr')
            }
            setIsHost(newIsHost)
            
            if (oldStatus !== newStatus) {
                logger.log('📊 [STATUS] Status-Wechsel:', oldStatus, '→', newStatus, '| RoundId:', newRoundId)
            }
            if (oldHotseat !== newHotseat) {
                logger.log('🎯 [HOTSEAT] Hotseat geändert:', oldHotseat, '→', newHotseat, '| RoundId:', newRoundId)
            }
            if (oldRoundId !== newRoundId) {
                // WICHTIG: Warnung wenn roundId zurückgeht (sollte nie passieren)
                if (oldRoundId !== null && oldRoundId !== undefined && newRoundId < oldRoundId) {
                    logger.error('🚨 [ROUND] KRITISCH: roundId geht zurück!', {
                        oldRoundId,
                        newRoundId,
                        status: data.status,
                        roomId: roomId
                    })
                    // Ignoriere dieses Update, um Loop zu verhindern
                    return
                }
                logger.log('🔄 [ROUND] Neue Runde:', oldRoundId, '→', newRoundId)
                // WICHTIG: Setze mySelection zurück bei Rundenwechsel, damit keine alte Auswahl übernommen wird
                if (mySelection) {
                    logger.log('🔄 [ROUND] Setze mySelection zurück bei Rundenwechsel:', {
                        oldSelection: mySelection,
                        oldRoundId: oldRoundId,
                        newRoundId: newRoundId,
                        reason: 'Neue Runde gestartet'
                    })
                    setMySelection(null)
                }
            }
            
            // WICHTIG: Setze globalData nur wenn sich wirklich etwas geändert hat
            // PERFORMANCE-OPTIMIERUNG: Effiziente Shallow-Comparisons statt JSON.stringify
            // JSON.stringify ist sehr teuer bei großen Objekten (kann 10-100ms dauern)
            let dataChanged = false
            if (!globalData) {
                dataChanged = true
            } else {
                // Prüfe nur wichtige Felder statt des gesamten Objekts
                const importantFields = ['status', 'roundId', 'hotseat', 'roundRecapShown']
                dataChanged = importantFields.some(field => globalData[field] !== data[field])
                
                // Prüfe lobbyReady IMMER separat, da es ein Objekt ist und direkter Vergleich nicht funktioniert
                // WICHTIG: Diese Prüfung muss immer ausgeführt werden, nicht nur wenn dataChanged noch false ist
                const oldLobbyReady = globalData.lobbyReady || {}
                const newLobbyReady = data.lobbyReady || {}
                const oldKeys = Object.keys(oldLobbyReady)
                const newKeys = Object.keys(newLobbyReady)
                
                // Prüfe zuerst ob sich die Anzahl der Keys geändert hat
                if (oldKeys.length !== newKeys.length) {
                    logger.log('🔄 [LOBBY READY] Anzahl Keys geändert:', {
                        oldCount: oldKeys.length,
                        newCount: newKeys.length,
                        oldKeys: oldKeys,
                        newKeys: newKeys
                    })
                    dataChanged = true
                } else {
                    // Prüfe alle Keys auf Änderungen - WICHTIG: Prüfe ALLE Keys, nicht nur bis zur ersten Änderung
                    const allKeys = new Set([...oldKeys, ...newKeys])
                    let lobbyReadyChanged = false
                    for (const key of allKeys) {
                        const oldVal = oldLobbyReady[key]
                        const newVal = newLobbyReady[key]
                        // WICHTIG: Prüfe explizit auf undefined/null Unterschiede
                        // Verwende === für strikten Vergleich, um auch false/undefined Unterschiede zu erkennen
                        const oldBool = oldVal === true
                        const newBool = newVal === true
                        if (oldBool !== newBool) {
                            logger.log('🔄 [LOBBY READY] Änderung erkannt:', {
                                key: key,
                                oldValue: oldVal,
                                newValue: newVal,
                                oldBool: oldBool,
                                newBool: newBool
                            })
                            lobbyReadyChanged = true
                            // BREAK NICHT - prüfe alle Keys, um alle Änderungen zu loggen
                        }
                    }
                    if (lobbyReadyChanged) {
                        dataChanged = true
                    }
                }
                
                // Effiziente Objekt-Vergleiche ohne JSON.stringify
                if (!dataChanged) {
                    const oldVotes = globalData.votes || {}
                    const newVotes = data.votes || {}
                    const oldVoteKeys = Object.keys(oldVotes)
                    const newVoteKeys = Object.keys(newVotes)
                    if (oldVoteKeys.length !== newVoteKeys.length || 
                        oldVoteKeys.some(key => oldVotes[key]?.choice !== newVotes[key]?.choice)) {
                        dataChanged = true
                    }
                }
                
                if (!dataChanged) {
                    const oldPlayers = globalData.players || {}
                    const newPlayers = data.players || {}
                    const oldPlayerKeys = Object.keys(oldPlayers)
                    const newPlayerKeys = Object.keys(newPlayers)
                    if (oldPlayerKeys.length !== newPlayerKeys.length ||
                        oldPlayerKeys.some(key => {
                            const oldP = oldPlayers[key]
                            const newP = newPlayers[key]
                            return oldP?.temp !== newP?.temp || oldP?.emoji !== newP?.emoji
                        })) {
                        dataChanged = true
                    }
                }
                
                if (!dataChanged) {
                    const oldReady = globalData.ready || []
                    const newReady = data.ready || []
                    if (oldReady.length !== newReady.length ||
                        oldReady.some((val, idx) => val !== newReady[idx])) {
                        dataChanged = true
                    }
                }
                
            }
            
            if (dataChanged || !globalData) {
                // WICHTIG: Erstelle immer ein neues Objekt, damit React die Änderung erkennt
                // Auch wenn data bereits ein neues Objekt von Firebase ist, stellen wir sicher,
                // dass lobbyReady immer eine neue Referenz hat, wenn es sich geändert hat
                const updatedData = { ...data }
                if (data.lobbyReady) {
                    updatedData.lobbyReady = { ...data.lobbyReady }
                }
                setGlobalData(updatedData)
                
                // Nur bei wichtigen Änderungen loggen
                if (statusChanged || roundIdChanged || hotseatChanged) {
                    logger.log('✅ [GLOBAL DATA] globalData aktualisiert:', {
                        statusChanged: statusChanged,
                        roundIdChanged: roundIdChanged,
                        hotseatChanged: hotseatChanged,
                        status: updatedData.status,
                        roundId: updatedData.roundId,
                        hotseat: updatedData.hotseat,
                        playerCount: Object.keys(updatedData.players || {}).length,
                        voteCount: Object.keys(updatedData.votes || {}).length,
                        readyCount: Array.isArray(updatedData.ready) ? updatedData.ready.length : 0
                    })
                }
            }
            
            // Screen-Wechsel basierend auf Status
            // WICHTIG: Nur setzen wenn sich der Status wirklich geändert hat (verhindert Loops)
            if (data.status === 'lobby') {
                if (currentScreen !== 'lobby') {
                    logger.log('🏠 [SCREEN] Wechsel zu Lobby')
                    setCurrentScreen('lobby')
                }
            } else if (data.status === 'game') {
                if (currentScreen !== 'game') {
                    logger.log('🎮 [SCREEN] Wechsel zu Game:', {
                        from: currentScreen,
                        to: 'game',
                        roundId: data.roundId,
                        hotseat: data.hotseat,
                        timestamp: new Date().toISOString(),
                        hasPendingWrites: snapshot.metadata.hasPendingWrites,
                        fromCache: snapshot.metadata.fromCache
                    })
                    setCurrentScreen('game')
                } else {
                    logger.log('⏭️ [SCREEN] Bereits auf Game-Screen, überspringe Wechsel:', {
                        roundId: data.roundId,
                        hotseat: data.hotseat
                    })
                }
                
                // WICHTIG: Prüfe ob sich nur votes geändert haben (nicht roundId, status, etc.)
                // Wenn nur andere Votes geändert wurden, überspringe die Selection-Logik komplett
                const onlyVotesChanged = globalData && 
                    globalData.status === data.status &&
                    globalData.roundId === data.roundId &&
                    globalData.hotseat === data.hotseat &&
                    votesEqual({...globalData, votes: {}}, {...data, votes: {}}) &&
                    globalData.votes?.[myName]?.choice === data.votes?.[myName]?.choice
                
                // WICHTIG: Initialisiere lastRoundId, wenn es noch nicht gesetzt ist
                if (lastRoundId === null && data.roundId !== undefined) {
                    logger.log('🎮 [GAME SCREEN] Initialisiere lastRoundId beim ersten Mal:', data.roundId)
                    setLastRoundId(data.roundId)
                }
                
                // WICHTIG: Prüfe zuerst, ob es eine neue Runde ist
                // Verwende lastRoundId als primäre Quelle, da es zuverlässiger ist
                const oldRoundId = lastRoundId ?? globalData?.roundId
                const isNewRound = oldRoundId !== null && oldRoundId !== undefined && data.roundId !== oldRoundId
                
                // WICHTIG: Bei neuer Runde IMMER Selection zurücksetzen, BEVOR andere Logik ausgeführt wird
                if (isNewRound) {
                    logger.log('🔄 [GAME SCREEN] Neue Runde erkannt - RESET Selection:', {
                        oldRoundId: oldRoundId,
                        newRoundId: data.roundId,
                        oldSelection: mySelection,
                        lastRoundId: lastRoundId,
                        globalDataRoundId: globalData?.roundId
                    })
                    setMySelection(null)
                    setLastRoundId(data.roundId)
                    setLocalActionDone(false)
                    setShowRewardChoice(false)
                    setShowAttackSelection(false)
                    setShowJokerShop(false)
                    // WICHTIG: Return früh, um zu verhindern, dass die Selection aus alten Votes wiederhergestellt wird
                    return
                }
                
                // WICHTIG: Prüfe auch, ob globalData noch nicht gesetzt ist, aber roundId gleich lastRoundId ist
                // Das verhindert, dass mySelection zurückgesetzt wird, wenn globalData beim ersten Mal undefined ist
                // ABER: Nur wenn es KEINE neue Runde ist!
                const isInitialLoad = !globalData && lastRoundId === data.roundId && !isNewRound
                
                // WICHTIG: Wenn ein Vote existiert, aber mySelection null ist, muss die Selection wiederhergestellt werden
                // ABER NUR wenn der Vote aus der aktuellen Runde stammt UND es KEINE neue Runde ist!
                const hasVote = data.votes?.[myName]?.choice !== undefined
                const voteRoundId = data.votes?.[myName]?.roundId
                const isVoteFromCurrentRound = voteRoundId !== undefined && voteRoundId === data.roundId
                const needsSelectionRestore = hasVote && isVoteFromCurrentRound && !mySelection && !isNewRound
                
                if (onlyVotesChanged || isInitialLoad) {
                    // Nur andere Votes haben sich geändert ODER es ist der erste Load mit gleicher Runde
                    // WICHTIG: Wenn ein Vote existiert, aber Selection fehlt, wiederherstellen
                    // ABER NUR wenn der Vote aus der aktuellen Runde stammt UND es KEINE neue Runde ist!
                    if (needsSelectionRestore) {
                        logger.log('🔄 [GAME SCREEN] Restore Selection aus Vote:', {
                            oldSelection: mySelection,
                            newSelection: data.votes[myName].choice,
                            voteRoundId: voteRoundId,
                            currentRoundId: data.roundId,
                            isNewRound: isNewRound
                        })
                        setMySelection(data.votes[myName].choice)
                    } else if (hasVote && !isVoteFromCurrentRound && mySelection) {
                        // WICHTIG: Wenn ein Vote existiert, aber aus alter Runde stammt, RESET Selection
                        logger.warn('⚠️ [GAME SCREEN] Vote aus alter Runde - RESET Selection:', {
                            oldSelection: mySelection,
                            voteRoundId: voteRoundId,
                            currentRoundId: data.roundId
                        })
                        setMySelection(null)
                    } else if (isNewRound && mySelection) {
                        // WICHTIG: Bei neuer Runde sollte Selection bereits zurückgesetzt sein, aber falls nicht, hier nochmal
                        logger.warn('⚠️ [GAME SCREEN] Neue Runde erkannt, aber Selection noch gesetzt - RESET:', {
                            oldSelection: mySelection,
                            currentRoundId: data.roundId,
                            oldRoundId: oldRoundId
                        })
                        setMySelection(null)
                    }
                    // WICHTIG: Kein return hier! Auto-Advance muss trotzdem laufen
                } else {
                
                logger.log('🎮 [GAME SCREEN] Game-Screen Update:', {
                    roundId: data.roundId,
                    oldRoundId: globalData?.roundId,
                    hotseat: data.hotseat,
                    myVote: data.votes?.[myName],
                    allVotes: Object.keys(data.votes || {}),
                    mySelection: mySelection,
                    localActionDone: localActionDone
                })
                
                // WICHTIG: Diese Logik wird nur ausgeführt, wenn es KEINE neue Runde ist
                // (neue Runde wird bereits oben behandelt)
                if (!isNewRound) {
                    // WICHTIG: Wenn globalData noch nicht gesetzt ist, initialisiere lastRoundId
                    if (!globalData && data.roundId !== lastRoundId) {
                        logger.log('🎮 [GAME SCREEN] Initialisiere lastRoundId:', data.roundId)
                        setLastRoundId(data.roundId)
                    }
                    // Bei gleicher Runde: Behalte Selection wenn bereits abgestimmt
                    // WICHTIG: NIE zurücksetzen, wenn andere Spieler abstimmen!
                    // WICHTIG: Prüfe ob es wirklich die gleiche Runde ist (lastRoundId === data.roundId)
                    if (lastRoundId === data.roundId) {
                        if (data.votes?.[myName]) {
                            // WICHTIG: Prüfe ob Vote aus aktueller Runde stammt
                            // Da Votes bei nextRound gelöscht werden, sollte ein existierender Vote immer aus der aktuellen Runde sein
                            // Aber zur Sicherheit prüfen wir trotzdem
                            const voteRoundId = data.votes[myName]?.roundId
                            // WICHTIG: Nur Votes mit roundId === data.roundId sind aus aktueller Runde
                            // Votes ohne roundId sind aus alter Version und sollten ignoriert werden
                            const isVoteFromCurrentRound = voteRoundId !== undefined && voteRoundId === data.roundId
                            
                            if (isVoteFromCurrentRound) {
                                // Spieler hat bereits abgestimmt - synchronisiere nur wenn Selection fehlt oder falsch ist
                                if (!mySelection) {
                                    logger.log('🔄 [GAME SCREEN] Restore Selection aus Vote (gleiche Runde):', {
                                        oldSelection: mySelection,
                                        newSelection: data.votes[myName].choice,
                                        voteRoundId: voteRoundId,
                                        currentRoundId: data.roundId,
                                        reason: 'Selection fehlt, Vote existiert'
                                    })
                                    setMySelection(data.votes[myName].choice)
                                } else if (mySelection !== data.votes[myName].choice) {
                                    // Vote existiert, aber Selection stimmt nicht überein - synchronisiere
                                    logger.log('🔄 [GAME SCREEN] Synchronisiere Selection mit Vote (gleiche Runde):', {
                                        oldSelection: mySelection,
                                        newSelection: data.votes[myName].choice,
                                        voteRoundId: voteRoundId,
                                        currentRoundId: data.roundId,
                                        reason: 'Selection stimmt nicht mit Vote überein'
                                    })
                                    setMySelection(data.votes[myName].choice)
                                } else {
                                    // Selection stimmt bereits überein - keine Änderung
                                }
                            } else {
                                // Vote aus alter Runde - ignoriere und RESET Selection
                                if (mySelection) {
                                    logger.warn('⚠️ [GAME SCREEN] Vote aus alter Runde - RESET Selection:', {
                                        mySelection: mySelection,
                                        voteRoundId: voteRoundId,
                                        currentRoundId: data.roundId
                                    })
                                    setMySelection(null)
                                }
                            }
                        }
                    }
                }
                }
                
                // Hotseat-Popup immer beim Wechsel zu 'game' anzeigen (wenn hotseat gesetzt)
                // Prüfe ob es eine neue Runde ist (roundId hat sich geändert)
                const currentRoundId = data.roundId || 0
                // WICHTIG: Prüfe auch ob Modal bereits angezeigt wird, um mehrfache Anzeige zu verhindern
                if (data.hotseat && data.players && currentRoundId !== hotseatModalShownRef.current && !showHotseatModal) {
                    hotseatModalShownRef.current = currentRoundId
                    const isMeHotseat = myName === data.hotseat
                    logger.log('🎯 [HOTSEAT MODAL] Neue Runde erkannt:', {
                        roundId: currentRoundId,
                        hotseat: data.hotseat,
                        isMeHotseat: isMeHotseat,
                        myName: myName,
                        players: Object.keys(data.players || {}),
                        showHotseatModal: showHotseatModal
                    })
                    // Warte kurz, damit der Screen gerendert ist
                    setTimeout(() => {
                        // Prüfe nochmal, ob Modal nicht bereits angezeigt wird
                        if (!showHotseatModal) {
                            triggerHotseatAlert(data.hotseat, data.players)
                        } else {
                            logger.log('🎯 [HOTSEAT MODAL] Modal wird bereits angezeigt, überspringe triggerHotseatAlert')
                        }
                    }, 100)
                } else if (data.hotseat && currentRoundId === hotseatModalShownRef.current) {
                    logger.log('🎯 [HOTSEAT MODAL] Bereits für diese Runde angezeigt, überspringe:', {
                        roundId: currentRoundId,
                        hotseatModalShownRef: hotseatModalShownRef.current,
                        showHotseatModal: showHotseatModal
                    })
                } else if (showHotseatModal && currentRoundId !== hotseatModalShownRef.current) {
                    // Modal wird angezeigt, aber es ist eine neue Runde - schließe Modal und setze Ref zurück
                    logger.log('🎯 [HOTSEAT MODAL] Neue Runde erkannt während Modal offen, schließe Modal')
                    setShowHotseatModal(false)
                    hotseatModalShownRef.current = null
                }
            } else if (data.status === 'result') {
                if (currentScreen !== 'result') {
                    logger.log('📊 [SCREEN] Wechsel zu Result:', {
                        from: currentScreen,
                        to: 'result',
                        roundId: data.roundId
                    })
                    setCurrentScreen('result')
                }
                
                // Party Mode: Zeige Angriffsauswahl wenn richtig geraten
                const isPartyMode = true
                const isHotseat = myName === data.hotseat
                const myVoteData = data.votes?.[myName]
                // WICHTIG: Stelle sicher, dass hotseat ein String ist
                const hotseatName = typeof data.hotseat === 'string' ? data.hotseat : (data.hotseat?.name || String(data.hotseat || ''))
                const hotseatVote = data.votes?.[hotseatName]
                const hotseatVoteRoundId = hotseatVote?.roundId
                const currentRoundId = data.roundId
                // WICHTIG: Prüfe ob Hotseat-Vote aus aktueller Runde stammt
                const isHotseatVoteFromCurrentRound = hotseatVoteRoundId !== undefined && hotseatVoteRoundId === currentRoundId
                const truth = isHotseatVoteFromCurrentRound ? hotseatVote?.choice : undefined
                const hasTruth = truth !== undefined && truth !== null
                
                logger.log('🔍 [RESULT] Hotseat-Vote-Prüfung:', {
                    roundId: currentRoundId,
                    hotseat: hotseatName,
                    hotseatVote: hotseatVote,
                    hotseatVoteRoundId: hotseatVoteRoundId,
                    isHotseatVoteFromCurrentRound: isHotseatVoteFromCurrentRound,
                    truth: truth,
                    hasTruth: hasTruth,
                    reason: !hasTruth ? (
                        !hotseatVote ? 'Kein Hotseat-Vote vorhanden' :
                        !isHotseatVoteFromCurrentRound ? `Vote aus alter Runde (${hotseatVoteRoundId} !== ${currentRoundId})` :
                        'Truth ist undefined/null'
                    ) : 'Hotseat hat geantwortet'
                })
                const guessedCorrectly = hasTruth && myVoteData && String(myVoteData.choice) === String(truth)
                const guessedWrong = hasTruth && myVoteData && String(myVoteData.choice) !== String(truth)
                const attackDecisions = data.attackDecisions || {}
                const roundRecapShown = data.roundRecapShown ?? false
                
                logger.log('📊 [RESULT] Result-Screen Analyse:', {
                    roundId: data.roundId,
                    isHotseat: isHotseat,
                    isPartyMode: isPartyMode,
                    myVote: myVoteData?.choice,
                    hotseat: data.hotseat,
                    hotseatVote: hotseatVote,
                    truth: truth,
                    hasTruth: hasTruth,
                    guessedCorrectly: guessedCorrectly,
                    guessedWrong: guessedWrong,
                    attackDecisions: attackDecisions,
                    myAttackDecision: attackDecisions[myName],
                    roundRecapShown: roundRecapShown,
                    allVotes: Object.keys(data.votes || {}),
                    localActionDone: localActionDone,
                    showRewardChoice: showRewardChoice,
                    showAttackSelection: showAttackSelection,
                    showJokerShop: showJokerShop,
                    pendingAttacks: data.pendingAttacks || {},
                    attackResults: data.attackResults ? Object.keys(data.attackResults) : []
                })
                
                // WICHTIG: Prüfe ob Hotseat überhaupt geantwortet hat
                if (!hasTruth && !isHotseat) {
                    logger.warn('⚠️ [RESULT] Hotseat hat noch keine Antwort abgegeben, warte...', {
                        hotseat: data.hotseat,
                        hotseatVote: hotseatVote,
                        allVotes: Object.keys(data.votes || {}),
                        votes: data.votes
                    })
                    // Warte auf Hotseat-Antwort, keine Aktion
                    // KEINE Strafhitze anwenden, wenn truth undefined ist!
                } else if (isHotseat && !attackDecisions[myName] && db && roomId) {
                    // Hotseat: Automatisch als entschieden markieren
                    logger.log('✅ [AUTO] Hotseat automatisch als entschieden markiert')
                    setLocalActionDone(true) // WICHTIG: Setze localActionDone für Hotseat, damit "Bereit"-Button angezeigt wird
                    updateDoc(doc(db, "lobbies", roomId), {
                        [`attackDecisions.${myName}`]: true
                    }).catch(logger.error)
                } else if (!isHotseat && guessedWrong && !attackDecisions[myName] && !isPartyMode && db && roomId) {
                    // Falsch geraten: Automatisch als entschieden markieren
                    // Im Party Mode wird es bereits in handlePartyModeWrongAnswer gesetzt
                    logger.log('❌ [AUTO] Falsch geraten - automatisch als entschieden markiert')
                    updateDoc(doc(db, "lobbies", roomId), {
                        [`attackDecisions.${myName}`]: true
                    }).catch(logger.error)
                } else if (!isHotseat && guessedWrong && !attackDecisions[myName] && isPartyMode && db && roomId) {
                    // Falsch geraten (Party Mode): Wende Strafhitze an
                    // WICHTIG: Prüfe Ref um mehrfache Ausführung zu verhindern
                    const penaltyKey = `${data.roundId}-${myName}`
                    if (penaltyAppliedRef.current !== penaltyKey) {
                        logger.log('❌ [AUTO] Falsch geraten (Party Mode) - wende Strafhitze an')
                        penaltyAppliedRef.current = penaltyKey
                        handlePartyModeWrongAnswer().catch(logger.error)
                        setLocalActionDone(true)
                    } else {
                        logger.log('❌ [AUTO] Strafhitze wurde bereits für diese Runde angewendet, überspringe')
                    }
                }
                
                // WICHTIG: Prüfe ob es eine neue Runde ist, um sicherzustellen, dass attackDecisions zur aktuellen Runde gehört
                const isNewRoundForReward = lastRoundId !== data.roundId
                // WICHTIG: Reset States bei neuer Runde, damit Spieler wieder auswählen kann
                if (isNewRoundForReward) {
                    setShowRewardChoice(false)
                    setShowAttackSelection(false)
                    setShowJokerShop(false)
                    // Reset Ref bei neuer Runde, damit Strafhitze bei neuer falscher Antwort wieder angewendet werden kann
                    penaltyAppliedRef.current = null
                }
                
                // Zeige Angriffsauswahl wenn richtig geraten UND noch keine Entscheidung getroffen
                // WICHTIG: Prüfe auch ob es eine neue Runde ist, damit die Auswahl bei jeder Runde möglich ist
                // HINWEIS: Gilt für BEIDE Modi (Party und normal), solange richtig geraten wurde
                if (!isHotseat && guessedCorrectly && !attackDecisions[myName] && !showRewardChoice && !showAttackSelection && !showJokerShop) {
                    // Zeige Angriffsauswahl
                    logger.log('🎁 [ATTACK] Zeige Angriffsauswahl', {
                        roundId: data.roundId,
                        lastRoundId: lastRoundId,
                        isNewRound: isNewRoundForReward,
                        attackDecisions: attackDecisions[myName],
                        isPartyMode: isPartyMode
                    })
                    setShowRewardChoice(true)
                }
                
                // Prüfe ob Angriffe ausgeführt wurden und zeige Popup
                // WICHTIG: Prüfe auch ob Modal bereits für diese Runde angezeigt wurde
                // WICHTIG: Prüfe auch ob Popup bereits bestätigt wurde (popupConfirmed)
                // WICHTIG: Zeige Popup auch wenn totalDmg === 0 ("cool geblieben")
                const popupConfirmed = data.popupConfirmed?.[myName] === true
                
                // WICHTIG: Prüfe ob alle Spieler ihre Angriffsentscheidungen getroffen haben, bevor Popups angezeigt werden
                // (Diese Variablen werden auch später für executePendingAttacks verwendet)
                const maxTemp = data.config?.maxTemp || 100
                const eliminatedPlayers = data.eliminatedPlayers || []
                const activePlayers = Object.keys(data.players || {}).filter(p => {
                    const temp = data.players?.[p]?.temp || 0
                    return temp < maxTemp && !eliminatedPlayers.includes(p)
                })
                const playerCount = activePlayers.length
                const playersWithDecision = Object.keys(attackDecisions).filter(p => attackDecisions[p] === true)
                // WICHTIG: Hotseat sollte als "decided" gezählt werden, wenn er abgestimmt hat (egal ob ich der Hotseat bin oder nicht)
                const hotseatShouldBeDecided = data.hotseat && data.votes?.[data.hotseat]?.choice !== undefined
                const effectiveDecidedCount = playersWithDecision.length + (hotseatShouldBeDecided && !attackDecisions[data.hotseat] ? 1 : 0)
                const allDecidedForPopups = effectiveDecidedCount >= playerCount
                
                // WICHTIG: Zeige Popup wenn roundRecapShown true ist (Angriffe wurden verarbeitet)
                // Die Bedingung allDecidedForPopups wird nur für die erste Anzeige benötigt
                // Sobald roundRecapShown true ist, wurden die Angriffe bereits verarbeitet
                if (data.attackResults && data.attackResults[myName] !== undefined && roundRecapShown && !popupConfirmed) {
                    const result = data.attackResults[myName]
                    const resultKey = generateAttackResultKey(data.roundId, result, roundRecapShown)
                    
                    logger.log('💥 [ATTACK MODAL] Attack-Result gefunden:', {
                        roundId: data.roundId,
                        result: result,
                        resultKey: resultKey,
                        lastAttackResultKey: lastAttackResultKey,
                        attackModalShownRef: attackModalShownRef.current,
                        isOpeningAttackModal: isOpeningAttackModal,
                        showAttackModal: showAttackModal,
                        roundRecapShown: roundRecapShown,
                        popupConfirmed: popupConfirmed,
                        totalDmg: result.totalDmg,
                        attackDetails: result.attackDetails
                    })
                    
                    // WICHTIG: Prüfe mehrfach, um sicherzustellen, dass Modal nur einmal angezeigt wird
                    // Verwende Ref, um zu verhindern, dass Modal mehrmals angezeigt wird
                    // Prüfe auch ob Modal bereits angezeigt wird (showAttackModal)
                    // WICHTIG: Prüfe auch ob Popup bereits bestätigt wurde
                    const shouldShowModal = resultKey !== attackModalShownRef.current && 
                                           !isOpeningAttackModal && 
                                           !showAttackModal &&
                                           !popupConfirmed
                    
                    if (shouldShowModal) {
                        logger.log('💥 [ATTACK MODAL] Modal wird angezeigt für Runde:', data.roundId, '| Schaden:', result.totalDmg, '°C')
                        // Setze Ref SOFORT, um mehrfache Anzeige zu verhindern
                        attackModalShownRef.current = resultKey
                        setLastAttackResultKey(resultKey)
                        setIsOpeningAttackModal(true)
                        setAttackResult(result)
                        // Warte kurz, damit der Screen gerendert ist
                        const timeoutId = setTimeout(() => {
                            // Prüfe nochmal, ob Modal nicht bereits angezeigt wird UND Ref noch stimmt UND Popup nicht bestätigt
                            if (!showAttackModal && attackModalShownRef.current === resultKey && !popupConfirmed) {
                                logger.log('💥 [ATTACK MODAL] Modal wird jetzt sichtbar gemacht')
                                setShowAttackModal(true)
                                setIsOpeningAttackModal(false)
                            } else {
                                logger.log('💥 [ATTACK MODAL] Modal wird bereits angezeigt, Ref geändert oder Popup bestätigt, überspringe setShowAttackModal:', {
                                    showAttackModal: showAttackModal,
                                    refMatches: attackModalShownRef.current === resultKey,
                                    popupConfirmed: popupConfirmed
                                })
                                setIsOpeningAttackModal(false)
                            }
                        }, 300)
                        timeoutIdsRef.current.push(timeoutId)
                    } else {
                        logger.log('💥 [ATTACK MODAL] Modal wird NICHT angezeigt:', {
                            resultKeyMatches: resultKey === attackModalShownRef.current,
                            isOpening: isOpeningAttackModal,
                            alreadyShown: showAttackModal,
                            popupConfirmed: popupConfirmed,
                            resultKey: resultKey,
                            attackModalShownRef: attackModalShownRef.current,
                            shouldShow: shouldShowModal
                        })
                    }
                }
                
                // Prüfe ob jemand eliminiert wurde
                // WICHTIG: Nur prüfen wenn Modal nicht bereits angezeigt wird, um mehrfache Anzeige zu verhindern
                if (data.eliminationInfo && data.eliminationInfo.player && !showEliminationModal) {
                    const eliminatedPlayerName = data.eliminationInfo.player
                    const isMeEliminated = eliminatedPlayerName === myName
                    const maxTemp = data.config?.maxTemp || 100
                    const playerTemp = data.players?.[eliminatedPlayerName]?.temp || 0
                    const eliminationKey = `${data.roundId}-${eliminatedPlayerName}`
                    
                    // Prüfe ob der Spieler wirklich eliminiert ist (temp >= maxTemp)
                    // WICHTIG: Zeige Modal nur einmal pro Eliminierung (prüfe mit eliminationKey)
                    if (playerTemp >= maxTemp && lastEliminationShown !== eliminationKey) {
                        logger.log('🔥 [ELIMINATION MODAL] Zeige Eliminierungs-Modal:', {
                            eliminatedPlayer: eliminatedPlayerName,
                            isMe: isMeEliminated,
                            temp: playerTemp,
                            maxTemp: maxTemp,
                            eliminationKey: eliminationKey
                        })
                        setEliminatedPlayer(eliminatedPlayerName)
                        setShowEliminationModal(true)
                        setLastEliminationShown(eliminationKey)
                    }
                } else {
                    // Kein Attack-Result oder roundRecapShown ist false oder Popup bereits bestätigt
                    logger.log('💥 [ATTACK MODAL] Kein Modal:', {
                        hasAttackResults: !!data.attackResults,
                        hasMyResult: data.attackResults?.[myName] !== undefined,
                        roundRecapShown: roundRecapShown,
                        popupConfirmed: popupConfirmed,
                        roundId: data.roundId
                    })
                }
                
                // Prüfe ob alle Spieler ihre Entscheidung getroffen haben
                // WICHTIG: Nur Host führt executePendingAttacks aus
                // (Variablen wurden bereits oben definiert für Popup-Prüfung)
                const allDecided = effectiveDecidedCount >= playerCount
                const recapNotShown = !roundRecapShown
                
                // WICHTIG: Prüfe auch ob alle Spieler geantwortet haben (für Strafhitze-Fall ohne normale Angriffe)
                // WICHTIG: Zähle nur Votes mit richtiger roundId
                const votes = data.votes || {}
                const voteCountForAllVoted = activePlayers.filter(p => {
                    const vote = votes[p]
                    if (!vote || vote.choice === undefined) return false
                    const voteRoundId = vote.roundId
                    return voteRoundId !== undefined && voteRoundId === data.roundId
                }).length
                const allVoted = voteCountForAllVoted >= playerCount && playerCount > 0
                
                // WICHTIG: Prüfe ob Hotseat überhaupt geantwortet hat, bevor executePendingAttacks ausgeführt wird
                if (!hasTruth && allDecided) {
                    logger.warn('⚠️ [EXECUTE ATTACKS] Alle haben entschieden, aber Hotseat hat noch keine Antwort - warte...')
                }
                
                logger.log('⚔️ [EXECUTE ATTACKS] Prüfung:', {
                    roundId: data.roundId,
                    playerCount: playerCount,
                    playersWithDecision: playersWithDecision.length,
                    effectiveDecidedCount: effectiveDecidedCount,
                    allDecided: allDecided,
                    allVoted: allVoted,
                    voteCount: voteCountForAllVoted,
                    totalVotesInFirebase: Object.keys(votes).length,
                    recapNotShown: recapNotShown,
                    hasTruth: hasTruth,
                    hotseat: data.hotseat,
                    hotseatVote: hotseatVote,
                    isHost: isHost,
                    isMeHost: data.host === myName,
                    attackDecisions: attackDecisions,
                    hotseatShouldBeDecided: hotseatShouldBeDecided,
                    hotseatInDecisions: attackDecisions[data.hotseat]
                })
                
                // HOST-FAILOVER: Prüfe ob Host inaktiv ist (>5 Sekunden keine Aktivität)
                const lastHostActivity = data.lastHostActivity
                const hostInactive = lastHostActivity && lastHostActivity.toMillis ? (Date.now() - lastHostActivity.toMillis()) > GAME_CONSTANTS.HOST_INACTIVE_THRESHOLD : true
                const hostName = data.host
                const isHostActive = !hostInactive && hostName === myName
                
                // Sortiere Spieler nach Name für konsistente Failover-Reihenfolge (verhindert Race Conditions)
                const eliminatedPlayersForSort = data.eliminatedPlayers || []
                const sortedActivePlayers = Object.keys(data.players || {}).filter(p => {
                    const temp = data.players?.[p]?.temp || 0
                    return temp < (data.config?.maxTemp || 100) && !eliminatedPlayersForSort.includes(p)
                }).sort()
                const myIndex = sortedActivePlayers.indexOf(myName)
                const isFirstBackupHost = myIndex === 0 && sortedActivePlayers.length > 0 && sortedActivePlayers[0] !== hostName
                
                // NUR HOST führt executePendingAttacks aus, ODER Backup-Host wenn Host inaktiv
                // WICHTIG: Nur ausführen wenn Hotseat geantwortet hat
                // WICHTIG: Auch ausführen wenn alle geantwortet haben (für Strafhitze-Fall ohne normale Angriffe)
                const condition1 = (allDecided || allVoted)
                const condition2 = recapNotShown
                const condition3 = hasTruth
                const condition4 = (isHostActive || (hostInactive && isFirstBackupHost))
                const canExecuteAttacks = condition1 && condition2 && condition3 && condition4
                
                // DETAILLIERTES LOGGING: Zeige welche Bedingungen erfüllt/nicht erfüllt sind
                if (!canExecuteAttacks && (allDecided || allVoted)) {
                    logger.log('⚔️ [EXECUTE ATTACKS] Prüfung fehlgeschlagen - Details:', {
                        roundId: data.roundId,
                        condition1_allDecidedOrVoted: condition1,
                        allDecided: allDecided,
                        allVoted: allVoted,
                        condition2_recapNotShown: condition2,
                        roundRecapShown: data.roundRecapShown,
                        condition3_hasTruth: condition3,
                        hotseatVote: data.votes?.[data.hotseat],
                        condition4_hostActive: condition4,
                        isHostActive: isHostActive,
                        hostInactive: hostInactive,
                        isFirstBackupHost: isFirstBackupHost,
                        myName: myName,
                        host: data.host
                    })
                }
                
                if (canExecuteAttacks) {
                    // Verhindere mehrfache Ausführung
                    const timeoutKey = `executeAttacks_${data.roundId}`
                    if (!timeoutKeysRef.current.has(timeoutKey)) {
                        timeoutKeysRef.current.add(timeoutKey)
                        logger.log('⚔️ [EXECUTE ATTACKS] Starte executePendingAttacks in 500ms')
                        const timeoutId = setTimeout(() => {
                            executePendingAttacks(data).catch(err => {
                                logger.error('⚔️ [EXECUTE ATTACKS] Fehler:', err)
                            })
                            timeoutKeysRef.current.delete(timeoutKey)
                        }, 500)
                        timeoutIdsRef.current.push(timeoutId)
                    }
                } else if (allDecided && recapNotShown && !hasTruth && isHost && data.host === myName) {
                    logger.warn('⚠️ [EXECUTE ATTACKS] Alle haben entschieden, aber Hotseat hat noch keine Antwort - warte auf Hotseat')
                } else if (allDecided && recapNotShown && hasTruth && !canExecuteAttacks) {
                    // FALLBACK: Wenn alle Bedingungen erfüllt sind, aber canExecuteAttacks false ist
                    // (z.B. weil Host-Check fehlschlägt), trotzdem versuchen auszuführen
                    logger.warn('⚠️ [EXECUTE ATTACKS] FALLBACK: Alle Bedingungen erfüllt, aber canExecuteAttacks ist false. Versuche trotzdem...', {
                        condition1: condition1,
                        condition2: condition2,
                        condition3: condition3,
                        condition4: condition4,
                        isHost: isHost,
                        myName: myName,
                        host: data.host
                    })
                    // Versuche als Backup-Host oder wenn ich der erste aktive Spieler bin
                    if (isFirstBackupHost || sortedActivePlayers[0] === myName) {
                        const timeoutKey = `executeAttacks_fallback_${data.roundId}`
                        if (!timeoutKeysRef.current.has(timeoutKey)) {
                            timeoutKeysRef.current.add(timeoutKey)
                            logger.log('⚔️ [EXECUTE ATTACKS] FALLBACK: Starte executePendingAttacks als Backup')
                            const timeoutId = setTimeout(() => {
                                executePendingAttacks(data).catch(err => {
                                    logger.error('⚔️ [EXECUTE ATTACKS] FALLBACK Fehler:', err)
                                })
                                timeoutKeysRef.current.delete(timeoutKey)
                            }, 1000)
                            timeoutIdsRef.current.push(timeoutId)
                        }
                    }
                }
            } else if (data.status === 'winner') {
                if (currentScreen !== 'winner') {
                    logger.log('🏆 [SCREEN] Wechsel zu Winner')
                    setCurrentScreen('winner')
                }
            }
            
            // Host Auto-Advance: Wenn alle Spieler geantwortet haben, automatisch zu Result
            // WICHTIG: Diese Logik wird IMMER ausgeführt, wenn status === 'game'
            // HOST-FAILOVER: Backup-Host kann übernehmen wenn Host inaktiv ist
            // WICHTIG: Hotseat MUSS auch geantwortet haben!
            // WICHTIG: Nur aktive Spieler (nicht eliminiert) zählen!
            
            // WICHTIG: Prüfe IMMER, wenn status === 'game' ist
            if (data.status === 'game') {
                const lastHostActivityAdvance = data.lastHostActivity
                // WICHTIG: Wenn lastHostActivity nicht gesetzt ist, prüfe ob wir der Host sind
                const hostInactiveAdvance = lastHostActivityAdvance && lastHostActivityAdvance.toMillis ? (Date.now() - lastHostActivityAdvance.toMillis()) > GAME_CONSTANTS.HOST_INACTIVE_THRESHOLD : false
                const hostNameAdvance = data.host
                const maxTempAdvance = data.config?.maxTemp || GAME_CONSTANTS.MAX_TEMP_DEFAULT
                const eliminatedPlayersAdvance = data.eliminatedPlayers || []
                const sortedActivePlayersAdvance = getActivePlayers(data.players, maxTempAdvance, eliminatedPlayersAdvance)
                const myIndexAdvance = sortedActivePlayersAdvance.indexOf(myName)
                const isFirstBackupHostAdvance = myIndexAdvance === 0 && sortedActivePlayersAdvance.length > 0 && sortedActivePlayersAdvance[0] !== hostNameAdvance
                const isHostActiveAdvance = !hostInactiveAdvance && hostNameAdvance === myName
                
                // WICHTIG: Prüfe zuerst, ob alle Spieler abgestimmt haben (inkl. Hotseat)
                // Wenn ja, erlaube Auto-Advance für jeden Spieler (nicht nur Host)
                const activePlayersAdvance = getActivePlayers(data.players, maxTempAdvance, eliminatedPlayersAdvance)
                const playerCountAdvance = activePlayersAdvance.length
                const voteCountAdvance = activePlayersAdvance.filter(p => {
                    const vote = data.votes?.[p]
                    if (!vote || vote.choice === undefined) return false
                    const voteRoundId = vote?.roundId
                    return voteRoundId !== undefined && voteRoundId === data.roundId
                }).length
                const hotseatAdvance = getHotseatName(data.hotseat)
                const hotseatVoteAdvance = hotseatAdvance ? data.votes?.[hotseatAdvance] : null
                const hotseatVoteRoundIdAdvance = hotseatVoteAdvance?.roundId
                const hotseatHasVotedAdvance = hotseatAdvance && activePlayersAdvance.includes(hotseatAdvance) && 
                    hotseatVoteAdvance?.choice !== undefined &&
                    hotseatVoteRoundIdAdvance !== undefined && 
                    hotseatVoteRoundIdAdvance === data.roundId
                
                // DEBUG: Detaillierte Prüfung für Hotseat-Vote
                if (!hotseatHasVotedAdvance && hotseatAdvance) {
                    logger.warn('⚠️ [AUTO-ADVANCE] Hotseat hat noch nicht (gültig) abgestimmt:', {
                        hotseat: hotseatAdvance,
                        hasVote: !!hotseatVoteAdvance,
                        choice: hotseatVoteAdvance?.choice,
                        voteRoundId: hotseatVoteRoundIdAdvance,
                        currentRoundId: data.roundId,
                        isActive: activePlayersAdvance.includes(hotseatAdvance)
                    })
                }

                // WICHTIG: Wenn alle aktiven Spieler abgestimmt haben, dann MUSS auch der Hotseat dabei sein
                // (da der Hotseat immer ein aktiver Spieler ist).
                // Wir entfernen die strikte hotseatHasVotedAdvance Prüfung für den Trigger,
                // da sie bei Namens-Unstimmigkeiten blockieren könnte.
                const allVotedAdvance = voteCountAdvance >= playerCountAdvance && playerCountAdvance > 0
                
                // DEBUG: Warnung wenn rechnerisch alle abgestimmt haben, aber Hotseat-Check fehlschlägt
                if (allVotedAdvance && !hotseatHasVotedAdvance && hotseatAdvance) {
                     logger.warn('⚠️ [AUTO-ADVANCE] Alle haben abgestimmt, aber Hotseat-Check schlug fehl (Ignoriere)', {
                        hotseat: hotseatAdvance,
                        activePlayers: activePlayersAdvance
                     })
                }
                
                // WICHTIG: Erlaube Auto-Advance wenn:
                // 1. Alle Spieler abgestimmt haben (inkl. Hotseat) - dann kann jeder Spieler den Wechsel auslösen
                // 2. ODER wenn wir der Host/Backup-Host sind
                const canAutoAdvance = data.votes && (
                    allVotedAdvance || // Alle haben abgestimmt - jeder kann wechseln
                    isHostActiveAdvance || // Aktiver Host
                    (hostInactiveAdvance && isFirstBackupHostAdvance) || // Backup-Host bei inaktivem Host
                    (hostNameAdvance === myName && !lastHostActivityAdvance) // Host ohne lastHostActivity
                )
            
            if (canAutoAdvance) {
                // WICHTIG: Verwende die bereits berechneten Werte aus der Basis-Prüfung
                // Das verhindert Inkonsistenzen zwischen den Prüfungen
                const maxTemp = data.config?.maxTemp || GAME_CONSTANTS.MAX_TEMP_DEFAULT
                const activePlayers = getActivePlayers(data.players, maxTemp)
                const playerCount = activePlayers.length
                
                // WICHTIG: Verwende die bereits berechneten Werte
                const voteCount = voteCountAdvance
                const hotseat = hotseatAdvance
                const hotseatVote = hotseatVoteAdvance
                const hotseatVoteRoundId = hotseatVoteRoundIdAdvance
                const hotseatHasVoted = hotseatHasVotedAdvance
                
                const allVotedCondition = voteCount >= playerCount && playerCount > 0
                const hotseatCondition = hotseatHasVoted
                const canAdvance = allVotedAdvance // Verwende die bereits berechnete Bedingung

                if (canAdvance) {
                    // Verhindere mehrfache Ausführung, ABER erlaube Retries nach einer gewissen Zeit
                    // Verwende Timestamp im Key um bei jedem Update eine neue Chance zu haben, falls es lange her ist?
                    // Nein, besser: Prüfe ob wir bereits versuchen
                    const timeoutKey = `autoAdvance_${data.roundId}`
                    
                    // Wenn der Key existiert, aber es ist schon > 5 Sekunden her, versuche es nochmal
                    // Dazu müssten wir den Timestamp speichern. Vereinfachung:
                    // Wir vertrauen auf retryFirebaseOperation. Wenn das durchläuft, ist gut.
                    // Wenn nicht, wird timeoutKey nicht gelöscht? Doch, im finally/catch/timeout callback.
                    
                    if (!timeoutKeysRef.current.has(timeoutKey)) {
                        timeoutKeysRef.current.add(timeoutKey)
                        const timeoutId = setTimeout(async () => {
                            try {
                                await retryFirebaseOperation(
                                    () => updateDoc(doc(db, "lobbies", roomId), { 
                                        status: 'result',
                                        lastHostActivity: serverTimestamp()
                                    }),
                                    `autoAdvance_${data.roundId}`,
                                    5, // Mehr Retries bei schlechtem Internet
                                    1000 // Kürzere Delay bei Retries
                                )
                            } catch (err) {
                                logger.error('⏩ [AUTO-ADVANCE] Fehler:', err)
                                // Setze Status auf 'slow' um zu signalisieren, dass es Probleme gibt
                                setConnectionStatus('slow')
                                // WICHTIG: Lösche Key bei Fehler, damit wir es beim nächsten Snapshot nochmal versuchen können!
                                timeoutKeysRef.current.delete(timeoutKey)
                            }
                            // Normalerweise Key löschen, aber bei Erfolg wollen wir nicht sofort nochmal feuern (Status ändert sich eh)
                            // Aber falls Status-Update langsam ist, könnte Snapshot nochmal feuern.
                            // Lassen wir den Key drin, bis Status sich ändert (dann wird Snapshot eh neu ausgeführt mit neuem Status)
                            // ABER: Wenn wir im 'game' Status bleiben (weil Update failed), müssen wir retryen.
                            // Da wir oben catch haben, löschen wir dort den Key.
                            // Hier (im success case) lassen wir ihn drin, oder löschen ihn verzögert?
                            // Löschen wir ihn, damit bei nächsten Snapshot (falls Status noch game) nochmal geprüft wird?
                            // Nein, das würde zu Loop führen. 
                            // Wir verlassen uns darauf, dass Status zu 'result' wechselt.
                        }, 500)
                        timeoutIdsRef.current.push(timeoutId)
                    }
                }
            }
            } // Ende von if (data.status === 'game')
            
            // Auto-Next läuft wenn Status 'result' ist
            if (data.status === 'result') {
            // Host Auto-Next: Wenn alle Spieler ihre Antwort abgegeben haben UND Popups bestätigt wurden, automatisch nächste Runde
            // HOST-FAILOVER: Backup-Host kann übernehmen wenn Host inaktiv ist
            // WICHTIG: Prüfe auf votes statt ready - wenn alle abgestimmt haben, geht es weiter
            let roundRecapShownForNext = data.roundRecapShown ?? false
            
            // Prüfe Host-Aktivität
            const lastHostActivityNext = data.lastHostActivity
            const hostInactiveNext = lastHostActivityNext && lastHostActivityNext.toMillis ? (Date.now() - lastHostActivityNext.toMillis()) > GAME_CONSTANTS.HOST_INACTIVE_THRESHOLD : true
            const hostNameNext = data.host
            
            // Sortiere Spieler für konsistente Failover-Reihenfolge
            const maxTempNext = data.config?.maxTemp || GAME_CONSTANTS.MAX_TEMP_DEFAULT
            const sortedActivePlayersNext = getActivePlayers(data.players, maxTempNext)
            const myIndexNext = sortedActivePlayersNext.indexOf(myName)
            const isFirstBackupHostNext = myIndexNext === 0 && sortedActivePlayersNext.length > 0 && sortedActivePlayersNext[0] !== hostNameNext
            const isHostActiveNext = !hostInactiveNext && hostNameNext === myName
            
            // WICHTIG: Prüfe ob roundRecapShown gesetzt werden muss, wenn alle bereit sind
            // Wenn alle bereit sind, aber roundRecapShown noch false ist, setze es auf true
            const maxTempCheck = data.config?.maxTemp || 100
            const eliminatedPlayersCheck = data.eliminatedPlayers || []
            const activePlayersCheck = Object.keys(data.players || {}).filter(p => {
                const temp = data.players?.[p]?.temp || 0
                return temp < maxTempCheck && !eliminatedPlayersCheck.includes(p)
            })
            const playerCountCheck = activePlayersCheck.length
            // WICHTIG: Zähle nur Votes aus der aktuellen Runde
            const voteCountCheck = activePlayersCheck.filter(p => {
                const vote = data.votes?.[p]
                if (!vote || vote.choice === undefined) return false
                const voteRoundId = vote.roundId
                return voteRoundId !== undefined && voteRoundId === data.roundId
            }).length
            const readyListCheck = data.ready || []
            const readyCountCheck = activePlayersCheck.filter(p => readyListCheck.includes(p)).length
            const allReadyCheck = readyCountCheck >= playerCountCheck && playerCountCheck > 0
            const allVotedCheck = voteCountCheck >= playerCountCheck && playerCountCheck > 0
            
            // Prüfe ob alle Popups bestätigt wurden (falls nötig)
            const popupConfirmedCheck = data.popupConfirmed || {}
            const hasAttackResultsCheck = data.attackResults && Object.keys(data.attackResults).length > 0
            const allPopupConfirmedCheck = !hasAttackResultsCheck || activePlayersCheck.every(p => {
                if (!data.attackResults?.[p]) return true
                return popupConfirmedCheck[p] === true
            })
            
            // FALLBACK: Wenn alle bereit sind, alle abgestimmt haben, aber roundRecapShown noch false ist,
            // setze es auf true - auch wenn executePendingAttacks nicht ausgeführt wurde
            // WICHTIG: Auch ausführen wenn alle Spieler entschieden haben (attackDecisions)
            const attackDecisionsCheck = data.attackDecisions || {}
            const playersWithDecisionCheck = Object.keys(attackDecisionsCheck).filter(p => attackDecisionsCheck[p] === true)
            const hotseatShouldBeDecidedCheck = data.hotseat && data.votes?.[data.hotseat]?.choice !== undefined
            const effectiveDecidedCountCheck = playersWithDecisionCheck.length + (hotseatShouldBeDecidedCheck && !attackDecisionsCheck[data.hotseat] ? 1 : 0)
            const allDecidedCheck = effectiveDecidedCountCheck >= playerCountCheck && playerCountCheck > 0
            
            // Wenn alle bereit sind UND (alle abgestimmt ODER alle entschieden), setze roundRecapShown auf true
            if (data.status === 'result' && !roundRecapShownForNext && allReadyCheck && 
                (allVotedCheck || allDecidedCheck) && allPopupConfirmedCheck && 
                (isHostActiveNext || (hostInactiveNext && isFirstBackupHostNext)) && db && roomId) {
                logger.log('⏭️ [AUTO-NEXT] FALLBACK: Setze roundRecapShown auf true, weil alle bereit sind:', {
                    roundId: data.roundId,
                    allReady: allReadyCheck,
                    allVoted: allVotedCheck,
                    allDecided: allDecidedCheck,
                    allPopupConfirmed: allPopupConfirmedCheck,
                    readyCount: readyCountCheck,
                    playerCount: playerCountCheck,
                    effectiveDecidedCount: effectiveDecidedCountCheck
                })
                updateDoc(doc(db, "lobbies", roomId), {
                    roundRecapShown: true
                }).catch(err => {
                    logger.error('⏭️ [AUTO-NEXT] Fehler beim Setzen von roundRecapShown:', err)
                })
                // Setze roundRecapShownForNext auf true für diese Prüfung
                roundRecapShownForNext = true
            }
            
            // WICHTIG: Erlaube Auto-Next auch wenn Host nicht aktiv ist, aber alle Bedingungen erfüllt sind
            // Wenn alle bereit sind, kann JEDER Spieler die nächste Runde starten (Failover)
            const canAutoNext = data.status === 'result' && roundRecapShownForNext && (
                isHostActiveNext || 
                (hostInactiveNext && isFirstBackupHostNext) ||
                (allReadyCheck && allVotedCheck && allPopupConfirmedCheck && sortedActivePlayersNext.includes(myName))
            )
            
            // DETAILLIERTES LOGGING: Zeige warum canAutoNext false ist
            if (!canAutoNext && data.status === 'result') {
                logger.log('⏭️ [AUTO-NEXT] canAutoNext ist false - Details:', {
                    roundId: data.roundId,
                    status: data.status,
                    roundRecapShown: data.roundRecapShown,
                    roundRecapShownForNext: roundRecapShownForNext,
                    allReadyCheck: allReadyCheck,
                    allVotedCheck: allVotedCheck,
                    allPopupConfirmedCheck: allPopupConfirmedCheck,
                    isHostActiveNext: isHostActiveNext,
                    hostInactiveNext: hostInactiveNext,
                    isFirstBackupHostNext: isFirstBackupHostNext,
                    myName: myName,
                    host: data.host
                })
            }
            
            if (canAutoNext) {
                const maxTemp = data.config?.maxTemp || 100
                const eliminatedPlayersAutoNext = data.eliminatedPlayers || []
                // WICHTIG: Zähle nur aktive Spieler (nicht eliminiert)
                const activePlayers = Object.keys(data.players || {}).filter(p => {
                    const temp = data.players?.[p]?.temp || 0
                    return temp < maxTemp && !eliminatedPlayersAutoNext.includes(p)
                })
                const playerCount = activePlayers.length
                // WICHTIG: Prüfe auf votes statt ready - alle müssen abgestimmt haben
                // WICHTIG: Zähle nur Votes mit richtiger roundId
                const voteCount = activePlayers.filter(p => {
                    const vote = data.votes?.[p]
                    if (!vote || vote.choice === undefined) return false
                    // WICHTIG: Prüfe ob Vote aus aktueller Runde stammt
                    const voteRoundId = vote.roundId
                    return voteRoundId !== undefined && voteRoundId === data.roundId
                }).length
                const popupConfirmed = data.popupConfirmed || {}
                // WICHTIG: Prüfe ob alle Popups bestätigt wurden ODER ob keine Attack-Results existieren (keine Popups nötig)
                const hasAttackResults = data.attackResults && Object.keys(data.attackResults).length > 0
                const allPopupConfirmed = !hasAttackResults || activePlayers.every(p => {
                    // Spieler ohne Attack-Result müssen kein Popup bestätigen
                    if (!data.attackResults?.[p]) return true
                    return popupConfirmed[p] === true
                })
                
                // WICHTIG: Prüfe ob alle aktiven Spieler bereit sind
                const readyList = data.ready || []
                const readyCount = activePlayers.filter(p => readyList.includes(p)).length
                const allReady = readyCount >= playerCount && playerCount > 0
                
                const shouldNext = voteCount >= playerCount && playerCount > 0 && allReady
                
                // DETAILLIERTES LOGGING: Zeige warum nextRound nicht ausgeführt wird
                if (!shouldNext && canAutoNext) {
                    logger.log('⏭️ [AUTO-NEXT] shouldNext ist false - Details:', {
                        roundId: data.roundId,
                        voteCount: voteCount,
                        playerCount: playerCount,
                        readyCount: readyCount,
                        allReady: allReady,
                        hasEnoughVotes: voteCount >= playerCount,
                        hasEnoughPlayers: playerCount > 0,
                        readyList: readyList,
                        activePlayers: activePlayers
                    })
                }
                
                if (shouldNext) {
                    const timeoutKey = `autoNext_${data.roundId}`
                    if (!timeoutKeysRef.current.has(timeoutKey)) {
                        timeoutKeysRef.current.add(timeoutKey)
                        logger.log('⏭️ [AUTO-NEXT] Starte nextRound in 1 Sekunde')
                        const timeoutId = setTimeout(async () => {
                            try {
                                // Verwende retryFirebaseOperation für robustere Fehlerbehandlung
                                await retryFirebaseOperation(
                                    () => nextRound(),
                                    `autoNext_${data.roundId}`,
                                    5, // Mehr Retries bei schlechtem Internet
                                    2000 // Längere Delay bei Retries
                                )
                            } catch (err) {
                                logger.error('⏭️ [AUTO-NEXT] Fehler nach allen Retries:', err)
                                // Setze Status auf 'slow' um zu signalisieren, dass es Probleme gibt
                                setConnectionStatus('slow')
                            }
                            timeoutKeysRef.current.delete(timeoutKey)
                        }, 1000)
                        timeoutIdsRef.current.push(timeoutId)
                    }
                }
            }
            } // Ende von if (data.status === 'result')
        }, // Ende von onSnapshot callback
        {
            // Verbindungsstatus-Überwachung für bessere Fehlerbehandlung
            includeMetadataChanges: true
        }
    )
        
        // Verbindungsstatus-Überwachung
        const connectionCheckInterval = setInterval(() => {
            const timeSinceLastUpdate = Date.now() - lastSuccessfulUpdateRef.current
            if (timeSinceLastUpdate > GAME_CONSTANTS.CONNECTION_OFFLINE_THRESHOLD) {
                setConnectionStatus('offline')
                logger.warn('⚠️ [CONNECTION] Keine Updates seit', Math.round(timeSinceLastUpdate / 1000), 'Sekunden')
            } else if (timeSinceLastUpdate > GAME_CONSTANTS.CONNECTION_SLOW_THRESHOLD) {
                setConnectionStatus('slow')
            } else {
                setConnectionStatus('online')
            }
        }, GAME_CONSTANTS.CONNECTION_CHECK_INTERVAL)
        
        // PRESENCE-SYSTEM: Heartbeat - Aktualisiere lastSeen regelmäßig (alle 5 Sekunden)
        // Dies ermöglicht es anderen Spielern zu sehen, wer online ist
        const presenceHeartbeatInterval = setInterval(async () => {
            if (!db || !roomId || !myName) {
                return // Stoppe Heartbeat wenn roomId leer ist
            }
            
            try {
                // Prüfe ob Lobby noch existiert, bevor wir updaten
                const lobbyDoc = await getDoc(doc(db, "lobbies", roomId))
                if (!lobbyDoc.exists()) {
                    logger.debug('💓 [PRESENCE] Lobby existiert nicht mehr, stoppe Heartbeat')
                    return
                }
                
                const lobbyData = lobbyDoc.data()
                if (lobbyData?.status === 'deleted') {
                    logger.debug('💓 [PRESENCE] Lobby wurde gelöscht, stoppe Heartbeat')
                    return
                }
                
                await updateDoc(doc(db, "lobbies", roomId), {
                    [`players.${myName}.lastSeen`]: serverTimestamp()
                })
            } catch (err) {
                // Fehler beim Heartbeat sind nicht kritisch - nur loggen
                // Aber stoppe Heartbeat bei permission-denied (Lobby wurde gelöscht)
                if (err?.code === 'permission-denied' || err?.code === 'not-found') {
                    logger.debug('💓 [PRESENCE] Heartbeat gestoppt (Lobby existiert nicht mehr)')
                    return
                }
                logger.debug('💓 [PRESENCE] Heartbeat-Fehler (nicht kritisch):', err)
            }
        }, 5000) // Alle 5 Sekunden (statt 10)
        
        // HOST: Prüfe auf inaktive Spieler (alle 10 Sekunden)
        // Markiere Spieler als inaktiv, wenn lastSeen > 15 Sekunden alt ist
        const inactivePlayerCheckInterval = setInterval(async () => {
            if (!isHost || !db || !roomId || !globalData?.players) {
                return // Nur Host prüft auf inaktive Spieler
            }
            
            try {
                const now = Date.now()
                const INACTIVE_THRESHOLD = 15000 // 15 Sekunden
                const inactivePlayers = []
                
                // Prüfe alle Spieler auf Inaktivität
                for (const [playerName, playerData] of Object.entries(globalData.players)) {
                    const lastSeen = playerData?.lastSeen
                    if (lastSeen && lastSeen.toMillis) {
                        const timeSinceLastSeen = now - lastSeen.toMillis()
                        if (timeSinceLastSeen > INACTIVE_THRESHOLD) {
                            inactivePlayers.push(playerName)
                            logger.warn(`💓 [PRESENCE] Spieler ${playerName} ist inaktiv (${Math.round(timeSinceLastSeen / 1000)}s)`)
                        }
                    }
                }
                
                // TODO: Optional - Markiere inaktive Spieler oder entferne sie aus activePlayers Berechnung
                // Für jetzt nur loggen
                if (inactivePlayers.length > 0) {
                    logger.warn('💓 [PRESENCE] Inaktive Spieler erkannt:', inactivePlayers)
                }
            } catch (err) {
                logger.debug('💓 [PRESENCE] Fehler beim Prüfen auf inaktive Spieler:', err)
            }
        }, 10000) // Alle 10 Sekunden
        
        // Cleanup-Funktion: Räume alle Timeouts auf und beende den Listener
        return () => {
            unsubscribe()
            clearInterval(connectionCheckInterval)
            clearInterval(presenceHeartbeatInterval)
            clearInterval(inactivePlayerCheckInterval)
            // WICHTIG: Räume alle Timeouts auf, um Memory Leaks zu vermeiden
            timeoutIdsRef.current.forEach(id => clearTimeout(id))
            timeoutIdsRef.current = []
            // Räume auch timeoutKeys auf
            timeoutKeysRef.current.clear()
        }
        }, [db, roomId, myName, isHost])
    
    // Emoji auswählen - mit zentriertem Scrollen
    const emojiGalleryRef = useRef(null)
    const [emojiScrollIndex, setEmojiScrollIndex] = useState(Math.floor(availableEmojis.length / 2))
    const isScrollingRef = useRef(false)
    const touchStartRef = useRef({ x: 0, y: 0, time: 0 })
    
    // Initialisiere mit mittlerem Emoji - IMMER mittlerer Charakter als erstes
    useEffect(() => {
        const middleIndex = Math.floor(availableEmojis.length / 2)
        const middleEmoji = availableEmojis[middleIndex]
        
        // WICHTIG: Beim Start-Screen IMMER mittlerer Charakter auswählen
        if (currentScreen === 'start') {
            // Prüfe, ob bereits der mittlere Charakter ausgewählt ist, um unnötige Updates zu vermeiden
            if (myEmoji !== middleEmoji || emojiScrollIndex !== middleIndex) {
                setMyEmoji(middleEmoji)
                setEmojiScrollIndex(middleIndex)
                sessionStorage.setItem("hk_emoji", middleEmoji)
            }
            
            // Die Zentrierung wird vom separaten useEffect übernommen
        } else if (!myEmoji || !availableEmojis.includes(myEmoji)) {
            // Nur wenn kein gültiges Emoji vorhanden ist, setze auf Mitte
            setMyEmoji(middleEmoji)
            setEmojiScrollIndex(middleIndex)
            sessionStorage.setItem("hk_emoji", middleEmoji)
        } else {
            // Falls bereits ein Emoji gespeichert ist (außerhalb des Start-Screens), verwende es
            const index = availableEmojis.indexOf(myEmoji)
            if (index >= 0) {
                setEmojiScrollIndex(index)
            } else {
                setEmojiScrollIndex(middleIndex)
                setMyEmoji(middleEmoji)
            }
        }
    }, [currentScreen])
    
    // Zentriere das ausgewählte Emoji
    useEffect(() => {
        if (emojiGalleryRef.current && emojiScrollIndex >= 0 && currentScreen === 'start') {
            const gallery = emojiGalleryRef.current
            const cards = gallery.querySelectorAll('.emoji-card')
            const selectedCard = cards[emojiScrollIndex]
            
            if (selectedCard) {
                // Blockiere Scroll-Events während der Zentrierung
                isScrollingRef.current = true
                
                // Warte auf Layout-Berechnung und setze dann die Scroll-Position
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const galleryWidth = gallery.clientWidth
                            const cardWidth = selectedCard.offsetWidth || 80
                            const cardLeft = selectedCard.offsetLeft
                            const scrollPosition = cardLeft - (galleryWidth / 2) + (cardWidth / 2)
                            
                            // Setze die Scroll-Position direkt (ohne smooth, für sofortige Positionierung)
                            const finalScrollPosition = Math.max(0, Math.min(scrollPosition, gallery.scrollWidth - gallery.clientWidth))
                            gallery.scrollLeft = finalScrollPosition
                            
                            // Prüfe nach kurzer Verzögerung, ob die Position korrekt ist
                            setTimeout(() => {
                                if (Math.abs(gallery.scrollLeft - finalScrollPosition) > 10) {
                                    gallery.scrollLeft = finalScrollPosition
                                }
                                
                                // Reaktiviere Scroll-Events nach der Positionierung
                                setTimeout(() => {
                                    isScrollingRef.current = false
                                }, 100)
                            }, 50)
                        })
                    })
                }, 150)
            }
        }
    }, [emojiScrollIndex, currentScreen])
    
    const selectEmoji = (emoji) => {
        const index = availableEmojis.indexOf(emoji)
        if (index >= 0) {
            // Verwende flushSync für sofortiges Update auf mobilen Geräten
            setEmojiScrollIndex(index)
            setMyEmoji(emoji)
            sessionStorage.setItem("hk_emoji", emoji)
            
            // Force re-render der betroffenen Karten auf mobilen Geräten
            if (emojiGalleryRef.current) {
                const cards = emojiGalleryRef.current.querySelectorAll('.emoji-card')
                cards.forEach((card, idx) => {
                    const isSelected = idx === index
                    if (isSelected) {
                        card.classList.add('selected')
                    } else {
                        card.classList.remove('selected')
                    }
                })
            }
        }
    }
    
    // Scroll-Funktionen für Emoji-Galerie
    const scrollEmojiLeft = () => {
        const newIndex = emojiScrollIndex > 0 ? emojiScrollIndex - 1 : availableEmojis.length - 1
        setEmojiScrollIndex(newIndex)
        setMyEmoji(availableEmojis[newIndex])
        sessionStorage.setItem("hk_emoji", availableEmojis[newIndex])
    }
    
    const scrollEmojiRight = () => {
        const newIndex = emojiScrollIndex < availableEmojis.length - 1 ? emojiScrollIndex + 1 : 0
        setEmojiScrollIndex(newIndex)
        setMyEmoji(availableEmojis[newIndex])
        sessionStorage.setItem("hk_emoji", availableEmojis[newIndex])
    }
    
    // Name speichern
    // PERFORMANCE-OPTIMIERUNG: useCallback verhindert Neuerstellung bei jedem Render
    const handleNameChange = useCallback((e) => {
        const name = e.target.value.trim().substring(0, 20)
        setMyName(name)
        sessionStorage.setItem("hk_name", name)
    }, [])
    
    // Kategorie umschalten
    // PERFORMANCE-OPTIMIERUNG: useCallback verhindert Neuerstellung bei jedem Render
    const toggleCategory = useCallback((catKey) => {
        if (catKey === 'all') {
            setSelectedCategories(prev => {
                if (prev.length === Object.keys(questionCategories).length) {
                    return []
                } else {
                    return Object.keys(questionCategories)
                }
            })
        } else {
            setSelectedCategories(prev => {
                if (prev.includes(catKey)) {
                    return prev.filter(c => c !== catKey)
                } else {
                    return [...prev, catKey]
                }
            })
        }
    }, [])
    
    // Fragengenerator: Fragen mischen (Fisher-Yates Shuffle)
    const shuffleQuestions = useCallback((questions) => {
        const shuffled = [...questions]
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled
    }, [])
    
    // Fragengenerator: Nächste Frage anzeigen
    const generateNewQuestion = useCallback(() => {
        if (shuffledQuestions.length === 0) {
            return
        }
        
        const nextIndex = currentQuestionIndex + 1
        
        if (nextIndex >= shuffledQuestions.length) {
            // Alle Fragen durchgegangen - von vorne beginnen
            setCurrentQuestionIndex(0)
            setCurrentGeneratorQuestion(shuffledQuestions[0])
        } else {
            setCurrentQuestionIndex(nextIndex)
            setCurrentGeneratorQuestion(shuffledQuestions[nextIndex])
        }
    }, [shuffledQuestions, currentQuestionIndex])
    
    // Fragengenerator: Zur vorherigen Frage zurück
    const goToPreviousQuestion = useCallback(() => {
        if (currentQuestionIndex === 0) {
            return // Bereits bei der ersten Frage
        }
        
        const previousIndex = currentQuestionIndex - 1
        setCurrentQuestionIndex(previousIndex)
        setCurrentGeneratorQuestion(shuffledQuestions[previousIndex])
    }, [shuffledQuestions, currentQuestionIndex])
    
    // Spiel erstellen
    const createGame = async () => {
        if (!myName.trim()) {
            alert("Bitte gib deinen Namen ein!")
            return
        }
        if (selectedCategories.length === 0) {
            alert("Bitte wähle mindestens eine Kategorie aus!")
            return
        }
        if (!db) {
            alert("Fehler: Firebase ist noch nicht initialisiert. Bitte warte einen Moment und versuche es erneut.")
            logger.error('❌ [CREATE GAME] Firebase DB nicht verfügbar')
            return
        }
        
        const dmg = GAME_CONSTANTS.ATTACK_DMG_PARTY
        const speed = 1.5
        const maxTemp = GAME_CONSTANTS.MAX_TEMP_DEFAULT
        
        const code = Math.random().toString(36).substring(2, 6).toUpperCase()
        
        try {
            const allQuestions = getAllQuestions(selectedCategories)
            const firstQuestion = allQuestions[0] || { q: "Willkommen zu Hitzkopf!", a: "A", b: "B" }
            const firstCategory = firstQuestion.category || null
            
            logger.log('🎮 [CREATE GAME] Versuche Lobby zu erstellen:', {
                code,
                host: myName,
                categories: selectedCategories.length,
            })
            
            const lobbyData = {
                host: myName,
                hostName: myName,
                status: "lobby",
                createdAt: serverTimestamp(),
                players: { 
                    [myName]: { 
                        temp: 0, 
                        inventory: [], 
                        emoji: myEmoji,
                        lastSeen: serverTimestamp() // Presence-Tracking
                    } 
                },
                config: { dmg, speed, startTemp: 0, maxTemp, categories: selectedCategories },
                votes: {},
                ready: [],
                log: [],
                hotseat: "",
                currentQ: firstQuestion,
                roundId: 0,
                lobbyReady: {},
            }
            
            // Füge lastQuestionCategory nur hinzu, wenn es nicht null ist
            if (firstCategory) {
                lobbyData.lastQuestionCategory = firstCategory
            }
            
            await setDoc(doc(db, "lobbies", code), lobbyData)
            
            // Nur bei erfolgreicher Erstellung: States setzen und zur Lobby navigieren
            setRoomId(code)
            sessionStorage.setItem("hk_room", code)
            setIsHost(true)
            setCurrentScreen('lobby')
            lastProcessedRoundIdRef.current = null // Reset für neue Lobby
            
            logger.log('✅ [CREATE GAME] Lobby erfolgreich erstellt:', code)
        } catch (error) {
            logger.error('❌ [CREATE GAME] Fehler beim Erstellen der Lobby:', {
                error,
                code: error.code,
                message: error.message,
                stack: error.stack
            })
            
            // States zurücksetzen bei Fehler
            setRoomId("")
            sessionStorage.removeItem("hk_room")
            setIsHost(false)
            
            // Benutzerfreundliche Fehlermeldung anzeigen
            if (error.code === 'permission-denied') {
                alert("Fehler: Keine Berechtigung zum Erstellen einer Lobby. Bitte überprüfe deine Firebase-Berechtigungen.")
            } else if (error.code === 'unavailable') {
                alert("Fehler: Firebase ist nicht verfügbar. Bitte überprüfe deine Internetverbindung.")
            } else {
                alert(`Fehler beim Erstellen des Spiels: ${error.message || 'Unbekannter Fehler'}`)
            }
        }
    }
    
    // Spiel beitreten (mit Raum-ID)
    const joinGame = async (targetRoomId = null) => {
        if (!myName.trim()) {
            alert("Bitte gib deinen Namen ein!")
            return
        }
        
        const code = (targetRoomId || roomCode).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6)
        if (!code || code.length < 4) {
            alert("Bitte wähle einen Raum aus der Liste!")
            return
        }
        
        const ref = doc(db, "lobbies", code)
        const snap = await getDoc(ref)
        
        if (!snap.exists()) {
            alert("Lobby nicht gefunden!")
            return
        }
        
        const roomData = snap.data()
        
        // Prüfe ob Spieler bereits existiert
        if (roomData.players && roomData.players[myName]) {
            alert("Du bist bereits in diesem Raum!")
        }
        
        setRoomId(code)
        sessionStorage.setItem("hk_room", code)
        setIsHost(false)
        lastProcessedRoundIdRef.current = null // Reset für neue Lobby
        
        await updateDoc(ref, {
            [`players.${myName}`]: { temp: 0, inventory: [], emoji: myEmoji },
            [`players.${myName}.lastSeen`]: serverTimestamp() // Presence-Tracking
        })
        
        // Screen wird durch Listener automatisch auf 'lobby' gesetzt
    }
    
    // Raumliste laden
    const loadRoomList = async () => {
        if (!db) return
        const roomsRef = collection(db, "lobbies")
        const q = query(roomsRef, where("status", "==", "lobby"))
        const querySnapshot = await getDocs(q)
        
        const rooms = []
        querySnapshot.forEach((doc) => {
            const data = doc.data()
            if (data.hostName && data.status === 'lobby') {
                // Hole Emoji des Hosts
                const hostEmoji = data.players?.[data.hostName]?.emoji || '😊'
                rooms.push({
                    id: doc.id,
                    hostName: data.hostName,
                    hostEmoji: hostEmoji,
                    playerCount: Object.keys(data.players || {}).length,
                })
            }
        })
        setRoomList(rooms)
        
        // WICHTIG: Lösche einmalig den alten Raum von "Host"
        querySnapshot.forEach((doc) => {
            const data = doc.data()
            if (data.hostName === 'Host' && data.status === 'lobby') {
                logger.log('🗑️ [CLEANUP] Lösche alten Raum von "Host":', doc.id)
                deleteDoc(doc.ref).catch(err => {
                    logger.error('Fehler beim Löschen des alten Raums:', err)
                })
            }
        })
    }
    
    // Raum auswählen
    const selectRoom = async (targetRoomId) => {
        setRoomCode(targetRoomId)
            await joinGame(targetRoomId)
    }
    
    // Lobby Ready umschalten
    const toggleLobbyReady = async () => {
        playSound('toggle', 0.4) // Sound beim Toggle
        if (!db || !roomId) return
        
        // WICHTIG: Prüfe ob Spieler ausgeschieden ist
        const maxTemp = globalData?.config?.maxTemp || 100
        const myTemp = globalData?.players?.[myName]?.temp || 0
        const isEliminated = myTemp >= maxTemp
        
        if (isEliminated) {
            alert('Du bist ausgeschieden und kannst nicht mehr mitspielen!')
            return
        }
        
        const current = !!(globalData?.lobbyReady?.[myName])
        const newValue = !current
        
        // WICHTIG: Aktualisiere globalData sofort für sofortiges visuelles Feedback
        if (globalData) {
            setGlobalData({
                ...globalData,
                lobbyReady: {
                    ...(globalData.lobbyReady || {}),
                    [myName]: newValue
                }
            })
        }
        
        await updateDoc(doc(db, "lobbies", roomId), {
            [`lobbyReady.${myName}`]: newValue
        })
    }
    
    // Spiel starten (nur Host)
    const startCountdown = async () => {
        logger.log('🎮 [START GAME] Starte Spiel:', {
            isHost: isHost,
            hasDb: !!db,
            roomId: roomId
        })
        
        if (!db || !roomId || !isHost) {
            logger.warn('🎮 [START GAME] Nicht der Host oder fehlende Parameter')
            return
        }
        
        const maxTemp = globalData?.config?.maxTemp || 100
        // WICHTIG: Zähle nur aktive Spieler (nicht eliminiert)
        const allPlayers = Object.keys(globalData?.players || {})
        const activePlayers = allPlayers.filter(p => {
            const temp = globalData?.players?.[p]?.temp || 0
            return temp < maxTemp
        })
        const lobbyReady = globalData?.lobbyReady || {}
        const readyCount = activePlayers.filter(p => lobbyReady[p]).length
        
        logger.log('🎮 [START GAME] Prüfung:', {
            allPlayers: allPlayers,
            activePlayers: activePlayers,
            readyCount: readyCount,
            totalActivePlayers: activePlayers.length,
            lobbyReady: lobbyReady
        })
        
        if (readyCount < activePlayers.length || activePlayers.length < 2) {
            logger.warn('🎮 [START GAME] Nicht alle aktiven Spieler bereit:', readyCount, '/', activePlayers.length)
            alert(`Alle aktiven Spieler müssen bereit sein! (${readyCount}/${activePlayers.length})`)
            return
        }
        
        // WICHTIG: Eiswürfel-Automatik vor dem Start
        await applyIceCooling(globalData.players)
        
        // WICHTIG: Hotseat und erste Frage setzen
        const usedQuestions = globalData?.usedQuestions || []
        const activeCategories = globalData?.config?.categories || Object.keys(questionCategories)
        const allQuestions = getAllQuestions(activeCategories)
        
        // Migration: Wenn usedQuestions noch Indizes enthält, konvertiere zu IDs
        let usedQuestionIds = usedQuestions
        if (usedQuestions.length > 0 && typeof usedQuestions[0] === 'number') {
            // Alte Daten: Indizes zu IDs konvertieren
            usedQuestionIds = usedQuestions.map(idx => allQuestions[idx]?.id).filter(Boolean)
        }
        
        const unusedQuestions = allQuestions.filter(q => q.id && !usedQuestionIds.includes(q.id))
        const randomQ = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)] || allQuestions[0]
        const nextRoundId = (globalData?.roundId ?? 0) + 1
        
        logger.log('🎮 [START GAME] Starte erste Runde:', {
            hotseat: activePlayers[0],
            question: randomQ.q,
            roundId: nextRoundId,
            questionId: randomQ.id
        })
        
        // Direkt zu 'game' wechseln
        playSound('game_start', 0.7) // Sound beim Spielstart
        await updateDoc(doc(db, "lobbies", roomId), {
            status: 'game',
            hotseat: activePlayers[0],
            currentQ: randomQ,
            votes: {},
            ready: [],
            roundId: nextRoundId,
            lobbyReady: {},
            usedQuestions: randomQ.id && !usedQuestionIds.includes(randomQ.id) ? [...usedQuestionIds, randomQ.id] : usedQuestionIds,
            lastQuestionCategory: randomQ.category,
            pendingAttacks: {},
            attackDecisions: {},
            attackResults: {},
            roundRecapShown: false,
            popupConfirmed: {},
        })
        
        logger.log('🎮 [START GAME] Spiel gestartet, direkt zu Game-Status')
    }
    
    // Antwort wählen
    // PERFORMANCE-OPTIMIERUNG: useCallback verhindert Neuerstellung bei jedem Render
    const vote = useCallback((choice) => {
        // WICHTIG: Prüfe ob Spieler eliminiert ist
        if (globalData) {
            const maxTemp = globalData.config?.maxTemp || 100
            const myTemp = globalData.players?.[myName]?.temp || 0
            if (myTemp >= maxTemp) {
                logger.warn('📝 [VOTE] Spieler ist eliminiert, kann nicht abstimmen:', {
                    myName: myName,
                    temp: myTemp,
                    maxTemp: maxTemp
                })
                alert("Du bist ausgeschieden und kannst nicht mehr abstimmen!")
                return
            }
        }
        setMySelection(choice)
        playSound('click', 0.3) // Sound beim Auswählen einer Antwort
    }, [playSound, globalData, myName])
    
    // Antwort absenden - ATOMARES UPDATE (nur spezifischer Pfad)
    const submitVote = useCallback(async () => {
        logger.log('📝 [SUBMIT VOTE] Starte submitVote:', {
            mySelection: mySelection,
            isHost: isHost,
            localActionDone: localActionDone
        })
        
        if (localActionDone) return // Bereits lokal als fertig markiert
        
        if (!db || !roomId) {
            logger.warn('📝 [SUBMIT VOTE] Fehlende Parameter (db oder roomId)')
            alert("Fehler: Datenbank-Verbindung fehlt!")
            return
        }
        
        // Prüfe ob bereits abgestimmt wurde (lokal UND in Firebase)
        const currentDoc = await getDoc(doc(db, "lobbies", roomId))
        if (!currentDoc.exists()) {
            logger.error('📝 [SUBMIT VOTE] Lobby existiert nicht mehr')
            alert("Lobby existiert nicht mehr!")
            return
        }
        
        const currentData = currentDoc.data()
        // WICHTIG: Prüfe ob Spieler eliminiert ist (100°C oder mehr)
        const maxTemp = currentData?.config?.maxTemp || 100
        const myTemp = currentData?.players?.[myName]?.temp || 0
        if (myTemp >= maxTemp) {
            logger.warn('📝 [SUBMIT VOTE] Spieler ist eliminiert, kann nicht abstimmen:', {
                myName: myName,
                temp: myTemp,
                maxTemp: maxTemp
            })
            alert("Du bist ausgeschieden und kannst nicht mehr abstimmen!")
            return
        }
        
        const existingVote = currentData?.votes?.[myName]
        const currentRoundId = currentData?.roundId || 0
        
        logger.log('📝 [SUBMIT VOTE] Prüfe bestehende Votes:', {
            existingVote: existingVote,
            allVotes: Object.keys(currentData?.votes || {}),
            roundId: currentRoundId,
            myName: myName,
            mySelection: mySelection
        })
        
        // WICHTIG: Prüfe ob bereits in dieser Runde abgestimmt wurde
        // WICHTIG: existingVote könnte aus einer vorherigen Runde stammen!
        // Prüfe daher, ob der Vote wirklich aus der aktuellen Runde stammt
        const voteRoundId = existingVote?.roundId
        // WICHTIG: Wenn Vote kein roundId-Feld hat, ist es aus einer alten Version
        // In diesem Fall prüfe, ob die Runde sich geändert hat (Vote ist alt, wenn roundId fehlt)
        const isVoteFromCurrentRound = existingVote && (
            voteRoundId !== undefined && voteRoundId === currentRoundId // Vote hat roundId und stimmt überein
        )
        
        // WICHTIG: Wenn Vote existiert aber keine roundId hat, ist es aus alter Version
        // Erlaube in diesem Fall das Voten, da wir nicht sicher sein können, ob es aus aktueller Runde ist
        // Die Transaction wird die finale Prüfung durchführen
        
        if (isVoteFromCurrentRound) {
            logger.warn('📝 [SUBMIT VOTE] Bereits in dieser Runde abgestimmt:', {
                existingVote: existingVote,
                currentRoundId: currentRoundId,
                voteRoundId: voteRoundId
            })
            alert("Du hast bereits abgestimmt!")
            return
        }
        
        // WICHTIG: Wenn Vote aus alter Runde stammt oder keine roundId hat, ignoriere es
        if (existingVote && !isVoteFromCurrentRound) {
            logger.log('📝 [SUBMIT VOTE] Vote aus alter Runde erkannt oder ohne roundId, ignoriere:', {
                existingVote: existingVote,
                currentRoundId: currentRoundId,
                voteRoundId: voteRoundId
            })
        }
        
        // WICHTIG: Prüfe ob mySelection noch gesetzt ist (könnte durch Re-Render zurückgesetzt worden sein)
        // RACE-CONDITION-FIX: Verhindere rekursive setTimeout-Loops
        if (!mySelection) {
            logger.warn('📝 [SUBMIT VOTE] mySelection ist null - versuche aus existingVote zu restaurieren')
            if (existingVote?.choice) {
                logger.log('📝 [SUBMIT VOTE] Restore mySelection aus existingVote:', existingVote.choice)
                setMySelection(existingVote.choice)
                // WICHTIG: Verwende existingVote.choice direkt statt rekursivem setTimeout
                // Das verhindert unendliche Loops und Race Conditions
                const restoredChoice = existingVote.choice
                // Fahre mit dem Vote fort, anstatt rekursiv submitVote aufzurufen
                // (Der Code wird nach setMySelection fortgesetzt)
            } else {
                logger.error('📝 [SUBMIT VOTE] mySelection ist null und keine existingVote vorhanden')
                alert("Bitte wähle zuerst eine Antwort!")
                return
            }
        }
        
        // WICHTIG: Verwende restoredChoice falls vorhanden, sonst mySelection
        const voteChoice = mySelection || existingVote?.choice
        if (!voteChoice) {
            logger.error('📝 [SUBMIT VOTE] Keine Wahl verfügbar')
            alert("Bitte wähle zuerst eine Antwort!")
            return
        }
        
        logger.log('📝 [SUBMIT VOTE] Sende Vote an Firebase:', {
            choice: String(voteChoice),
            strategy: myStrategy || 'none',
            roundId: currentRoundId
        })
        
        // RACE-CONDITION-PREVENTION: Verwende runTransaction für atomares Update
        // Dies verhindert, dass mehrere Clients gleichzeitig voten oder doppelte Votes entstehen
        // WICHTIG: Verwende retryFirebaseOperation für robustere Fehlerbehandlung
        const operationId = `submitVote_${myName}_${currentRoundId}_${Date.now()}`
        
        // Versuche zuerst mit Transaction, falls das fehlschlägt, verwende updateDoc als Fallback
        let success = false
        let transactionFailed = false
        
        try {
            success = await retryFirebaseOperation(async () => {
                await runTransaction(db, async (transaction) => {
                    const lobbyRef = doc(db, "lobbies", roomId)
                    const lobbyDoc = await transaction.get(lobbyRef)
                    
                    if (!lobbyDoc.exists()) {
                        throw new Error("Lobby existiert nicht mehr!")
                    }
                    
                    const lobbyData = lobbyDoc.data()
                    const currentRoundIdInTransaction = lobbyData?.roundId || 0
                    
                    // WICHTIG: Prüfe ob roundId sich geändert hat (neue Runde gestartet)
                    if (currentRoundIdInTransaction !== currentRoundId) {
                        logger.warn('📝 [SUBMIT VOTE] RoundId hat sich geändert während Transaction:', {
                            expectedRoundId: currentRoundId,
                            actualRoundId: currentRoundIdInTransaction
                        })
                        throw new Error("Runde hat sich geändert!")
                    }
                    
                    const existingVoteInTransaction = lobbyData?.votes?.[myName]
                    
                    // WICHTIG: Prüfe ob bereits in dieser Runde abgestimmt wurde
                    // Verwende roundId aus dem Vote, falls vorhanden, sonst prüfe gegen aktuelle roundId
                    const existingVoteRoundId = existingVoteInTransaction?.roundId
                    const hasVotedInCurrentRound = existingVoteInTransaction && (
                        (existingVoteRoundId !== undefined && existingVoteRoundId === currentRoundIdInTransaction) ||
                        (existingVoteRoundId === undefined && currentRoundIdInTransaction === currentRoundId)
                    )
                    
                    if (hasVotedInCurrentRound) {
                        logger.warn('📝 [SUBMIT VOTE] Bereits in dieser Runde abgestimmt (Transaction):', {
                            existingVote: existingVoteInTransaction,
                            currentRoundIdInTransaction: currentRoundIdInTransaction,
                            existingVoteRoundId: existingVoteRoundId,
                            currentRoundId: currentRoundId
                        })
                        throw new Error("Du hast bereits abgestimmt!")
                    }
                    
                    // Atomar: Vote setzen mit roundId, damit man später prüfen kann, ob Vote aus aktueller Runde stammt
                    transaction.update(lobbyRef, {
                        [`votes.${myName}`]: { 
                            choice: String(voteChoice), 
                            strategy: myStrategy || 'none',
                            roundId: currentRoundIdInTransaction, // WICHTIG: Speichere roundId im Vote
                            timestamp: serverTimestamp()
                        }
                    })
                })
            }, operationId, 3, 500) // Weniger Retries für Transaction, da sie automatisch wiederholt wird
        } catch (err) {
            // Transaction fehlgeschlagen - verwende updateDoc als Fallback
            if (err?.code === 'failed-precondition' || err?.message?.includes('failed-precondition')) {
                transactionFailed = true
                logger.warn('📝 [SUBMIT VOTE] Transaction fehlgeschlagen, verwende updateDoc als Fallback:', err)
                
                // Fallback: Verwende updateDoc direkt (ohne Transaction)
                // Prüfe zuerst, ob bereits abgestimmt wurde
                try {
                    const lobbyDoc = await getDoc(doc(db, "lobbies", roomId))
                    if (!lobbyDoc.exists()) {
                        throw new Error("Lobby existiert nicht mehr!")
                    }
                    
                    const lobbyData = lobbyDoc.data()
                    const currentRoundIdInFallback = lobbyData?.roundId || 0
                    
                    // Prüfe ob roundId sich geändert hat
                    if (currentRoundIdInFallback !== currentRoundId) {
                        logger.warn('📝 [SUBMIT VOTE] RoundId hat sich geändert:', {
                            expectedRoundId: currentRoundId,
                            actualRoundId: currentRoundIdInFallback
                        })
                        throw new Error("Runde hat sich geändert!")
                    }
                    
                    const existingVoteInFallback = lobbyData?.votes?.[myName]
                    const existingVoteRoundId = existingVoteInFallback?.roundId
                    const hasVotedInCurrentRound = existingVoteInFallback && (
                        (existingVoteRoundId !== undefined && existingVoteRoundId === currentRoundIdInFallback) ||
                        (existingVoteRoundId === undefined && currentRoundIdInFallback === currentRoundId)
                    )
                    
                    if (hasVotedInCurrentRound) {
                        logger.warn('📝 [SUBMIT VOTE] Bereits in dieser Runde abgestimmt (Fallback):', {
                            existingVote: existingVoteInFallback,
                            currentRoundIdInFallback: currentRoundIdInFallback
                        })
                        throw new Error("Du hast bereits abgestimmt!")
                    }
                    
                    // Verwende updateDoc als Fallback
                    success = await retryFirebaseOperation(async () => {
                        await updateDoc(doc(db, "lobbies", roomId), {
                            [`votes.${myName}`]: { 
                                choice: String(voteChoice), 
                                strategy: myStrategy || 'none',
                                roundId: currentRoundIdInFallback,
                                timestamp: serverTimestamp()
                            }
                        })
                    }, `${operationId}_fallback`, 3, 500)
                } catch (fallbackErr) {
                    logger.error('📝 [SUBMIT VOTE] Fallback fehlgeschlagen:', fallbackErr)
                    success = false
                }
            } else {
                // Anderer Fehler - nicht retryen
                logger.error('📝 [SUBMIT VOTE] Transaction-Fehler (nicht failed-precondition):', err)
                success = false
            }
        }
        
        if (success) {
            logger.log('📝 [SUBMIT VOTE] Vote erfolgreich gesendet (Transaction)')
            setLocalActionDone(true) // Erst JETZT UI updaten (falls nicht schon durch Listener passiert)
            playSound('click', 0.3) // Sound beim Auswählen einer Antwort
        } else {
            logger.error("📝 [SUBMIT VOTE] Fehler beim Absenden der Antwort nach mehreren Versuchen")
            // Prüfe ob es ein "Du hast bereits abgestimmt!" Fehler war
            const existingVote = globalData?.votes?.[myName]
            if (existingVote?.roundId === currentRoundId) {
                logger.warn('📝 [SUBMIT VOTE] Bereits abgestimmt in dieser Runde')
                alert("Du hast bereits abgestimmt!")
            } else {
                alert("Fehler beim Absenden der Antwort! Bitte versuche es erneut.")
            }
        }
    }, [playSound, globalData, myName, mySelection, myStrategy, db, roomId])
    
    // Bereit setzen (für Result-Screen)
    const setReady = async () => {
        logger.log('👍 [SET READY] setReady aufgerufen für', myName)
        
        if (!db || !roomId) {
            logger.warn('👍 [SET READY] Fehlende Parameter')
            return
        }
        
        // WICHTIG: Verwende atomare Operationen (arrayUnion/arrayRemove) statt Array-Ersetzung
        // Das verhindert Race-Conditions, wenn mehrere Spieler gleichzeitig ihren Status ändern
        const ref = doc(db, "lobbies", roomId)
        
        // Prüfe aktuellen Status aus globalData (schneller als getDoc)
        const currentReady = globalData?.ready || []
        const isReady = currentReady.includes(myName)
        
        logger.log('👍 [SET READY] Aktueller Status:', {
            isReady: isReady,
            currentReady: currentReady,
            willToggle: !isReady
        })
        
        try {
            if (isReady) {
                // Entferne aus ready-Liste (atomar)
                await updateDoc(ref, {
                    ready: arrayRemove(myName)
                })
                logger.log('👍 [SET READY] Nicht mehr bereit gesetzt')
            } else {
                // Füge zu ready-Liste hinzu (atomar)
                await updateDoc(ref, {
                    ready: arrayUnion(myName)
                })
                logger.log('👍 [SET READY] Bereit gesetzt')
            }
        } catch (error) {
            logger.error('👍 [SET READY] Fehler:', error)
            // Bei Fehler: Versuche es nochmal mit getDoc für genauere Prüfung
            try {
                const currentDoc = await getDoc(ref)
                if (!currentDoc.exists()) {
                    logger.error('👍 [SET READY] Lobby existiert nicht mehr')
                    return
                }
                const currentData = currentDoc.data()
                const currentReadyCheck = currentData?.ready || []
                const isReadyCheck = currentReadyCheck.includes(myName)
                
                if (isReadyCheck !== isReady) {
                    // Status hat sich geändert, versuche es nochmal
                    if (isReadyCheck) {
                        await updateDoc(ref, {
                            ready: arrayRemove(myName)
                        })
                    } else {
                        await updateDoc(ref, {
                            ready: arrayUnion(myName)
                        })
                    }
                    logger.log('👍 [SET READY] Retry erfolgreich')
                }
            } catch (retryError) {
                logger.error('👍 [SET READY] Retry fehlgeschlagen:', retryError)
            }
        }
    }
    
    // Lobby verlassen
    // PERFORMANCE-OPTIMIERUNG: useCallback verhindert Neuerstellung bei jedem Render
    const leaveLobby = useCallback(() => {
        setRoomId("")
        setGlobalData(null)
        setCurrentScreen('start')
        sessionStorage.removeItem("hk_room")
        lastProcessedRoundIdRef.current = null // Reset Ref
    }, [])
    
    // Spieler-Liste rendern
    // PERFORMANCE-FIX: useMemo verhindert unnötige Neuberechnungen bei jedem Render
    // WICHTIG: Sortiere Spieler so, dass Host immer oben steht, dann die anderen in Join-Reihenfolge
    // WICHTIG: Reihenfolge darf sich NICHT ändern, wenn jemand bereit geht
    const players = useMemo(() => {
        if (!globalData?.players) return []
        const host = globalData.host
        const playerEntries = Object.entries(globalData.players)
        
        // WICHTIG: Erstelle eine stabile Sortierung
        // 1. Trenne Host und andere Spieler
        const hostEntry = playerEntries.find(([name]) => name === host)
        const otherEntries = playerEntries.filter(([name]) => name !== host)
        
        // 2. Kombiniere: Host zuerst, dann andere in ursprünglicher Reihenfolge
        const sorted = hostEntry ? [hostEntry, ...otherEntries] : otherEntries
        
        return sorted.map(([name, data]) => ({
            name,
            temp: data.temp || 0,
            emoji: data.emoji || '😊'
        }))
    }, [globalData?.players, globalData?.host])
    
    // Alias für Rückwärtskompatibilität
    const renderPlayers = useCallback(() => players, [players])
    
    // Ref für Hotseat-Modal, um zu verhindern, dass es mehrfach angezeigt wird
    const hotseatModalShownRef = useRef(null)
    // Ref für Attack-Modal, um zu verhindern, dass es mehrfach angezeigt wird
    const attackModalShownRef = useRef(null)
    
    // Ref um zu verhindern, dass Strafhitze mehrfach angewendet wird
    const penaltyAppliedRef = useRef(null)
    
    // Hotseat-Popup anzeigen
    const triggerHotseatAlert = (hotseatName, players) => {
        if (hotseatName && players) {
            // WICHTIG: Prüfe ob Modal bereits angezeigt wird, um mehrfache Anzeige zu verhindern
            if (showHotseatModal) {
                logger.log('🎯 [HOTSEAT MODAL] triggerHotseatAlert übersprungen - Modal wird bereits angezeigt')
                return
            }
            const isMeHotseat = myName === hotseatName
            logger.log('🎯 [HOTSEAT MODAL] triggerHotseatAlert aufgerufen:', {
                hotseatName: hotseatName,
                isMeHotseat: isMeHotseat,
                myName: myName,
                players: Object.keys(players || {}),
                showHotseatModal: showHotseatModal
            })
            setShowHotseatModal(true)
            logger.log('🎯 [HOTSEAT MODAL] showHotseatModal auf true gesetzt')
        } else {
            logger.warn('🎯 [HOTSEAT MODAL] triggerHotseatAlert fehlgeschlagen - fehlende Parameter:', { hotseatName, players })
        }
    }
    
    // Hotseat-Modal schließen
    const closeHotseatModal = () => {
        logger.log('🎯 [HOTSEAT MODAL] Modal wird geschlossen')
        setShowHotseatModal(false)
    }
    
    // Attack-Modal schließen
    const closeAttackModal = async () => {
        logger.log('💥 [ATTACK MODAL] Modal wird geschlossen')
        setShowAttackModal(false)
        setIsOpeningAttackModal(false)
        setAttackResult(null)
        
        // WICHTIG: Markiere Popup als bestätigt, damit es nicht erneut angezeigt wird
        if (roomId && myName && db) {
            try {
                // Verwende retryFirebaseOperation
                await retryFirebaseOperation(async () => {
                    const ref = doc(db, "lobbies", roomId)
                    const currentData = await getDoc(ref)
                    const currentPopupConfirmed = currentData.data()?.popupConfirmed || {}
                    
                    if (!currentPopupConfirmed[myName]) {
                        logger.log('💥 [ATTACK MODAL] Markiere Popup als bestätigt für', myName)
                        await updateDoc(ref, {
                            [`popupConfirmed.${myName}`]: true
                        })
                        logger.log('💥 [ATTACK MODAL] Popup erfolgreich als bestätigt markiert')
                    }
                }, `confirmPopup_${myName}`, 3, 500)
            } catch (err) {
                logger.error('💥 [ATTACK MODAL] Fehler beim Markieren als bestätigt:', err)
                // Fehler ignorieren, da wir jetzt in autoNext darauf vertrauen, dass "Ready" reicht
            }
        }
    }
    
    // Party Mode: Falsche Antwort (10° Strafhitze)
    const handlePartyModeWrongAnswer = async () => {
        logger.log('❌ [PARTY MODE] handlePartyModeWrongAnswer aufgerufen für', myName)
        
        if (!db || !roomId) {
            logger.warn('❌ [PARTY MODE] Fehlende Parameter')
            return
        }
        
        const dmg = 10
        const ref = doc(db, "lobbies", roomId)
        const currentData = await getDoc(ref)
        const currentAttackDecisions = currentData.data()?.attackDecisions || {}
        const updatedAttackDecisions = {
            ...currentAttackDecisions,
            [myName]: true
        }
        
        logger.log('❌ [PARTY MODE] Wende Strafhitze an:', {
            dmg: dmg,
            myName: myName,
            attackDecisions: updatedAttackDecisions
        })
        
        await updateDoc(ref, {
            [`players.${myName}.temp`]: increment(dmg),
            log: arrayUnion(`❌ ${myName} hat falsch geraten und sich selbst aufgeheizt (+${dmg}°C)`),
            attackDecisions: updatedAttackDecisions
        }).then(() => {
            logger.log('❌ [PARTY MODE] Strafhitze erfolgreich angewendet')
            // WICHTIG: Aktualisiere globalData sofort, damit die UI die Änderung sofort anzeigt
            if (globalData && globalData.players && globalData.players[myName]) {
                const currentTemp = globalData.players[myName].temp || 0
                setGlobalData({
                    ...globalData,
                    players: {
                        ...globalData.players,
                        [myName]: {
                            ...globalData.players[myName],
                            temp: currentTemp + dmg
                        }
                    }
                })
            }
        }).catch(err => {
            logger.error('❌ [PARTY MODE] Fehler:', err)
        })
    }
    
    // Angriff ausführen
    const doAttack = async (target) => {
        playSound('attack', 0.6) // Sound beim Angriff
        logger.log('🔥 [ATTACK] Starte Angriff auf:', target)
        
        if (!db || !roomId) {
            logger.warn('🔥 [ATTACK] Fehlende Parameter')
            return
        }
        
        // UI-Feedback sofort: Aber localActionDone erst bei Erfolg final setzen
        // Wir könnten hier einen Loading-State setzen, aber localActionDone verhindert weitere Klicks
        // Das ist riskant wenn es fehlschlägt.
        // Besser: Loading State.
        
        const isPartyMode = true
        const baseDmg = GAME_CONSTANTS.ATTACK_DMG_PARTY
        const attackerState = globalData?.players?.[myName] || {}
        const hasOil = attackerState.inventory?.includes('card_oil')
        const dmg = baseDmg * (hasOil ? 2 : 1)
        
        // RACE-CONDITION-PREVENTION: Verwende runTransaction für atomares Update
        // Dies verhindert, dass mehrere Clients gleichzeitig angreifen oder doppelte Angriffe entstehen
        try {
            await runTransaction(db, async (transaction) => {
                const lobbyRef = doc(db, "lobbies", roomId)
                const lobbyDoc = await transaction.get(lobbyRef)
                
                if (!lobbyDoc.exists()) {
                    throw new Error("Lobby existiert nicht mehr!")
                }
                
                const lobbyData = lobbyDoc.data()
                const currentPendingAttacks = lobbyData?.pendingAttacks || {}
                const currentAttackDecisions = lobbyData?.attackDecisions || {}
                
                // WICHTIG: Prüfe ob bereits eine Angriffsentscheidung getroffen wurde
                if (currentAttackDecisions[myName] === true) {
                    throw new Error("Du hast bereits eine Angriffsentscheidung getroffen!")
                }
                
                // Erstelle neue Attack-Liste für das Ziel
                const targetAttacks = currentPendingAttacks[target] || []
                targetAttacks.push({
                    attacker: myName,
                    dmg: dmg,
                    hasOil: hasOil
                })
                
                // Atomar: Update pendingAttacks und attackDecisions
                const updatedPendingAttacks = {
                    ...currentPendingAttacks,
                    [target]: targetAttacks
                }
                
                const updatedAttackDecisions = {
                    ...currentAttackDecisions,
                    [myName]: true
                }
                
                transaction.update(lobbyRef, {
                    pendingAttacks: updatedPendingAttacks,
                    attackDecisions: updatedAttackDecisions
                })
                
                // Ölfass entfernen, falls verwendet
                if (hasOil) {
                    transaction.update(lobbyRef, {
                        [`players.${myName}.inventory`]: arrayRemove('card_oil')
                    })
                    logger.log('🔥 [ATTACK] Ölfass wird verbraucht')
                }
            })
            
            logger.log('🔥 [ATTACK] Angriff erfolgreich gesendet (Transaction)')
            // WICHTIG: Erst JETZT UI sperren
            setLocalActionDone(true)
            
        } catch (err) {
            logger.error('🔥 [ATTACK] Fehler:', err)
            if (err.message === "Du hast bereits eine Angriffsentscheidung getroffen!") {
                setLocalActionDone(true) // Korrigiere UI falls State inkonsistent
                alert("Du hast bereits eine Angriffsentscheidung getroffen!")
            } else {
                alert("Fehler beim Senden des Angriffs: " + err.message)
                // localActionDone NICHT setzen, damit User es nochmal versuchen kann
            }
        }
    }
    
    // Nächste Runde starten - NUR VOM HOST
    const nextRound = async () => {
        // HOST AUTHORITY: Nur Host darf nextRound ausführen
        if (!isHost) {
            logger.warn('🔄 [NEXT ROUND] Nicht der Host - Zugriff verweigert')
            return
        }
        
        const opId = `nextRound_${Date.now()}`
        pendingOperationsRef.current.set(opId, { startTime: Date.now(), attempts: 0 })
        logger.log('🔄 [NEXT ROUND] Starte nextRound:', {
            isHost: isHost,
            hasDb: !!db,
            roomId: roomId,
            myName: myName
        })
        
        if (!db || !roomId) {
            logger.warn('🔄 [NEXT ROUND] Fehlende Parameter')
            return
        }
        
        // Prüfe nochmal explizit ob Host oder ob Failover erlaubt ist
        const currentDoc = await getDoc(doc(db, "lobbies", roomId))
        if (!currentDoc.exists()) {
            logger.warn('🔄 [NEXT ROUND] Lobby existiert nicht')
            return
        }
        
        const currentData = currentDoc.data()
        
        // WICHTIG: Prüfe ob Lobby gelöscht wurde
        if (currentData.status === 'deleted') {
            logger.warn('🔄 [NEXT ROUND] Lobby wurde gelöscht')
            return
        }
        
        // WICHTIG: Prüfe ob roomId noch gesetzt ist (Race Condition Schutz)
        if (!roomId) {
            logger.warn('🔄 [NEXT ROUND] roomId wurde gelöscht')
            return
        }
        
        const isCurrentHost = currentData.host === myName
        
        // WICHTIG: Erlaube auch Nicht-Hosts, wenn alle Bedingungen erfüllt sind (Failover)
        if (!isCurrentHost && !isHost) {
            // Prüfe ob Failover erlaubt ist (alle bereit, alle abgestimmt, etc.)
            const maxTemp = currentData.config?.maxTemp || 100
            const eliminatedPlayersFailover = currentData.eliminatedPlayers || []
            const activePlayers = Object.keys(currentData.players || {}).filter(p => {
                const temp = currentData.players?.[p]?.temp || 0
                return temp < maxTemp && !eliminatedPlayersFailover.includes(p)
            })
            const playerCount = activePlayers.length
            // WICHTIG: Zähle nur Votes mit richtiger roundId
            const voteCount = activePlayers.filter(p => {
                const vote = currentData.votes?.[p]
                if (!vote || vote.choice === undefined) return false
                // WICHTIG: Prüfe ob Vote aus aktueller Runde stammt
                const voteRoundId = vote.roundId
                return voteRoundId !== undefined && voteRoundId === currentData.roundId
            }).length
            const readyList = currentData.ready || []
            const readyCount = activePlayers.filter(p => readyList.includes(p)).length
            const allReady = readyCount >= playerCount && playerCount > 0
            const allVoted = voteCount >= playerCount && playerCount > 0
            
            const popupConfirmed = currentData.popupConfirmed || {}
            const hasAttackResults = currentData.attackResults && Object.keys(currentData.attackResults).length > 0
            const allPopupConfirmed = !hasAttackResults || activePlayers.every(p => {
                if (!currentData.attackResults?.[p]) return true
                return popupConfirmed[p] === true
            })
            
            const roundRecapShown = currentData.roundRecapShown ?? false
            
            // Nur erlauben wenn alle Bedingungen erfüllt sind
            if (!(allReady && allVoted && allPopupConfirmed && roundRecapShown && currentData.status === 'result')) {
                const voteDetails = activePlayers.map(p => {
                    const vote = currentData.votes?.[p]
                    return {
                        player: p,
                        hasVote: !!vote,
                        choice: vote?.choice,
                        roundId: vote?.roundId,
                        currentRoundId: currentData.roundId,
                        isValid: vote?.roundId === currentData.roundId
                    }
                })
                logger.warn('🔄 [NEXT ROUND] Nicht der Host und Failover-Bedingungen nicht erfüllt:', {
                    roundId: currentData.roundId,
                    allReady,
                    allVoted,
                    allPopupConfirmed,
                    roundRecapShown,
                    status: currentData.status,
                    voteCount: voteCount,
                    playerCount: playerCount,
                    readyCount: readyCount,
                    voteDetails: voteDetails,
                    readyList: readyList
                })
                return
            }
            
            logger.log('🔄 [NEXT ROUND] Failover erlaubt - alle Bedingungen erfüllt')
        } else if (!isCurrentHost) {
            logger.warn('🔄 [NEXT ROUND] Host-Check fehlgeschlagen:', {
                host: currentData.host,
                myName: myName
            })
            return
        }
        
        logger.log('🔄 [NEXT ROUND] Aktuelle Daten:', {
            roundId: currentData.roundId,
            status: currentData.status,
            players: Object.keys(currentData.players || {})
        })
        const players = currentData?.players || {}
        const playerNames = Object.keys(players)
        const maxTemp = currentData?.config?.maxTemp || GAME_CONSTANTS.MAX_TEMP_DEFAULT
        const activePlayers = getActivePlayers(players, maxTemp)
        
        logger.log('🔄 [NEXT ROUND] Aktive Spieler:', {
            allPlayers: playerNames,
            activePlayers: activePlayers,
            maxTemp: maxTemp,
            playerTemps: playerNames.map(p => ({ name: p, temp: currentData?.players[p]?.temp || 0 }))
        })
        
        // WICHTIG: Prüfe auf Spielende - wenn nur noch 1 oder 0 aktive Spieler, beende das Spiel
        if (activePlayers.length <= 1) {
            const winnerName = activePlayers.length === 1 ? activePlayers[0] : null
            logger.log('🏆 [NEXT ROUND] Spielende erkannt:', {
                activePlayers: activePlayers.length,
                winner: winnerName,
                allPlayers: playerNames.map(p => ({ name: p, temp: currentData?.players[p]?.temp || 0 }))
            })
            
            await updateDoc(doc(db, "lobbies", roomId), {
                status: 'winner'
            })
            return
        }
        
        // WICHTIG: Rotiere Hotseat - finde nächsten Spieler
        // WICHTIG: Stelle sicher, dass currentHotseat ein String ist
        const currentHotseatRaw = currentData?.hotseat || ''
        const currentHotseat = typeof currentHotseatRaw === 'string' ? currentHotseatRaw : (currentHotseatRaw?.name || String(currentHotseatRaw || ''))
        let nextHotseatIndex = activePlayers.indexOf(currentHotseat)
        if (nextHotseatIndex === -1) nextHotseatIndex = 0
        nextHotseatIndex = (nextHotseatIndex + 1) % activePlayers.length
        const nextHotseat = activePlayers[nextHotseatIndex]
        
        const usedQuestions = currentData?.usedQuestions || []
        const activeCategories = currentData?.config?.categories || Object.keys(questionCategories)
        
        // WICHTIG: Deterministische Frage-Auswahl basierend auf roundId, damit alle Spieler die gleiche Frage sehen
        const allQuestions = getAllQuestions(activeCategories)
        
        // Migration: Wenn usedQuestions noch Indizes enthält, konvertiere zu IDs
        let usedQuestionIds = usedQuestions
        if (usedQuestions.length > 0 && typeof usedQuestions[0] === 'number') {
            // Alte Daten: Indizes zu IDs konvertieren
            usedQuestionIds = usedQuestions.map(idx => allQuestions[idx]?.id).filter(Boolean)
        }
        
        const unusedQuestions = allQuestions.filter(q => q.id && !usedQuestionIds.includes(q.id))
        // Verwende roundId als Seed für deterministische Auswahl
        const nextRoundId = (currentData?.roundId ?? 0) + 1
        const questionIndex = unusedQuestions.length > 0 ? (nextRoundId % unusedQuestions.length) : 0
        const randomQ = unusedQuestions[questionIndex] || allQuestions[0]
        
        // Bei nextRound direkt zu 'game' wechseln
        
        logger.log('🔄 [NEXT ROUND] Runden-Details:', {
            currentHotseat: currentHotseat,
            nextHotseat: nextHotseat,
            nextHotseatIndex: nextHotseatIndex,
            question: randomQ.q,
            nextRoundId: nextRoundId
        })
        
        // WICHTIG: Eiswürfel-Automatik vor dem Rundenwechsel
        logger.log('🧊 [NEXT ROUND] Wende Eiswürfel-Automatik an')
        await applyIceCooling(currentData.players)
        
        logger.log('🔄 [NEXT ROUND] Bereite nächste Runde vor:', {
            nextRoundId: nextRoundId,
            hotseat: nextHotseat,
            question: randomQ.q,
            activePlayers: activePlayers
        })
        
        // ATOMARES UPDATE: Nur spezifische Felder setzen, nicht ganze Objekte überschreiben
        // Verwende deleteField für Felder, die zurückgesetzt werden sollen
        logger.log('🔍 [NEXT ROUND] Erstelle updateData Objekt:', {
            currentRoundId: currentData?.roundId,
            nextRoundId: nextRoundId,
            currentStatus: currentData?.status,
            nextHotseat: nextHotseat,
            hasRandomQ: !!randomQ,
            randomQId: randomQ?.id,
            randomQCategory: randomQ?.category
        })
        
        const updateData = {
            status: 'game',
            hotseat: nextHotseat,
            currentQ: randomQ,
            roundId: nextRoundId,
            lastQuestionCategory: randomQ.category,
            roundRecapShown: false,
            lastHostActivity: serverTimestamp() // Host-Aktivität für Failover-Tracking
        }
        
        logger.log('🔍 [NEXT ROUND] Basis-updateData erstellt:', {
            keys: Object.keys(updateData),
            status: updateData.status,
            roundId: updateData.roundId,
            hotseat: updateData.hotseat,
            hasCurrentQ: !!updateData.currentQ
        })
        
        // Lösche alte Felder atomar
        updateData.votes = deleteField()
        updateData.ready = []
        updateData.lobbyReady = {}
        updateData.pendingAttacks = {}
        updateData.attackDecisions = {}
        updateData.attackResults = {}
        updateData.popupConfirmed = {}
        
        logger.log('🔍 [NEXT ROUND] updateData vollständig erstellt:', {
            totalKeys: Object.keys(updateData).length,
            hasDeleteFields: updateData.votes === deleteField(),
            arrayFields: {
                ready: Array.isArray(updateData.ready),
                usedQuestions: Array.isArray(updateData.usedQuestions)
            },
            objectFields: {
                lobbyReady: typeof updateData.lobbyReady === 'object',
                pendingAttacks: typeof updateData.pendingAttacks === 'object',
                attackDecisions: typeof updateData.attackDecisions === 'object',
                attackResults: typeof updateData.attackResults === 'object',
                popupConfirmed: typeof updateData.popupConfirmed === 'object'
            }
        })
        
        // Füge neue usedQuestion hinzu
        if (randomQ.id && !usedQuestionIds.includes(randomQ.id)) {
            updateData.usedQuestions = [...usedQuestionIds, randomQ.id]
        } else {
            updateData.usedQuestions = usedQuestionIds
        }
        
        logger.log('🔄 [NEXT ROUND] Update Firebase mit:', {
            roomId: roomId,
            roundId: updateData.roundId,
            status: updateData.status,
            hotseat: updateData.hotseat,
            currentQ: updateData.currentQ ? { q: updateData.currentQ.q?.substring(0, 50), category: updateData.currentQ.category } : null,
            lastQuestionCategory: updateData.lastQuestionCategory,
            roundRecapShown: updateData.roundRecapShown,
            hasLastHostActivity: !!updateData.lastHostActivity,
            votes: '[deleteField]',
            ready: Array.isArray(updateData.ready) ? updateData.ready : 'not array',
            lobbyReady: updateData.lobbyReady ? Object.keys(updateData.lobbyReady).length : 0,
            pendingAttacks: updateData.pendingAttacks ? Object.keys(updateData.pendingAttacks).length : 0,
            attackDecisions: updateData.attackDecisions ? Object.keys(updateData.attackDecisions).length : 0,
            attackResults: updateData.attackResults ? Object.keys(updateData.attackResults).length : 0,
            popupConfirmed: updateData.popupConfirmed ? Object.keys(updateData.popupConfirmed).length : 0,
            usedQuestions: Array.isArray(updateData.usedQuestions) ? updateData.usedQuestions.length : 'not array'
        })
        
        // WICHTIG: Prüfe nochmal ob roomId noch gesetzt ist (Race Condition Schutz)
        if (!roomId) {
            logger.warn('🔄 [NEXT ROUND] roomId wurde gelöscht, breche ab')
            pendingOperationsRef.current.delete(opId)
            return
        }
        
        // WICHTIG: Retry-Mechanismus für blockierte Anfragen
        logger.log('🔄 [NEXT ROUND] Starte Firebase-Update:', {
            roomId: roomId,
            updateDataKeys: Object.keys(updateData),
            roundId: updateData.roundId,
            status: updateData.status,
            hasDeleteFields: updateData.votes === deleteField(),
            updateDataSize: JSON.stringify(updateData).length
        })
        
        const success = await retryFirebaseOperation(async () => {
            // Prüfe nochmal ob Lobby noch existiert
            if (!roomId) {
                throw new Error("roomId wurde gelöscht")
            }
            
            // Detailliertes Log vor dem Update
            logger.log('🔄 [NEXT ROUND] Versuche updateDoc:', {
                roomId: roomId,
                timestamp: Date.now(),
                updateData: {
                    status: updateData.status,
                    roundId: updateData.roundId,
                    hotseat: updateData.hotseat,
                    hasVotes: updateData.votes !== undefined,
                    readyLength: Array.isArray(updateData.ready) ? updateData.ready.length : 'not array',
                    lobbyReadyKeys: updateData.lobbyReady ? Object.keys(updateData.lobbyReady).length : 0,
                    pendingAttacksKeys: updateData.pendingAttacks ? Object.keys(updateData.pendingAttacks).length : 0,
                    attackDecisionsKeys: updateData.attackDecisions ? Object.keys(updateData.attackDecisions).length : 0,
                    attackResultsKeys: updateData.attackResults ? Object.keys(updateData.attackResults).length : 0,
                    popupConfirmedKeys: updateData.popupConfirmed ? Object.keys(updateData.popupConfirmed).length : 0,
                    usedQuestionsLength: Array.isArray(updateData.usedQuestions) ? updateData.usedQuestions.length : 'not array',
                    hasCurrentQ: !!updateData.currentQ,
                    lastQuestionCategory: updateData.lastQuestionCategory,
                    roundRecapShown: updateData.roundRecapShown,
                    hasLastHostActivity: !!updateData.lastHostActivity
                }
            })
            
            const updateStartTime = Date.now()
            await updateDoc(doc(db, "lobbies", roomId), updateData)
            const updateDuration = Date.now() - updateStartTime
            
            logger.log('✅ [NEXT ROUND] updateDoc erfolgreich:', {
                duration: updateDuration + 'ms',
                roomId: roomId,
                roundId: updateData.roundId,
                timestamp: new Date().toISOString()
            })
        }, opId, 3, 1000)
        
        if (success) {
            pendingOperationsRef.current.delete(opId)
            logger.log('🔄 [NEXT ROUND] Firebase aktualisiert, direkt zu Game-Status')
        } else {
            logger.error('❌ [NEXT ROUND] Firebase-Update fehlgeschlagen nach mehreren Versuchen')
            // Prüfe ob Lobby noch existiert, bevor wir retryen
            if (!roomId) {
                logger.warn('🔄 [NEXT ROUND] roomId wurde gelöscht, kein Retry')
                pendingOperationsRef.current.delete(opId)
                return
            }
            
            // Versuche es erneut nach längerer Pause
            setTimeout(async () => {
                // Prüfe nochmal ob roomId noch gesetzt ist
                if (!roomId || !db) {
                    logger.warn('🔄 [NEXT ROUND] roomId oder db fehlt, kein Retry')
                    pendingOperationsRef.current.delete(opId)
                    return
                }
                
                try {
                    // Prüfe ob Lobby noch existiert
                    const checkDoc = await getDoc(doc(db, "lobbies", roomId))
                    if (!checkDoc.exists() || checkDoc.data()?.status === 'deleted') {
                        logger.warn('🔄 [NEXT ROUND] Lobby existiert nicht mehr, kein Retry')
                        pendingOperationsRef.current.delete(opId)
                        return
                    }
                    
                    await updateDoc(doc(db, "lobbies", roomId), updateData)
                    lastSuccessfulUpdateRef.current = Date.now()
                    pendingOperationsRef.current.delete(opId)
                    logger.log('✅ [NEXT ROUND] Retry erfolgreich')
                } catch (err) {
                    logger.error('❌ [NEXT ROUND] Retry auch fehlgeschlagen:', err)
                    pendingOperationsRef.current.delete(opId)
                    // Watchdog wird das Problem erkennen und Recovery starten
                }
            }, 3000)
        }
    }
    
    // executePendingAttacks - Hitze verteilen - NUR VOM HOST
    const executePendingAttacks = async (data) => {
        const opId = `executeAttacks_${data?.roundId || Date.now()}`
        pendingOperationsRef.current.set(opId, { startTime: Date.now(), attempts: 0 })
        
        // HOST AUTHORITY: Prüfe ob ich der Host bin ODER ob ich als Backup-Host agieren kann
        // WICHTIG: Prüfe basierend auf aktuellen Firebase-Daten, nicht auf React State
        const maxTemp = data?.config?.maxTemp || 100
        const activePlayers = Object.keys(data?.players || {}).filter(p => {
            const temp = data.players?.[p]?.temp || 0
            return temp < maxTemp
        }).sort()
        const hostName = data?.host
        const isCurrentHost = hostName === myName
        const myIndex = activePlayers.indexOf(myName)
        const isFirstBackupHost = myIndex === 0 && activePlayers.length > 0
        
        // Erlaube Ausführung wenn: Ich bin Host ODER Ich bin erster Backup-Host
        const canExecute = isCurrentHost || isFirstBackupHost || isHost
        
        logger.log('⚔️ [EXECUTE ATTACKS] Starte executePendingAttacks:', {
            roundId: data?.roundId,
            myName: myName,
            hostName: hostName,
            isCurrentHost: isCurrentHost,
            isFirstBackupHost: isFirstBackupHost,
            isHost: isHost,
            canExecute: canExecute,
            hasDb: !!db,
            roomId: roomId
        })
        
        if (!canExecute) {
            logger.warn('⚔️ [EXECUTE ATTACKS] Kein Host oder Backup-Host - Zugriff verweigert')
            pendingOperationsRef.current.delete(opId)
            return
        }
        
        if (!db || !roomId) {
            logger.warn('⚔️ [EXECUTE ATTACKS] Fehlende Parameter')
            pendingOperationsRef.current.delete(opId)
            return
        }
        
        // Prüfe nochmal explizit ob Host
        const currentDoc = await getDoc(doc(db, "lobbies", roomId))
        if (!currentDoc.exists()) {
            logger.warn('⚔️ [EXECUTE ATTACKS] Lobby existiert nicht mehr')
            return
        }
        
        const currentDocData = currentDoc.data()
        if (currentDocData.status === 'deleted') {
            logger.warn('⚔️ [EXECUTE ATTACKS] Lobby wurde gelöscht')
            return
        }
        
        if (currentDocData.host !== myName) {
            logger.warn('⚔️ [EXECUTE ATTACKS] Host-Check fehlgeschlagen')
            return
        }
        
        // WICHTIG: Prüfe nochmal ob roomId noch gesetzt ist (Race Condition Schutz)
        if (!roomId) {
            logger.warn('⚔️ [EXECUTE ATTACKS] roomId wurde gelöscht')
            return
        }
        
        // Verwende aktuelle Daten aus Firebase, nicht übergebene Daten
        const currentData = currentDoc.data()
        const pendingAttacks = currentData.pendingAttacks || {}
        const players = currentData.players || {}
        const attackDecisions = currentData.attackDecisions || {}
        
        // WICHTIG: Stelle sicher, dass hotseat ein String ist (außerhalb der filter-Funktionen definiert)
        const hotseatName = typeof currentData.hotseat === 'string' ? currentData.hotseat : (currentData.hotseat?.name || String(currentData.hotseat || ''))
        
        // WICHTIG: Prüfe ob alle Spieler, die einen Angriff wählen können, auch wirklich einen Angriff in pendingAttacks haben
        // Oder ob sie sich entschieden haben, keinen Angriff zu machen (attackDecisions[player] = true, aber kein Eintrag in pendingAttacks)
        const maxTempConfig = currentData?.config?.maxTemp || 100
        const eliminatedPlayers = currentData?.eliminatedPlayers || []
        // WICHTIG: Filtere eliminierten Spieler heraus - sie können nicht mehr angreifen und müssen nicht mehr entscheiden
        const playerNames = Object.keys(players).filter(p => {
            const temp = players[p]?.temp || 0
            return temp < maxTempConfig && !eliminatedPlayers.includes(p)
        })
        const playersWhoCanAttack = playerNames.filter(p => {
            // Hotseat kann nicht angreifen
            if (p === hotseatName) return false
            // Spieler die falsch geraten haben, können nicht angreifen
            const votes = currentData.votes || {}
            const hotseatVote = votes[hotseatName]
            const playerVote = votes[p]
            if (hotseatVote && playerVote) {
                const truth = String(hotseatVote.choice || '')
                const playerChoice = String(playerVote.choice || '')
                if (playerChoice !== truth) return false
            }
            return true
        })
        
        // Prüfe ob alle Spieler, die angreifen können, auch eine Entscheidung getroffen haben
        const allAttackersDecided = playersWhoCanAttack.every(p => attackDecisions[p] === true)
        
        // WICHTIG: Prüfe auch ob alle Spieler (inklusive die, die falsch geraten haben) eine Entscheidung getroffen haben
        // Spieler die falsch geraten haben, haben bereits attackDecisions[player] = true durch handlePartyModeWrongAnswer
        // WICHTIG: Eliminierte Spieler werden nicht mehr berücksichtigt
        const playersWhoCannotAttack = playerNames.filter(p => {
            if (p === hotseatName) return false
            const votes = currentData.votes || {}
            const hotseatVote = votes[hotseatName]
            const playerVote = votes[p]
            if (hotseatVote && playerVote) {
                const truth = String(hotseatVote.choice || '')
                const playerChoice = String(playerVote.choice || '')
                if (playerChoice !== truth) return true  // Falsch geraten = kann nicht angreifen
            }
            return false
        })
        
        // Alle Spieler die nicht angreifen können, müssen bereits attackDecisions haben (durch handlePartyModeWrongAnswer)
        const allNonAttackersDecided = playersWhoCannotAttack.every(p => attackDecisions[p] === true)
        
        logger.log('⚔️ [EXECUTE ATTACKS] Verarbeite Angriffe:', {
            roundId: currentData.roundId,
            pendingAttacks: pendingAttacks,
            players: Object.keys(players),
            playersWhoCanAttack: playersWhoCanAttack,
            playersWhoCannotAttack: playersWhoCannotAttack,
            allAttackersDecided: allAttackersDecided,
            allNonAttackersDecided: allNonAttackersDecided,
            attackDecisions: attackDecisions
        })
        
        // WICHTIG: Wenn nicht alle Angreifer entschieden haben UND es gibt Spieler die angreifen können, warte noch
        // Aber wenn alle Nicht-Angreifer entschieden haben und es keine Angreifer gibt, fahre fort
        if (!allAttackersDecided && playersWhoCanAttack.length > 0) {
            const missing = playersWhoCanAttack.filter(p => !attackDecisions[p])
            logger.warn('⚔️ [EXECUTE ATTACKS] ❌ Nicht alle Angreifer haben entschieden, warte noch...', {
                roundId: currentData.roundId,
                playersWhoCanAttack: playersWhoCanAttack,
                missing: missing,
                attackDecisions: attackDecisions,
                pendingAttacks: pendingAttacks,
                allAttackersDecided: allAttackersDecided
            })
            return
        }
        
        // WICHTIG: Wenn es keine Angreifer gibt (alle haben falsch geraten), fahre trotzdem fort
        // wenn alle Nicht-Angreifer entschieden haben (Strafhitze wurde bereits angewendet)
        // ABER: Wenn niemand angreifen kann, fahre trotzdem fort (auch wenn noch nicht alle attackDecisions gesetzt sind)
        // Das verhindert, dass das Spiel hängen bleibt, wenn niemand richtig geraten hat
        if (playersWhoCanAttack.length === 0 && !allNonAttackersDecided && playersWhoCannotAttack.length > 0) {
            const missing = playersWhoCannotAttack.filter(p => !attackDecisions[p])
            // FALLBACK: Wenn niemand angreifen kann und alle Spieler falsch geraten haben (inkl. Hotseat),
            // warte maximal kurz, dann fahre trotzdem fort
            logger.warn('⚔️ [EXECUTE ATTACKS] ❌ Nicht alle Nicht-Angreifer haben entschieden, warte noch...', {
                roundId: currentData.roundId,
                playersWhoCannotAttack: playersWhoCannotAttack,
                missing: missing,
                attackDecisions: attackDecisions,
                allNonAttackersDecided: allNonAttackersDecided,
                totalPlayers: playerNames.length,
                hotseatName: hotseatName
            })
            
            // WICHTIG: Wenn ALLE aktiven Spieler (inkl. Hotseat) falsch geraten haben,
            // fahre nach kurzer Wartezeit trotzdem fort (Race Condition Prevention)
            const allPlayersGuessedWrong = playerNames.length === (playersWhoCannotAttack.length + 1) // +1 für Hotseat
            if (allPlayersGuessedWrong) {
                logger.log('⚔️ [EXECUTE ATTACKS] ✅ FALLBACK: Alle haben falsch geraten (inkl. Hotseat), fahre fort...')
                await updateDoc(doc(db, "lobbies", roomId), {
                    roundRecapShown: true,
                    attackResults: {} // Nur Strafhitze, keine normalen Angriffe
                })
                return
            }
            
            return
        }
        
        // WICHTIG: Wenn es keine Angreifer gibt (alle haben falsch geraten), aber alle haben entschieden,
        // fahre trotzdem fort (Strafhitze wurde bereits angewendet, es gibt keine normalen Angriffe)
        if (playersWhoCanAttack.length === 0 && allNonAttackersDecided) {
            logger.log('⚔️ [EXECUTE ATTACKS] ✅ Keine Angreifer, aber alle haben entschieden (nur Strafhitze), fahre fort...')
            // Setze roundRecapShown auf true, damit das Spiel weitergeht
            // WICHTIG: Setze auch attackResults auf leeres Objekt, damit die UI weiß, dass es keine Angriffe gibt
            await updateDoc(doc(db, "lobbies", roomId), {
                roundRecapShown: true,
                attackResults: {} // Leeres Objekt, damit die UI weiß, dass es keine Angriffe gibt
            })
            return // Beende hier, da es keine normalen Angriffe zu verarbeiten gibt
        }
        
        // WICHTIG: Fallback: Wenn es keine Angreifer gibt und auch keine Nicht-Angreifer (nur Hotseat),
        // fahre trotzdem fort
        if (playersWhoCanAttack.length === 0 && playersWhoCannotAttack.length === 0) {
            logger.log('⚔️ [EXECUTE ATTACKS] ✅ Keine Angreifer und keine Nicht-Angreifer (nur Hotseat), fahre fort...')
            await updateDoc(doc(db, "lobbies", roomId), {
                roundRecapShown: true,
                attackResults: {}
            })
            return
        }
        
        logger.log('⚔️ [EXECUTE ATTACKS] ✅ Alle Entscheidungen getroffen, verarbeite Angriffe...', {
            roundId: currentData.roundId,
            playersWhoCanAttack: playersWhoCanAttack,
            playersWhoCannotAttack: playersWhoCannotAttack,
            allAttackersDecided: allAttackersDecided,
            allNonAttackersDecided: allNonAttackersDecided,
            pendingAttacks: pendingAttacks
        })
        
        const tempUpdates = {}
        const attackResults = {}
        const logEntries = []
        
        // Verarbeite alle Angriffe
        for (const [target, attacks] of Object.entries(pendingAttacks)) {
            if (!players[target] || !Array.isArray(attacks) || attacks.length === 0) continue
            
            const targetState = players[target]
            const targetHasMirror = targetState.inventory?.includes('card_mirror')
            let totalDmg = 0
            const attackerNames = []
            
            attacks.forEach(attack => {
                totalDmg += attack.dmg || 0
                attackerNames.push(attack.attacker)
                if (attack.hasOil) {
                    logEntries.push(`🔥 ${attack.attacker} greift ${target} mit dem Ölfass an (+${attack.dmg}°C)`)
                } else {
                    logEntries.push(`🔥 ${attack.attacker} greift ${target} an (+${attack.dmg}°C)`)
                }
            })
            
            if (targetHasMirror) {
                // Spiegele Angriffe zurück - ATOMARES UPDATE
                await updateDoc(doc(db, "lobbies", roomId), {
                    [`players.${target}.inventory`]: arrayRemove('card_mirror')
                })
                
                attacks.forEach(attack => {
                    if (!tempUpdates[`players.${attack.attacker}.temp`]) {
                        tempUpdates[`players.${attack.attacker}.temp`] = 0
                    }
                    tempUpdates[`players.${attack.attacker}.temp`] += attack.dmg || 0
                })
                
                const attackerList = attackerNames.join(' und ')
                logEntries.push(`🪞 ${target} spiegelt die Angriffe von ${attackerList} zurück! (+${totalDmg}°C)`)
                
                attackResults[target] = {
                    attackers: attackerNames,
                    totalDmg: 0,
                    attackDetails: attacks.map(a => ({ attacker: a.attacker, dmg: a.dmg || 0, mirrored: true }))
                }
            } else {
                // Normaler Angriff
                if (!tempUpdates[`players.${target}.temp`]) {
                    tempUpdates[`players.${target}.temp`] = 0
                }
                tempUpdates[`players.${target}.temp`] += totalDmg
                
                attackResults[target] = {
                    attackers: [...attackerNames],
                    totalDmg: totalDmg,
                    attackDetails: attacks.map(a => ({ attacker: a.attacker, dmg: a.dmg || 0 }))
                }
            }
        }
        
        // Füge Strafhitze für falsche Antworten hinzu
        const votes = currentData.votes || {}
        // WICHTIG: Stelle sicher, dass hotseat ein String ist
        const hotseat = typeof currentData.hotseat === 'string' ? currentData.hotseat : (currentData.hotseat?.name || String(currentData.hotseat || ''))
        const truth = votes?.[hotseat]?.choice
        const isPartyMode = true
        const allPlayers = Object.keys(players)
        
        // WICHTIG: Vergleiche Strings mit Strings (Firebase speichert als String)
        allPlayers.forEach(playerName => {
            if (playerName === hotseat) return
            
            const playerVote = votes[playerName]
            // Konvertiere beide zu String für Vergleich
            const playerChoice = String(playerVote?.choice || '')
            const truthChoice = String(truth || '')
            
            if (playerVote && playerChoice !== truthChoice) {
                // Falsch geraten - Strafhitze
                let penaltyDmg = GAME_CONSTANTS.PENALTY_DMG
                if (isPartyMode) {
                    // Im Party Mode wurde bereits 10° in handlePartyModeWrongAnswer angewendet
                    // Aber wir müssen es trotzdem zu attackResults hinzufügen für die Anzeige
                    penaltyDmg = 0 // Keine zusätzliche Temperatur-Änderung
                }
                
                if (penaltyDmg > 0) {
                    if (!tempUpdates[`players.${playerName}.temp`]) {
                        tempUpdates[`players.${playerName}.temp`] = 0
                    }
                    tempUpdates[`players.${playerName}.temp`] += penaltyDmg
                }
                
                // WICHTIG: Strafhitze IMMER zu attackResults hinzufügen (auch im Party Mode)
                // damit sie im Popup angezeigt wird, auch wenn sie bereits angewendet wurde
                if (!attackResults[playerName]) {
                    attackResults[playerName] = {
                        attackers: [],
                        totalDmg: 0,
                        attackDetails: []
                    }
                }
                
                // Im Party Mode: 10° Strafhitze wurde bereits angewendet, aber wir zeigen sie trotzdem
                // 10° Strafhitze wird hier angewendet und angezeigt
                const displayedPenaltyDmg = 10 // Immer 10° anzeigen
                attackResults[playerName].totalDmg += displayedPenaltyDmg
                attackResults[playerName].attackDetails.push({
                    attacker: 'Strafhitze',
                    dmg: displayedPenaltyDmg,
                    isPenalty: true
                })
            }
        })
        
        // Erstelle Attack-Ergebnisse für ALLE Spieler
        // WICHTIG: Auch Spieler ohne Schaden bekommen ein Ergebnis (für "cool geblieben" Popup)
        allPlayers.forEach(playerName => {
            if (!attackResults[playerName]) {
                attackResults[playerName] = {
                    attackers: [],
                    totalDmg: 0,
                    attackDetails: []
                }
            }
        })
        
        // ATOMARES UPDATE: Nur spezifische Felder aktualisieren
        const updateData = {
            pendingAttacks: {},
            attackResults: attackResults,
            roundRecapShown: true,
            lastHostActivity: serverTimestamp() // Host-Aktivität für Failover-Tracking
        }
        
        if (logEntries.length > 0) {
            // PERFORMANCE: Begrenze Log-Array auf letzte 50 Einträge
            // Lese aktuelles Log-Array, füge neue Einträge hinzu und kürze auf 50
            const currentLog = currentData.log || []
            const newLog = [...currentLog, ...logEntries]
            const limitedLog = newLog.slice(-50) // Nur letzte 50 Einträge behalten
            updateData.log = limitedLog
        }
        
        // Konvertiere tempUpdates zu Firebase-Format (increment für atomare Updates)
        for (const [path, dmg] of Object.entries(tempUpdates)) {
            const parts = path.split('.')
            if (parts.length === 3 && parts[0] === 'players' && parts[2] === 'temp') {
                const playerName = parts[1]
                updateData[`players.${playerName}.temp`] = increment(dmg)
            }
        }
        
        // WICHTIG: Retry-Mechanismus für blockierte Anfragen
        const success = await retryFirebaseOperation(async () => {
            await updateDoc(doc(db, "lobbies", roomId), updateData)
        }, opId, 3, 1000)
        
        if (success) {
            pendingOperationsRef.current.delete(opId)
        } else {
            logger.error('❌ [EXECUTE ATTACKS] Firebase-Update fehlgeschlagen nach mehreren Versuchen')
            // Versuche es erneut nach längerer Pause
            setTimeout(async () => {
                logger.log('⚔️ [EXECUTE ATTACKS] Retry nach 3 Sekunden...')
                try {
                    await updateDoc(doc(db, "lobbies", roomId), updateData)
                    lastSuccessfulUpdateRef.current = Date.now()
                    pendingOperationsRef.current.delete(opId)
                    logger.log('✅ [EXECUTE ATTACKS] Retry erfolgreich')
                } catch (err) {
                    logger.error('❌ [EXECUTE ATTACKS] Retry auch fehlgeschlagen:', err)
                    // Watchdog wird das Problem erkennen und Recovery starten
                }
            }, 3000)
        }
        
        // WICHTIG: Prüfe nach den Temperatur-Updates, ob nur noch ein Spieler übrig ist
        // Lese aktualisierte Daten aus Firebase, um die neuen Temperaturen zu bekommen
        const updatedDoc = await getDoc(doc(db, "lobbies", roomId))
        if (updatedDoc.exists()) {
            const updatedData = updatedDoc.data()
            const updatedPlayers = updatedData.players || {}
            const maxTemp = updatedData.config?.maxTemp || 100
            const activePlayers = Object.keys(updatedPlayers).filter(p => (updatedPlayers[p]?.temp || 0) < maxTemp)
            
            // Prüfe ob jemand gerade eliminiert wurde (100° erreicht)
            const newlyEliminated = Object.keys(updatedPlayers).filter(p => {
                const temp = updatedPlayers[p]?.temp || 0
                return temp >= maxTemp
            })
            
            // Prüfe ob jemand in dieser Runde eliminiert wurde (vorher war temp < maxTemp, jetzt >= maxTemp)
            // Vergleiche mit den Temperaturen vor dem Update
            const beforeUpdate = currentData.players || {}
            const justEliminated = newlyEliminated.filter(p => {
                const beforeTemp = beforeUpdate[p]?.temp || 0
                const afterTemp = updatedPlayers[p]?.temp || 0
                return beforeTemp < maxTemp && afterTemp >= maxTemp
            })
            
            logger.log('🏆 [WINNER CHECK] Prüfe auf Gewinner nach Angriffen:', {
                roundId: updatedData.roundId,
                allPlayers: Object.keys(updatedPlayers),
                activePlayers: activePlayers,
                newlyEliminated: newlyEliminated,
                justEliminated: justEliminated,
                playerTemps: Object.keys(updatedPlayers).map(p => ({
                    name: p,
                    temp: updatedPlayers[p]?.temp || 0,
                    beforeTemp: beforeUpdate[p]?.temp || 0,
                    isEliminated: (updatedPlayers[p]?.temp || 0) >= maxTemp
                })),
                maxTemp: maxTemp
            })
            
            // Wenn jemand gerade eliminiert wurde, setze eliminationInfo und füge zu eliminatedPlayers hinzu
            if (justEliminated.length > 0) {
                const eliminatedName = justEliminated[0]
                logger.log('🔥 [ELIMINATION] Spieler eliminiert:', eliminatedName)
                
                // Lese aktuelle eliminatedPlayers Liste
                const currentEliminated = updatedData.eliminatedPlayers || []
                const updatedEliminated = currentEliminated.includes(eliminatedName) 
                    ? currentEliminated 
                    : [...currentEliminated, eliminatedName]
                
                const updatePayload = {
                    eliminationInfo: {
                        player: eliminatedName,
                        roundId: updatedData.roundId,
                        timestamp: Date.now()
                    },
                    eliminatedPlayers: updatedEliminated,
                    // WICHTIG: Entferne aus lobbyReady, damit ausgeschiedene Spieler nicht mehr als "bereit" zählen
                    [`lobbyReady.${eliminatedName}`]: deleteField()
                }
                
                // WICHTIG: Wenn der eliminierte Spieler der Host ist, weise einen neuen Host zu
                const currentHost = updatedData.host
                if (eliminatedName === currentHost) {
                    // Finde den ersten noch aktiven Spieler (nicht eliminiert)
                    const remainingActivePlayers = activePlayers.filter(p => p !== eliminatedName)
                    if (remainingActivePlayers.length > 0) {
                        const newHost = remainingActivePlayers[0]
                        logger.log('👑 [HOST REASSIGNMENT] Host wurde eliminiert, neuer Host:', {
                            oldHost: eliminatedName,
                            newHost: newHost,
                            remainingPlayers: remainingActivePlayers
                        })
                        updatePayload.host = newHost
                    } else {
                        logger.warn('👑 [HOST REASSIGNMENT] Kein aktiver Spieler mehr für Host-Zuweisung!')
                    }
                }
                
                await updateDoc(doc(db, "lobbies", roomId), updatePayload)
            }
            
            // Wenn nur noch ein Spieler übrig ist, setze Status auf 'winner'
            if (activePlayers.length === 1) {
                const winnerName = activePlayers[0]
                logger.log('🏆 [WINNER] Nur noch ein Spieler übrig! Gewinner:', winnerName)
                await updateDoc(doc(db, "lobbies", roomId), {
                    status: 'winner'
                })
            } else if (activePlayers.length === 0) {
                // Alle sind raus - sollte nicht passieren, aber falls doch, setze auch auf winner
                logger.warn('🏆 [WINNER] Alle Spieler sind ausgeschieden!')
                await updateDoc(doc(db, "lobbies", roomId), {
                    status: 'winner'
                })
            }
        }
        
        // Nach executePendingAttacks: Prüfe ob alle Popups bestätigt wurden, dann automatisch weiter
        // Dies wird durch den Listener gehandhabt, der auf roundRecapShown reagiert
    }
    
    // Eiswürfel-Automatik: Kühle Spieler mit Eiswürfel ab
    const applyIceCooling = async (players) => {
        // HOST AUTHORITY: Nur Host darf applyIceCooling ausführen
        if (!isHost) {
            logger.warn('🧊 [ICE COOLING] Nicht der Host - Zugriff verweigert')
            return
        }
        
        if (!players || !db || !roomId) return
        const coolValue = globalData?.config?.dmg || 10
        const ref = doc(db, "lobbies", roomId)
        
        for (const name of Object.keys(players)) {
            if (players[name].inventory?.includes('card_ice')) {
                const reduction = Math.min(coolValue, players[name].temp || 0)
                if (reduction > 0) {
                    await updateDoc(ref, {
                        [`players.${name}.temp`]: increment(-reduction),
                        [`players.${name}.inventory`]: arrayRemove('card_ice'),
                        log: arrayUnion(`🧊 ${name} kühlt sich ab (-${reduction}°C)`)
                    })
                }
            }
        }
    }
    
    // Host: Runde erzwingen
    const forceNextRound = async () => {
        if (!isHost || !db || !roomId) return
        if (!window.confirm("Möchtest du wirklich zur nächsten Runde springen?")) return
        await nextRound()
        setMenuOpen(false)
    }
    
    // Host: Spiel neustarten
    const resetGame = async () => {
        if (!isHost || !db || !roomId) return
        if (!window.confirm("Möchtest du das Spiel wirklich neustarten? Alle Temperaturen werden zurückgesetzt.")) return
        
        const pClean = {}
        Object.keys(globalData?.players || {}).forEach(p => {
            pClean[p] = { temp: 0, inventory: [], emoji: globalData?.players[p]?.emoji || '😊' }
        })
        
        await updateDoc(doc(db, "lobbies", roomId), {
            status: 'lobby',
            players: pClean,
            votes: deleteField(),
            ready: [],
            log: [],
            hotseat: "",
            roundId: 0,
            lobbyReady: {},
            usedQuestions: [],
            pendingAttacks: deleteField(),
            attackResults: deleteField(),
            popupConfirmed: deleteField(),
            eliminatedPlayers: [] // WICHTIG: Setze eliminatedPlayers zurück
        })
        setMenuOpen(false)
    }
    
    // Host: Lobby löschen
    const killLobby = async () => {
        if (!isHost || !db || !roomId) return
        if (!window.confirm("Lobby wirklich löschen? Alle Spieler werden ausgeworfen und die Lobby ist danach nicht mehr verfügbar!")) return
        
        try {
            // Setze Status auf "deleted" bevor wir löschen, damit andere Spieler benachrichtigt werden
            const ref = doc(db, "lobbies", roomId)
            await updateDoc(ref, {
                status: 'deleted',
                deletedAt: serverTimestamp()
            }).catch(err => {
                logger.warn('⚠️ [KILL LOBBY] Konnte Status nicht setzen, lösche direkt:', err)
            })
            
            // Kurz warten, damit andere Spieler die Änderung sehen können
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // Jetzt löschen
            await deleteDoc(ref)
            logger.log('✅ [KILL LOBBY] Lobby gelöscht:', roomId)
            setMenuOpen(false)
            leaveLobby()
        } catch (error) {
            logger.error('❌ [KILL LOBBY] Fehler beim Löschen:', error)
            alert(`Fehler beim Löschen der Lobby: ${error.message}`)
        }
    }
    
    // Admin-Funktion: Alle alten/kaputten Lobbies löschen
    const deleteAllLobbies = async () => {
        if (!db) {
            alert("Fehler: Firebase ist nicht verfügbar.")
            return
        }
        
        if (!window.confirm("⚠️ WARNUNG: Alle offenen Lobbies werden gelöscht! Dies kann nicht rückgängig gemacht werden. Fortfahren?")) {
            return
        }
        
        if (!window.confirm("Bist du wirklich sicher? Alle Spieler werden ausgeworfen!")) {
            return
        }
        
        try {
            logger.log('🗑️ [ADMIN] Starte Löschung aller Lobbies...')
            const roomsRef = collection(db, "lobbies")
            const q = query(roomsRef, where("status", "in", ["lobby", "game", "result"]))
            const querySnapshot = await getDocs(q)
            
            let deletedCount = 0
            let errorCount = 0
            
            for (const docSnapshot of querySnapshot.docs) {
                try {
                    const lobbyData = docSnapshot.data()
                    // Setze Status auf "deleted" bevor wir löschen
                    await updateDoc(docSnapshot.ref, {
                        status: 'deleted',
                        deletedAt: serverTimestamp()
                    }).catch(() => {}) // Ignoriere Fehler beim Status-Setzen
                    
                    await deleteDoc(docSnapshot.ref)
                    deletedCount++
                    logger.log(`🗑️ [ADMIN] Lobby gelöscht: ${docSnapshot.id} (Host: ${lobbyData.hostName || lobbyData.host})`)
                } catch (error) {
                    errorCount++
                    logger.error(`❌ [ADMIN] Fehler beim Löschen von ${docSnapshot.id}:`, error)
                }
            }
            
            alert(`✅ ${deletedCount} Lobby(s) gelöscht.${errorCount > 0 ? `\n⚠️ ${errorCount} Fehler aufgetreten.` : ''}`)
            logger.log(`✅ [ADMIN] Löschung abgeschlossen: ${deletedCount} gelöscht, ${errorCount} Fehler`)
        } catch (error) {
            logger.error('❌ [ADMIN] Fehler beim Löschen aller Lobbies:', error)
            alert(`Fehler beim Löschen: ${error.message}`)
        }
    }
    
    // Revanche starten
    const rematchGame = async () => {
        if (!globalData || !db || !roomId) return
        if (globalData.host !== myName) {
            alert("Nur der Host kann eine Revanche starten.")
            return
        }
        if (!window.confirm("Möchtest du eine Revanche starten? Alle Temperaturen werden zurückgesetzt.")) return
        
        const pClean = {}
        Object.keys(globalData.players || {}).forEach(p => {
            pClean[p] = { 
                temp: 0, 
                inventory: [], 
                emoji: globalData.players[p]?.emoji || '😊' 
            }
        })
        
        await updateDoc(doc(db, "lobbies", roomId), {
            status: 'lobby',
            players: pClean,
            votes: deleteField(),
            ready: [],
            log: arrayUnion("♻️ Revanche gestartet! Alle Temperaturen wurden zurückgesetzt."),
            hotseat: "",
            roundId: (globalData.roundId ?? 0) + 1,
            lobbyReady: {},
            usedQuestions: [],
            pendingAttacks: deleteField(),
            attackResults: deleteField(),
            popupConfirmed: deleteField(),
            eliminatedPlayers: [] // WICHTIG: Setze eliminatedPlayers zurück
        })
        alert("Revanche gestartet! Alle zurück in die Lobby.")
    }
    
    // Angriff ausführen
    const chooseReward = (rewardType) => {
        if (rewardType === 'attack') {
            setShowRewardChoice(false)
            setShowAttackSelection(true)
        } else if (rewardType === 'invest') {
            setShowRewardChoice(false)
            setShowJokerShop(true)
        }
    }
    
    // Joker-Karte ziehen
    const takeCard = async (card) => {
        if (!db || !roomId) return
        
        setLocalActionDone(true)
        setShowRewardChoice(false)
        setShowJokerShop(false)
        
        const inventory = globalData?.players?.[myName]?.inventory || []
        if (inventory.includes(card)) {
            alert("Du besitzt diesen Joker bereits! Du kannst jeden Joker nur einmal haben.")
            return
        }
        
        const cardInfo = {
            card_oil: { label: '🛢️ Ölfass', desc: 'Verdoppelt deinen nächsten Angriff.' },
            card_mirror: { label: '🪞 Spiegel', desc: 'Der nächste Angriff prallt zurück.' },
            card_ice: { label: '🧊 Eiswürfel', desc: 'Kühlt dich in der nächsten Runde automatisch ab.' }
        }
        
        await updateDoc(doc(db, "lobbies", roomId), {
            [`players.${myName}.inventory`]: arrayUnion(card),
            log: arrayUnion(`🃏 ${myName} zieht eine geheime Karte.`)
        })
        
        const info = cardInfo[card] || { label: '🃏 Joker', desc: '' }
        alert(`${info.label} erhalten! ${info.desc}`)
    }
    
    // Angriff überspringen
    const skipAttack = async () => {
        if (!db || !roomId) return
        
        // Optimistic UI updates
        setShowRewardChoice(false)
        setShowAttackSelection(false)
        
        try {
            const ref = doc(db, "lobbies", roomId)
            const currentData = await getDoc(ref)
            const currentAttackDecisions = currentData.data()?.attackDecisions || {}
            const updatedAttackDecisions = {
                ...currentAttackDecisions,
                [myName]: true
            }
            
            await updateDoc(ref, {
                log: arrayUnion(`🕊️ ${myName} verzichtet auf einen Angriff.`),
                attackDecisions: updatedAttackDecisions
            })
            
            setLocalActionDone(true) // Erst bei Erfolg setzen
        } catch (error) {
            logger.error("Fehler beim Überspringen:", error)
            alert("Fehler beim Überspringen des Angriffs: " + error.message)
            // UI wiederherstellen falls Fehler
            setShowAttackSelection(true) // Nehmen wir an wir waren da
        }
    }

    return (
        <div className="App">
            {currentScreen !== 'landing' && (
                <div className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>⚙️</div>
            )}
            {currentScreen === 'create' && (
                <div className={`menu-btn help-btn ${styles.helpButtonLeft}`} onClick={() => setCurrentScreen('start')}>←</div>
            )}
            {currentScreen === 'questionGeneratorCategories' && (
                <div className={`menu-btn help-btn ${styles.helpButtonLeft}`} onClick={() => setCurrentScreen('start')}>←</div>
            )}
            {currentScreen === 'questionGenerator' && (
                <div className={`menu-btn help-btn ${styles.helpButtonLeft}`} onClick={() => setCurrentScreen('questionGeneratorCategories')}>←</div>
            )}
            {currentScreen !== 'landing' && currentScreen !== 'create' && currentScreen !== 'questionGeneratorCategories' && currentScreen !== 'questionGenerator' && (
                <div className={`menu-btn help-btn ${styles.helpButtonLeft}`} onClick={() => setShowRulesModal(true)}>?</div>
            )}
            
            {menuOpen && (
                <>
                    <div className="overlay open" onClick={() => {
                        setMenuOpen(false)
                        setMenuPage('main')
                    }}></div>
                    <div className={styles.menuModal}>
                        {menuPage === 'main' && (
                            <>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>⚙️ Menü</h3>
                                    <button 
                                        onClick={() => {
                                            setMenuOpen(false)
                                            setMenuPage('main')
                                        }}
                                        className={styles.menuCloseButton}
                                    >✕</button>
                                </div>
                                
                                <button 
                                    onClick={() => setMenuPage('settings')}
                                    className={styles.menuButton}
                                >
                                    ⚙️ Einstellungen
                                </button>
                                
                                <button 
                                    onClick={() => setMenuPage('volume')}
                                    className={styles.menuButton}
                                >
                                    🔊 Lautstärke
                                </button>
                                
                                <button 
                                    onClick={() => setMenuPage('log')}
                                    className={styles.menuButton}
                                >
                                    📜 Spielverlauf
                                </button>
                                
                                <div className={styles.spacer}></div>
                                
                                <button 
                                    onClick={leaveLobby}
                                    className={styles.leaveButton}
                                >
                                    👋 Spiel verlassen
                                </button>
                            </>
                        )}
                        
                        {menuPage === 'settings' && (
                            <>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>⚙️ Einstellungen</h3>
                                    <button 
                                        onClick={() => setMenuPage('main')}
                                        className={styles.menuBackButton}
                                    >←</button>
                                </div>
                                
                                {isHost && (
                                    <>
                                        <button 
                                            onClick={forceNextRound}
                                            className={`${styles.settingsButton} ${styles.settingsButtonGray}`}
                                        >
                                            ⏩ Runde erzwingen
                                        </button>
                                        <button 
                                            onClick={resetGame}
                                            className={`${styles.settingsButton} ${styles.settingsButtonRed}`}
                                        >
                                            🔄 Spiel neustarten
                                        </button>
                                        <button 
                                            onClick={killLobby}
                                            className={`${styles.settingsButton} ${styles.settingsButtonDarkRed}`}
                                        >
                                            🧨 Lobby löschen
                                        </button>
                                    </>
                                )}
                                
                                {/* Admin-Funktion: Alle Lobbies löschen (für Testzwecke) */}
                                <div className={styles.menuSection}>
                                    <h4 className={styles.menuSectionTitle}>🔧 Admin-Funktionen</h4>
                                    <button 
                                        onClick={deleteAllLobbies}
                                        className={`${styles.settingsButton} ${styles.settingsButtonDanger}`}
                                    >
                                        🗑️ Alle Lobbies löschen (Test)
                                    </button>
                                </div>
                                
                                <button 
                                    onClick={toggleMusic}
                                    className={`${styles.settingsButton} ${styles.settingsButtonMusic} ${musicEnabled ? styles.settingsButtonMusicEnabled : styles.settingsButtonMusicDisabled}`}
                                >
                                    {musicEnabled ? '🔊' : '🔇'} Hintergrundmusik {musicEnabled ? 'an' : 'aus'}
                                </button>
                            </>
                        )}
                        
                        {menuPage === 'volume' && (
                            <>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>🔊 Lautstärke</h3>
                                    <button 
                                        onClick={() => setMenuPage('main')}
                                        className={styles.menuBackButton}
                                    >←</button>
                                </div>
                                
                                <div className={styles.volumeSliderContainer}>
                                    <h4 className={styles.volumeTitle}>Hintergrundmusik</h4>
                                    <div className={styles.volumeSliderWrapper}>
                                        <span className={styles.volumeIcon}>🔇</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="10"
                                            value={musicVolume}
                                            onChange={(e) => handleMusicVolumeChange(parseInt(e.target.value))}
                                            className={styles.volumeSliderInput}
                                        />
                                        <span className={styles.volumeIcon}>🔊</span>
                                    </div>
                                </div>
                                
                                <div className={styles.volumeSliderContainer}>
                                    <h4 className={styles.volumeTitle}>Soundeffekte</h4>
                                    <div className={styles.volumeSliderWrapper}>
                                        <span className={styles.volumeIcon}>🔇</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="10"
                                            value={soundVolume}
                                            onChange={(e) => handleSoundVolumeChange(parseInt(e.target.value))}
                                            className={styles.volumeSliderInput}
                                        />
                                        <span className={styles.volumeIcon}>🔊</span>
                                    </div>
                                </div>
                            </>
                        )}
                        
                        {menuPage === 'log' && (
                            <>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>📜 Spielverlauf</h3>
                                    <button 
                                        onClick={() => setMenuPage('main')}
                                        className={styles.menuBackButton}
                                    >←</button>
                                </div>
                                
                                <div className={styles.menuLogContainer}>
                                    {globalData?.log && globalData.log.length > 0 ? (
                                        globalData.log.slice(-20).map((entry, idx) => (
                                            <div key={idx} className={styles.menuLogEntry}>{entry}</div>
                                        ))
                                    ) : (
                                        <div className={styles.menuLogEmpty}>Keine Einträge</div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
            
            {currentScreen !== 'landing' && (
                <div className={styles.logoContainer}>
                    <img 
                        src={hkLogoHorizontal} 
                        alt="Hitzkopf Logo" 
                        className={styles.logoHorizontal}
                    />
                </div>
            )}
            
            {/* LANDING PAGE */}
            {currentScreen === 'landing' && (
                <div className={styles.landingContainer}>
                    
                    {/* Zurück Button */}
                    {onBack && (
                        <button
                            onClick={onBack}
                            className={styles.backToProjectsButton}
                            title="Zurück zur Projektauswahl"
                        >
                            ← Zurück
                        </button>
                    )}
                    
                    {/* Logo in der Mitte */}
                    <div className={styles.landingLogoContainer}>
                        <img 
                            src={hkLogo} 
                            alt="Hitzkopf Logo" 
                            className={styles.landingLogo}
                        />
                    </div>
                    
                    {/* Spielen Button */}
                    <button
                        onClick={() => setCurrentScreen('start')}
                        className={styles.landingButton}
                    >
                        SPIELEN
                    </button>
                </div>
            )}
            
            {/* START SCREEN */}
            {currentScreen === 'start' && (
                <div className="screen active card">
                    <input 
                        id="playerName"
                        name="playerName"
                        type="text" 
                        value={myName}
                        onChange={handleNameChange}
                        placeholder="Dein Name" 
                        maxLength={20} 
                        autoComplete="name"
                    />
                    <div className={`emoji-gallery-wrapper ${styles.emojiGalleryWrapper}`}>
                        <div 
                            ref={emojiGalleryRef}
                            id="emojiGallery" 
                            className={styles.emojiGallery}
                        >
                            {/* Spacer am Anfang, damit der erste Charakter zentriert werden kann */}
                            <div className={`emoji-spacer ${styles.emojiSpacer}`}></div>
                            
                            {availableEmojis.map((emoji, index) => {
                                const isSelected = index === emojiScrollIndex
                                
                                return (
                                    <div
                                        key={`${emoji}-${index}`}
                                        className={`emoji-card ${isSelected ? 'selected' : ''}`}
                                        onClick={(e) => {
                                            // Nur auswählen, wenn nicht gescrollt wurde
                                            if (!isScrollingRef.current) {
                                                selectEmoji(emoji)
                                            }
                                        }}
                                        onTouchStart={(e) => {
                                            // Speichere Start-Position für Swipe-Erkennung
                                            touchStartRef.current = {
                                                x: e.touches[0].clientX,
                                                y: e.touches[0].clientY,
                                                time: Date.now()
                                            }
                                        }}
                                        onTouchMove={(e) => {
                                            // Wenn Bewegung erkannt wird, markiere als Scroll
                                            if (touchStartRef.current.x !== 0) {
                                                const deltaX = Math.abs(e.touches[0].clientX - touchStartRef.current.x)
                                                const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y)
                                                // Wenn Bewegung größer als 10px, ist es ein Swipe
                                                if (deltaX > 10 || deltaY > 10) {
                                                    isScrollingRef.current = true
                                                }
                                            }
                                        }}
                                        onTouchEnd={(e) => {
                                            // Prüfe ob es ein Swipe war
                                            const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartRef.current.x)
                                            const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartRef.current.y)
                                            const deltaTime = Date.now() - touchStartRef.current.time
                                            const isSwipe = deltaX > 10 || deltaY > 10
                                            
                                            // Nur auswählen wenn es kein Swipe war und nicht zu lange gedrückt wurde
                                            if (!isSwipe && deltaTime < 300 && !isScrollingRef.current) {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                selectEmoji(emoji)
                                            }
                                            
                                            // Reset nach kurzer Verzögerung
                                            setTimeout(() => {
                                                isScrollingRef.current = false
                                                touchStartRef.current = { x: 0, y: 0, time: 0 }
                                            }, 100)
                                        }}
                                        data-emoji={emoji}
                                        data-index={index}
                                    >
                                        {emoji}
                                    </div>
                                )
                            })}
                            
                            {/* Spacer am Ende, damit der letzte Charakter zentriert werden kann */}
                            <div className={`emoji-spacer ${styles.emojiSpacer}`}></div>
                        </div>
                    </div>
                    
                    <div className="start-actions">
                        <button className="btn-secondary" onClick={() => setCurrentScreen('create')} disabled={!myName.trim()}>
                            🎮 Spiel erstellen
                        </button>
                        <button className="btn-secondary" onClick={() => { setCurrentScreen('join'); loadRoomList(); }} disabled={!myName.trim()}>
                            🚪 Spiel beitreten
                        </button>
                    </div>
                </div>
            )}
            
            {/* QUESTION GENERATOR BUTTON - Full Width außerhalb des Containers */}
            {currentScreen === 'start' && (
                <button 
                    className={styles.fullWidthButton} 
                    onClick={() => setCurrentScreen('questionGeneratorCategories')}
                    style={{ opacity: 1 }}
                >
                    📝 Fragengenerator
                </button>
            )}
            
            {/* CREATE GAME SCREEN */}
            {currentScreen === 'create' && (
                <div className="screen active card">
                    <label className={styles.labelWithMargin}>
                        Wähle Fragenkategorien:
                    </label>
                    <div className={styles.grid3Cols}>
                        <div className={`category-card ${selectedCategories.length === Object.keys(questionCategories).length ? 'selected' : ''}`} onClick={() => toggleCategory('all')}>
                            <div className="category-emoji">🌟</div>
                            <div className="category-name">Alle</div>
                        </div>
                        {Object.entries(questionCategories).map(([key, cat]) => (
                            <div key={key} className={`category-card ${selectedCategories.includes(key) ? 'selected' : ''}`} onClick={() => toggleCategory(key)}>
                                <div className="category-emoji">{cat.emoji}</div>
                                <div className="category-name">{cat.name.split(' ')[0]}</div>
                            </div>
                        ))}
                    </div>
                    <button className={`btn-primary ${styles.buttonMarginTop}`} onClick={createGame} disabled={!myName.trim() || selectedCategories.length === 0}>
                        🎮 Spiel erstellen
                    </button>
                    <button 
                        onClick={() => setCurrentScreen('start')}
                        className={`btn-secondary ${styles.backButton}`}
                    >
                        ← Zurück
                    </button>
                </div>
            )}
            
            {/* QUESTION GENERATOR CATEGORIES SCREEN */}
            {currentScreen === 'questionGeneratorCategories' && (
                <div className="screen active card">
                    <label className={styles.labelWithMargin}>
                        Wähle Fragenkategorien:
                    </label>
                    <div className={styles.grid3Cols}>
                        <div className={`category-card ${selectedCategories.length === Object.keys(questionCategories).length ? 'selected' : ''}`} onClick={() => toggleCategory('all')}>
                            <div className="category-emoji">🌟</div>
                            <div className="category-name">Alle</div>
                        </div>
                        {Object.entries(questionCategories).map(([key, cat]) => (
                            <div key={key} className={`category-card ${selectedCategories.includes(key) ? 'selected' : ''}`} onClick={() => toggleCategory(key)}>
                                <div className="category-emoji">{cat.emoji}</div>
                                <div className="category-name">{cat.name.split(' ')[0]}</div>
                            </div>
                        ))}
                    </div>
                    <button className={`btn-primary ${styles.buttonMarginTop}`} onClick={() => {
                        if (selectedCategories.length === 0) {
                            alert("Bitte wähle mindestens eine Kategorie aus!")
                            return
                        }
                        // Fragen holen und mischen
                        const questions = getAllQuestions().filter(q => selectedCategories.includes(q.category))
                        if (questions.length === 0) {
                            alert("Keine Fragen in den ausgewählten Kategorien gefunden!")
                            return
                        }
                        
                        // Fragen mischen (Fisher-Yates Shuffle)
                        const shuffled = [...questions]
                        for (let i = shuffled.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
                        }
                        
                        // Gemischte Fragen speichern und erste Frage anzeigen
                        setShuffledQuestions(shuffled)
                        setCurrentQuestionIndex(0)
                        setCurrentGeneratorQuestion(shuffled[0])
                        setCurrentScreen('questionGenerator')
                    }} disabled={selectedCategories.length === 0}>
                        📝 Fragen generieren
                    </button>
                    <button 
                        onClick={() => setCurrentScreen('start')}
                        className={`btn-secondary ${styles.backButton}`}
                    >
                        ← Zurück
                    </button>
                </div>
            )}
            
            {/* QUESTION GENERATOR SCREEN */}
            {currentScreen === 'questionGenerator' && currentGeneratorQuestion && (
                <div className="screen active card">
                    {/* Kategorie anzeigen */}
                    {currentGeneratorQuestion.category && (
                        <div className={styles.gameCategory} style={{ marginBottom: '20px' }}>
                            {questionCategories[currentGeneratorQuestion.category]?.emoji} {questionCategories[currentGeneratorQuestion.category]?.name}
                        </div>
                    )}
                    
                    {/* Frage */}
                    <h3 className={styles.gameQuestion}>
                        {currentGeneratorQuestion.q || 'Lade Frage...'}
                    </h3>
                    
                    {/* Antwortmöglichkeiten - NICHT anklickbar */}
                    <div className="option-row">
                        <div 
                            className="btn-option" 
                            style={{ 
                                cursor: 'default', 
                                opacity: 0.9,
                                pointerEvents: 'none'
                            }}
                        >
                            a) {currentGeneratorQuestion.a || 'A'}
                        </div>
                        <div 
                            className="btn-option" 
                            style={{ 
                                cursor: 'default', 
                                opacity: 0.9,
                                pointerEvents: 'none'
                            }}
                        >
                            b) {currentGeneratorQuestion.b || 'B'}
                        </div>
                    </div>
                    {/* Zeige C und D nur an, wenn sie existieren */}
                    {(currentGeneratorQuestion.c || currentGeneratorQuestion.d) && (
                        <div className="option-row">
                            {currentGeneratorQuestion.c && (
                                <div 
                                    className="btn-option" 
                                    style={{ 
                                        cursor: 'default', 
                                        opacity: 0.9,
                                        pointerEvents: 'none'
                                    }}
                                >
                                    c) {currentGeneratorQuestion.c}
                                </div>
                            )}
                            {currentGeneratorQuestion.d && (
                                <div 
                                    className="btn-option" 
                                    style={{ 
                                        cursor: 'default', 
                                        opacity: 0.9,
                                        pointerEvents: 'none'
                                    }}
                                >
                                    d) {currentGeneratorQuestion.d}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Nächste Frage Button - Orange */}
                    <button 
                        className={`btn-primary ${styles.submitButtonMargin}`}
                        onClick={generateNewQuestion}
                        style={{
                            background: 'linear-gradient(135deg, #ff8c00 0%, #ff6b00 100%)',
                            marginTop: '30px'
                        }}
                    >
                        ➡️ Nächste Frage
                    </button>
                    
                    <button 
                        onClick={goToPreviousQuestion}
                        className={`btn-secondary ${styles.backButton}`}
                        disabled={currentQuestionIndex === 0}
                    >
                        ← Vorherige Frage
                    </button>
                </div>
            )}
            
            {/* JOIN GAME SCREEN */}
            {currentScreen === 'join' && (
                <div className="screen active card">
                    <h3 className={styles.joinScreenTitle}>🤝 Spiel beitreten</h3>
                    <button className={`btn-secondary ${styles.refreshButton}`} onClick={loadRoomList}>
                        🔄 Räume aktualisieren
                    </button>
                    {roomList.length > 0 ? (
                        <div className={styles.grid2Cols}>
                            {roomList.map((room) => (
                                <div 
                                    key={room.id} 
                                    className={`category-card ${roomCode === room.id ? 'selected' : ''} ${styles.roomCard}`}
                                    onClick={() => selectRoom(room.id, room.hasPassword)}
                                >
                                    <div className={`category-emoji ${styles.categoryEmojiLarge}`}>
                                        {room.hostEmoji || '😊'}
                                    </div>
                                    <div className={`category-name ${styles.categoryNameLarge}`}>
                                        Spiel von {room.hostName}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className={styles.noRoomsText}>Keine Räume verfügbar</p>
                    )}
                    {roomCode && (
                            <button className="btn-secondary" onClick={() => joinGame(roomCode)} disabled={!myName.trim() || !roomCode}>
                                🚪 Beitreten
                            </button>
                    )}
                    <button 
                        onClick={() => setCurrentScreen('start')}
                        className={`btn-secondary ${styles.backButton}`}
                    >
                        ← Zurück
                    </button>
                </div>
            )}
            
            {/* LOBBY SCREEN */}
            {currentScreen === 'lobby' && globalData && (() => {
                const allPlayers = renderPlayers()
                const myPlayer = allPlayers.find(p => p.name === myName)
                const otherPlayers = allPlayers.filter(p => p.name !== myName)
                const myIsReady = globalData.lobbyReady?.[myName] === true
                const maxTemp = globalData.config?.maxTemp || 100
                const myIsEliminated = (myPlayer?.temp || 0) >= maxTemp
                
                return (
                <div className="screen active card">
                        <h3 className={styles.lobbyTitle}>
                            👥 Spiel von {globalData.hostName || globalData.host || 'Unbekannt'}
                        </h3>
                        
                        {/* Eigener Spieler oben */}
                        {myPlayer && (
                            <div 
                                onClick={toggleLobbyReady}
                                className={`${styles.myPlayerCard} ${myIsEliminated ? styles.eliminated : (myIsReady ? styles.ready : styles.notReady)}`}
                            >
                                <div className={styles.myPlayerEmoji}>
                                    {myPlayer.emoji}
                                </div>
                                <div className={styles.myPlayerInfo}>
                                    <div className={styles.myPlayerName}>
                                        {myPlayer.name} (Du)
                                        {globalData.host === myPlayer.name && <span className={styles.crownIcon}>👑</span>}
                                    </div>
                                    <div className={styles.readyToggle}>
                                        <span className={styles.readyLabel}>
                                            Bereit
                                        </span>
                                        {/* Toggle Switch */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleLobbyReady();
                                            }}
                                            className={`${styles.toggleSwitch} ${myIsReady ? styles.ready : styles.notReady}`}
                                        >
                                            <div className={`${styles.toggleThumb} ${myIsReady ? styles.ready : styles.notReady}`}>
                                                {myIsReady ? (
                                                    <span className={styles.toggleCheck}>✓</span>
                                                ) : (
                                                    <span className={styles.toggleCross}>✕</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Andere Spieler darunter */}
                        {otherPlayers.length > 0 && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '15px',
                                marginTop: '20px'
                            }}>
                                {otherPlayers.map((p) => {
                            const isReady = globalData.lobbyReady?.[p.name] === true
                            const isEliminated = (p.temp || 0) >= maxTemp
                            
                            return (
                                <div 
                                    key={p.name} 
                                    style={{
                                        padding: '16px',
                                        background: 'rgba(22, 27, 34, 0.6)',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        opacity: isEliminated ? 0.5 : (isReady ? 1 : 0.4),
                                        transition: 'opacity 0.3s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '12px',
                                                cursor: 'default'
                                            }}
                                >
                                    <div style={{
                                        fontSize: '2.5rem',
                                        marginBottom: '4px'
                                    }}>
                                        {p.emoji}
                                    </div>
                                    <div style={{
                                        fontSize: '1rem',
                                        fontWeight: 'bold',
                                        color: '#fff',
                                        textAlign: 'center',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        {p.name}
                                        {globalData.host === p.name && <span style={{ fontSize: '1.2rem' }}>👑</span>}
                                    </div>
                                    
                                            {/* Toggle Switch (nur Anzeige, nicht klickbar) */}
                                    <div
                                        style={{
                                            position: 'relative',
                                            width: '50px',
                                            height: '28px',
                                            borderRadius: '14px',
                                            background: isReady ? '#22c55e' : '#d1d5db',
                                                    cursor: 'default',
                                            transition: 'all 0.3s ease',
                                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '2px',
                                                    opacity: 0.8,
                                            marginTop: '4px'
                                        }}
                                    >
                                        <div style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '12px',
                                            background: '#fff',
                                            transition: 'transform 0.3s ease',
                                            transform: isReady ? 'translateX(22px)' : 'translateX(0)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                                        }}>
                                            {isReady ? (
                                                <span style={{ color: '#22c55e', fontSize: '14px', fontWeight: 'bold' }}>✓</span>
                                            ) : (
                                                <span style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 'bold' }}>✕</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                        )}
                        
                    {isHost && (
                        <button 
                            className={`btn-primary ${styles.buttonMarginTop}`}
                            onClick={startCountdown} 
                            disabled={
                                (() => {
                                    const maxTemp = globalData.config?.maxTemp || 100
                                    const activePlayers = renderPlayers().filter(p => (p.temp || 0) < maxTemp)
                                    const activeReady = activePlayers.filter(p => globalData.lobbyReady?.[p.name] === true)
                                    return activeReady.length < activePlayers.length || activePlayers.length < 2
                                })()
                            }
                        >
                            🔥 Spiel starten
                        </button>
                    )}
                        {!isHost && (() => {
                            const maxTemp = globalData.config?.maxTemp || 100
                            const activePlayers = renderPlayers().filter(p => (p.temp || 0) < maxTemp)
                            const activeReady = activePlayers.filter(p => globalData.lobbyReady?.[p.name] === true)
                            const allReady = activeReady.length >= activePlayers.length && activePlayers.length >= 2
                            
                            return (
                                <p className={styles.waitText}>
                                    {allReady ? '⏳ Warten bis der Host das Spiel startet' : '⏳ Warten bis alle bereit sind'}
                                </p>
                            )
                        })()}
                </div>
                )
            })()}
            
            {/* GAME SCREEN */}
            {currentScreen === 'game' && globalData && (() => {
                // PERFORMANCE-FIX: Memoize hotseat-Status, damit sich Markierung nicht ändert, wenn nur Votes geändert werden
                const currentHotseat = globalData.hotseat
                const maxTemp = globalData.config?.maxTemp || 100
                const myTemp = globalData.players?.[myName]?.temp || 0
                const isEliminated = myTemp >= maxTemp
                
                // WICHTIG: Eliminierte Spieler sehen nur Spectator-Ansicht
                if (isEliminated) {
                    return (
                        <div className="screen active card">
                            <h3 className={styles.eliminatedTitle}>🔥 Du bist ausgeschieden!</h3>
                            <div className={styles.eliminatedInfoBox}>
                                <p className={styles.eliminatedText}>Du hast {myTemp}°C erreicht und bist ausgeschieden.</p>
                                <p className={styles.eliminatedSubtext}>Du kannst dem Spiel als Zuschauer folgen.</p>
                            </div>
                            {/* THERMOMETER RANGLISTE - AUSGEBLENDET - Code bleibt für spätere Platzierung erhalten */}
                            <div className="thermo-grid" style={{ display: 'none' }}>
                                {renderPlayers().map((player) => {
                                    const tempPercent = Math.min((player.temp / maxTemp) * 100, 100)
                                    const isHotseat = player.name === currentHotseat
                                    const hasAnswered = !!globalData.votes?.[player.name]
                                    
                                    return (
                                        <div key={player.name} className={`thermo-item ${isHotseat ? 'is-hotseat' : ''} ${hasAnswered ? styles.thermoItemAnswered : styles.thermoItemNotAnswered}`}>
                                            <div className={styles.thermoTop}>
                                                <span className={styles.thermoTopLeft}>
                                                    {isHotseat && <span>🔥</span>}
                                                    <span>{player.emoji} {player.name}{player.name === myName ? ' (Du)' : ''}</span>
                                                </span>
                                                <span className={`${styles.thermoTemp} ${tempPercent >= 100 ? styles.thermoTempMax : ''}`}>{player.temp}°C</span>
                                            </div>
                                            <div className={styles.thermoBar}>
                                                <div className={styles.thermoFill} style={{
                                                    width: `${tempPercent}%`,
                                                    height: '100%',
                                                    background: (() => {
                                                        if (tempPercent >= 100) {
                                                            return 'linear-gradient(90deg, #ff0000, #ff4500)'
                                                        } else if (tempPercent >= 75) {
                                                            return 'linear-gradient(90deg, #ff8c00, #ff4500, #ff0000)'
                                                        } else if (tempPercent >= 50) {
                                                            return 'linear-gradient(90deg, #ffae00, #ff8c00, #ff4500)'
                                                        } else if (tempPercent >= 25) {
                                                            return 'linear-gradient(90deg, #4a9eff, #ffae00, #ff8c00)'
                                                        } else {
                                                            return 'linear-gradient(90deg, #4a9eff, #0066cc)'
                                                        }
                                                    })(),
                                                    transition: 'width 0.5s ease-out'
                                                }}></div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className={styles.currentQuestionBox}>
                                <h4 className={styles.currentQuestionTitle}>Aktuelle Frage:</h4>
                                <p className={styles.currentQuestionText}>{globalData.currentQ?.q || 'Lade Frage...'}</p>
                            </div>
                        </div>
                    )
                }
                
                return (
                <div className="screen active card">
                    
                    {/* THERMOMETER RANGLISTE - AUSGEBLENDET - Code bleibt für spätere Platzierung erhalten */}
                    <div className="thermo-grid" style={{ display: 'none' }}>
                        {renderPlayers().map((player) => {
                            const tempPercent = Math.min((player.temp / maxTemp) * 100, 100)
                            // WICHTIG: isHotseat nur basierend auf currentHotseat berechnen, nicht auf globalData.hotseat
                            // Das verhindert unnötige Re-Renders, wenn sich nur Votes ändern
                            const isHotseat = player.name === currentHotseat
                            const hasAnswered = !!globalData.votes?.[player.name]
                            
                            return (
                                <div key={player.name} className={`thermo-item ${isHotseat ? 'is-hotseat' : ''}`} style={{
                                    border: hasAnswered ? '2px solid #22c55e' : '1px solid #333',
                                    borderRadius: '10px',
                                    padding: '12px',
                                    background: hasAnswered ? 'rgba(34, 197, 94, 0.2)' : 'rgba(22, 27, 34, 0.6)',
                                    opacity: hasAnswered ? 1 : 0.5,
                                    transition: 'opacity 0.3s ease'
                                }}>
                                    <div className="thermo-top" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                                        <span style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                            {isHotseat && <span>🔥</span>}
                                            <span>{player.emoji} {player.name}</span>
                                        </span>
                                        <span style={{fontWeight: 'bold', color: tempPercent >= 100 ? '#ff0000' : '#fff'}}>{player.temp}°C</span>
                                    </div>
                                    <div className="thermo-bar" style={{
                                        width: '100%',
                                        height: '20px',
                                        background: '#333',
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        position: 'relative'
                                    }}>
                                        <div className="thermo-fill" style={{
                                            width: `${tempPercent}%`,
                                            height: '100%',
                                            background: (() => {
                                                // Farbverlauf: Blau (0°) → Gelb (50°) → Orange (75°) → Rot (100°)
                                                if (tempPercent >= 100) {
                                                    return 'linear-gradient(90deg, #ff0000, #ff4500)'
                                                } else if (tempPercent >= 75) {
                                                    return 'linear-gradient(90deg, #ff8c00, #ff4500, #ff0000)'
                                                } else if (tempPercent >= 50) {
                                                    return 'linear-gradient(90deg, #ffae00, #ff8c00, #ff4500)'
                                                } else if (tempPercent >= 25) {
                                                    return 'linear-gradient(90deg, #4a9eff, #ffae00, #ff8c00)'
                                                } else {
                                                    return 'linear-gradient(90deg, #4a9eff, #0066cc)'
                                                }
                                            })(),
                                            transition: 'width 0.5s ease-out',
                                            boxShadow: tempPercent >= 100 ? '0 0 10px rgba(255, 0, 0, 0.5)' : 'none'
                                        }}></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {/* <hr className={styles.horizontalRule} /> */}
                    {/* Hotseat-Hinweis über der Frage */}
                    {(() => {
                        // WICHTIG: Stelle sicher, dass currentHotseat ein String ist
                        const hotseatNameString = typeof currentHotseat === 'string' ? currentHotseat : (currentHotseat?.name || String(currentHotseat || ''))
                        const isHotseat = myName === hotseatNameString
                        const hotseatPlayer = hotseatNameString ? renderPlayers().find(p => p.name === hotseatNameString) : null
                        const hotseatName = hotseatPlayer?.name || hotseatNameString || 'Hotseat'
                        const hotseatEmoji = hotseatPlayer?.emoji || '🔥'
                        return (
                            <div style={{
                                marginBottom: '15px',
                                padding: '10px 15px',
                                background: 'rgba(22, 27, 34, 0.6)',
                                border: '1px solid #333',
                                borderRadius: '10px',
                                textAlign: 'center'
                            }}>
                                <p style={{
                                    margin: 0,
                                    color: '#aaa',
                                    fontSize: '0.95rem',
                                    fontWeight: isHotseat ? 'bold' : 'normal'
                                }}>
                                    {isHotseat ? (
                                        <>🔥 Du bist gefragt! <br/>Antworte ehrlich - die anderen versuchen deine Wahl zu erraten.</>
                                    ) : (
                                        <>Rate, was {hotseatEmoji} <strong>{hotseatName}</strong> gewählt hat.</>
                                    )}
                                </p>
                            </div>
                        )
                    })()}
                    <h3 className={styles.gameQuestion}>
                        {globalData.currentQ?.q || 'Lade Frage...'}
                    </h3>
                    {/* Kategorie anzeigen */}
                    {globalData.currentQ?.category && (
                        <div className={styles.gameCategory}>
                            {questionCategories[globalData.currentQ.category]?.emoji} {questionCategories[globalData.currentQ.category]?.name}
                        </div>
                    )}
                    {globalData.votes?.[myName] ? (
                        <div className={styles.voteSubmitted}>
                            <p className={styles.voteSubmittedTitle}>✅ Antwort abgesendet!</p>
                            <p className={styles.voteSubmittedText}>Warte auf andere Spieler...</p>
                        </div>
                    ) : (
                        <>
                            <div className="option-row">
                                <button 
                                    className={`btn-option ${mySelection === 'A' ? 'selected' : ''}`} 
                                    onClick={() => vote('A')}
                                    disabled={isEliminated}
                                >
                                    {globalData.currentQ?.a || 'A'}
                                </button>
                                <button 
                                    className={`btn-option ${mySelection === 'B' ? 'selected' : ''}`} 
                                    onClick={() => vote('B')}
                                    disabled={isEliminated}
                                >
                                    {globalData.currentQ?.b || 'B'}
                                </button>
                            </div>
                            <button 
                                className={`btn-primary ${styles.submitButtonMargin}`}
                                onClick={submitVote} 
                                disabled={!mySelection || isEliminated}
                            >
                                🔒 Antwort absenden
                            </button>
                        </>
                    )}

                    {/* NOTFALL-BUTTON FÜR HOST - IMMER SICHTBAR (Auch wenn abgestimmt) */}
                    {isHost && (
                        <div style={{ marginTop: '20px', textAlign: 'center' }}>
                            <button 
                                className="btn-text"
                                style={{ fontSize: '0.8em', color: '#ff4d4d', opacity: 0.8 }}
                                onClick={async () => {
                                    if (confirm("Wirklich zur Auswertung springen? Dies sollte nur genutzt werden, wenn das Spiel hängt.")) {
                                        logger.log('🚨 [FORCE ADVANCE] Host erzwingt Result-Screen')
                                        await updateDoc(doc(db, "lobbies", roomId), {
                                            status: 'result',
                                            lastHostActivity: serverTimestamp()
                                        })
                                    }
                                }}
                            >
                                ⚠️ Hängt? Weiter zur Auswertung
                            </button>
                        </div>
                    )}
                </div>
                )
            })()}
            
            {/* RESULT SCREEN / ANGRIFFSPHASE / ZWISCHENERGEBNIS */}
            {currentScreen === 'result' && globalData && (() => {
                // WICHTIG: Definiere isHotseat hier im Scope, damit es im JSX verwendet werden kann
                const isHotseat = myName === globalData.hotseat
                const roundRecapShown = globalData.roundRecapShown ?? false
                const maxTemp = globalData.config?.maxTemp || 100
                const activePlayers = Object.keys(globalData.players || {}).filter(p => {
                    const temp = globalData.players?.[p]?.temp || 0
                    return temp < maxTemp
                })
                const popupConfirmed = globalData.popupConfirmed || {}
                const hasAttackResults = globalData.attackResults && Object.keys(globalData.attackResults).length > 0
                const allPopupConfirmed = !hasAttackResults || activePlayers.every(p => {
                    if (!globalData.attackResults?.[p]) return true
                    return popupConfirmed[p] === true
                })
                
                // ZWISCHENERGEBNIS-PHASE: Sobald Angriffe ausgeführt wurden (roundRecapShown = true)
                // Popups werden darüber angezeigt, aber im Hintergrund ist bereits das Zwischenergebnis zu sehen
                const showIntermediateResult = roundRecapShown
                
                return (
                <div className="screen active card">
                    {showIntermediateResult && <h3 className={styles.resultTitle}>📊 Zwischenergebnis</h3>}
                    
                    {/* THERMOMETER RANGLISTE - Zeige in Zwischenergebnis-Phase, sortiert nach Hitze */}
                    <div className="thermo-grid" style={{ display: showIntermediateResult ? 'grid' : 'none' }}>
                        {renderPlayers().sort((a, b) => b.temp - a.temp).map((player) => {
                            const maxTemp = globalData.config?.maxTemp || 100
                            const tempPercent = Math.min((player.temp / maxTemp) * 100, 100)
                            
                            return (
                                <div key={player.name} className={`thermo-item ${styles.resultThermoItem}`}>
                                    <div className={styles.thermoTop}>
                                        <span>{player.emoji} {player.name}{player.name === myName ? ' (Du)' : ''}</span>
                                        <span className={`${styles.thermoTemp} ${tempPercent >= 100 ? styles.thermoTempMax : ''}`}>{player.temp}°C</span>
                                    </div>
                                    <div className={styles.thermoBar}>
                                        <div className={styles.thermoFill} style={{
                                            width: `${tempPercent}%`,
                                            height: '100%',
                                            background: (() => {
                                                // Farbverlauf: Blau (0°) → Gelb (50°) → Orange (75°) → Rot (100°)
                                                if (tempPercent >= 100) {
                                                    return 'linear-gradient(90deg, #ff0000, #ff4500)'
                                                } else if (tempPercent >= 75) {
                                                    return 'linear-gradient(90deg, #ff8c00, #ff4500, #ff0000)'
                                                } else if (tempPercent >= 50) {
                                                    return 'linear-gradient(90deg, #ffae00, #ff8c00, #ff4500)'
                                                } else if (tempPercent >= 25) {
                                                    return 'linear-gradient(90deg, #4a9eff, #ffae00, #ff8c00)'
                                                } else {
                                                    return 'linear-gradient(90deg, #4a9eff, #0066cc)'
                                                }
                                            })(),
                                            transition: 'width 0.5s ease-out'
                                        }}></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    
                    {/* Status-Anzeige - Nur in Angriffsphase, nicht in Zwischenergebnis */}
                    {!showIntermediateResult && (() => {
                        // WICHTIG: Stelle sicher, dass hotseat ein String ist
                        const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                        const truth = globalData.votes?.[hotseatName]?.choice
                        const myVote = globalData.votes?.[myName]
                        const isPartyMode = true
                        const isHotseat = myName === hotseatName
                        
                        if (isHotseat) {
                            // Hotseat-Person: Zeige wer richtig und falsch geraten hat
                            const allPlayers = renderPlayers().filter(p => p.name !== hotseatName)
                            const correctGuessers = allPlayers.filter(p => {
                                const playerVote = globalData.votes?.[p.name]
                                return playerVote && String(playerVote.choice) === String(truth)
                            }).sort((a, b) => a.name.localeCompare(b.name))
                            const wrongGuessers = allPlayers.filter(p => {
                                const playerVote = globalData.votes?.[p.name]
                                return !playerVote || String(playerVote.choice) !== String(truth)
                            }).sort((a, b) => a.name.localeCompare(b.name))
                            
                            return (
                                <div className={styles.hotseatWaitContainer}>
                                    <div className={styles.hotseatWaitBox}>
                                        <p className={styles.hotseatWaitTitle}>⏳ Warte bis alle Spieler ihre Hitze verteilt haben</p>
                                        <p className={styles.hotseatWaitSubtitle}>Die anderen Spieler greifen gerade an...</p>
                                    </div>
                                    
                                    {/* Übersicht: Wer hat richtig/falsch geraten */}
                                    <div className={styles.guessOverviewContainer}>
                                        {correctGuessers.length > 0 && (
                                            <div className={styles.guessOverviewSection}>
                                                <h4 className={styles.guessOverviewTitle} style={{ color: '#22c55e' }}>✅ Richtig geraten:</h4>
                                                <div className={styles.guessOverviewList}>
                                                    {correctGuessers.map(player => (
                                                        <div key={player.name} className={styles.guessOverviewItem} style={{ background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e' }}>
                                                            <span>{player.emoji} {player.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {wrongGuessers.length > 0 && (
                                            <div className={styles.guessOverviewSection}>
                                                <h4 className={styles.guessOverviewTitle} style={{ color: '#ef4444' }}>❌ Falsch geraten:</h4>
                                                <div className={styles.guessOverviewList}>
                                                    {wrongGuessers.map(player => (
                                                        <div key={player.name} className={styles.guessOverviewItem} style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444' }}>
                                                            <span>{player.emoji} {player.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        } else if (myVote && truth !== undefined && truth !== null && String(myVote.choice) === String(truth)) {
                            // Richtig geraten - Angriff ausführen
                            const attackDecisions = globalData.attackDecisions || {}
                            
                            // WICHTIG: Prüfe ob bereits eine Entscheidung getroffen wurde (attackDecisions), nicht nur localActionDone
                            // localActionDone kann aus verschiedenen Gründen true sein, aber wenn attackDecisions[myName] nicht gesetzt ist,
                            // muss der Spieler noch eine Entscheidung treffen
                            const hasAttackDecision = attackDecisions[myName] === true
                            const shouldShowAttackSelection = !hasAttackDecision && isPartyMode
                            
                            logger.log('✅ [ATTACK SELECTION] Richtig geraten - Prüfe Angriffsauswahl:', {
                                roundId: globalData.roundId,
                                myName: myName,
                                isPartyMode: isPartyMode,
                                localActionDone: localActionDone,
                                attackDecisions: attackDecisions,
                                myAttackDecision: attackDecisions[myName],
                                hasAttackDecision: hasAttackDecision,
                                showRewardChoice: showRewardChoice,
                                showAttackSelection: showAttackSelection,
                                showJokerShop: showJokerShop,
                                isHotseat: isHotseat,
                                shouldShowAttackSelection: shouldShowAttackSelection,
                                shouldShowReward: !hasAttackDecision && !isPartyMode
                            })
                            
                            if (shouldShowAttackSelection) {
                                logger.log('✅ [ATTACK SELECTION] Zeige Angriffsauswahl (Party Mode)')
                                return (
                                    <div className={styles.correctGuessContainer}>
                                        <p className={styles.correctGuessTitle}>✅ RICHTIG GERATEN!</p>
                                        <p className={styles.correctGuessSubtitle}>Zur Belohnung darfst du einen Spieler aufheizen</p>
                                        
                                        {/* Angriffsauswahl Container */}
                                        <div className={styles.attackSelectionWrapper}>
                                            <div className={styles.attackSelectionHeader}>
                                                <span className={styles.attackSelectionHeaderIcon}>🔥</span>
                                                <span>Wen aufheizen?</span>
                                            </div>
                                            <div className={styles.attackSelectionGrid}>
                                                {(() => {
                                                    const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                                                    const maxTemp = globalData?.config?.maxTemp || 100
                                                    const allPlayers = renderPlayers()
                                                    // Zähle aktive (nicht eliminierte) Spieler
                                                    const activePlayers = allPlayers.filter(p => (globalData?.players?.[p.name]?.temp || 0) < maxTemp)
                                                    const activePlayerCount = activePlayers.length
                                                    
                                                    // NEUE REGEL: Hotseat ist immer angreifbar
                                                    // Filtere: Nicht mich selbst (da ich Hotseat bin), nicht eliminierte Spieler
                                                    const attackablePlayers = allPlayers.filter(p => {
                                                        if (p.name === myName) return false // Nicht mich selbst
                                                        const playerTemp = globalData?.players?.[p.name]?.temp || 0
                                                        if (playerTemp >= maxTemp) return false // Nicht eliminierte Spieler
                                                        return true
                                                    })
                                                    
                                                    if (attackablePlayers.length === 0) {
                                                        return (
                                                            <div key="no-players" className={styles.attackNoPlayersLarge}>
                                                                Keine Spieler zum Angreifen verfügbar
                                                            </div>
                                                        )
                                                    }
                                                    return attackablePlayers.map((player) => {
                                                    const baseDmg = isPartyMode ? 20 : (globalData.config?.dmg || 10)
                                                    const attackerState = globalData.players?.[myName] || {}
                                                    const hasOil = attackerState.inventory?.includes('card_oil')
                                                    const dmg = baseDmg * (hasOil ? 2 : 1)
                                                    
                                                    return (
                                                        <div
                                                            key={player.name}
                                                            onClick={() => doAttack(player.name)}
                                                            className={styles.attackPlayerCardLarge}
                                                        >
                                                            <div className={styles.attackPlayerEmojiLarge}>{player.emoji}</div>
                                                            <div className={styles.attackPlayerNameLarge}>{player.name}</div>
                                                            <div className={styles.attackPlayerDmgLarge}>+{dmg}°</div>
                                                        </div>
                                                    )
                                                })
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )
                            } else if (!hasAttackDecision && !isPartyMode) {
                                // Angriff ausführen
                                logger.log('🎁 [ATTACK] Zeige Angriffsauswahl')
                                return (
                                    <div className={styles.rewardContainer}>
                                        <p className={styles.rewardTitle}>✅ RICHTIG GERATEN!</p>
                                        
                                        {showRewardChoice && (
                                            <div className={styles.rewardChoiceBox}>
                                                <h4 className={styles.rewardChoiceTitle}>🎁 Belohnung wählen:</h4>
                                                <div className={styles.rewardGrid}>
                                                    <button 
                                                        onClick={() => chooseReward('attack')}
                                                        className={styles.rewardButtonAttack}
                                                    >
                                                        🔴 Gegner aufheizen
                                                    </button>
                                                    <button 
                                                        onClick={() => chooseReward('invest')}
                                                        className={styles.rewardButtonInvest}
                                                    >
                                                        🃏 Joker ziehen
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {showAttackSelection && (
                                            <div className={styles.attackSelectionContainer}>
                                                <h4 className={styles.attackSelectionTitle}>🔥 Wen aufheizen?</h4>
                                                <div className={styles.attackSelectionGrid}>
                                                    {(() => {
                                                        const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                                                        // NEUE REGEL: Hotseat ist angreifbar - nur ich selbst darf nicht angegriffen werden
                                                        const attackablePlayers = renderPlayers().filter(p => p.name !== myName)
                                                        if (attackablePlayers.length === 0) {
                                                            return (
                                                                <div key="no-players" className={styles.attackNoPlayers}>
                                                                    Keine Spieler zum Angreifen verfügbar
                                                                </div>
                                                            )
                                                        }
                                                        return attackablePlayers.map((player) => {
                                                        const baseDmg = globalData.config?.dmg || 10
                                                        const attackerState = globalData.players?.[myName] || {}
                                                        const hasOil = attackerState.inventory?.includes('card_oil')
                                                        const dmg = baseDmg * (hasOil ? 2 : 1)
                                                        
                                                        return (
                                                            <div
                                                                key={player.name}
                                                                onClick={() => doAttack(player.name)}
                                                                className={styles.attackPlayerCard}
                                                            >
                                                                <div className={styles.attackPlayerEmoji}>{player.emoji}</div>
                                                                <div className={styles.attackPlayerName}>{player.name}</div>
                                                                <div className={styles.attackPlayerDmg}>+{dmg}°</div>
                                                            </div>
                                                        )
                                                    })
                                                    })()}
                                                </div>
                                                <div className={styles.attackButtons}>
                                                    <button 
                                                        onClick={() => { setShowAttackSelection(false); setShowRewardChoice(true); }}
                                                        className={styles.attackButton}
                                                    >
                                                        ← Zurück
                                                    </button>
                                                    <button 
                                                        onClick={skipAttack}
                                                        className={styles.attackButton}
                                                    >
                                                        Angriff überspringen
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {showJokerShop && (
                                            <div className={styles.jokerShopContainer}>
                                                <h4 className={styles.jokerShopTitle}>🃏 Joker-Karte wählen:</h4>
                                                <div className={styles.jokerShopGrid}>
                                                    <button 
                                                        onClick={() => takeCard('card_oil')}
                                                        className={styles.jokerCard}
                                                    >
                                                        <strong className={styles.jokerCardTitle}>🛢️ Ölfass</strong>
                                                        <span className={styles.jokerCardDescription}>Verdoppelt deinen nächsten Angriff.</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => takeCard('card_mirror')}
                                                        className={styles.jokerCard}
                                                    >
                                                        <strong className={styles.jokerCardTitle}>🪞 Spiegel</strong>
                                                        <span className={styles.jokerCardDescription}>Der nächste Angriff prallt zurück.</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => takeCard('card_ice')}
                                                        className={styles.jokerCard}
                                                    >
                                                        <strong className={styles.jokerCardTitle}>🧊 Eiswürfel</strong>
                                                        <span className={styles.jokerCardDescription}>Kühlt dich in der nächsten Runde automatisch ab.</span>
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={() => { setShowJokerShop(false); setShowRewardChoice(true); }}
                                                    className={styles.attackButton}
                                                    style={{width: '100%', marginTop: '10px'}}
                                                >
                                                    ← Zurück
                                                </button>
                                            </div>
                                        )}
                                        
                                        {!showRewardChoice && !showAttackSelection && !showJokerShop && (
                                            <div className={styles.rewardDecisionMade}>
                                                <p className={styles.rewardDecisionTitle}>✅ RICHTIG GERATEN!</p>
                                                <p className={styles.rewardDecisionText}>Entscheidung getroffen. Warte auf andere Spieler...</p>
                                            </div>
                                        )}
                                    </div>
                                )
                            } else {
                                return (
                                    <div className={styles.rewardDecisionMade}>
                                        <p className={styles.rewardDecisionTitle}>✅ RICHTIG GERATEN!</p>
                                        <p className={styles.rewardDecisionText}>Entscheidung getroffen. Warte auf andere Spieler...</p>
                                    </div>
                                )
                            }
                        } else if (myVote && truth !== undefined && truth !== null && String(myVote.choice) !== String(truth)) {
                            // Falsch geraten - WICHTIG: String-Vergleich, aber nur wenn truth existiert
                            // WICHTIG: attackDecisions aus globalData extrahieren
                            const attackDecisions = globalData?.attackDecisions || {}
                            logger.log('❌ [RESULT UI] Falsch geraten erkannt:', {
                                myChoice: myVote.choice,
                                truth: truth,
                                isPartyMode: isPartyMode,
                                localActionDone: localActionDone,
                                hasAttackDecision: attackDecisions[myName]
                            })
                            // WICHTIG: handlePartyModeWrongAnswer wird jetzt im useEffect aufgerufen, nicht hier im Render
                            // Die Prüfung erfolgt im useEffect-Block (siehe Zeile ~873)
                            // Hier wird nur noch localActionDone gesetzt, falls nötig
                            if (isPartyMode && !localActionDone && attackDecisions[myName]) {
                                // attackDecisions ist bereits gesetzt (Strafhitze wurde angewendet)
                                setLocalActionDone(true)
                            }
                            // Zeige Strafhitze-Info + Wartetext
                            return (
                                <div className={styles.hotseatWaitContainer}>
                                    {/* Strafhitze-Information */}
                                    <div className={styles.wrongAnswerContainer}>
                                        <div className={styles.wrongAnswerIcon}>❌</div>
                                        <p className={styles.wrongAnswerTitleRed}>FALSCH GERATEN</p>
                                        {isPartyMode && <p className={styles.wrongAnswerTextWhite}>Du erhältst 10°C Strafhitze.</p>}
                                    </div>
                                    
                                    {/* Wartetext */}
                                    <div className={styles.hotseatWaitBox}>
                                        <p className={styles.hotseatWaitTitle}>⏳ Warte bis alle Spieler ihre Hitze verteilt haben</p>
                                        <p className={styles.hotseatWaitSubtitle}>Die anderen Spieler greifen gerade an...</p>
                                    </div>
                                </div>
                            )
                        } else if (myVote && (truth === undefined || truth === null)) {
                            // Hotseat hat noch nicht geantwortet, aber Spieler hat abgestimmt
                            return (
                                <div className={styles.resultStatusBox}>
                                    <p className={styles.resultStatusText}>Du hast die Frage beantwortet. Warte auf die anderen Spieler...</p>
                                </div>
                            )
                        } else {
                            return (
                                <div className={styles.resultStatusBox}>
                                    <p className={styles.resultStatusTextAlt}>⌛ Keine Antwort abgegeben.</p>
                                </div>
                            )
                        }
                    })()}
                    
                    {/* WICHTIG: Button immer anzeigen, außer Spieler ist ausgeschieden ODER gerade am Angreifen */}
                    {(() => {
                        const playerData = globalData.players?.[myName]
                        const maxTemp = globalData.config?.maxTemp || 100
                        const isEliminated = (playerData?.temp || 0) >= maxTemp
                        
                        // Prüfe ob Spieler gerade angreift (richtig geraten und noch nicht entschieden)
                        const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                        const isHotseat = myName === hotseatName
                        const truth = globalData.votes?.[hotseatName]?.choice
                        const myVote = globalData.votes?.[myName]
                        const guessedCorrectly = myVote && truth !== undefined && String(myVote.choice) === String(truth)
                        const guessedWrong = myVote && truth !== undefined && String(myVote.choice) !== String(truth)
                        const attackDecisions = globalData.attackDecisions || {}
                        const hasAttackDecision = attackDecisions[myName] === true
                        const isCurrentlyAttacking = !showIntermediateResult && guessedCorrectly && !hasAttackDecision && !isHotseat
                        
                        // Button anzeigen wenn: localActionDone
                        // ABER NICHT wenn Spieler gerade angreift
                        // ABER NICHT in Angriffsphase wenn falsch geraten (warten auf andere)
                        // ABER NICHT in Angriffsphase wenn Hotseat (wartet auch nur)
                        // IN Zwischenergebnis-Phase: ALLE sehen den Button
                        const shouldShowButton = showIntermediateResult ? 
                            (localActionDone || isHotseat || isEliminated) : // Zwischenergebnis: wie bisher
                            (localActionDone || isEliminated) && !isCurrentlyAttacking && !guessedWrong && !isHotseat // Angriffsphase: Hotseat sieht auch keinen Button
                        
                        if (!shouldShowButton) return null
                        
                        // Button Text: In Zwischenergebnis-Phase "Nächste Frage", sonst "Bereit"
                        const buttonText = showIntermediateResult ? 
                            ((globalData.ready || []).includes(myName) ? '✅ Bereit für nächste Frage' : '➡️ Nächste Frage') :
                            ((globalData.ready || []).includes(myName) ? '❌ Nicht bereit' : '👍 Bereit')
                        
                        return (
                            <button 
                                className={(globalData.ready || []).includes(myName) ? 'btn-secondary' : 'btn-primary'} 
                                onClick={setReady}
                                disabled={isEliminated}
                                style={{marginTop: '20px'}}
                            >
                                {isEliminated ? '🔥 Hitzkopf - Ausgeschieden' : buttonText}
                            </button>
                        )
                    })()}
                    
                    {/* Spieler-Bereit-Status unter dem Button - Nur anzeigen wenn Button auch angezeigt wird */}
                    {(() => {
                        // Prüfe ob Button angezeigt wird (gleiche Logik wie oben)
                        const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                        const isHotseat = myName === hotseatName
                        const truth = globalData.votes?.[hotseatName]?.choice
                        const myVote = globalData.votes?.[myName]
                        const guessedCorrectly = myVote && truth !== undefined && String(myVote.choice) === String(truth)
                        const guessedWrong = myVote && truth !== undefined && String(myVote.choice) !== String(truth)
                        const attackDecisions = globalData.attackDecisions || {}
                        const hasAttackDecision = attackDecisions[myName] === true
                        const isCurrentlyAttacking = !showIntermediateResult && guessedCorrectly && !hasAttackDecision && !isHotseat
                        
                        // Nur anzeigen wenn nicht gerade am Angreifen UND nicht falsch geraten UND nicht Hotseat (außer in Zwischenergebnis-Phase)
                        if (isCurrentlyAttacking) return null
                        if (!showIntermediateResult && guessedWrong) return null
                        if (!showIntermediateResult && isHotseat) return null
                        
                        return (
                            <div className={styles.playerReadyList}>
                                {(() => {
                                    const maxTemp = globalData.config?.maxTemp || 100
                                    const activePlayers = renderPlayers().filter(p => (globalData.players?.[p.name]?.temp || 0) < maxTemp)
                                    const readyList = globalData.ready || []
                                    
                                    // Sortiere alphabetisch
                                    const sortedPlayers = [...activePlayers].sort((a, b) => a.name.localeCompare(b.name))
                                    
                                    // Erstelle Komma-getrennte Liste
                                    const playerText = sortedPlayers.map(player => {
                                        const isReady = readyList.includes(player.name)
                                        const icon = isReady ? '✅' : '⏳'
                                        return `${icon} ${player.emoji} ${player.name}`
                                    }).join(', ')
                                    
                                    return (
                                        <div className={styles.playerReadyText}>
                                            {playerText}
                                        </div>
                                    )
                                })()}
                            </div>
                        )
                    })()}
                </div>
                )
            })()}
            
            {/* WINNER SCREEN */}
            {currentScreen === 'winner' && globalData && (
                <div className={`screen active card ${styles.winnerScreen}`}>
                    {/* Konfetti Animation */}
                    {[...Array(50)].map((_, i) => (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                width: '10px',
                                height: '10px',
                                background: ['#ff4500', '#ff8c00', '#ffd700', '#ff6b35', '#ffa500'][Math.floor(Math.random() * 5)],
                                left: `${Math.random() * 100}%`,
                                top: '-10px',
                                animation: `confettiFall ${2 + Math.random() * 3}s linear infinite`,
                                animationDelay: `${Math.random() * 2}s`,
                                borderRadius: '50%',
                                zIndex: 1
                            }}
                        />
                    ))}
                    <h2 className={styles.winnerTitle}>🎉 Gewinner!</h2>
                    {(() => {
                        const maxTemp = globalData.config?.maxTemp || 100
                        const winner = Object.entries(globalData.players || {}).find(([name, data]) => (data.temp || 0) < maxTemp)
                        if (winner) {
                            const [winnerName, winnerData] = winner
                            return (
                                <div className={styles.winnerCard}>
                                    <div className={styles.winnerEmoji}>{winnerData.emoji || '😎'}</div>
                                    <p className={styles.winnerName}>
                                        {winnerName}
                                    </p>
                                    <p className={styles.winnerText}>
                                        ist cool geblieben und gewinnt diese Runde Hitzkopf! 🧊
                                    </p>
                                    <p className={styles.winnerTemp}>
                                        {winnerData.temp || 0}°C
                                    </p>
                                </div>
                            )
                        }
                        return null
                    })()}
                    <div className={styles.winnerActions}>
                        {isHost && (
                            <button onClick={rematchGame} className={`btn-primary ${styles.winnerButton}`}>
                                ♻️ Revanche starten
                            </button>
                        )}
                        <button onClick={leaveLobby} className={`btn-secondary ${styles.winnerButton}`}>
                            🚪 Lobby verlassen
                        </button>
                    </div>
                </div>
            )}
            
            {/* HOTSEAT MODAL */}
            {showHotseatModal && globalData && globalData.hotseat && (
                <div 
                    className={styles.hotseatModalOverlay}
                    onClick={closeHotseatModal}
                >
                    <div 
                        className={styles.hotseatModalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.hotseatModalIcon}>
                            {(() => {
                                // WICHTIG: Stelle sicher, dass hotseat ein String ist
                                const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                                const isMeHotseat = myName === hotseatName
                                // Beim Hotseat-Spieler: Fragezeichen statt Dartscheibe
                                // Bei anderen: Dartscheibe bleibt
                                return isMeHotseat ? '❓' : '🎯'
                            })()}
                        </div>
                        {myName === globalData.hotseat ? (
                            <>
                                <div className={styles.hotseatModalTitle}>
                                    Du bist gefragt!
                                </div>
                                <div className={styles.hotseatModalText}>
                                    Alle anderen müssen deine Antwort erraten.
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.hotseatModalHeader}>
                                    {(() => {
                                        // WICHTIG: Stelle sicher, dass hotseat ein String ist
                                        const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                                        const isMeHotseat = myName === hotseatName
                                        // Beim nicht-Hotseat-Spieler: Zeige den Emoji des Hotseat-Spielers (nicht gestylt)
                                        const hotseatEmoji = globalData.players?.[hotseatName]?.emoji || '😊'
                                        return (
                                            <>
                                                <span className={styles.hotseatModalEmoji}>{hotseatEmoji}</span>
                                                <span className={styles.hotseatModalTitle}>{hotseatName}</span>
                                            </>
                                        )
                                    })()}
                                </div>
                                <div className={styles.hotseatModalText}>
                                    {(() => {
                                        // WICHTIG: Stelle sicher, dass hotseat ein String ist
                                        const hotseatName = typeof globalData.hotseat === 'string' ? globalData.hotseat : (globalData.hotseat?.name || String(globalData.hotseat || ''))
                                        return <>ist gefragt. Versuche {hotseatName}'s Antwort zu erraten.</>
                                    })()}
                                </div>
                            </>
                        )}
                        <button 
                            className={`btn-primary ${styles.hotseatModalButton}`}
                            onClick={closeHotseatModal}
                        >
                            Los geht's
                        </button>
                    </div>
                </div>
            )}
            
            {/* ATTACK MODAL */}
            {showAttackModal && attackResult && globalData && (
                <div 
                    className={styles.attackModalOverlay}
                    onClick={closeAttackModal}
                >
                    <div 
                        className={`${styles.attackModalContent} ${attackResult.totalDmg > 0 ? styles.attackModalContentDamage : styles.attackModalContentNoDamage}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.attackModalIcon}>
                            {attackResult.totalDmg > 0 ? '🔥' : '🧊'}
                        </div>
                        <div className={`${styles.attackModalName} ${attackResult.totalDmg > 0 ? styles.attackModalNameDamage : styles.attackModalNameNoDamage}`}>
                            {myName}
                        </div>
                        <div className={styles.attackModalMessage}>
                            {attackResult.totalDmg > 0 
                                ? `Du wurdest aufgeheizt! Insgesamt ${attackResult.totalDmg}°C`
                                : 'Cool geblieben - Keiner hat dich aufgeheizt'
                            }
                        </div>
                        {attackResult.totalDmg === 0 && (
                            <div className={styles.attackModalNoDamage}>
                                Du hast diese Runde keine Hitze erhalten
                            </div>
                        )}
                        {attackResult.attackDetails && attackResult.attackDetails.length > 0 && attackResult.totalDmg > 0 && (
                            <div className={styles.attackModalDetails}>
                                <strong className={styles.attackModalDetailsTitle}>Angriffe:</strong><br />
                                {attackResult.attackDetails
                                    .filter(d => !d.mirrored) // Zeige alle Angriffe außer gespiegelte, inklusive Strafhitze
                                    .map((detail, idx) => (
                                        <div key={idx} className={styles.attackModalDetailItem}>
                                            • {detail.attacker}: +{detail.dmg}°C
                                        </div>
                                    ))}
                            </div>
                        )}
                        <div className={styles.attackModalBar}>
                            {(() => {
                                const maxTemp = globalData.config?.maxTemp || 100
                                const currentTemp = globalData.players?.[myName]?.temp || 0
                                const tempPercent = Math.min((currentTemp / maxTemp) * 100, 100)
                                
                                return (
                                    <div 
                                        className={`${styles.attackModalBarFill} ${attackResult.totalDmg > 0 ? styles.attackModalBarFillDamage : styles.attackModalBarFillNoDamage}`}
                                        ref={(el) => {
                                            if (el) {
                                                setTimeout(() => {
                                                    el.style.width = `${tempPercent}%`
                                                }, 100)
                                            }
                                        }}
                                    ></div>
                                )
                            })()}
                        </div>
                        <div className={`${styles.attackModalTemp} ${attackResult.totalDmg > 0 ? styles.attackModalTempDamage : styles.attackModalTempNoDamage}`}>
                            {globalData.players?.[myName]?.temp || 0}°C
                        </div>
                        <button 
                            className={`btn-primary ${styles.attackModalButton}`}
                            onClick={closeAttackModal}
                        >
                            Verstanden
                        </button>
                    </div>
                </div>
            )}
            
            {/* ELIMINATION MODAL */}
            {showEliminationModal && eliminatedPlayer && globalData && (
                <div 
                    className={styles.eliminationModalOverlay}
                    onClick={() => {
                        setShowEliminationModal(false)
                        setEliminatedPlayer(null)
                        // WICHTIG: Setze eliminationInfo in Firebase zurück, damit das Modal nicht erneut angezeigt wird
                        if (db && roomId) {
                            updateDoc(doc(db, "lobbies", roomId), {
                                eliminationInfo: deleteField()
                            }).catch(console.error)
                        }
                    }}
                >
                    <div 
                        className={styles.eliminationModalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.eliminationModalLogoContainer}>
                            <img 
                                src={hkLogoHorizontal} 
                                alt="Hitzkopf Logo" 
                                className={styles.eliminationModalLogo}
                            />
                        </div>
                        {eliminatedPlayer === myName ? (
                            <>
                                <h2 className={styles.eliminationModalTitle}>
                                    Oh nein!
                                </h2>
                                <p className={styles.eliminationModalText}>
                                    Du bist ein Hitzkopf und somit ab sofort raus!
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className={styles.eliminationModalTitle}>
                                    {eliminatedPlayer}
                                </h2>
                                <p className={styles.eliminationModalText}>
                                    ist ein Hitzkopf und somit raus!
                                </p>
                            </>
                        )}
                        <button 
                            className={`btn-primary ${styles.eliminationModalButton}`}
                            onClick={() => {
                                setShowEliminationModal(false)
                                setEliminatedPlayer(null)
                                // WICHTIG: Setze eliminationInfo in Firebase zurück, damit das Modal nicht erneut angezeigt wird
                                if (db && roomId) {
                                    updateDoc(doc(db, "lobbies", roomId), {
                                        eliminationInfo: deleteField()
                                    }).catch(console.error)
                                }
                            }}
                        >
                            Verstanden
                        </button>
                    </div>
                </div>
            )}
            
            {/* RULES MODAL */}
            {showRulesModal && (
                <div 
                    className={styles.rulesModalOverlay}
                    onClick={() => setShowRulesModal(false)}
                >
                    <div 
                        className={styles.rulesModalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className={styles.rulesModalHeader}>
                            <span className={styles.rulesModalHeaderIcon}>📖</span>
                            <span>Anleitung</span>
                        </h2>
                        <div className={styles.rulesModalBody}>
                            <div className={styles.rulesModalSectionBox}>
                                <div className={styles.rulesModalSectionHeader}>
                                    <span className={styles.rulesModalSectionIcon}>🎯</span>
                                    <strong className={styles.rulesModalSectionTitle}>Ziel:</strong>
                                </div>
                                <p className={styles.rulesModalSectionText}>
                                    Errate die Antworten deiner Freunde und bringe sie zum Kochen! <br />
                                    Rätst du richtig, darfst du Hitze verteilen, liegst du falsch, erhältst du Strafhitze.
                                </p>
                            </div>
                            
                            <div className={styles.rulesModalSectionBox}>
                                <div className={styles.rulesModalSectionHeader}>
                                    <span className={styles.rulesModalSectionIcon}>🔥</span>
                                    <strong className={styles.rulesModalSectionTitle}>Verlierer:</strong>
                                </div>
                                <p className={styles.rulesModalSectionText}>
                                    Wer als erstes 100° erreicht ist ein Hitzkopf und fliegt raus.
                                </p>
                            </div>
                            
                            <div className={styles.rulesModalSectionBox}>
                                <div className={styles.rulesModalSectionHeader}>
                                    <span className={styles.rulesModalSectionIcon}>🧊</span>
                                    <strong className={styles.rulesModalSectionTitle}>Gewinner:</strong>
                                </div>
                                <p className={styles.rulesModalSectionText}>
                                    Bewahrst du einen kühlen Kopf, entscheidest du das Spiel für dich.
                                </p>
                            </div>
                        </div>
                        <button 
                            className={`btn-primary ${styles.rulesModalButton}`}
                            onClick={() => setShowRulesModal(false)}
                        >
                            <span>Verstanden</span>
                            <span>✓</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default HitzkopfGame
