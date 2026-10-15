// Gemeinsame Spiel-Logik für Amplify (App und Live-Board) – reine Funktionen ohne React/Firebase

export const UNLIMITED = -1
export const DEFAULT_UP = 3
export const DEFAULT_DOWN = 1            // ein Daumen runter: Interaktion ohne gezieltes Abschießen
export const FALLBACK_DURATION = 210000  // falls Spotify keine Länge geliefert hat

// Eine lange Playlist: jederzeit vorschlagen und voten. Kurz vor Ende des laufenden Songs geht Platz 1 an Spotify.
export const DEFAULT_MAX_SONGS = 3
export const LOCK_BEFORE_END_MS = 5000   // so knapp vor Songende wird Platz 1 festgelegt (Spotify braucht etwas Vorlauf)

export const scoreOf = (item) => Object.values(item?.votes || {}).reduce((s, v) => s + v, 0)
export const voteCounts = (item) => {
    const vals = Object.values(item?.votes || {})
    return { up: vals.filter(v => v === 1).length, down: vals.filter(v => v === -1).length }
}
export const byScore = (a, b) => (scoreOf(b) - scoreOf(a)) || ((a.addedAt || 0) - (b.addedAt || 0))
/** Plätze wie im Sport: gleiche Stimmen = gleicher Platz, danach geht es mit der echten Position weiter (1, 1, 1, 4) */
export const placeOf = (sorted, i) => 1 + sorted.findIndex(x => scoreOf(x) === scoreOf(sorted[i]))
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

// ── Zeiten ───────────────────────────────────────────────────────────────────
export const nowPosition = (np, now) => (np
    ? (np.isPlaying ? Math.min((np.positionMs || 0) + (now - (np.updatedAt || now)), np.durationMs || 0) : (np.positionMs || 0))
    : 0)

/** Reihenfolge der Warteschlange (so, wie sie an Spotify ging): Runde für Runde, innerhalb der Runde der feste Platz */
const byQueue = (a, b) => ((a.queuedRound || 0) - (b.queuedRound || 0))
    || ((a.queuePos ?? Infinity) - (b.queuePos ?? Infinity))
    || byScore(a, b)
export const queueOrder = (data) => (data?.playlist || []).filter(i => i.queuedRound != null).sort(byQueue)

/**
 * Was läuft gerade? Den Stand meldet nur das Host-Gerät – ist es im Hintergrund, kommt kein Songwechsel an.
 * Ist der gemeldete Song rechnerisch zu Ende, wird entlang der Warteschlange weitergerechnet (nur Anzeige,
 * die nächste echte Meldung des Hosts gilt sofort wieder). Songs, die noch nicht an Spotify gingen, zählen nicht.
 */
export const liveNowPlaying = (data, now) => {
    const np = data?.nowPlaying || null
    if (!np?.isPlaying || !np.durationMs) return np
    let over = (np.positionMs || 0) + (now - (np.updatedAt || now)) - np.durationMs
    if (over < 0) return np
    const pending = new Set(data.pendingBatch?.spotifyIds || [])
    const order = queueOrder(data).filter(i => !pending.has(i.spotifyId))
    const idx = order.findIndex(i => i.spotifyId === np.trackId)
    if (idx < 0) return np
    const rest = order.slice(idx + 1)
    if (!rest.length) return np
    const predicted = (it, pos, dur) => ({ trackId: it.spotifyId, trackName: it.title || '', artist: it.artist || '', imageUrl: it.imageUrl || null, positionMs: pos, durationMs: dur, isPlaying: true, updatedAt: now, predicted: true })
    for (const it of rest) {
        const dur = it.duration || FALLBACK_DURATION
        if (over < dur) return predicted(it, over, dur)
        over -= dur
    }
    const last = rest[rest.length - 1]   // Warteschlange rechnerisch zu Ende: letzter Song steht am Ende
    return predicted(last, last.duration || FALLBACK_DURATION, last.duration || FALLBACK_DURATION)
}

/** Songs der Warteschlange nach dem laufenden (davor = schon gelaufen, auch wenn der Host es noch nicht gemeldet hat) */
export const upcomingQueue = (data, now) => {
    const order = queueOrder(data)
    const np = liveNowPlaying(data, now)
    const idx = np ? order.findIndex(i => i.spotifyId === np.trackId) : -1
    return order.slice(idx + 1)
}

/** Restliche Musik der Warteschlange: Rest des laufenden Songs + Länge der noch wartenden Songs (null = keine Warteschlange) */
export const queueRemainingMs = (data, now) => {
    const order = queueOrder(data)
    if (!order.length) return null
    const np = liveNowPlaying(data, now)
    const idx = np ? order.findIndex(i => i.spotifyId === np.trackId) : -1
    let ms = idx >= 0 ? Math.max(0, (np.durationMs || order[idx].duration || FALLBACK_DURATION) - nowPosition(np, now)) : 0
    for (const q of order.slice(idx + 1)) ms += q.duration || FALLBACK_DURATION
    return ms
}

/** Läuft gerade der letzte Song der Warteschlange? */
export const isLastSong = (data, now = Date.now()) => {
    const np = liveNowPlaying(data, now)
    const order = queueOrder(data)
    return !!np && order.length > 0 && order[order.length - 1].spotifyId === np.trackId
}

/** Songs, die noch im Rennen sind (nicht an Spotify übergeben) */
export const poolOf = (data) => (data?.playlist || []).filter(i => i.queuedRound == null)
/** Pausiert: Song im Rennen, der nicht zum laufenden Runden-Modus passt (kein Voting, läuft nicht, Stimmen zählen nicht) */
export const isPaused = (data, item) => item?.queuedRound == null && !!ruleProblem(data?.roundRule, item)
/** Songs im Rennen, die zum Modus passen – nur die zählen für Platz 1 und fürs Stimmen-Budget */
export const activePoolOf = (data) => poolOf(data).filter(i => !isPaused(data, i))
/** Vergebene Stimmen einer Person (1 = hoch, -1 = runter); Stimmen auf pausierten Songs sind gutgeschrieben */
export const usedVotes = (data, name, value, exceptId = null) =>
    activePoolOf(data).filter(i => i.id !== exceptId && i.votes?.[name] === value).length
const playable = (i) => i.source === 'spotify' && !!i.spotifyId && i.type === 'song'
/** Live-Rangliste: meiste Stimmen (Saldo) zuerst, bei Gleichstand der früher eingereichte Song */
export const rankedPool = (data) => poolOf(data).sort(byScore)
/** Wie lange läuft der aktuelle Song noch – so lange kann Platz 1 noch wechseln (null = nichts läuft) */
export const nextSongInMs = (data, now) => {
    if (!data || data.pendingBatch || !activePoolOf(data).some(playable) || upcomingQueue(data, now).length) return null
    const np = liveNowPlaying(data, now)
    if (!np?.isPlaying || !np.durationMs) return null
    return Math.max(0, np.durationMs - nowPosition(np, now))
}
/** Ein verdienter Nummer-1-Hit: Platz 1 mit mindestens einer Stimme hoch (sonst kam der Song „einfach so“ dran) */
export const isEarnedHit = (item) => voteCounts(item).up >= 1

// ── Streak: verdiente Nummer-1-Hits (eigener Song lief mit mindestens einer Stimme hoch) – nur Belohnung ──
// Vorerst ohne Abbau (kommt mit „On Fire“); ab Stufe 3 gibt es nicht mehr (sonst übernimmt eine Person die Party)
export const STREAK_LEVELS = [
    null,
    { songs: 1, up: 0, label: '+1 Song' },
    { songs: 1, up: 1, label: '+1 Song & +1 Daumen' },
    { songs: 2, up: 1, label: '+2 Songs & +1 Daumen' }
]
export const STREAK_MAX = STREAK_LEVELS.length - 1
export const streakOf = (data, name) => data?.streaks?.[name]?.current || 0
export const streakLevel = (n) => STREAK_LEVELS[Math.min(n, STREAK_MAX)] || null
/** Bonus für eine Person (0, wenn Streak aus oder noch kein Platz-1-Hit) */
export const streakBonus = (data, name) => {
    const n = streakOf(data, name)
    const lvl = data?.streakEnabled ? streakLevel(n) : null
    if (!lvl) return { songs: 0, up: 0, active: false, streak: 0, label: null, next: null }
    return { songs: lvl.songs, up: lvl.up, active: true, streak: n, label: lvl.label, next: n < STREAK_MAX ? STREAK_LEVELS[n + 1].label : null }
}
/** Eigenes Song-Limit und Daumen-Budget inkl. Streak-Bonus */
export const limitsFor = (data, name, defaults) => {
    const b = streakBonus(data, name)
    const up = data?.upvotesPerPerson ?? defaults.up
    return {
        maxSongs: (data?.maxSongsPerPerson || defaults.maxSongs || DEFAULT_MAX_SONGS) + b.songs,
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
/** Laufende Runde (0 = noch keine an Spotify übergeben) */
export const currentRoundNo = (data) => data?.votingRound || 0

export const ruleEmoji = (rule) => ({ artist: '🎤', decade: '📼', keyword: '🔤' }[rule?.type] || '')

/** Genre-Filter der Suche: deutscher Name → Last.fm-Tag (Hitlisten; Spotifys eigene Genres sind zu unsauber) */
export const SEARCH_GENRES = [
    { key: 'rock', label: 'Rock', tag: 'rock' },
    { key: 'pop', label: 'Pop', tag: 'pop' },
    { key: 'hiphop', label: 'Hip-Hop', tag: 'hip-hop' },
    { key: 'deutschrap', label: 'Deutschrap', tag: 'deutschrap' },
    { key: 'schlager', label: 'Schlager', tag: 'schlager' },
    { key: 'dance', label: 'Dance', tag: 'dance' },
    { key: 'elektro', label: 'Elektro', tag: 'electronic' },
    { key: 'metal', label: 'Metal', tag: 'metal' },
    { key: 'indie', label: 'Indie', tag: 'indie' },
    { key: 'punk', label: 'Punk', tag: 'punk' },
    { key: 'rnb', label: 'R&B', tag: 'rnb' },
    { key: 'soul', label: 'Soul & Funk', tag: 'soul' },
    { key: 'reggae', label: 'Reggae', tag: 'reggae' },
    { key: 'country', label: 'Country', tag: 'country' },
    { key: 'jazz', label: 'Jazz', tag: 'jazz' }
]

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

// ── Nächster Song ────────────────────────────────────────────────────────────
/**
 * Platz 1 der Live-Rangliste kommt in die Warteschlange; alle anderen bleiben mit ihren Stimmen im Rennen.
 * Liefert die Felder fürs Firestore-Update (null = kein Song im Voting).
 */
export const finishRound = (data, now) => {
    const round = (data.votingRound || 0) + 1
    const current = data.playlist || []
    const ranked = activePoolOf(data).filter(playable).sort(byScore)
    const next = ranked[0]
    if (!next) return null
    // Noch nicht gesendete Songs (z. B. kein Spotify-Gerät) nicht verlieren
    const pendingIds = data.pendingBatch?.spotifyIds || []
    const update = {
        playlist: current.map(i => (i.id === next.id ? { ...i, queuedRound: round, queuePos: 0 } : i)),
        votingRound: round,
        pendingBatch: { round, spotifyIds: [...pendingIds.filter(id => id !== next.spotifyId), next.spotifyId] }
    }
    const earned = isEarnedHit(next)
    if (earned && next.addedBy) {
        const prev = data.streaks?.[next.addedBy] || { current: 0, best: 0 }
        const cur = (prev.current || 0) + 1
        update.streaks = { ...(data.streaks || {}), [next.addedBy]: { current: cur, best: Math.max(prev.best || 0, cur) } }
    }
    update.lastResult = {
        round, at: now, earned,
        top: [{ ...voteCounts(next), place: 1, score: scoreOf(next), title: next.title || '', artist: next.artist || '', imageUrl: next.imageUrl || null, addedBy: next.addedBy || '', spotifyId: next.spotifyId }]
    }
    return update
}

// ── Rennen: NEU-Markierung und Ladenhüter ────────────────────────────────────
export const NEW_MS = 10 * 60000   // so lange gilt ein Song als neu (✨ NEU)
export const isNew = (item, now) => item?.queuedRound == null && now - (item?.addedAt || 0) < NEW_MS

// Ladenhüter: Songs, die zu weit im Minus stehen oder zu lange nicht hochkommen, fliegen raus (Platz wird frei).
// dropBelow = ab diesem Minus raus (0 = aus), dropAfterMin = nach so vielen Minuten im Rennen raus (0 = aus)
export const DEFAULT_DROP_BELOW = 3
export const DEFAULT_DROP_AFTER = 0
export const dropReason = (data, item, now) => {
    if (item.queuedRound != null || isPaused(data, item)) return null   // pausierte Songs bleiben unangetastet
    const below = data?.dropBelow ?? DEFAULT_DROP_BELOW
    const after = data?.dropAfterMin ?? DEFAULT_DROP_AFTER
    if (below > 0 && scoreOf(item) <= -below) return 'score'
    if (after > 0 && now - (item.addedAt || now) >= after * 60000) return 'time'
    return null
}
export const staleItems = (data, now) => poolOf(data).filter(i => dropReason(data, i, now))
/** Felder fürs Firestore-Update: Ladenhüter raus, kurz vermerkt (für den Hinweis an die Person) */
export const dropUpdate = (data, now, items) => {
    if (!items.length) return null
    const ids = new Set(items.map(i => i.id))
    const entries = items.map(i => ({ id: i.id, title: i.title || '', addedBy: i.addedBy || '', reason: dropReason(data, i, now) || 'score', score: scoreOf(i), at: now }))
    return {
        playlist: (data.playlist || []).filter(i => !ids.has(i.id)),
        dropped: [...(data.dropped || []), ...entries].slice(-20)
    }
}
