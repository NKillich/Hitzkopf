// Identify-Gastmodus: aus Spotify-Song-Links eine Liste mit Apple-Hörproben bauen.
// Spotify wird nur hier (einmalig, mit dem App-Token der Funktion „spotifyToken“) nach Titel/Interpret/Länge gefragt;
// gespeichert werden nur Apple-Daten (ID, Titel, Interpret, Jahr, Cover, Hörprobe). Aufruf:
//   node scripts/identify-list.mjs <id> "<Name>" <emoji> <links.txt>
// links.txt: eine Spotify-Song-ID oder ein Link (open.spotify.com/track/…) pro Zeile.
// Ergebnis: public/identify/lists/<id>.json + Eintrag in public/identify/lists/index.json,
// Bericht über nicht gefundene/unsichere Songs: scripts/identify-lists/<id>.report.txt
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { cleanTitle, normTitle, normName } from '../src/projects/SecondSound/songGuess.js'

const firebaseConfig = {
    apiKey: 'AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA', authDomain: 'hitzkopf-f0ea6.firebaseapp.com',
    projectId: 'hitzkopf-f0ea6', appId: '1:828164655874:web:1cab759bdb03bfb736101b'
}
const [id, name, emoji, file] = process.argv.slice(2)
if (!id || !name || !file) { console.error('Aufruf: node scripts/identify-list.mjs <id> "<Name>" <emoji> <links.txt>'); process.exit(1) }

const OUT_DIR = 'public/identify/lists'
const APPLE_PAUSE_MS = 3200          // Apple erlaubt ca. 20 Suchen pro Minute
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const ids = [...new Set(readFileSync(file, 'utf8').split(/\r?\n/)
    .map(l => (l.match(/track\/([A-Za-z0-9]{22})/) || l.trim().match(/^([A-Za-z0-9]{22})$/) || [])[1])
    .filter(Boolean))]
console.log(`${ids.length} Spotify-Songs in ${file}`)

const app = initializeApp(firebaseConfig)
await signInAnonymously(getAuth(app))
const { data: tok } = await httpsCallable(getFunctions(app), 'spotifyToken')()

async function spotifyTrack(tid) {
    for (let i = 0; i < 4; i++) {
        const r = await fetch(`https://api.spotify.com/v1/tracks/${tid}`, { headers: { Authorization: `Bearer ${tok.access_token}` } })
        if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 5) * 1000); continue }
        if (!r.ok) return { error: r.status }
        const t = await r.json()
        return { title: t.name, artists: (t.artists || []).map(a => a.name), year: parseInt(t.album?.release_date, 10) || null, ms: t.duration_ms }
    }
    return { error: 429 }
}

async function appleSearch(term) {
    for (let i = 0; i < 5; i++) {
        const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: 'song', limit: '25', country: 'DE' })}`)
        if (r.status === 403 || r.status === 429) { console.log('  Apple bremst – 60 s Pause'); await sleep(60000); continue }
        if (!r.ok) return []
        return (await r.json()).results || []
    }
    return []
}

// Beste Apple-Version: gleicher Titel (ohne Zusätze), passender Interpret, ähnliche Länge, keine Karaoke/Cover
const BAD = /karaoke|tribute|made famous|originally performed|cover version|instrumental|8-bit|lullaby|re-?recorded|demo/i
function pick(sp, results) {
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

const songs = []
const report = []
for (let i = 0; i < ids.length; i++) {
    const sp = await spotifyTrack(ids[i])
    await sleep(120)
    if (sp.error) { report.push(`Spotify-Fehler ${sp.error}: ${ids[i]}`); continue }
    const label = `${sp.artists[0]} – ${sp.title}`
    let hit = pick(sp, await appleSearch(`${sp.artists[0]} ${cleanTitle(sp.title)}`))
    await sleep(APPLE_PAUSE_MS)
    if (!hit) {   // zweiter Versuch nur mit dem Titel
        hit = pick(sp, await appleSearch(cleanTitle(sp.title)))
        await sleep(APPLE_PAUSE_MS)
    }
    if (!hit) { report.push(`nicht gefunden: ${label}`); console.log(`${i + 1}/${ids.length} ✗ ${label}`); continue }
    const a = hit.a
    if (hit.score < 75) report.push(`unsicher (${Math.round(hit.score)}): ${label} → ${a.artistName} – ${a.trackName} [${a.collectionName}]`)
    // Frühestes bekanntes Jahr (Best-ofs/Neuauflagen haben spätere Daten)
    const years = [parseInt(a.releaseDate, 10), sp.year].filter(Boolean)
    songs.push({
        id: a.trackId,
        title: a.trackName,
        artist: a.artistName,
        artistId: a.artistId,
        year: years.length ? Math.min(...years) : null,
        cover: (a.artworkUrl100 || '').replace('100x100bb', '300x300bb') || null,
        preview: a.previewUrl
    })
    console.log(`${i + 1}/${ids.length} ✓ ${label}`)
}

// Doppelte Apple-Songs entfernen
const seen = new Set()
const unique = songs.filter(s => !seen.has(s.id) && seen.add(s.id))

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(`${OUT_DIR}/${id}.json`, JSON.stringify({ id, name, emoji: emoji || '🎵', songs: unique }, null, 1) + '\n')
const indexFile = `${OUT_DIR}/index.json`
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : []
const entry = { id, name, emoji: emoji || '🎵', count: unique.length, cover: unique[0]?.cover || null }
const at = index.findIndex(l => l.id === id)
if (at >= 0) index[at] = entry; else index.push(entry)
writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n')
writeFileSync(`scripts/identify-lists/${id}.report.txt`,
    `${unique.length} von ${ids.length} Songs übernommen\n\n${report.join('\n') || 'Alles gefunden.'}\n`)
console.log(`\nFertig: ${unique.length}/${ids.length} → ${OUT_DIR}/${id}.json · Bericht: scripts/identify-lists/${id}.report.txt`)
process.exit(0)
