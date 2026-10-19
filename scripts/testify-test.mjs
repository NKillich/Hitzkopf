// Testify testen ohne zweites Handy: ein Skript-Spieler („Bot“) spielt über Firestore mit.
// Aufruf (Sammlung per TF_COL, Standard testifyLobbies; vor dem Veröffentlichen der Regeln im Dev-Modus z. B. TF_COL=lobbies):
//   node scripts/testify-test.mjs bot CODE [Name] [modus]   → tritt einem Spiel aus dem Browser bei und spielt automatisch
//   node scripts/testify-test.mjs host [Name] [modus]       → legt ein Spiel an (Code steht in der Ausgabe), Browser tritt bei
//   node scripts/testify-test.mjs delete CODE               → Test-Lobby löschen (nur, was das Skript selbst angelegt hat, oder TF_COL=lobbies)
// modus: right (tippt immer richtig), wrong (immer falsch), mix (Zufall, Standard). Beenden mit Strg+C.
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import { answerUpdate, nextUpdate, startGame, optionCount } from '../src/projects/Testify/testifyLogic.js'

const firebaseConfig = {
    apiKey: 'AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA', authDomain: 'hitzkopf-f0ea6.firebaseapp.com',
    projectId: 'hitzkopf-f0ea6', appId: '1:828164655874:web:1cab759bdb03bfb736101b'
}
const COL = process.env.TF_COL || 'testifyLobbies'
const [cmd, ...args] = process.argv.slice(2)
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
await signInAnonymously(auth)
const db = getFirestore(app)
const me = auth.currentUser.uid
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const mutate = (ref, change) => runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return { missing: true }
    const res = change(snap.data()) || {}
    if (res.update) tx.update(ref, { ...res.update, lastActiveAt: Date.now() })
    return res
})

function play(ref, mode, isHost) {
    const busy = new Set()
    const later = (key, ms, fn) => {
        if (busy.has(key)) return
        busy.add(key)
        setTimeout(() => fn().catch(e => log('Fehler', e.message)), ms)
    }
    onSnapshot(ref, (snap) => {
        if (!snap.exists()) { log('Lobby gelöscht – Ende'); process.exit(0) }
        const d = snap.data()
        if (d.status === 'closed') {
            log('Spiel verlassen von', d.closedByName)
            ;(isHost ? deleteDoc(ref).then(() => log('Lobby gelöscht')) : Promise.resolve()).catch(() => {}).finally(() => process.exit(0))
            return
        }
        const players = Object.keys(d.players || {})
        const other = players.find(u => u !== me)
        if (d.phase === 'lobby' && isHost && players.length === 2) later('start', 1500, () => mutate(ref, (x) => ({ update: startGame(x, x.set, x.rounds) })))
        if (d.phase === 'play') {
            const q = d.questions[d.idx]
            const mine = d.round?.answers?.[me] || {}
            const theirs = d.round?.answers?.[other] || {}
            const key = `${d.gameNo}-${d.idx}`
            const n = optionCount(q)
            if (mine.own == null) {
                later(`own-${key}`, 2500, () => mutate(ref, (x) => {
                    const r = answerUpdate(x, me, x.idx, { own: Math.floor(Math.random() * n) })
                    if (r.done) r.update['round.doneAt'] = serverTimestamp()
                    return r
                }).then(() => log(`Frage ${d.idx + 1}: eigene Antwort`)))
            } else if (mine.guess == null && (mode === 'mix' || theirs.own != null)) {
                later(`guess-${key}`, 2500, () => mutate(ref, (x) => {
                    const own = x.round.answers?.[other]?.own
                    let g = Math.floor(Math.random() * n)
                    if (mode === 'right' && own != null) g = own
                    if (mode === 'wrong' && own != null) g = q.type === 'scale' ? (own + 2) % 5 : (own + 1) % n
                    const r = answerUpdate(x, me, x.idx, { guess: g })
                    if (r.done) r.update['round.doneAt'] = serverTimestamp()
                    return r
                }).then(() => log(`Frage ${d.idx + 1}: Tipp`)))
            } else if (d.round?.doneAt && !d.round?.next?.[me]) {
                later(`next-${key}`, 9000, () => mutate(ref, (x) => nextUpdate(x, me, x.idx)).then(() => log(`Frage ${d.idx + 1}: Weiter`)))
            }
        }
        if (d.phase === 'result' && !isHost && !d.again?.[me]) later(`again-${d.gameNo}`, 4000, () => updateDoc(ref, { [`again.${me}`]: true }).then(() => log('Nochmal spielen')))
        if (d.phase === 'result' && isHost) log('Ergebnis da – Bot (Host) wartet')
        if (d.phase === 'setup' && !isHost && !d.again?.[me]) later(`again2-${d.gameNo}`, 2000, () => updateDoc(ref, { [`again.${me}`]: true }))
    })
}

if (cmd === 'bot') {
    const [code, name = 'Lisa', mode = 'mix'] = args
    const ref = doc(db, COL, code)
    const res = await mutate(ref, (d) => (d.players?.[me] ? {} : { update: { [`players.${me}`]: { name, emoji: '🐼', joinedAt: Date.now() } } }))
    if (res.missing) { console.log('Gibt es nicht:', code); process.exit(1) }
    log('beigetreten als', name, 'in', COL, code, 'Modus', mode)
    play(ref, mode, false)
} else if (cmd === 'host') {
    const [name = 'Lisa', mode = 'mix'] = args
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
    const ref = doc(db, COL, code)
    await setDoc(ref, {
        hostUid: me, createdAt: Date.now(), lastActiveAt: Date.now(), status: 'open', set: 'freunde', rounds: 10, phase: 'lobby',
        gameNo: 0, used: [], questions: [], idx: 0, log: [], round: { answers: {}, doneAt: null, next: {} }, again: {},
        players: { [me]: { name, emoji: '🐼', joinedAt: Date.now() } },
    })
    log('angelegt', COL, code, '– im Browser beitreten')
    play(ref, mode, true)
} else if (cmd === 'delete') {
    await deleteDoc(doc(db, COL, args[0]))
    log('gelöscht', COL, args[0])
    process.exit(0)
} else {
    console.log('Befehle: bot CODE [Name] [modus] | host [Name] [modus] | delete CODE')
    process.exit(1)
}
