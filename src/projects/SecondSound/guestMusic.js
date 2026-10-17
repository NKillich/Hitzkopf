// Identify-Gastmodus: kuratierte Listen (public/identify/lists, erzeugt mit scripts/identify-list.mjs)
// und Apples freie Suche für die Vorschläge im Pro-Modus – beides ohne Login, direkt aus dem Browser.
import { normTitle, normName } from './songGuess.js'

const LIST_BASE = `${import.meta.env.BASE_URL}identify/lists/`

export async function loadGuestIndex() {
    const r = await fetch(`${LIST_BASE}index.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error('Listen konnten nicht geladen werden.')
    return r.json()
}

export async function loadGuestList(id) {
    const r = await fetch(`${LIST_BASE}${encodeURIComponent(id)}.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error(`Liste „${id}“ konnte nicht geladen werden.`)
    return r.json()
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
