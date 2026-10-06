// Gemeinsame Spiel-Logik für Amplify (App und Live-Board) – reine Funktionen ohne React/Firebase

export const UNLIMITED = -1
export const DEFAULT_UP = 3
export const DEFAULT_DOWN = 1            // ein Daumen runter: Interaktion ohne gezieltes Abschießen
export const FALLBACK_DURATION = 210000  // falls Spotify keine Länge geliefert hat

// Drei Vorgaben statt vieler Regler (Feinheiten unter "Erweitert")
// Ziel: alle ~20 Min. eine Abstimmung, und mehr eingereichte Songs als Plätze (sonst ist Abstimmen sinnlos)
export const PRESETS = [
    { id: 'schnell', label: 'Schnell', sub: '4 Songs pro Runde (≈ 15 Min.) · 60 s abstimmen · 2 pro Person', values: { batchSize: 4, votingDurationSec: 60, maxSongsPerPerson: 2, preQueueVotingMinutes: 2 } },
    { id: 'normal', label: 'Normal', sub: '6 Songs pro Runde (≈ 20 Min.) · 90 s abstimmen · 3 pro Person', values: { batchSize: 6, votingDurationSec: 90, maxSongsPerPerson: 3, preQueueVotingMinutes: 3 } },
    { id: 'lang', label: 'Lange Party', sub: '10 Songs pro Runde (≈ 35 Min.) · 2 Min. abstimmen · 4 pro Person', values: { batchSize: 10, votingDurationSec: 120, maxSongsPerPerson: 4, preQueueVotingMinutes: 4 } }
]
export const DEFAULT_PRESET = PRESETS[1]
export const activePresetId = (data) => {
    const p = PRESETS.find(pr => Object.entries(pr.values).every(([k, v]) => (data?.[k] ?? DEFAULT_PRESET.values[k]) === v))
    return p ? p.id : 'custom'
}

export const scoreOf = (item) => Object.values(item?.votes || {}).reduce((s, v) => s + v, 0)
export const voteCounts = (item) => {
    const vals = Object.values(item?.votes || {})
    return { up: vals.filter(v => v === 1).length, down: vals.filter(v => v === -1).length }
}
export const byScore = (a, b) => (scoreOf(b) - scoreOf(a)) || ((a.addedAt || 0) - (b.addedAt || 0))

// Namen vergleichen ohne Groß-/Kleinschreibung ("DizzyCapybara" = "dizzycapybara")
export const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim()
export const nameKey = (s) => cleanName(s).toLocaleLowerCase('de')

// Fast gleiche Songs erkennen: "One More Time" = "One More Time - Radio Edit" = "One More Time (Remastered 2011)"
const VERSION_WORDS = /\b(remaster(ed)?|radio|edit|version|mix|remix|live|mono|stereo|deluxe|bonus|single|extended|original|acoustic|demo|instrumental|feat\.?|ft\.?|featuring|from|soundtrack|anniversary|\d{4})\b/i
export const normalizeTitle = (t) => {
    let s = String(t || '').toLowerCase()
    s = s.replace(/[([][^)\]]*[)\]]/g, (m) => (VERSION_WORDS.test(m) ? ' ' : m))   // (Remastered 2011), [Radio Edit]
    s = s.replace(/\s[-–—]\s.*$/, (m) => (VERSION_WORDS.test(m) ? ' ' : m))       // " - Radio Edit"
    s = s.replace(/\b(feat\.?|ft\.?|featuring)\b.*$/, ' ')
    return s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
const artistKey = (a) => String(a || '').split(',')[0].trim().toLowerCase()
export const sameSong = (a, b) => (!!a.spotifyId && a.spotifyId === b.spotifyId) || a.id === b.id
export const similarSong = (a, b) => sameSong(a, b)
    || (!!normalizeTitle(a.title) && normalizeTitle(a.title) === normalizeTitle(b.title) && artistKey(a.artist) === artistKey(b.artist))

// Stabile, aber pro Person/Runde gemischte Reihenfolge (kein Vorteil für den zuerst eingereichten Song)
const hash = (str) => {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}
export const seededOrder = (items, seed) => [...items].sort((a, b) => hash(seed + a.id) - hash(seed + b.id))

// ── Zeiten ───────────────────────────────────────────────────────────────────
export const nowPosition = (np, now) => (np
    ? (np.isPlaying ? Math.min((np.positionMs || 0) + (now - (np.updatedAt || now)), np.durationMs || 0) : (np.positionMs || 0))
    : 0)

/** Restliche Musik der Warteschlange: Rest des laufenden Songs + Länge der noch wartenden Songs (null = keine Warteschlange) */
export const queueRemainingMs = (data, now) => {
    const queued = (data?.playlist || []).filter(i => i.queuedRound != null)
    if (!queued.length) return null
    const np = data.nowPlaying
    const current = np ? queued.find(i => i.spotifyId === np.trackId) : null
    let ms = current ? Math.max(0, (np.durationMs || current.duration || FALLBACK_DURATION) - nowPosition(np, now)) : 0
    for (const q of queued) if (q !== current) ms += q.duration || FALLBACK_DURATION
    return ms
}

/** Reihenfolge der Warteschlange (so, wie sie an Spotify ging) */
export const queueOrder = (data) => (data?.playlist || []).filter(i => i.queuedRound != null).sort(byScore)

/** Läuft gerade der letzte Song der Warteschlange? */
export const isLastSong = (data) => {
    const np = data?.nowPlaying
    const queued = queueOrder(data)
    return !!np && queued.length > 0 && queued.every(i => i.spotifyId === np.trackId)
}

/**
 * Wann startet die nächste Abstimmung automatisch? (null = gerade nicht absehbar)
 * Wenn nur noch die eingestellte Zeit Musik übrig ist – spätestens aber, sobald der letzte Song beginnt.
 */
export const nextVotingInMs = (data, now) => {
    if (data?.lobbyPhase !== 'laeuft' || data.pendingBatch) return null
    const rem = queueRemainingMs(data, now)
    if (rem == null) return null
    const queued = queueOrder(data)
    const last = queued[queued.length - 1]
    const lastDur = last ? (last.spotifyId === data.nowPlaying?.trackId && data.nowPlaying?.durationMs) || last.duration || FALLBACK_DURATION : 0
    return Math.max(0, rem - Math.max((data.preQueueVotingMinutes || 1) * 60000, lastDur))
}

// ── Streak: wer mehrere Runden in Folge gut ankommt, bekommt einen kleinen Bonus (nur Belohnung, keine Strafe) ──
export const STREAK_DEFAULT_MIN = 2
export const STREAK_REWARDS = [
    { id: 'song', label: '+1 Song', songs: 1, up: 0 },
    { id: 'vote', label: '+1 Daumen hoch', songs: 0, up: 1 },
    { id: 'both', label: '+1 Song & +1 Daumen', songs: 1, up: 1 }
]
export const streakOf = (data, name) => data?.streaks?.[name]?.current || 0
/** Bonus für eine Person (0, wenn Streak aus oder noch nicht erreicht) */
export const streakBonus = (data, name) => {
    if (!data?.streakEnabled) return { songs: 0, up: 0, active: false }
    if (streakOf(data, name) < (data.streakMin || STREAK_DEFAULT_MIN)) return { songs: 0, up: 0, active: false }
    const r = STREAK_REWARDS.find(x => x.id === (data.streakReward || 'both')) || STREAK_REWARDS[2]
    return { songs: r.songs, up: r.up, active: true }
}
/** Eigenes Song-Limit und Daumen-Budget inkl. Streak-Bonus */
export const limitsFor = (data, name, defaults) => {
    const b = streakBonus(data, name)
    const up = data?.upvotesPerPerson ?? defaults.up
    return {
        maxSongs: (data?.maxSongsPerPerson || defaults.maxSongs) + b.songs,
        up: up === UNLIMITED ? UNLIMITED : up + b.up,
        down: data?.downvotesPerPerson ?? defaults.down,
        bonus: b
    }
}

export const mmss = (ms) => {
    const t = Math.max(0, Math.ceil((ms || 0) / 1000))
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// ── Runden-Modi ──────────────────────────────────────────────────────────────
export const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020]
export const decadeLabel = (from) => (from >= 2000 ? `${from}er` : `${String(from).slice(2)}er`)

export const ruleLabel = (rule) => {
    if (!rule) return null
    if (rule.type === 'artist') return `${rule.artistName}-Runde`
    if (rule.type === 'decade') return `${decadeLabel(rule.from)}-Runde`
    if (rule.type === 'keyword') return `Stichwort-Runde: „${rule.word}“`
    return null
}
export const ruleHint = (rule) => {
    if (!rule) return null
    if (rule.type === 'artist') return `Nur Songs von ${rule.artistName}`
    if (rule.type === 'decade') return `Nur Songs aus den ${decadeLabel(rule.from)}n (${rule.from}–${rule.from + 9})`
    if (rule.type === 'keyword') return `Nur Songs mit „${rule.word}“ im Titel`
    return null
}
export const ruleEmoji = (rule) => ({ artist: '🎤', decade: '📼', keyword: '🔤' }[rule?.type] || '')

/** Suchanfrage passend zum Modus (Spotify-Filter) */
export const ruleSearchQuery = (rule, q) => {
    if (rule?.type === 'artist') return `${q} artist:"${rule.artistName}"`
    if (rule?.type === 'decade') return `${q} year:${rule.from}-${rule.from + 9}`
    return q
}

/** Passt der Song zum Modus? null = ja, sonst Begründung */
export const ruleProblem = (rule, item) => {
    if (!rule || item?.type === 'album') return null
    if (rule.type === 'artist') {
        const ok = (item.artistIds || []).includes(rule.artistId)
            || String(item.artist || '').toLowerCase().split(',').map(s => s.trim()).includes(rule.artistName.toLowerCase())
        return ok ? null : `Passt nicht: nur Songs von ${rule.artistName}`
    }
    if (rule.type === 'decade') {
        const y = Number(item.releaseYear)
        if (!y) return null   // ohne Jahr nicht prüfbar – lieber durchlassen
        return y >= rule.from && y <= rule.from + 9 ? null : `Passt nicht: erschienen ${y}`
    }
    if (rule.type === 'keyword') {
        return normalizeTitle(item.title).includes(normalizeTitle(rule.word)) ? null : `Passt nicht: „${rule.word}“ fehlt im Titel`
    }
    return null
}

// ── Runde auswerten ──────────────────────────────────────────────────────────
/**
 * Beendet eine Runde: Gewinner (oder alle, wenn es nicht mehr Songs als Plätze gibt) kommen in die
 * Warteschlange, der Rest wandert in die "Zweite Chance". Liefert die Felder fürs Firestore-Update.
 */
export const finishRound = (data, now, { voted }) => {
    const batchSize = data.batchSize || 10
    const round = voted ? (data.votingRound || 0) : (data.votingRound || 0) + 1
    const current = data.playlist || []
    const pool = current.filter(i => i.queuedRound == null)
    const playable = pool.filter(i => i.source === 'spotify' && i.spotifyId && i.type === 'song').sort(byScore)
    const selected = voted ? playable.slice(0, batchSize) : playable
    const selectedIds = selected.map(i => i.spotifyId)
    const notChosen = pool.filter(i => !selectedIds.includes(i.spotifyId))
    const leftovers = {}
    notChosen.forEach(i => {
        const owner = i.addedBy || '?'
        if (!leftovers[owner]) leftovers[owner] = []
        leftovers[owner].push({ ...i, votes: {} })
    })
    // Noch nicht gesendete Gewinner einer früheren Runde (z. B. kein Spotify-Gerät) nicht verlieren
    const pendingIds = data.pendingBatch?.spotifyIds || []
    const batchIds = [...pendingIds, ...selectedIds.filter(id => !pendingIds.includes(id))]
    const update = {
        playlist: current.filter(i => !notChosen.includes(i)).map(i => (selectedIds.includes(i.spotifyId) ? { ...i, queuedRound: round } : i)),
        leftovers,
        // Ohne Gewinner gibt es nichts abzuspielen → zurück ins Sammeln
        lobbyPhase: selectedIds.length || data.nowPlaying?.isPlaying ? 'laeuft' : 'songwahl',
        phaseEndsAt: null,
        phaseStartedAt: null,
        votingRound: round,
        pendingBatch: batchIds.length ? { round, spotifyIds: batchIds } : null,
        queueStartedAt: null,
        queueTotalDurationMs: null
    }
    if (voted) {
        const net = {}
        pool.forEach(i => { if (i.addedBy) net[i.addedBy] = (net[i.addedBy] || 0) + scoreOf(i) })
        const streaks = { ...(data.streaks || {}) }
        Object.entries(net).forEach(([owner, n]) => {
            const prev = streaks[owner] || { current: 0, best: 0 }
            const current = n > 0 ? (prev.current || 0) + 1 : 0
            streaks[owner] = { current, best: Math.max(prev.best || 0, current) }
        })
        update.streaks = streaks
    }
    if (voted && selected.length) {
        update.lastResult = {
            round, at: now, total: playable.length,
            top: selected.slice(0, 3).map(i => ({ ...voteCounts(i), score: scoreOf(i), title: i.title || '', artist: i.artist || '', imageUrl: i.imageUrl || null, addedBy: i.addedBy || '', spotifyId: i.spotifyId }))
        }
    }
    return update
}
