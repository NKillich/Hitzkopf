// Test-Lobbys für Amplify 2.0 direkt in Firestore anlegen, ändern und wieder löschen (anonymer Login).
// Die Lobby hat kein hostUid, damit jeder Skript-Lauf sie wieder löschen darf. Aufruf:
//   node scripts/amplify2-test.mjs create CODE [big]   → Lobby mit 5 (big: 14) Songs, Host „HostTest“
//   node scripts/amplify2-test.mjs round CODE          → Platz 1 an „Spotify“ übergeben (simuliert)
//   node scripts/amplify2-test.mjs vote CODE t5 Anna 1 → Stimme setzen (1, -1 oder 0)
//   node scripts/amplify2-test.mjs playing CODE t2     → Song läuft seit 60 s
//   node scripts/amplify2-test.mjs sethost CODE Name   → Host ändern (z. B. eigener Name im Browser)
//   node scripts/amplify2-test.mjs close CODE | delete CODE
// Im Browser als „Tester“ beitreten: Song t5 gehört „Tester“.
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
const firebaseConfig = {
    apiKey: 'AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA', authDomain: 'hitzkopf-f0ea6.firebaseapp.com',
    projectId: 'hitzkopf-f0ea6', appId: '1:828164655874:web:1cab759bdb03bfb736101b'
}
import { finishRound } from '../src/projects/Amplify2/amplifyLogic.js'

const [cmd, code] = process.argv.slice(2)
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
await signInAnonymously(auth)
const db = getFirestore(app)
const ref = doc(db, 'amplify2Lobbies', code)

const song = (n, title, artist, by, votes, img) => ({
    id: `spotify_track_t${n}`, spotifyId: `t${n}`, title, artist, type: 'song', source: 'spotify', addedBy: by,
    votes, addedAt: Date.now() - (20 - n * 3) * 60000, duration: 200000, imageUrl: img || null
})

if (cmd === 'create') {
    await setDoc(ref, {
        host: 'HostTest', createdAt: Date.now(), lastActiveAt: Date.now(),
        players: { HostTest: { emoji: '🎧', uid: auth.currentUser.uid }, Anna: { emoji: '🦊', uid: 'x1' }, Ben: { emoji: '🐸', uid: 'x2' } },
        playlist: [
            song(1, 'Africa', 'TOTO', 'Anna', { Ben: 1 }),
            song(2, 'Mr. Brightside', 'The Killers', 'Ben', { Anna: 1, HostTest: 1 }),
            song(3, 'Dancing Queen', 'ABBA', 'HostTest', {}),
            song(4, 'Hey Ya!', 'OutKast', 'Anna', { Ben: -1, HostTest: -1 }),
            song(5, 'Rosanna', 'TOTO', 'Tester', {}),
            ...(process.argv[4] === 'big' ? [
                song(6, 'Aja', 'Steely Dan', 'Ben', { Anna: 1, HostTest: 1, Tester: 1 }),
                song(7, 'Do It Again', 'Steely Dan', 'Ben', { Anna: 1, HostTest: 1 }),
                song(8, 'Josie', 'Steely Dan', 'Anna', { HostTest: 1 }),
                song(9, 'In the End', 'Linkin Park', 'HostTest', {}),
                song(10, 'Numb', 'Linkin Park', 'Anna', {}),
                song(11, 'September', 'Earth, Wind & Fire', 'Ben', {}),
                song(12, 'Take On Me', 'a-ha', 'HostTest', { Ben: -1 }),
                { ...song(13, 'Blinding Lights', 'The Weeknd', 'Anna', { Ben: -1 }), addedAt: Date.now() - 60000 },
                { ...song(14, 'Levitating', 'Dua Lipa', 'Ben', { Anna: -1 }), addedAt: Date.now() - 120000 }
            ] : [])
        ],
        history: [], status: 'active', batchSize: 3, maxSongsPerPerson: 3, upvotesPerPerson: 3, downvotesPerPerson: 1,
        roundRule: null, streakEnabled: true, streaks: {}, votingRound: 0, pendingBatch: null, lastResult: null
    })
    console.log('angelegt', code)
} else if (cmd === 'round') {
    const data = (await getDoc(ref)).data()
    const update = finishRound(data, Date.now())
    // Übergabe an Spotify simulieren (kein Host-Gerät im Test)
    await updateDoc(ref, { ...update, pendingBatch: null, lastActiveAt: Date.now() })
    console.log('Runde', update.votingRound, update.lastResult.top.map(t => `${t.place}. ${t.title} (${t.addedBy})`).join(' | '))
} else if (cmd === 'vote') {
    // node scripts/amplify2-test.mjs vote CODE t5 Anna 1
    const [, , id, voter, val] = process.argv.slice(2)
    const data = (await getDoc(ref)).data()
    await updateDoc(ref, { playlist: data.playlist.map(i => (i.spotifyId === id ? { ...i, votes: { ...i.votes, [voter]: Number(val) } } : i)), lastActiveAt: Date.now() })
    console.log('Stimme', id, voter, val)
} else if (cmd === 'playing') {
    // node scripts/amplify2-test.mjs playing CODE t2  → Song läuft seit 60 s
    const id = process.argv[4]
    const it = (await getDoc(ref)).data().playlist.find(i => i.spotifyId === id)
    await updateDoc(ref, { nowPlaying: { trackId: id, trackName: it.title, artist: it.artist, imageUrl: null, positionMs: 60000, durationMs: 200000, isPlaying: true, updatedAt: Date.now() } })
    console.log('läuft', it.title)
} else if (cmd === 'sethost') {
    await updateDoc(ref, { host: process.argv[4] })
    console.log('Host', process.argv[4])
} else if (cmd === 'close') {
    await updateDoc(ref, { status: 'closed', lastActiveAt: Date.now() })
    console.log('geschlossen', code)
} else if (cmd === 'delete') {
    await deleteDoc(ref)
    console.log('gelöscht', code)
}
process.exit(0)
