// Testify: KI-Fragen über die Firebase-Funktion testifyQuestions (Schlüssel und Pool bleiben auf dem Server)
// und 👍/👎 zu Pool-Fragen (testifyPool/{id}/votes/{uid}, gezählt von der Funktion testifyVote).
import { getApp } from 'firebase/app'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { doc, setDoc } from 'firebase/firestore'

/** Fragen für das nächste Spiel der Lobby erstellen lassen (nur Host). Ergebnis schreibt die Funktion in die Lobby. */
export const requestQuestions = (lobbyId) =>
    httpsCallable(getFunctions(getApp()), 'testifyQuestions', { timeout: 130000 })({ lobbyId }).then(r => r.data)

/** Frage aus dem gemeinsamen Pool (bewertbar)? Feste Fragen haben kein catLabel, private KI-Fragen eine p-ID. */
export const isPoolQuestion = (q) => !!(q?.catLabel && q.id && !String(q.id).startsWith('p-'))

// Eigene Stimmen auf diesem Gerät (nur zur Anzeige; gezählt wird auf dem Server)
const VOTES_KEY = 'tf_votes_v1'
export const readVote = (id) => {
    try { return JSON.parse(localStorage.getItem(VOTES_KEY) || '{}')[id] || 0 } catch { return 0 }
}
export async function voteQuestion(db, uid, id, v) {
    await setDoc(doc(db, 'testifyPool', id, 'votes', uid), { v, at: Date.now() })
    try {
        const all = JSON.parse(localStorage.getItem(VOTES_KEY) || '{}')
        all[id] = v
        const keys = Object.keys(all)
        if (keys.length > 500) delete all[keys[0]]
        localStorage.setItem(VOTES_KEY, JSON.stringify(all))
    } catch { /* nur Anzeige */ }
}
