// Identify-Listen in Firestore: identifyLists/<id> (Songs) + identifyIndex/main (Übersicht für die Auswahl).
// Lesen darf jeder (auch ohne Login), schreiben nur das Studio-Konto (siehe firestore.rules).
import { doc, getDoc, runTransaction } from 'firebase/firestore'

const indexRef = (db) => doc(db, 'identifyIndex', 'main')
const listRef = (db, id) => doc(db, 'identifyLists', id)

export const MAX_SONGS = 2000      // ein Firestore-Dokument darf höchstens 1 MB groß sein

/** Übersicht aller Listen: [{ id, name, count, cover, category?, badge? }] (ältere Einträge evtl. mit emoji) */
export async function fetchIndex(db) {
    const snap = await getDoc(indexRef(db))
    return snap.exists() ? (snap.data().lists || []) : []
}

/** Eine Liste mit Songs – oder null */
export async function fetchList(db, id) {
    const snap = await getDoc(listRef(db, id))
    return snap.exists() ? snap.data() : null
}

/** Eintrag der Übersicht zu einer Liste */
export const indexEntry = (list) => ({
    id: list.id,
    name: list.name,
    ...(list.emoji ? { emoji: list.emoji } : {}),
    ...(list.category ? { category: list.category } : {}),
    ...(list.badge ? { badge: list.badge } : {}),
    count: (list.songs || []).length,
    cover: list.songs?.[0]?.cover || null
})

/** Liste speichern und Übersicht in einem Schritt aktualisieren (Transaktion) */
export async function saveList(db, list) {
    const clean = {
        id: list.id,
        name: String(list.name || '').trim().slice(0, 60) || 'Ohne Namen',
        ...(list.emoji ? { emoji: String(list.emoji).slice(0, 8) } : {}),
        ...(String(list.category || '').trim() ? { category: String(list.category).trim().slice(0, 30) } : {}),
        ...(String(list.badge || '').trim() ? { badge: String(list.badge).trim().slice(0, 16) } : {}),
        songs: (list.songs || []).slice(0, MAX_SONGS),
        missing: (list.missing || []).slice(0, 500),
        spotifyIds: (list.spotifyIds || []).slice(0, 5000),
        updatedAt: Date.now()
    }
    await runTransaction(db, async (tx) => {
        const idx = await tx.get(indexRef(db))
        const lists = idx.exists() ? (idx.data().lists || []) : []
        const at = lists.findIndex(l => l.id === clean.id)
        const entry = indexEntry(clean)
        if (at >= 0) lists[at] = entry; else lists.push(entry)
        tx.set(listRef(db, clean.id), clean)
        tx.set(indexRef(db), { lists })
    })
    return clean
}

/** Liste löschen (inkl. Eintrag in der Übersicht) */
export async function deleteList(db, id) {
    await runTransaction(db, async (tx) => {
        const idx = await tx.get(indexRef(db))
        const lists = (idx.exists() ? (idx.data().lists || []) : []).filter(l => l.id !== id)
        tx.delete(listRef(db, id))
        tx.set(indexRef(db), { lists })
    })
}

/** Neue ID aus dem Namen: „80er Party!“ → „80er-party“ (eindeutig gegenüber `taken`) */
export function slugFor(name, taken = []) {
    const base = String(name || 'liste').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'liste'
    let id = base
    for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`
    return id
}
