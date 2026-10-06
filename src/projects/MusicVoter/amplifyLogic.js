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
/** Plätze wie im Sport: gleiche Stimmen = gleicher Platz, danach geht es mit der echten Position weiter (1, 1, 1, 4) */
export const placeOf = (sorted, i) => 1 + sorted.findIndex(x => scoreOf(x) === scoreOf(sorted[i]))
const ORDINAL = { 1: 'erste', 2: 'zweite', 3: 'dritte' }
const signed = (n) => `${n > 0 ? '+' : ''}${n}`
/** Hinweise zur Auswertung: geteilte Plätze (Reihenfolge ausgelost) und Los an der Grenze */
export const resultNotes = (res) => {
    const notes = []
    const counts = {}
    ;(res?.top || []).forEach(t => { if (t.place) counts[t.place] = (counts[t.place] || 0) + 1 })
    Object.entries(counts).filter(([, c]) => c > 1).forEach(([p, c]) => notes.push(`${c} ${ORDINAL[p] || `${p}.`} Plätze – die Reihenfolge wurde ausgelost`))
    const l = res?.lottery
    if (l) notes.push(`${l.won} von ${l.tied} Songs mit ${signed(l.score)} ${l.won === 1 ? 'ist' : 'sind'} per Los weitergekommen`)
    return notes
}

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

/**
 * Wann startet die nächste Abstimmung automatisch? (null = gerade nicht absehbar)
 * Wenn nur noch die eingestellte Zeit Musik übrig ist – spätestens aber, sobald der letzte Song beginnt.
 */
export const nextVotingInMs = (data, now) => {
    if (!data || data.lobbyPhase === 'abstimmung' || data.pendingBatch) return null
    const rem = queueRemainingMs(data, now)
    if (rem == null) return null
    const queued = queueOrder(data)
    const last = queued[queued.length - 1]
    const np = liveNowPlaying(data, now)
    const lastDur = last ? (last.spotifyId === np?.trackId && np?.durationMs) || last.duration || FALLBACK_DURATION : 0
    return Math.max(0, rem - Math.max((data.preQueueVotingMinutes || 1) * 60000, lastDur))
}

// ── Streak: Runden in Folge mit einem eigenen Song auf Platz 1 (Gleichstand zählt) – nur Belohnung, keine Strafe ──
// Stufe = Platz-1-Runden in Folge, ab Stufe 3 gibt es nicht mehr (sonst übernimmt eine Person die Party)
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
    // Meiste Stimmen (Saldo) zuerst; bei Gleichstand entscheidet der Zufall – auch darüber, wer an der Grenze reinkommt.
    // Einmal hier gewürfelt und als queuePos gespeichert, damit alle Geräte und Spotify dieselbe Reihenfolge haben.
    const shuffled = pool.filter(i => i.source === 'spotify' && i.spotifyId && i.type === 'song')
    for (let k = shuffled.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]
    }
    const playable = shuffled.sort((a, b) => scoreOf(b) - scoreOf(a))   // stabil: Zufall bleibt innerhalb gleicher Stimmen
    const selected = voted ? playable.slice(0, batchSize) : playable
    const selectedIds = selected.map(i => i.spotifyId)
    // Reihenfolge ausgelost? (ein anderer Gewinner hat gleich viele Stimmen)
    const drawn = new Set(selected.filter(i => selected.some(o => o !== i && scoreOf(o) === scoreOf(i))).map(i => i.spotifyId))
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
        playlist: current.filter(i => !notChosen.includes(i)).map(i => (selectedIds.includes(i.spotifyId) ? { ...i, queuedRound: round, queuePos: selectedIds.indexOf(i.spotifyId), queueDrawn: drawn.has(i.spotifyId) } : i)),
        leftovers,
        // "laeuft" nur, bis die Gewinner bei Spotify sind – danach (oder ohne Gewinner) wieder Songs einreichen
        lobbyPhase: batchIds.length ? 'laeuft' : 'songwahl',
        phaseEndsAt: null,
        phaseStartedAt: batchIds.length ? null : now,
        votingRound: round,
        pendingBatch: batchIds.length ? { round, spotifyIds: batchIds } : null,
        queueStartedAt: null,
        queueTotalDurationMs: null
    }
    if (voted) {
        // Platz-1-Hit: ein eigener Song auf Platz 1 (auch geteilt) mit mehr Daumen hoch als runter.
        // Wer Songs in der Runde hatte, aber keinen Hit, verliert die Streak; wer nichts eingereicht hat, behält sie.
        const topScore = playable.length ? scoreOf(playable[0]) : 0
        const hitters = new Set(topScore > 0 ? playable.filter(i => scoreOf(i) === topScore).map(i => i.addedBy).filter(Boolean) : [])
        const streaks = { ...(data.streaks || {}) }
        new Set(pool.map(i => i.addedBy).filter(Boolean)).forEach(owner => {
            const prev = streaks[owner] || { current: 0, best: 0 }
            const current = hitters.has(owner) ? (prev.current || 0) + 1 : 0
            streaks[owner] = { current, best: Math.max(prev.best || 0, current) }
        })
        update.streaks = streaks
    }
    if (voted && selected.length) {
        // Podest: alle Gewinner auf Platz 1–3 (bei Gleichstand auch mehr als drei)
        const top = selected.map((i, k) => ({ i, place: placeOf(playable, k) })).filter(x => x.place <= 3)
        // Gleichstand an der Grenze: nur ein Teil der gleichauf liegenden Songs kam per Los weiter
        let lottery = null
        if (playable.length > selected.length && scoreOf(playable[selected.length - 1]) === scoreOf(playable[selected.length])) {
            const score = scoreOf(playable[selected.length])
            lottery = { score, place: placeOf(playable, selected.length), tied: playable.filter(i => scoreOf(i) === score).length, won: selected.filter(i => scoreOf(i) === score).length }
        }
        update.lastResult = {
            round, at: now, total: playable.length, lottery,
            top: top.map(({ i, place }) => ({ ...voteCounts(i), place, score: scoreOf(i), title: i.title || '', artist: i.artist || '', imageUrl: i.imageUrl || null, addedBy: i.addedBy || '', spotifyId: i.spotifyId }))
        }
    }
    return update
}
