// Spotify-Song → passende Apple-Hörprobe finden. Genutzt vom Identify Studio (Browser) und von
// scripts/identify-list.mjs (Node) – beide haben fetch. Apple erlaubt ca. 20 Suchen pro Minute.
import { cleanTitle, normTitle, normName } from './songGuess.js'

export const APPLE_PAUSE_MS = 3200
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** Apple-Suche; bei Bremse (403/429) eine Minute warten und erneut versuchen */
export async function appleSearch(params, { onWait } = {}) {
    for (let i = 0; i < 5; i++) {
        const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ country: 'DE', entity: 'song', limit: '25', ...params })}`)
        if (r.status === 403 || r.status === 429) { onWait?.(60); await sleep(60000); continue }
        if (!r.ok) return []
        return (await r.json()).results || []
    }
    return []
}

// Karaoke, Cover, Demos usw. nur nehmen, wenn es nichts anderes gibt
const BAD = /karaoke|tribute|made famous|originally performed|cover version|instrumental|8-bit|lullaby|re-?recorded|demo/i

/** Beste Apple-Version für einen Spotify-Song { title, artists[], ms } – oder null */
export function pickAppleMatch(sp, results) {
    const wantTitle = normTitle(sp.title)
    const wantArtists = sp.artists.map(normName)
    let best = null
    for (const a of results) {
        if (a.kind !== 'song' || !a.previewUrl) continue
        const titleOk = normTitle(a.trackName) === wantTitle
        const an = normName(a.artistName)
        const artistOk = wantArtists.some(w => an === w || an.includes(w) || w.includes(an))
        if (!titleOk || !artistOk) continue
        let score = 100
        if (BAD.test(`${a.collectionName} ${a.trackName} ${a.artistName}`)) score -= 60
        if (/live|remaster|version|mix|edit|acoustic/i.test(a.trackName)) score -= 10
        if (sp.ms && a.trackTimeMillis) score -= Math.min(30, Math.abs(sp.ms - a.trackTimeMillis) / 1000)
        if (/compilation|hits|best of|greatest|bravo|charts/i.test(a.collectionName)) score -= 5
        if (!best || score > best.score) best = { a, score }
    }
    return best
}

/** Apple-Treffer → Song-Eintrag einer Identify-Liste (nur Apple-Daten; Jahr = frühestes bekanntes) */
export function toListSong(a, spYear = null) {
    const years = [parseInt(a.releaseDate, 10), spYear].filter(Boolean)
    return {
        id: a.trackId,
        title: a.trackName,
        artist: a.artistName,
        artistId: a.artistId,
        year: years.length ? Math.min(...years) : null,
        cover: (a.artworkUrl100 || '').replace('100x100bb', '300x300bb') || null,
        preview: a.previewUrl
    }
}

/**
 * Sucht einen Spotify-Song { title, artists[], year, ms } bei Apple: erst „Interpret Titel“, dann nur der Titel.
 * Gibt { song, score, a } oder null zurück. Hält Apples Tempo-Grenze selbst ein.
 */
export async function matchToApple(sp, { onWait } = {}) {
    let hit = pickAppleMatch(sp, await appleSearch({ term: `${sp.artists[0]} ${cleanTitle(sp.title)}` }, { onWait }))
    await sleep(APPLE_PAUSE_MS)
    if (!hit) {
        hit = pickAppleMatch(sp, await appleSearch({ term: cleanTitle(sp.title) }, { onWait }))
        await sleep(APPLE_PAUSE_MS)
    }
    return hit ? { song: toListSong(hit.a, sp.year), score: hit.score, a: hit.a } : null
}

/** Spotify-Song-IDs aus eingefügtem Text (Links oder reine IDs, eine pro Zeile oder gemischt) */
export const spotifyIdsFromText = (text) => [...new Set(String(text || '')
    .split(/[\s,]+/)
    .map(l => (l.match(/track[/:]([A-Za-z0-9]{22})/) || l.trim().match(/^([A-Za-z0-9]{22})$/) || [])[1])
    .filter(Boolean))]

/** Einen Spotify-Song mit App-Token abfragen → { title, artists[], year, ms } oder { error } */
export async function spotifyTrack(id, token) {
    for (let i = 0; i < 4; i++) {
        const r = await fetch(`https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 5) * 1000); continue }
        if (!r.ok) return { error: r.status }
        const t = await r.json()
        return { title: t.name, artists: (t.artists || []).map(a => a.name), year: parseInt(t.album?.release_date, 10) || null, ms: t.duration_ms }
    }
    return { error: 429 }
}
