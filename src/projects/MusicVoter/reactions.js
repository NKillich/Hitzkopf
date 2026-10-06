// Live-Reaktionen: Emojis vom Handy aufs Live-Board (eigene Unterliste der Lobby, nicht im Lobby-Dokument –
// sonst würden Reaktionen Abstimmungen und Songs ausbremsen)
import { collection, addDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore'

export const MAX_PER_PACKET = 30
export const DEFAULT_EMOJIS = ['🔥', '😂', '💀', '❤️', '🙌', '🕺', '🎉', '👎']

const reactionsRef = (db, code) => collection(db, 'musicVoterLobbies', code, 'reactions')

/** Emojis aus einem Text (auch zusammengesetzte wie 👩‍🎤 oder Flaggen) */
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('de', { granularity: 'grapheme' }) : null
export const emojisIn = (text) => (segmenter ? [...segmenter.segment(text)].map(s => s.segment) : Array.from(text))
    .filter(g => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g))

export const sendReactions = (db, code, by, emojis) =>
    addDoc(reactionsRef(db, code), { e: emojis.slice(0, MAX_PER_PACKET), by: String(by || '').slice(0, 40), t: serverTimestamp() })

/** Beim Beenden der Playlist mitlöschen (Unterlisten löscht Firestore nicht von selbst) */
export const deleteReactions = async (db, code) => {
    const snap = await getDocs(reactionsRef(db, code))
    for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db)
        snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
        await batch.commit()
    }
}

export { reactionsRef }
