// Spotify-Song → passende Apple-Hörprobe finden. Genutzt vom Identify Studio (Browser) und von
// scripts/identify-list.mjs (Node) – beide haben fetch. Apple erlaubt ca. 20 Anfragen pro Minute.
import { cleanTitle, normTitle, normName } from './songGuess.js'

export const APPLE_PAUSE_MS = 3200
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function appleFetch(url, onWait) {
    for (let i = 0; i < 5; i++) {
        const r = await fetch(url)
        if (r.status === 403 || r.status === 429) { onWait?.(60); await sleep(60000); continue }
        if (!r.ok) return []
        return (await r.json()).results || []
    }
    return []
}

/** Apple-Suche; bei Bremse (403/429) eine Minute warten und erneut versuchen */
export const appleSearch = (params, { onWait } = {}) =>
    appleFetch(`https://itunes.apple.com/search?${new URLSearchParams({ country: 'DE', entity: 'song', limit: '25', ...params })}`, onWait)

/** Alle Songs eines Apple-Albums */
export const appleAlbumTracks = async (collectionId, { onWait } = {}) =>
    (await appleFetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=DE`, onWait)).filter(r => r.wrapperType === 'track')

// Varianten: kommen sie bei Apple vor, aber nicht im Spotify-Titel/-Album, ist es die falsche Version → ausgeschlossen
const VARIANTS = {
    live: /\blive\b|unplugged|mtv /i,
    instrumental: /instrumental/i,
    acappella: /a ?cappella/i,
    acoustic: /acoustic/i,
    remix: /remix|\bmix\)|club mix|radio mix|\brmx\b/i,
    karaoke: /karaoke|originally performed|made famous|in the style of|tribute/i,
    cover: /\bcover\b/i,
    demo: /\bdemo\b/i,
    speed: /sped up|slowed|nightcore|reverb/i,
    orchestral: /orchestral|symphonic|piano version|lullaby|8-bit|music box/i
}
const variantsOf = (text) => new Set(Object.keys(VARIANTS).filter(k => VARIANTS[k].test(text || '')))

// Ausgaben, die nicht das Original-Album sind: kleiner Abzug (Original gewinnt, wenn es da ist)
const REISSUE = /deluxe|anniversary|edition|remaster|expanded|bonus|special|collection|greatest|best of|\bhits\b|singles|essentials|anthology/i
const SINGLE = /\s-\s(single|ep)$/i
const CLEAN = /\bclean\b|edited|amended/i

/**
 * Beste Apple-Version für einen Spotify-Song { title, artists[], album, ms } – oder null.
 * Gleicher Titel (ohne Zusätze) + passender Interpret; Varianten (Live, Instrumental …) nur, wenn Spotify auch eine ist;
 * Original-Album vor Single/Deluxe/Best-of; bei Gleichstand die ältere Veröffentlichung (kleinere Apple-ID).
 */
export function pickAppleMatch(sp, results) {
    const wantTitle = normTitle(sp.title)
    const wantArtists = sp.artists.map(normName)
    const spVariants = variantsOf(`${sp.title} ${sp.album || ''}`)
    let best = null
    for (const a of results) {
        if (a.kind !== 'song' || !a.previewUrl) continue
        if (normTitle(a.trackName) !== wantTitle) continue
        const an = normName(a.artistName)
        if (!wantArtists.some(w => an === w || an.includes(w) || w.includes(an))) continue
        const appleVariants = variantsOf(`${a.trackName} ${a.collectionName}`)
        if ([...appleVariants].some(v => !spVariants.has(v))) continue
        let score = 100
        if (REISSUE.test(a.collectionName) && !REISSUE.test(sp.album || '')) score -= 8
        if (SINGLE.test(a.collectionName) && !SINGLE.test(sp.album || '')) score -= 6
        if (CLEAN.test(`${a.trackName} ${a.collectionName}`) && !CLEAN.test(sp.title)) score -= 12
        if (sp.album && normTitle(a.collectionName) === normTitle(sp.album)) score += 5
        if (sp.ms && a.trackTimeMillis) score -= Math.min(15, Math.abs(sp.ms - a.trackTimeMillis) / 1000)
        const better = !best || score > best.score + 0.01 ||
            (Math.abs(score - best.score) <= 0.01 && a.collectionId < best.a.collectionId)
        if (better) best = { a, score }
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
        album: a.collectionName || null,
        preview: a.previewUrl
    }
}

const GOOD = 90    // ab hier wird nicht weiter gesucht

/**
 * Sucht einen Spotify-Song { title, artists[], album, year, ms } bei Apple:
 * 1. „Interpret Titel“  2. das Spotify-Album bei Apple (Songliste des Albums)  3. nur der Titel.
 * Gibt { song, score, a } oder null zurück. Hält Apples Tempo-Grenze selbst ein.
 * albumCache (Map) spart Anfragen, wenn mehrere Songs vom selben Album kommen.
 */
export async function matchToApple(sp, { onWait, albumCache } = {}) {
    const keep = (hit, next) => (next && (!hit || next.score > hit.score) ? next : hit)
    let hit = pickAppleMatch(sp, await appleSearch({ term: `${sp.artists[0]} ${cleanTitle(sp.title)}` }, { onWait }))
    await sleep(APPLE_PAUSE_MS)

    if ((!hit || hit.score < GOOD) && sp.album) {
        const key = `${normName(sp.artists[0])}|${normTitle(sp.album)}`
        let tracks = albumCache?.get(key)
        if (!tracks) {
            // Album über einen seiner Songs finden (Apples Album-Suche ist lückenhaft)
            const found = await appleSearch({ term: `${sp.artists[0]} ${cleanTitle(sp.album)}`, limit: '50' }, { onWait })
            await sleep(APPLE_PAUSE_MS)
            const ids = [...new Set(found
                .filter(a => normTitle(a.collectionName) === normTitle(sp.album) && sp.artists.map(normName).some(w => normName(a.artistName).includes(w) || w.includes(normName(a.artistName))))
                .map(a => a.collectionId))].slice(0, 2)
            tracks = []
            for (const id of ids) {
                tracks.push(...await appleAlbumTracks(id, { onWait }))
                await sleep(APPLE_PAUSE_MS)
            }
            albumCache?.set(key, tracks)
        }
        hit = keep(hit, pickAppleMatch(sp, tracks))
    }

    if (!hit || hit.score < GOOD) {
        hit = keep(hit, pickAppleMatch(sp, await appleSearch({ term: cleanTitle(sp.title) }, { onWait })))
        await sleep(APPLE_PAUSE_MS)
    }
    return hit ? { song: toListSong(hit.a, sp.year), score: hit.score, a: hit.a } : null
}

/** Spotify-Song-IDs aus eingefügtem Text (Links oder reine IDs, eine pro Zeile oder gemischt) */
export const spotifyIdsFromText = (text) => [...new Set(String(text || '')
    .split(/[\s,]+/)
    .map(l => (l.match(/track[/:]([A-Za-z0-9]{22})/) || l.trim().match(/^([A-Za-z0-9]{22})$/) || [])[1])
    .filter(Boolean))]

/** Einen Spotify-Song mit App-Token abfragen → { title, artists[], album, year, ms } oder { error } */
export async function spotifyTrack(id, token) {
    for (let i = 0; i < 4; i++) {
        const r = await fetch(`https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 5) * 1000); continue }
        if (!r.ok) return { error: r.status }
        const t = await r.json()
        return {
            title: t.name,
            artists: (t.artists || []).map(a => a.name),
            album: t.album?.name || '',
            year: parseInt(t.album?.release_date, 10) || null,
            ms: t.duration_ms
        }
    }
    return { error: 429 }
}

/**
 * Für „Versionen prüfen“: gespeicherten Song als Suchauftrag – ohne Variantenzusätze, damit das Original gesucht wird.
 * Album auf den Kern kürzen: „From Zero: A Cappellas + Instrumentals“ → „From Zero“, „Hybrid Theory (Deluxe)“ → „Hybrid Theory“.
 */
export function songAsQuery(s) {
    let album = String(s.album || '').split(/\s*[:([]\s*|\s+-\s+/)[0].replace(REISSUE, '').trim()
    if (variantsOf(album).size) album = ''
    return { title: cleanTitle(s.title), artists: [s.artist], album, year: s.year || null, ms: null }
}
