import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, increment, arrayUnion, deleteDoc, deleteField, collection, query, where } from 'firebase/firestore'
import { characters, getCharacterById, getPassiveById, getCharacterQuip } from '../../data/quizCharacters'
import { getUpgradeById, generateUpgradeOffers, RARITY_CONFIG } from '../../data/quizUpgrades'
import { quizCategories, getQuestionsForCategories, tiebreakerQuestions } from '../../data/quizQuestions'
import styles from './QuizGame.module.css'

const firebaseConfig = {
    apiKey: "AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA",
    authDomain: "hitzkopf-f0ea6.firebaseapp.com",
    projectId: "hitzkopf-f0ea6",
    storageBucket: "hitzkopf-f0ea6.firebasestorage.app",
    messagingSenderId: "828164655874",
    appId: "1:828164655874:web:1cab759bdb03bfb736101b"
}

const QUESTION_TIME = 30
const UPGRADE_EVERY_N = 2

// Device-based progression (stored per browser/Gerät, nicht per Name)
const getDeviceId = () => {
    let id = localStorage.getItem('qz_deviceId')
    if (!id) {
        id = 'qz_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
        localStorage.setItem('qz_deviceId', id)
    }
    return id
}
const getPlayerWins = () => parseInt(localStorage.getItem('qz_wins') || '0', 10)
const addPlayerWin = () => localStorage.setItem('qz_wins', String(getPlayerWins() + 1))

const getFirebaseApp = () => {
    const existing = getApps().find(a => a.name === 'quizGame')
    return existing || initializeApp(firebaseConfig, 'quizGame')
}

const generateLobbyCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
}

const calculatePoints = (playerData, answerElapsed, isCorrect, allPlayersData) => {
    const upgrs = playerData.upgrades || []
    const passive = playerData.passive || null

    if (!isCorrect) {
        if (upgrs.includes('consistent')) return 2
        if (passive === 'nils_risiko') return -8
        // nils_urteil: kein Minus bei falsch
        return 0
    }

    // Base: Zeit-Punkte (Sekunden übrig)
    let elapsed = answerElapsed
    // niklas_inspiration: nach Sek. 20 trotzdem volle 30 Punkte
    if (passive === 'niklas_inspiration' && elapsed > 20) elapsed = 0
    let base = Math.max(1, QUESTION_TIME - Math.floor(elapsed))
    if (upgrs.includes('time_warp')) base *= 2
    let pts = base

    // Passive-Effekte (richtige Antwort)
    // Kevin: +6 flat pro richtiger Antwort (zuverlässig, ~48 Bonus über 8 Richtige)
    if (passive === 'kevin_bildung') pts += 6
    // Kevin: nach Falsch → nächste Richtige +20 (reaktiv, ~3 Trigger = 60 Bonus)
    if (passive === 'kevin_nachhilfe' && playerData.lastWasWrong) pts += 20
    // Kevin: jede 3. in Folge +25 (streakbasiert, 2 Trigger = 50)
    if (passive === 'kevin_klassenarbeit' && ((playerData.streak || 0) + 1) % 3 === 0) pts += 25
    // Niklas: erste 10s → +10 (speed reward ohne double-Hammer, ~7 Trigger = 70)
    if (passive === 'niklas_kreativ' && answerElapsed <= 10) pts += 10
    // Niklas: streak → ab 2. Richtiger +5 pro Frage (7-streak = 35 extra)
    if (passive === 'niklas_flow' && (playerData.streak || 0) > 0) pts += 5
    // Nils: +12 auf richtig (Risiko-Tradeoff: 7c/3w = +60 netto)
    if (passive === 'nils_risiko') pts += 12
    // Nils: floor 20 pts für richtige Antworten (verlässliche Untergrenze)
    if (passive === 'nils_urteil') pts = Math.max(pts, 20)
    // Nils: als Erster Richtiger → +12 (kompetitiv, ~50% Chance in 2er-Spiel)
    if (passive === 'nils_anklaeger') {
        const others = Object.values(allPlayersData).filter(p => p !== playerData)
        const myFastest = others.every(p => !p.answered || !p.answerCorrect || (p.answerElapsed ?? QUESTION_TIME) > answerElapsed)
        if (myFastest) pts += 12
    }

    // Upgrade-Effekte
    if (upgrs.includes('quick_thinker')) pts += 3
    if (upgrs.includes('knowledge_boost')) pts += 8
    if (upgrs.includes('consistent')) pts += 2
    if (upgrs.includes('early_bird') && answerElapsed <= 12) pts += 5
    const nextStreak = (playerData.streak || 0) + 1
    if (upgrs.includes('streak_bonus') && nextStreak % 3 === 0) pts += 20
    if (upgrs.includes('double_or_nothing')) pts = Math.random() < 0.5 ? pts * 2 : 0
    if (upgrs.includes('critical_hit') && Math.random() < 0.25) pts *= 2
    const scores = Object.values(allPlayersData).map(p => p.score || 0)
    const myScore = playerData.score || 0
    const isLast = scores.length > 1 && myScore === Math.min(...scores)
    if (upgrs.includes('comeback') && isLast) pts += 25
    const othersAllWrong = Object.values(allPlayersData).filter(p => p !== playerData).every(p => !p.answerCorrect)
    if (upgrs.includes('time_thief') && othersAllWrong) pts += 30
    if (upgrs.includes('master_student') && (playerData.masterStudentCharges || 0) > 0) pts *= 2
    return Math.max(0, Math.round(pts))
}

const Confetti = () => {
    const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 3}s`,
        duration: `${2.5 + Math.random() * 2}s`,
        color: ['#ff6b35', '#4ecdc4', '#ffd700', '#ff69b4', '#98fb98', '#87ceeb', '#dda0dd'][i % 7],
        width: `${6 + Math.random() * 8}px`,
        height: `${4 + Math.random() * 10}px`,
        rotation: `${Math.random() * 720}deg`
    })), [])
    return (
        <div className={styles.confettiContainer}>
            {pieces.map(p => (
                <div key={p.id} className={styles.confettiPiece}
                    style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, backgroundColor: p.color, width: p.width, height: p.height, '--end-rotation': p.rotation }}
                />
            ))}
        </div>
    )
}

function QuizGame({ onBack }) {
    const [db, setDb] = useState(null)
    const [myUid, setMyUid] = useState(null)
    const [screen, setScreen] = useState('landing')
    const [myName, setMyName] = useState(() => sessionStorage.getItem('qz_name') || '')
    const [joinCode, setJoinCode] = useState('')
    const [selectedCategories, setSelectedCategories] = useState(Object.keys(quizCategories))
    const [questionCount, setQuestionCount] = useState(10)
    const [lobbyId, setLobbyId] = useState(null)
    const [lobbyData, setLobbyData] = useState(null)
    const [isHost, setIsHost] = useState(false)

    // Game state
    const [selectedAnswer, setSelectedAnswer] = useState(null)
    const [hasAnswered, setHasAnswered] = useState(false)
    const [timeRemaining, setTimeRemaining] = useState(QUESTION_TIME)
    const [tiebreakerGuess, setTiebreakerGuess] = useState('')
    const [tieGuessSubmitted, setTieGuessSubmitted] = useState(false)

    // UI state
    const [showUpgradeMenu, setShowUpgradeMenu] = useState(false)
    const [openLobbies, setOpenLobbies] = useState([])
    const [myWins] = useState(() => getPlayerWins())
    const winCountedRef = useRef(false)
    const [pendingCharacter, setPendingCharacter] = useState(null) // character clicked, waiting for passive selection
    const [carouselIdx, setCarouselIdx] = useState(0)

    // Quips sind client-side zufällig, werden bei reveal gerendert
    const quipsRef = useRef({})

    const lobbyDataRef = useRef(null)
    const hostAdvancingRef = useRef(false)
    const timerIntervalRef = useRef(null)

    useEffect(() => { lobbyDataRef.current = lobbyData }, [lobbyData])

    useEffect(() => {
        const app = getFirebaseApp()
        const auth = getAuth(app)
        const firestoreDb = getFirestore(app)
        setDb(firestoreDb)
        onAuthStateChanged(auth, user => {
            if (user) setMyUid(user.uid)
            else signInAnonymously(auth).catch(console.error)
        })
    }, [])

    useEffect(() => {
        if (!db || !lobbyId) return
        const unsub = onSnapshot(doc(db, 'quizLobbies', lobbyId), snap => {
            if (!snap.exists()) { setScreen('landing'); setLobbyId(null); setLobbyData(null); return }
            setLobbyData(snap.data())
        })
        return unsub
    }, [db, lobbyId])

    // Open lobbies list
    useEffect(() => {
        if (!db || screen !== 'landing') return
        const q = query(collection(db, 'quizLobbies'), where('status', '==', 'lobby'))
        const unsub = onSnapshot(q, snap => {
            setOpenLobbies(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })
        return unsub
    }, [db, screen])

    // Count win when winner screen shown
    useEffect(() => {
        if (lobbyData?.status !== 'winner' || winCountedRef.current || !myUid) return
        const players = lobbyData.players || {}
        const maxScore = Math.max(...Object.values(players).map(p => p.score || 0))
        const tieWinner = lobbyData.tiebreakerWinner
        const isWinner = tieWinner ? tieWinner === myUid : (players[myUid]?.score || 0) === maxScore
        if (isWinner) { addPlayerWin(); winCountedRef.current = true }
    }, [lobbyData?.status, myUid])

    // Reset local state on question change
    useEffect(() => {
        if (lobbyData?.status === 'question') {
            setSelectedAnswer(null)
            setHasAnswered(false)
            setTimeRemaining(QUESTION_TIME)
            quipsRef.current = {}
        }
        if (lobbyData?.status === 'tiebreaker') { setTiebreakerGuess(''); setTieGuessSubmitted(false) }
    }, [lobbyData?.status, lobbyData?.questionIndex])

    // Auto-confirm when timer hits 0 and player has a selection
    useEffect(() => {
        if (hasAnswered || selectedAnswer === null || timeRemaining > 0) return
        handleConfirmAnswer()
    }, [timeRemaining])

    // Generate quips when reveal starts
    useEffect(() => {
        if (lobbyData?.status !== 'reveal') return
        const players = lobbyData.players || {}
        const newQuips = {}
        for (const [uid, p] of Object.entries(players)) {
            if (p.character && p.answered) {
                newQuips[uid] = getCharacterQuip(p.character, p.answerCorrect)
            }
        }
        quipsRef.current = newQuips
    }, [lobbyData?.status, lobbyData?.questionIndex])

    // Client-side question timer
    useEffect(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
        if (lobbyData?.status !== 'question' || !lobbyData?.questionStartTime) { setTimeRemaining(QUESTION_TIME); return }
        const myUpgrades = lobbyData?.players?.[myUid]?.upgrades || []
        const hasTimeWarp = myUpgrades.includes('time_warp')
        timerIntervalRef.current = setInterval(() => {
            const elapsed = (Date.now() - lobbyData.questionStartTime) / 1000
            const base = hasTimeWarp ? QUESTION_TIME * 2 : QUESTION_TIME
            setTimeRemaining(Math.max(0, Math.ceil(base - (hasTimeWarp ? elapsed * 2 : elapsed))))
        }, 100)
        return () => clearInterval(timerIntervalRef.current)
    }, [lobbyData?.status, lobbyData?.questionStartTime, myUid, lobbyData?.players])

    // HOST: auto-advance from question when timer expires
    useEffect(() => {
        if (!isHost || lobbyData?.status !== 'question' || !lobbyData?.questionStartTime) return
        const elapsed = Date.now() - lobbyData.questionStartTime
        const remaining = QUESTION_TIME * 1000 - elapsed
        if (remaining <= 0) { advanceFromQuestion(); return }
        const t = setTimeout(advanceFromQuestion, remaining + 500)
        return () => clearTimeout(t)
    }, [isHost, lobbyData?.status, lobbyData?.questionStartTime])

    // HOST: advance from question if all players answered
    useEffect(() => {
        if (!isHost || lobbyData?.status !== 'question') return
        const players = lobbyData.players || {}
        const uids = Object.keys(players)
        if (uids.length === 0) return
        if (uids.every(uid => players[uid].answered)) {
            const t = setTimeout(advanceFromQuestion, 600)
            return () => clearTimeout(t)
        }
    }, [isHost, lobbyData?.status, lobbyData?.players])

    // HOST: advance from upgrade when all picked
    useEffect(() => {
        if (!isHost || lobbyData?.status !== 'upgrade') return
        const players = lobbyData.players || {}
        const uids = Object.keys(players)
        if (uids.length === 0) return
        if (uids.every(uid => players[uid].upgradePickDone)) advanceFromUpgrade()
    }, [isHost, lobbyData?.status, lobbyData?.players])

    // HOST: advance from reveal when all players clicked "Weiter"
    useEffect(() => {
        if (!isHost || lobbyData?.status !== 'reveal') return
        const players = lobbyData.players || {}
        const uids = Object.keys(players)
        if (uids.length === 0) return
        const readyMap = lobbyData.revealReady || {}
        if (uids.every(uid => readyMap[uid])) {
            advanceFromReveal()
        }
    }, [isHost, lobbyData?.status, lobbyData?.revealReady])

    // HOST: resolve tiebreaker
    useEffect(() => {
        if (!isHost || lobbyData?.status !== 'tiebreaker') return
        const players = lobbyData.players || {}
        const maxScore = Math.max(...Object.values(players).map(p => p.score || 0))
        const tiedUids = Object.keys(players).filter(uid => (players[uid].score || 0) === maxScore)
        const guesses = lobbyData.tiebreakerGuesses || {}
        if (tiedUids.length > 0 && tiedUids.every(uid => guesses[uid] !== undefined)) resolveTiebreaker(tiedUids, guesses)
    }, [isHost, lobbyData?.status, lobbyData?.tiebreakerGuesses])

    const advanceFromQuestion = useCallback(async () => {
        if (!isHost || hostAdvancingRef.current) return
        const data = lobbyDataRef.current
        if (!data || data.status !== 'question') return
        hostAdvancingRef.current = true
        try {
            const players = data.players || {}
            const question = data.currentQuestion
            const updates = {}
            for (const [uid, player] of Object.entries(players)) {
                const isCorrect = player.answered && player.answerIndex === question.correctIndex
                const answerElapsed = player.answerElapsed ?? QUESTION_TIME
                const pts = calculatePoints(player, answerElapsed, isCorrect, players)
                const newStreak = isCorrect ? (player.streak || 0) + 1 : 0
                updates[`players.${uid}.answerCorrect`] = isCorrect
                updates[`players.${uid}.pointsEarned`] = pts
                updates[`players.${uid}.score`] = increment(pts)
                updates[`players.${uid}.streak`] = newStreak
                updates[`players.${uid}.lastWasWrong`] = !isCorrect
                if (isCorrect && player.upgrades?.includes('master_student') && (player.masterStudentCharges || 0) > 0) {
                    updates[`players.${uid}.masterStudentCharges`] = (player.masterStudentCharges || 0) - 1
                }
            }
            updates.status = 'reveal'
            updates.revealStartTime = Date.now()
            await updateDoc(doc(db, 'quizLobbies', lobbyId), updates)
        } finally {
            hostAdvancingRef.current = false
        }
    }, [isHost, db, lobbyId])

    const advanceFromReveal = useCallback(async () => {
        const data = lobbyDataRef.current
        if (!data || data.status !== 'reveal') return
        const nextIndex = (data.questionIndex || 0) + 1
        const total = data.totalQuestions || 0
        if (nextIndex >= total) {
            const players = data.players || {}
            const maxScore = Math.max(...Object.values(players).map(p => p.score || 0))
            const winners = Object.keys(players).filter(uid => (players[uid].score || 0) === maxScore)
            if (winners.length > 1) {
                const tbQ = tiebreakerQuestions[Math.floor(Math.random() * tiebreakerQuestions.length)]
                await updateDoc(doc(db, 'quizLobbies', lobbyId), { status: 'tiebreaker', tiebreaker: tbQ, tiebreakerGuesses: {} })
            } else {
                await updateDoc(doc(db, 'quizLobbies', lobbyId), { status: 'winner' })
            }
            return
        }
        const doUpgrade = nextIndex % UPGRADE_EVERY_N === 0
        if (doUpgrade) {
            const offerUpdates = {}
            for (const [uid, player] of Object.entries(data.players || {})) {
                const offers = generateUpgradeOffers(3, player.upgrades || [])
                offerUpdates[`upgradeOffers.${uid}`] = offers
                offerUpdates[`players.${uid}.upgradePickDone`] = false
            }
            await updateDoc(doc(db, 'quizLobbies', lobbyId), { status: 'upgrade', questionIndex: nextIndex, ...offerUpdates })
        } else {
            await startNextQuestion(nextIndex, data)
        }
    }, [db, lobbyId])

    const advanceFromUpgrade = useCallback(async () => {
        const data = lobbyDataRef.current
        if (!data || data.status !== 'upgrade') return
        await startNextQuestion(data.questionIndex, data)
    }, [db, lobbyId])

    const startNextQuestion = async (index, data) => {
        const pool = data.questionPool || []
        if (index >= pool.length) return
        const question = pool[index]
        const playerResets = {}
        for (const uid of Object.keys(data.players || {})) {
            playerResets[`players.${uid}.answered`] = false
            playerResets[`players.${uid}.answerIndex`] = null
            playerResets[`players.${uid}.answerElapsed`] = null
            playerResets[`players.${uid}.answerCorrect`] = null
            playerResets[`players.${uid}.pointsEarned`] = 0
        }
        await updateDoc(doc(db, 'quizLobbies', lobbyId), {
            status: 'question',
            questionIndex: index,
            currentQuestion: question,
            questionStartTime: Date.now(),
            revealStartTime: null,
            revealReady: {},
            ...playerResets
        })
    }

    const resolveTiebreaker = async (tiedUids, guesses) => {
        const data = lobbyDataRef.current
        if (!data) return
        const correctAnswer = data.tiebreaker.answer
        let winnerUid = tiedUids[0]
        let bestDiff = Math.abs((guesses[tiedUids[0]] || 0) - correctAnswer)
        for (const uid of tiedUids) {
            const diff = Math.abs((guesses[uid] || 0) - correctAnswer)
            if (diff < bestDiff) { bestDiff = diff; winnerUid = uid }
        }
        await updateDoc(doc(db, 'quizLobbies', lobbyId), { status: 'winner', tiebreakerWinner: winnerUid })
    }

    // --- Actions ---
    const handleCreateLobby = async () => {
        if (!myName.trim() || !db || !myUid) return
        if (selectedCategories.length === 0) { alert('Bitte mindestens eine Kategorie auswählen!'); return }
        const name = myName.trim()
        sessionStorage.setItem('qz_name', name)
        const code = generateLobbyCode()
        const questions = getQuestionsForCategories(selectedCategories).slice(0, questionCount)
        const initialOffers = generateUpgradeOffers(3, [])
        await setDoc(doc(db, 'quizLobbies', code), {
            hostId: myUid, hostName: name, status: 'lobby',
            categories: selectedCategories, totalQuestions: questions.length,
            questionPool: questions, questionIndex: 0,
            currentQuestion: null, questionStartTime: null, revealStartTime: null,
            upgradeOffers: { [myUid]: initialOffers },
            tiebreakerGuesses: {}, tiebreaker: null, tiebreakerWinner: null,
            players: { [myUid]: { name, character: null, passive: null, ready: false, score: 0, upgrades: [], upgradePickDone: false, answered: false, answerIndex: null, answerElapsed: null, answerCorrect: null, pointsEarned: 0, streak: 0, masterStudentCharges: 0, lastWasWrong: false } },
            createdAt: Date.now()
        })
        setLobbyId(code); setIsHost(true); setScreen('game')
    }

    const handleJoinLobby = async (lobbyDocId) => {
        if (!myName.trim() || !db || !myUid) return
        const name = myName.trim()
        sessionStorage.setItem('qz_name', name)
        try {
            const initialOffers = generateUpgradeOffers(3, [])
            await updateDoc(doc(db, 'quizLobbies', lobbyDocId), {
                [`upgradeOffers.${myUid}`]: initialOffers,
                [`players.${myUid}`]: { name, character: null, passive: null, ready: false, score: 0, upgrades: [], upgradePickDone: false, answered: false, answerIndex: null, answerElapsed: null, answerCorrect: null, pointsEarned: 0, streak: 0, masterStudentCharges: 0, lastWasWrong: false }
            })
            setLobbyId(lobbyDocId); setIsHost(false); setScreen('game')
        } catch { alert('Lobby konnte nicht beigetreten werden.') }
    }

    const handleSelectCharacterWithPassive = async (characterId, passiveId) => {
        if (!db || !lobbyId || !myUid) return
        await updateDoc(doc(db, 'quizLobbies', lobbyId), {
            [`players.${myUid}.character`]: characterId,
            [`players.${myUid}.passive`]: passiveId
        })
        setPendingCharacter(null)
    }

    const handleToggleReady = async () => {
        const current = lobbyData?.players?.[myUid]?.ready || false
        await updateDoc(doc(db, 'quizLobbies', lobbyId), { [`players.${myUid}.ready`]: !current })
    }

    const handleStartGame = async () => {
        if (!isHost || !db || !lobbyId) return
        const players = lobbyData?.players || {}
        const uids = Object.keys(players)
        if (!uids.every(uid => players[uid].character && players[uid].passive)) { alert('Alle Spieler müssen Charakter & Passive wählen!'); return }
        if (!uids.every(uid => players[uid].ready)) { alert('Alle Spieler müssen bereit sein!'); return }
        const offerUpdates = {}
        for (const uid of uids) {
            const offers = generateUpgradeOffers(3, [])
            offerUpdates[`upgradeOffers.${uid}`] = offers
            offerUpdates[`players.${uid}.upgradePickDone`] = false
            offerUpdates[`players.${uid}.score`] = 0
            offerUpdates[`players.${uid}.upgrades`] = []
            offerUpdates[`players.${uid}.streak`] = 0
            offerUpdates[`players.${uid}.masterStudentCharges`] = 0
        }
        await updateDoc(doc(db, 'quizLobbies', lobbyId), { status: 'upgrade', questionIndex: 0, ...offerUpdates })
    }

    const handlePickUpgrade = async (upgradeId) => {
        if (!db || !lobbyId || !myUid || lobbyData?.players?.[myUid]?.upgradePickDone) return
        const updates = { [`players.${myUid}.upgrades`]: arrayUnion(upgradeId), [`players.${myUid}.upgradePickDone`]: true }
        if (upgradeId === 'head_start') updates[`players.${myUid}.score`] = increment(20)
        if (upgradeId === 'master_student') updates[`players.${myUid}.masterStudentCharges`] = 5
        await updateDoc(doc(db, 'quizLobbies', lobbyId), updates)
    }

    const handleSelectAnswer = (answerIndex) => {
        if (hasAnswered) return
        setSelectedAnswer(answerIndex)
    }

    const handleConfirmAnswer = async () => {
        if (hasAnswered || selectedAnswer === null || !db || !lobbyId || !myUid) return
        setHasAnswered(true)
        const elapsed = (Date.now() - (lobbyData?.questionStartTime || Date.now())) / 1000
        await updateDoc(doc(db, 'quizLobbies', lobbyId), {
            [`players.${myUid}.answered`]: true,
            [`players.${myUid}.answerIndex`]: selectedAnswer,
            [`players.${myUid}.answerElapsed`]: Math.min(elapsed, QUESTION_TIME)
        })
    }

    const handleRevealReady = async () => {
        if (!db || !lobbyId || !myUid) return
        await updateDoc(doc(db, 'quizLobbies', lobbyId), {
            [`revealReady.${myUid}`]: true
        })
    }

    const handleSubmitTiebreakerGuess = async () => {
        if (!tiebreakerGuess.trim() || tieGuessSubmitted || !db || !lobbyId || !myUid) return
        setTieGuessSubmitted(true)
        await updateDoc(doc(db, 'quizLobbies', lobbyId), { [`tiebreakerGuesses.${myUid}`]: Number(tiebreakerGuess) })
    }

    const handleRestartGame = async () => {
        winCountedRef.current = false
        if (!isHost || !db || !lobbyId) return
        const players = lobbyData?.players || {}
        const playerResets = {}
        for (const uid of Object.keys(players)) {
            playerResets[`players.${uid}.score`] = 0; playerResets[`players.${uid}.upgrades`] = []
            playerResets[`players.${uid}.streak`] = 0; playerResets[`players.${uid}.ready`] = false
            playerResets[`players.${uid}.answered`] = false; playerResets[`players.${uid}.upgradePickDone`] = false
            playerResets[`players.${uid}.masterStudentCharges`] = 0; playerResets[`players.${uid}.character`] = null
            playerResets[`players.${uid}.answerCorrect`] = null; playerResets[`players.${uid}.pointsEarned`] = 0
        }
        await updateDoc(doc(db, 'quizLobbies', lobbyId), { status: 'lobby', questionIndex: 0, currentQuestion: null, questionStartTime: null, revealStartTime: null, tiebreaker: null, tiebreakerGuesses: {}, tiebreakerWinner: null, upgradeOffers: {}, ...playerResets })
    }

    const handleBack = async () => {
        if (lobbyId && db) {
            if (isHost) {
                // Host verlässt → Lobby löschen
                deleteDoc(doc(db, 'quizLobbies', lobbyId)).catch(() => {})
            } else if (myUid) {
                // Nicht-Host verlässt → sich selbst aus der Lobby entfernen
                try {
                    const remaining = Object.keys(lobbyData?.players || {}).filter(uid => uid !== myUid)
                    if (remaining.length === 0) {
                        // Letzter Spieler → Lobby löschen
                        await deleteDoc(doc(db, 'quizLobbies', lobbyId))
                    } else {
                        await updateDoc(doc(db, 'quizLobbies', lobbyId), {
                            [`players.${myUid}`]: deleteField(),
                            [`upgradeOffers.${myUid}`]: deleteField()
                        })
                    }
                } catch { /* ignore */ }
            }
        }
        setScreen('landing'); setLobbyId(null); setLobbyData(null); setIsHost(false)
        winCountedRef.current = false
    }

    // --- Derived state ---
    const myPlayer = lobbyData?.players?.[myUid] || {}
    const myUpgrades = myPlayer.upgrades || []
    const myOffers = lobbyData?.upgradeOffers?.[myUid] || []
    const players = lobbyData?.players || {}
    const playerList = Object.entries(players).sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
    const currentQuestion = lobbyData?.currentQuestion

    const eliminatedAnswerIndex = useMemo(() => {
        if (!myUpgrades.includes('omniscient') || !currentQuestion) return null
        if (timeRemaining > 15) return null
        const wrong = currentQuestion.answers.map((_, i) => i).filter(i => i !== currentQuestion.correctIndex)
        return wrong[currentQuestion.question.length % wrong.length]
    }, [myUpgrades, timeRemaining, currentQuestion])

    const upgradesUntilNext = useMemo(() => {
        if (!lobbyData) return null
        const qIdx = lobbyData.questionIndex || 0
        const nextIdx = qIdx + 1
        const rem = UPGRADE_EVERY_N - (nextIdx % UPGRADE_EVERY_N)
        return rem === UPGRADE_EVERY_N ? 0 : rem
    }, [lobbyData?.questionIndex])

    // Upgrade Menu content
    const UpgradeMenu = () => (
        <div className={styles.upgradeMenuOverlay} onClick={() => setShowUpgradeMenu(false)}>
            <div className={styles.upgradeMenuPanel} onClick={e => e.stopPropagation()}>
                <div className={styles.upgradeMenuHeader}>
                    <h3 className={styles.upgradeMenuTitle}>⚡ Meine Upgrades</h3>
                    <button className={styles.upgradeMenuClose} onClick={() => setShowUpgradeMenu(false)}>✕</button>
                </div>
                {myUpgrades.length === 0 ? (
                    <p className={styles.upgradeMenuEmpty}>Noch keine Upgrades</p>
                ) : (
                    <div className={styles.upgradeMenuList}>
                        {myUpgrades.map(uid => {
                            const u = getUpgradeById(uid)
                            if (!u) return null
                            const cfg = RARITY_CONFIG[u.rarity]
                            return (
                                <div key={uid} className={styles.upgradeMenuItem}
                                    style={{ '--rarity-color': cfg.color, '--rarity-border': cfg.border, '--rarity-bg': cfg.bg }}>
                                    <span className={styles.upgradeMenuEmoji}>{u.emoji}</span>
                                    <div>
                                        <div className={styles.upgradeMenuName}>{u.name}
                                            <span className={styles.upgradeMenuRarity} style={{ color: cfg.color }}> · {cfg.label}</span>
                                        </div>
                                        <div className={styles.upgradeMenuDesc}>{u.description}</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
                <div className={styles.upgradeMenuDivider} />
                <button className={styles.leaveGameBtn} onClick={() => { setShowUpgradeMenu(false); handleBack() }}>
                    Spiel verlassen
                </button>
            </div>
        </div>
    )

    // =================== RENDER ===================

    if (screen === 'landing') {
        return (
            <div className={styles.screen}>
                <div className={styles.bg} />
                <div className={styles.container}>
                    <button className={styles.backBtn} onClick={onBack}>← Zurück</button>
                    <div className={styles.landingContent}>
                        <div className={styles.heroEmoji}>🧠</div>
                        <h1 className={styles.heroTitle}>Quiz<span className={styles.accent}>Royale</span></h1>
                        <p className={styles.heroSub}>Rundenbasiertes Quizgame mit Charakter-Passiven & Upgrades</p>
                        <div className={styles.nameSection}>
                            <input className={styles.input} placeholder="Dein Name..." value={myName}
                                onChange={e => setMyName(e.target.value)} maxLength={20}
                                onKeyDown={e => e.key === 'Enter' && myName.trim() && setScreen('create')} />
                        </div>
                        <button className={styles.btnPrimary} onClick={() => myName.trim() && setScreen('create')} disabled={!myName.trim()}>
                            🏠 Lobby erstellen
                        </button>

                        {/* Open lobbies list */}
                        <div className={styles.lobbyListSection}>
                            <h3 className={styles.lobbyListTitle}>Offene Lobbies</h3>
                            {openLobbies.length === 0 ? (
                                <p className={styles.lobbyListEmpty}>Keine offenen Lobbies… erstelle eine!</p>
                            ) : (
                                <div className={styles.lobbyListCards}>
                                    {openLobbies.map(lobby => (
                                        <div key={lobby.id} className={styles.lobbyListCard}>
                                            <div className={styles.lobbyListInfo}>
                                                <span className={styles.lobbyListHost}>{lobby.hostName}</span>
                                                <span className={styles.lobbyListMeta}>
                                                    {Object.keys(lobby.players || {}).length} Spieler · {lobby.totalQuestions} Fragen
                                                </span>
                                            </div>
                                            <button className={styles.btnSecondary}
                                                onClick={() => myName.trim() && handleJoinLobby(lobby.id)}
                                                disabled={!myName.trim()}>
                                                Beitreten
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (screen === 'create') {
        return (
            <div className={styles.screen}>
                <div className={styles.bg} />
                <div className={styles.container}>
                    <button className={styles.backBtn} onClick={() => setScreen('landing')}>← Zurück</button>
                    <h2 className={styles.sectionTitle}>Lobby erstellen</h2>
                    <div className={styles.createCard}>
                        <h3 className={styles.subTitle}>Kategorien wählen</h3>
                        <div className={styles.categoryGrid}>
                            {Object.entries(quizCategories).map(([key, cat]) => (
                                <button key={key}
                                    className={`${styles.categoryBtn} ${selectedCategories.includes(key) ? styles.selected : ''}`}
                                    onClick={() => setSelectedCategories(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                                    style={{ '--cat-color': cat.color }}>
                                    <span className={styles.catEmoji}>{cat.emoji}</span>
                                    <span className={styles.catName}>{cat.name}</span>
                                    {selectedCategories.includes(key) && <span className={styles.check}>✓</span>}
                                </button>
                            ))}
                        </div>
                        <div className={styles.countRow}>
                            <h3 className={styles.subTitle}>Frageanzahl</h3>
                            <div className={styles.countBtns}>
                                {[5, 10, 15, 20].map(n => (
                                    <button key={n} className={`${styles.countBtn} ${questionCount === n ? styles.countSelected : ''}`}
                                        onClick={() => setQuestionCount(n)}>{n}</button>
                                ))}
                            </div>
                        </div>
                        <button className={styles.btnPrimary} onClick={handleCreateLobby}
                            disabled={selectedCategories.length === 0 || !myUid}>🚀 Lobby starten</button>
                    </div>
                </div>
            </div>
        )
    }

    if (screen === 'game' && lobbyData) {
        const status = lobbyData.status

        // LOBBY
        if (status === 'lobby') {
            const myChar = myPlayer.character
            const myPassive = myPlayer.passive
            const myReady = myPlayer.ready
            const allReady = Object.values(players).every(p => p.ready && p.character && p.passive)
            const currentCarouselChar = characters[carouselIdx]

            const handleCarouselTouch = (() => {
                let startX = null
                return {
                    onTouchStart: (e) => { startX = e.touches[0].clientX },
                    onTouchEnd: (e) => {
                        if (startX === null) return
                        const diff = startX - e.changedTouches[0].clientX
                        if (Math.abs(diff) > 40) {
                            if (diff > 0) setCarouselIdx(i => (i + 1) % characters.length)
                            else setCarouselIdx(i => (i - 1 + characters.length) % characters.length)
                        }
                        startX = null
                    }
                }
            })()

            return (
                <div className={styles.screen}>
                    <div className={styles.bg} />
                    <div className={styles.container}>
                        <button className={styles.backBtn} onClick={handleBack}>← Verlassen</button>
                        <div className={styles.lobbyLayout}>
                            <h2 className={styles.sectionTitle}>Lobby</h2>

                            {/* Character Carousel */}
                            <h3 className={styles.subTitle}>Wähle deinen Charakter</h3>
                            <div className={styles.carousel} {...handleCarouselTouch}>
                                {characters.map((char, i) => {
                                    const n = characters.length
                                    const raw = ((i - carouselIdx) + n) % n
                                    const slot = raw > Math.floor(n / 2) ? raw - n : raw
                                    const isActive = slot === 0
                                    const isNear = Math.abs(slot) === 1
                                    return (
                                        <div
                                            key={char.id}
                                            className={`${styles.charCard} ${char.id === myChar ? styles.charSelected : ''}`}
                                            style={{
                                                '--char-color': char.color,
                                                transform: `translateX(calc(-50% + ${slot * (window.innerWidth < 500 ? 195 : 245)}px)) translateY(-50%) scale(${isActive ? 1 : 0.8})`,
                                                opacity: isActive ? 1 : (isNear ? 0.45 : 0),
                                                zIndex: isActive ? 2 : 1,
                                                pointerEvents: (isActive || isNear) ? 'auto' : 'none',
                                                cursor: isNear ? 'pointer' : 'default',
                                            }}
                                            onClick={isNear ? () => setCarouselIdx(i) : undefined}
                                        >
                                            <div className={styles.charImageWrap}>
                                                {char.image
                                                    ? <img src={`${import.meta.env.BASE_URL}${char.image}`} alt={char.name} className={styles.charImage} />
                                                    : <div className={styles.charImagePlaceholder}>{char.emoji}</div>
                                                }
                                            </div>
                                            <div className={styles.charName}>{char.name}</div>
                                            <div className={styles.charTitle}>{char.title}</div>
                                            {isActive && (
                                                <button className={styles.selectCharBtn}
                                                    onClick={() => setPendingCharacter(char)}
                                                    disabled={myReady}>
                                                    {myChar === char.id ? (myPassive ? '✓ Gewählt' : 'Passive wählen') : 'Auswählen'}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                            <div className={styles.carouselDots}>
                                {characters.map((_, i) => (
                                    <span key={i} className={`${styles.dot} ${i === carouselIdx ? styles.dotActive : ''}`}
                                        onClick={() => setCarouselIdx(i)} />
                                ))}
                            </div>

                            {myChar && myPassive && (
                                <div className={styles.selectedPassiveHint}>
                                    {getCharacterById(myChar)?.emoji} <b>{getCharacterById(myChar)?.name}</b> · {getPassiveById(myPassive)?.icon} {getPassiveById(myPassive)?.name}
                                </div>
                            )}

                            {/* Passive Picker Overlay */}
                            {pendingCharacter && (
                                <div className={styles.passiveOverlay} onClick={() => setPendingCharacter(null)}>
                                    <div className={styles.passivePanel} onClick={e => e.stopPropagation()}>
                                        <div className={styles.passivePanelHeader}>
                                            <span className={styles.passivePanelEmoji}>{pendingCharacter.emoji}</span>
                                            <div>
                                                <h3 className={styles.passivePanelName}>{pendingCharacter.name}</h3>
                                                <p className={styles.passivePanelTitle}>{pendingCharacter.title}</p>
                                            </div>
                                            <button className={styles.passivePanelClose} onClick={() => setPendingCharacter(null)}>✕</button>
                                        </div>
                                        <p className={styles.passivePanelSub}>Wähle deine Passive</p>
                                        <div className={styles.passiveList}>
                                            {pendingCharacter.passives.map(p => {
                                                return (
                                                    <button key={p.id}
                                                        className={`${styles.passiveOption} ${myPassive === p.id && myChar === pendingCharacter.id ? styles.passiveChosen : ''}`}
                                                        onClick={() => handleSelectCharacterWithPassive(pendingCharacter.id, p.id)}>
                                                        <span className={styles.passiveOptionIcon}>{p.icon}</span>
                                                        <div className={styles.passiveOptionText}>
                                                            <span className={styles.passiveOptionName}>{p.name}</span>
                                                            <span className={styles.passiveOptionDesc}>{p.description}</span>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Player list */}
                            <div className={styles.playerList}>
                                <h3 className={styles.subTitle}>Spieler ({Object.keys(players).length})</h3>
                                {playerList.map(([uid, p]) => {
                                    const char = getCharacterById(p.character)
                                    const passive = getPassiveById(p.passive)
                                    return (
                                        <div key={uid} className={styles.playerRow}>
                                            <span className={styles.playerEmoji}>{char?.emoji || '❓'}</span>
                                            <div className={styles.playerRowInfo}>
                                                <span className={styles.playerName}>{p.name} {uid === myUid && '(Du)'}</span>
                                                <span className={styles.playerCharTitle}>{char ? `${char.title} · ${passive?.name || '…'}` : 'kein Charakter'}</span>
                                            </div>
                                            <span className={`${styles.readyBadge} ${p.ready && p.character && p.passive ? styles.readyYes : styles.readyNo}`}>
                                                {p.ready && p.character && p.passive ? '✓' : '…'}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className={styles.lobbyActions}>
                                <button className={`${styles.btnReady} ${myReady ? styles.btnReadyActive : ''}`}
                                    onClick={handleToggleReady} disabled={!myChar || !myPassive}>
                                    {myReady ? '✓ Bereit!' : 'Bereit?'}
                                </button>
                                {isHost && <button className={styles.btnPrimary} onClick={handleStartGame}
                                    disabled={!allReady || Object.keys(players).length < 1}>🎮 Spiel starten</button>}
                                {!isHost && <p className={styles.hint}>Warte auf den Host...</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )
        }

        // UPGRADE SELECTION
        if (status === 'upgrade') {
            const myPickDone = myPlayer.upgradePickDone
            const qIndex = lobbyData.questionIndex || 0
            const isInitial = qIndex === 0
            return (
                <div className={styles.screen}>
                    <div className={styles.bg} />
                    <div className={styles.upgradeOverlay}>
                        <div className={styles.upgradeHeader}>
                            <div className={styles.upgradeStars}>✨ ✨ ✨</div>
                            <h2 className={styles.upgradeTitle}>{isInitial ? 'Starter-Upgrade wählen!' : 'Upgrade Zeit!'}</h2>
                            <p className={styles.upgradeSub}>{isInitial ? 'Wähle ein Upgrade bevor das Spiel beginnt' : `Nach Frage ${qIndex} – wähle ein neues Upgrade`}</p>
                        </div>
                        {myPickDone ? (
                            <div className={styles.waitingBox}>
                                <div className={styles.waitingIcon}>⏳</div>
                                <p className={styles.waitingText}>Warte auf andere Spieler...</p>
                                <div className={styles.waitingPlayers}>
                                    {playerList.map(([uid, p]) => (
                                        <span key={uid} className={`${styles.waitBadge} ${p.upgradePickDone ? styles.waitDone : styles.waitPending}`}>
                                            {p.name} {p.upgradePickDone ? '✓' : '...'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className={styles.upgradeCards}>
                                {myOffers.map(upgradeId => {
                                    const upg = getUpgradeById(upgradeId)
                                    if (!upg) return null
                                    const cfg = RARITY_CONFIG[upg.rarity]
                                    return (
                                        <button key={upg.id} className={styles.upgradeCard} onClick={() => handlePickUpgrade(upg.id)}
                                            style={{ '--rarity-color': cfg.color, '--rarity-bg': cfg.bg, '--rarity-border': cfg.border, '--rarity-glow': cfg.glow }}>
                                            <div className={styles.rarityBadge} style={{ color: cfg.color, borderColor: cfg.border }}>{cfg.label.toUpperCase()}</div>
                                            <div className={styles.upgradeEmoji}>{upg.emoji}</div>
                                            <div className={styles.upgradeName}>{upg.name}</div>
                                            <div className={styles.upgradeDesc}>{upg.description}</div>
                                            <div className={styles.upgradeSelectBtn}>Wählen</div>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                        {myUpgrades.length > 0 && (
                            <div className={styles.myUpgradesBar}>
                                <span className={styles.myUpgradesLabel}>Meine Upgrades:</span>
                                {myUpgrades.map(uid => {
                                    const u = getUpgradeById(uid)
                                    return u ? <span key={uid} className={styles.myUpgradePill} title={u.description}>{u.emoji} {u.name}</span> : null
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )
        }

        // QUESTION + REVEAL
        if (status === 'question' || status === 'reveal') {
            const isReveal = status === 'reveal'
            const q = currentQuestion
            if (!q) return null

            const myUpgradesLocal = myPlayer.upgrades || []
            const totalTime = myUpgradesLocal.includes('time_warp') ? QUESTION_TIME * 2 : QUESTION_TIME
            const timerPct = (timeRemaining / totalTime) * 100
            const timerColor = timerPct > 60 ? '#4ecdc4' : timerPct > 30 ? '#ffd700' : '#ff4757'

            const qIdx = lobbyData.questionIndex || 0
            const nextUpgradeIn = upgradesUntilNext

            return (
                <div className={styles.screen}>
                    <div className={styles.bg} />
                    {showUpgradeMenu && <UpgradeMenu />}
                    <div className={styles.gameLayout}>

                        {/* Header */}
                        <div className={styles.gameHeader}>
                            <div className={styles.questionMeta}>
                                <span className={styles.categoryBadge}>{quizCategories[q.category]?.emoji} {q.categoryName}</span>
                                <span className={styles.questionNum}>Frage {qIdx + 1} / {lobbyData.totalQuestions}</span>
                                {nextUpgradeIn === 0
                                    ? <span className={styles.upgradeSoon}>⚡ Upgrade nach dieser Frage!</span>
                                    : nextUpgradeIn === 1
                                        ? <span className={styles.upgradeNext}>🔮 Upgrade in 1 Frage</span>
                                        : <span className={styles.upgradeNext}>🔮 Upgrade in {nextUpgradeIn} Fragen</span>
                                }
                            </div>
                            <div className={styles.headerRight}>
                                <button className={styles.gearBtn} onClick={() => setShowUpgradeMenu(true)} title="Einstellungen & Upgrades">
                                    ⚙️
                                    {myUpgradesLocal.length > 0 && <span className={styles.gearBadge}>{myUpgradesLocal.length}</span>}
                                </button>
                            </div>
                        </div>

                        {/* Timer */}
                        <div className={styles.timerContainer}>
                            <div className={styles.timerTrack}>
                                <div className={styles.timerFill}
                                    style={{ width: `${isReveal ? 0 : timerPct}%`, backgroundColor: timerColor, transition: isReveal ? 'none' : 'width 0.1s linear, background-color 0.5s' }} />
                            </div>
                            <span className={styles.timerNum} style={{ color: timerColor }}>
                                {isReveal ? '–' : timeRemaining}
                            </span>
                        </div>

                        {/* Question */}
                        <div className={styles.questionBox}>
                            <p className={styles.questionText}>{q.question}</p>
                        </div>

                        {/* Answers */}
                        <div className={styles.answersColumn}>
                            {q.answers.map((answer, i) => {
                                let cls = styles.answerBtn
                                if (isReveal) {
                                    if (i === q.correctIndex) cls = `${styles.answerBtn} ${styles.answerCorrect}`
                                    else if (i === myPlayer.answerIndex && i !== q.correctIndex) cls = `${styles.answerBtn} ${styles.answerWrong}`
                                    else cls = `${styles.answerBtn} ${styles.answerDim}`
                                } else {
                                    if (i === selectedAnswer) cls = `${styles.answerBtn} ${styles.answerSelected}`
                                    if (i === eliminatedAnswerIndex) cls = `${styles.answerBtn} ${styles.answerEliminated}`
                                }
                                const labels = ['A', 'B', 'C', 'D']
                                return (
                                    <button key={i} className={cls}
                                        onClick={() => !isReveal && !hasAnswered && handleSelectAnswer(i)}
                                        disabled={isReveal || hasAnswered || i === eliminatedAnswerIndex}>
                                        <span className={styles.answerLabel}>{labels[i]}</span>
                                        <span className={styles.answerText}>{answer}</span>
                                        {isReveal && i === q.correctIndex && <span className={styles.answerCheck}>✓</span>}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Confirm answer button */}
                        {!isReveal && !hasAnswered && selectedAnswer !== null && (
                            <button className={styles.confirmAnswerBtn} onClick={handleConfirmAnswer}>
                                Antwort bestätigen ✓
                            </button>
                        )}
                        {!isReveal && hasAnswered && (
                            <p className={styles.waitingForOthers}>Warte auf die anderen Spieler…</p>
                        )}
                        {!isReveal && !hasAnswered && selectedAnswer === null && (
                            <p className={styles.selectHint}>Wähle eine Antwort aus</p>
                        )}

                        {/* Reveal Phase */}
                        {isReveal && (
                            <div className={styles.revealSection}>
                                {/* Fun Fact */}
                                {q.funFact && (
                                    <div className={styles.funFact}>
                                        <span className={styles.funFactIcon}>💡</span>
                                        <span>{q.funFact}</span>
                                    </div>
                                )}

                                {/* Player results + quips */}
                                <div className={styles.revealResults}>
                                    {playerList.map(([uid, p]) => {
                                        const char = getCharacterById(p.character)
                                        const quip = quipsRef.current[uid]
                                        return (
                                            <div key={uid} className={`${styles.revealRow} ${p.answerCorrect ? styles.revealRight : styles.revealWrong}`}>
                                                <div className={styles.revealRowTop}>
                                                    <span className={styles.revealEmoji}>{char?.emoji}</span>
                                                    <span className={styles.revealName}>{p.name}</span>
                                                    <span className={styles.revealPts}>
                                                        {p.answerCorrect
                                                            ? <span className={styles.ptsPlus}>+{p.pointsEarned}</span>
                                                            : p.pointsEarned < 0
                                                                ? <span className={styles.ptsMinus}>{p.pointsEarned}</span>
                                                                : <span className={styles.ptsMiss}>✗</span>}
                                                    </span>
                                                </div>
                                                {quip && <div className={styles.revealQuip}>"{quip}"</div>}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Weiter button + countdown */}
                                <div className={styles.revealBottom}>
                                    <div className={styles.revealReadyRow}>
                                        {playerList.map(([uid, p]) => {
                                            const char = getCharacterById(p.character)
                                            const ready = lobbyData.revealReady?.[uid]
                                            return (
                                                <span key={uid} className={`${styles.revealReadyPip} ${ready ? styles.revealReadyDone : ''}`} title={p.name}>
                                                    {char?.emoji || '❓'}
                                                </span>
                                            )
                                        })}
                                    </div>
                                    {!lobbyData.revealReady?.[myUid] && (
                                        <button className={styles.weiterBtn} onClick={handleRevealReady}>
                                            Weiter →
                                        </button>
                                    )}
                                    {lobbyData.revealReady?.[myUid] && (
                                        <p className={styles.revealWaiting}>Warte auf die anderen…</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Scorecard */}
                        <div className={styles.scoreBar}>
                            {playerList.map(([uid, p], rank) => {
                                const char = getCharacterById(p.character)
                                return (
                                    <div key={uid} className={`${styles.scoreRow} ${uid === myUid ? styles.scoreMe : ''}`}>
                                        <span className={styles.scoreRank}>#{rank + 1}</span>
                                        <span className={styles.scoreEmoji}>{char?.emoji || '❓'}</span>
                                        <span className={styles.scoreName}>{p.name}</span>
                                        <span className={styles.scoreValue}>{p.score || 0}</span>
                                    </div>
                                )
                            })}
                        </div>

                        {!isReveal && myUpgradesLocal.includes('omniscient') && timeRemaining <= 15 && (
                            <div className={styles.omniscientHint}>🔮 Allwissend aktiv: Eine falsche Antwort ist markiert</div>
                        )}
                        {!isReveal && hasAnswered && (
                            <div className={styles.answeredIndicator}>✓ Antwort abgeschickt – warte auf andere...</div>
                        )}
                    </div>
                </div>
            )
        }

        // TIEBREAKER
        if (status === 'tiebreaker') {
            const tb = lobbyData.tiebreaker
            const guesses = lobbyData.tiebreakerGuesses || {}
            const maxScore = Math.max(...Object.values(players).map(p => p.score || 0))
            const tiedPlayers = playerList.filter(([_, p]) => (p.score || 0) === maxScore)
            return (
                <div className={styles.screen}>
                    <div className={styles.bg} />
                    <div className={styles.container}>
                        <div className={styles.tieCard}>
                            <div className={styles.tieIcon}>⚖️</div>
                            <h2 className={styles.tieTitle}>Gleichstand! Stechen!</h2>
                            <p className={styles.tieSub}>Gleichstand: {tiedPlayers.map(([_, p]) => p.name).join(', ')}</p>
                            <div className={styles.tieQuestion}>{tb?.question}</div>
                            <p className={styles.tieHint}>Schätze so genau wie möglich. Wer am nächsten ist, gewinnt!</p>
                            {!tieGuessSubmitted ? (
                                <div className={styles.tieInput}>
                                    <input type="number" className={styles.input} placeholder="Deine Schätzung..."
                                        value={tiebreakerGuess} onChange={e => setTiebreakerGuess(e.target.value)} />
                                    <button className={styles.btnPrimary} onClick={handleSubmitTiebreakerGuess}
                                        disabled={!tiebreakerGuess.trim()}>Schätzen</button>
                                </div>
                            ) : (
                                <div className={styles.waitingBox}>
                                    <div className={styles.waitingIcon}>⏳</div>
                                    <p>Warte auf andere...</p>
                                    <div className={styles.waitingPlayers}>
                                        {tiedPlayers.map(([uid, p]) => (
                                            <span key={uid} className={`${styles.waitBadge} ${guesses[uid] !== undefined ? styles.waitDone : styles.waitPending}`}>
                                                {p.name} {guesses[uid] !== undefined ? '✓' : '...'}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )
        }

        // WINNER
        if (status === 'winner') {
            const maxScore = Math.max(...Object.values(players).map(p => p.score || 0))
            const winnerUid = lobbyData.tiebreakerWinner || Object.keys(players).find(uid => (players[uid].score || 0) === maxScore)
            const winner = players[winnerUid]
            const winnerChar = getCharacterById(winner?.character)
            return (
                <div className={styles.screen}>
                    <div className={styles.bg} />
                    <Confetti />
                    <div className={styles.winnerContainer}>
                        <div className={styles.winnerCard}>
                            <div className={styles.winnerCrown}>🏆</div>
                            <div className={styles.winnerEmoji}>{winnerChar?.emoji || '🎉'}</div>
                            <h1 className={styles.winnerName}>{winner?.name}</h1>
                            <p className={styles.winnerSub}>{winnerChar ? `${winnerChar.name} – ${winnerChar.title}` : ''}</p>
                            <div className={styles.winnerScore}>{winner?.score || 0} Punkte</div>
                            <div className={styles.finalScoreboard}>
                                <h3 className={styles.subTitle}>Endstand</h3>
                                {playerList.map(([uid, p], rank) => {
                                    const char = getCharacterById(p.character)
                                    return (
                                        <div key={uid} className={`${styles.finalRow} ${uid === winnerUid ? styles.finalWinner : ''}`}>
                                            <span className={styles.finalRank}>{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}</span>
                                            <span>{char?.emoji} {p.name}</span>
                                            <span className={styles.finalScore}>{p.score || 0} Pkt.</span>
                                        </div>
                                    )
                                })}
                            </div>
                            {isHost && <button className={styles.btnPrimary} onClick={handleRestartGame}>🔄 Nochmal spielen</button>}
                            <button className={styles.btnSecondary} onClick={handleBack}>Beenden</button>
                        </div>
                    </div>
                </div>
            )
        }
    }

    return (
        <div className={styles.screen}>
            <div className={styles.bg} />
            <div className={styles.container}>
                <p style={{ color: '#fff', textAlign: 'center' }}>Verbinde...</p>
            </div>
        </div>
    )
}

export default QuizGame
