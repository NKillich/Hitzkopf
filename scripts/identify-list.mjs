// Identify-Gastmodus: aus Spotify-Song-Links eine Liste mit Apple-Hörproben bauen (als Datei).
// Hinweis: Normalerweise pflegt man Listen im Identify Studio (#studio). Das Skript bleibt für große Mengen am PC.
// Spotify wird nur hier (einmalig, mit dem App-Token der Funktion „spotifyToken“) nach Titel/Interpret/Länge gefragt;
// gespeichert werden nur Apple-Daten (ID, Titel, Interpret, Jahr, Cover, Hörprobe). Aufruf:
//   node scripts/identify-list.mjs <id> "<Name>" <emoji> <links.txt>
// links.txt: Spotify-Song-IDs oder Links (open.spotify.com/track/…).
// Ergebnis: public/identify/lists/<id>.json + Eintrag in public/identify/lists/index.json,
// Bericht über nicht gefundene/unsichere Songs: scripts/identify-lists/<id>.report.txt
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { matchToApple, spotifyIdsFromText, spotifyTrack } from '../src/projects/SecondSound/appleMatch.js'

const firebaseConfig = {
    apiKey: 'AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA', authDomain: 'hitzkopf-f0ea6.firebaseapp.com',
    projectId: 'hitzkopf-f0ea6', appId: '1:828164655874:web:1cab759bdb03bfb736101b'
}
const [id, name, emoji, file] = process.argv.slice(2)
if (!id || !name || !file) { console.error('Aufruf: node scripts/identify-list.mjs <id> "<Name>" <emoji> <links.txt>'); process.exit(1) }

const OUT_DIR = 'public/identify/lists'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const ids = spotifyIdsFromText(readFileSync(file, 'utf8'))
console.log(`${ids.length} Spotify-Songs in ${file}`)

const app = initializeApp(firebaseConfig)
await signInAnonymously(getAuth(app))
const { data: tok } = await httpsCallable(getFunctions(app), 'spotifyToken')()

const songs = []
const report = []
for (let i = 0; i < ids.length; i++) {
    const sp = await spotifyTrack(ids[i], tok.access_token)
    await sleep(120)
    if (sp.error) { report.push(`Spotify-Fehler ${sp.error}: ${ids[i]}`); continue }
    const label = `${sp.artists[0]} – ${sp.title}`
    const hit = await matchToApple(sp, { onWait: () => console.log('  Apple bremst – 60 s Pause') })
    if (!hit) { report.push(`nicht gefunden: ${label}`); console.log(`${i + 1}/${ids.length} ✗ ${label}`); continue }
    if (hit.score < 75) report.push(`unsicher (${Math.round(hit.score)}): ${label} → ${hit.a.artistName} – ${hit.a.trackName} [${hit.a.collectionName}]`)
    songs.push(hit.song)
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
