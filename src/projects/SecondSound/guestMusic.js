// Identify-Gastmodus: kuratierte Listen (gepflegt im Identify Studio, gespeichert in Firestore; Rückfall auf die
// Dateien in public/identify/lists) und Apples freie Suche für die Vorschläge im Pro-Modus – alles ohne Login.
import { getApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import '../../firebase.js'
import { normTitle, normName } from './songGuess.js'
import { fetchIndex, fetchList } from './listStore.js'

const LIST_BASE = `${import.meta.env.BASE_URL}identify/lists/`

const db = () => getFirestore(getApp())

async function fileIndex() {
    const r = await fetch(`${LIST_BASE}index.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error('Listen konnten nicht geladen werden.')
    return r.json()
}

/** Übersicht der Listen: aus Firestore (Studio), sonst aus den Dateien */
export async function loadGuestIndex() {
    try {
        const lists = await fetchIndex(db())
        if (lists.length) return lists
    } catch (e) { console.warn('[Identify] Listen aus Firestore nicht lesbar, nehme Dateien:', e?.code || e) }
    return fileIndex()
}

export async function loadGuestList(id) {
    try {
        const list = await fetchList(db(), id)
        if (list) return list
    } catch { /* Rückfall auf Datei */ }
    const r = await fetch(`${LIST_BASE}${encodeURIComponent(id)}.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error(`Liste „${id}“ konnte nicht geladen werden.`)
    return r.json()
}

/** Die Listen aus den Dateien (für die einmalige Übernahme ins Studio) */
export async function loadFileLists() {
    const index = await fileIndex()
    return Promise.all(index.map(async (l) => {
        const r = await fetch(`${LIST_BASE}${encodeURIComponent(l.id)}.json`, { cache: 'no-cache' })
        return r.ok ? r.json() : null
    })).then(lists => lists.filter(Boolean))
}

const itunes = async (params) => {
    const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ country: 'DE', ...params })}`)
    if (!r.ok) throw new Error(`Apple-Suche fehlgeschlagen (${r.status})`)
    return (await r.json()).results || []
}

/**
 * Gleiche Form wie spotifyService.searchArtists / searchPage, damit das Tipp-Fenster beide Quellen nutzen kann.
 * searchPage versteht die Spotify-Schreibweise „track:Ro artist:"TOTO"“ und macht daraus eine Apple-Suche.
 */
export const appleSearch = {
    async searchArtists(q, limit = 5) {
        const res = await itunes({ term: q, entity: 'musicArtist', limit: String(limit) })
        return res.map(a => ({ id: a.artistId, name: a.artistName, imageUrl: null }))
    },
    // Apple sucht nach ganzen Wörtern („Cra“ findet nicht „Crawling“) → selbst nach Teilwörtern filtern.
    // Mit Interpret: einmal alle Songs des Interpreten holen (gemerkt) und lokal filtern.
    async searchPage(query) {
        const artist = (query.match(/artist:"([^"]*)"/) || [])[1] || ''
        const title = query.replace(/artist:"[^"]*"/, '').replace(/^track:/, '').trim()
        let res
        if (artist) {
            const key = normName(artist)
            if (!artistSongs.has(key)) artistSongs.set(key, itunes({ term: artist, entity: 'song', attribute: 'artistTerm', limit: '200' }))
            try { res = await artistSongs.get(key) } catch (e) { artistSongs.delete(key); throw e }
        } else {
            res = await itunes({ term: title, entity: 'song', limit: '50' })
        }
        const want = normTitle(title)
        const hits = want ? res.filter(t => normTitle(t.trackName).includes(want)) : res
        // Titel, die mit dem Getippten beginnen, zuerst
        hits.sort((a, b) => Number(normTitle(b.trackName).startsWith(want)) - Number(normTitle(a.trackName).startsWith(want)))
        return { tracks: hits.map(t => ({ title: t.trackName, artistIds: [t.artistId], releaseYear: parseInt(t.releaseDate, 10) || null })) }
    }
}

const artistSongs = new Map()   // Interpret → Songs (eine Anfrage pro Interpret und Sitzung)
