// Testify: Spiellogik ohne React (Fragen ziehen, Punkte, Auswertung, Lobby-Änderungen für Transaktionen).
// Antworten sind immer Indizes: Eins aus 4 → 0–3, Dies oder das → 0/1, Skala → 0–4 (angezeigt als 1–5).
import { QUESTIONS, CATEGORIES } from './questions.js'

export const ROUND_OPTIONS = [10, 15, 20]
export const DEFAULT_ROUNDS = 15
export const MAX_PLAYERS = 2

// Ablauf nach dem zweiten „Fertig“ (ab Serverzeit doneAt)
export const BOTH_MS = 1200      // „Beide fertig!“
export const COUNT_MS = 3000     // 3 – 2 – 1
export const GO_MS = 700         // „Los!“
export const REVEAL_AT = BOTH_MS + COUNT_MS + GO_MS
export const SCORE_DELAY = 700   // Spielstand zählt so lange nach der Aufdeckung hoch

export const TYPE_LABEL = { pick4: 'Eins aus 4', pair: 'Dies oder das', scale: 'Skala 1–5' }
export const catLabel = (cat) => CATEGORIES[cat] || cat

export const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim()

// ── Fragen ziehen ───────────────────────────────────────────────────────────
const shuffle = (arr, rnd = Math.random) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

/**
 * n Fragen aus einem Set: Fragetypen gemischt (ca. 45 % Eins aus 4, 30 % Dies oder das, 25 % Skala),
 * gleiche Kategorie nicht zweimal hintereinander (soweit möglich), schon gespielte (used) erst, wenn nichts anderes übrig ist.
 * Antworten von „Eins aus 4“ werden gemischt (beide Handys bekommen dieselbe Reihenfolge aus der Lobby).
 */
export function pickQuestions(setId, n, used = [], rnd = Math.random) {
    const pool = QUESTIONS.filter(q => q.sets.includes(setId))
    const usedSet = new Set(used)
    const fresh = shuffle(pool.filter(q => !usedSet.has(q.id)), rnd)
    const old = shuffle(pool.filter(q => usedSet.has(q.id)), rnd)
    const want = { pick4: Math.round(n * 0.45), pair: Math.round(n * 0.3) }
    want.scale = n - want.pick4 - want.pair
    const chosen = []
    const take = (list, type) => {
        for (const q of list) {
            if (chosen.filter(c => c.type === type).length >= want[type]) return
            if (q.type === type && !chosen.includes(q)) chosen.push(q)
        }
    }
    for (const type of ['pick4', 'pair', 'scale']) { take(fresh, type); take(old, type) }
    // Zu wenig von einem Typ → mit beliebigen anderen auffüllen
    for (const q of [...fresh, ...old]) { if (chosen.length >= n) break; if (!chosen.includes(q)) chosen.push(q) }

    // Reihenfolge: zufällig, aber keine gleiche Kategorie direkt hintereinander, wenn es sich vermeiden lässt
    const rest = shuffle(chosen.slice(0, n), rnd)
    const ordered = []
    while (rest.length) {
        const prev = ordered[ordered.length - 1]
        let i = rest.findIndex(q => !prev || (q.cat !== prev.cat && q.type !== prev.type))
        if (i < 0) i = rest.findIndex(q => !prev || q.cat !== prev.cat)
        if (i < 0) i = 0
        ordered.push(rest.splice(i, 1)[0])
    }
    return ordered.map((src) => {
        const q = { ...src }
        delete q.sets   // gehört nicht in die Lobby
        if (q.type === 'pick4') q.options = shuffle(q.options, rnd)
        return q
    })
}

// ── Punkte ──────────────────────────────────────────────────────────────────
export const optionCount = (q) => (q.type === 'pick4' ? 4 : q.type === 'pair' ? 2 : 5)

/** Punkte für einen Tipp: richtig 1, bei der Skala 1 daneben ½ („knapp“), sonst 0 */
export function points(q, own, guess) {
    if (own == null || guess == null) return 0
    if (own === guess) return 1
    return q.type === 'scale' && Math.abs(own - guess) === 1 ? 0.5 : 0
}
export function verdict(q, own, guess) {
    const p = points(q, own, guess)
    return p === 1 ? 'right' : p > 0 ? 'close' : 'wrong'
}
/** Erwartete Punkte bei reinem Raten (für die Bereinigung um Zufallstreffer) */
export function chance(q, own) {
    if (q.type !== 'scale') return 1 / optionCount(q)
    const neighbours = (own > 0 ? 1 : 0) + (own < 4 ? 1 : 0)
    return (1 + 0.5 * neighbours) / 5
}

/** „kennt zu …“ in Prozent: (Punkte − Zufall) / (möglich − Zufall), nie unter 0 */
export function knowsPercent(entries) {
    if (!entries.length) return 0
    let pts = 0, luck = 0
    for (const e of entries) { pts += points(e.q, e.own, e.guess); luck += chance(e.q, e.own) }
    const max = entries.length
    if (max - luck <= 0) return 0
    return Math.max(0, Math.min(100, Math.round(((pts - luck) / (max - luck)) * 100)))
}

export function titleFor(pct) {
    if (pct >= 80) return 'Seelenverwandt'
    if (pct >= 50) return 'Eingespieltes Team'
    if (pct >= 30) return 'Auf gutem Weg'
    if (pct >= 15) return 'Da geht noch was'
    return 'Noch viel zu entdecken'
}

// ── Lobby lesen ─────────────────────────────────────────────────────────────
/** [ich, der andere] als { uid, name, emoji } (der andere evtl. null) */
export function pairOf(data, myUid) {
    const players = data?.players || {}
    const me = players[myUid] ? { uid: myUid, ...players[myUid] } : null
    const otherUid = Object.keys(players).find(u => u !== myUid)
    const other = otherUid ? { uid: otherUid, ...players[otherUid] } : null
    return [me, other]
}

/** Einträge „wer tippt über wen“: guesser tippt, owner hat geantwortet */
function entriesFor(data, guesser, owner, withCurrent) {
    const qs = data.questions || []
    const rows = (data.log || []).map((r, i) => ({ q: qs[i], a: r.a }))
    if (withCurrent && data.round?.answers) rows.push({ q: qs[data.idx], a: data.round.answers })
    return rows
        .filter(r => r.q && r.a?.[guesser]?.guess != null && r.a?.[owner]?.own != null)
        .map(r => ({ q: r.q, own: r.a[owner].own, guess: r.a[guesser].guess }))
}

/** Spielstand { uid: Punkte } aus den abgeschlossenen Runden (+ laufende, wenn schon aufgedeckt) */
export function scoreOf(data, uid, otherUid, withCurrent = false) {
    if (!otherUid) return 0
    return entriesFor(data, uid, otherUid, withCurrent).reduce((s, e) => s + points(e.q, e.own, e.guess), 0)
}

export const fmtPoints = (p) => String(p).replace('.', ',')

/** Auswertung am Ende */
export function summary(data, aUid, bUid) {
    const aOnB = entriesFor(data, aUid, bUid, false)
    const bOnA = entriesFor(data, bUid, aUid, false)
    const aKnowsB = knowsPercent(aOnB)
    const bKnowsA = knowsPercent(bOnA)
    const together = Math.round((aKnowsB + bKnowsA) / 2)
    const cats = []
    for (const cat of Object.keys(CATEGORIES)) {
        const a = aOnB.filter(e => e.q.cat === cat)
        const b = bOnA.filter(e => e.q.cat === cat)
        if (!a.length && !b.length) continue
        cats.push({ cat, label: CATEGORIES[cat], a: knowsPercent(a), b: knowsPercent(b) })
    }
    // Größte Überraschungen: beide falsch zuerst, dann weit daneben (Skala), höchstens 3
    const qs = data.questions || []
    const surprises = (data.log || []).map((r, i) => {
        const q = qs[i]
        const ra = r.a?.[aUid], rb = r.a?.[bUid]
        if (!q || !ra || !rb) return null
        const missA = 1 - points(q, rb.own, ra.guess), missB = 1 - points(q, ra.own, rb.guess)
        const far = q.type === 'scale' ? Math.max(Math.abs(rb.own - ra.guess), Math.abs(ra.own - rb.guess)) / 4 : 0
        const weight = missA + missB + far
        return weight >= 1 ? { q, aOwn: ra.own, bOwn: rb.own, weight } : null
    }).filter(Boolean).sort((x, y) => y.weight - x.weight).slice(0, 3)
    return { aKnowsB, bKnowsA, together, title: titleFor(together), cats, surprises }
}

/** Text einer Antwort (Index) zur Anzeige */
export function answerText(q, i) {
    if (i == null) return '–'
    if (q.type === 'scale') return `${i + 1} · ${q.labels[i]}`
    if (q.type === 'pair') return q.options[i]?.label ?? '–'
    return q.options[i] ?? '–'
}

// ── Lobby ändern (für mutateLobby: rein, ohne Nebenwirkungen) ──────────────
/** Neues Spiel aus Set und Rundenzahl; used = schon gespielte Fragen-IDs dieser Lobby */
export function startGame(data, setId, rounds, rnd = Math.random) {
    const questions = pickQuestions(setId, rounds, data.used || [], rnd)
    const used = [...new Set([...(data.used || []), ...questions.map(q => q.id)])]
    return {
        set: setId, rounds, phase: 'play', questions, idx: 0, log: [], used,
        round: { answers: {}, doneAt: null, next: {} }, again: {}, gameNo: (data.gameNo || 0) + 1,
    }
}

/**
 * Eigene Antwort / Tipp speichern. patch = { own } oder { guess } oder beides.
 * Liefert { update, done } – done: beide sind jetzt komplett (Aufrufer setzt dann doneAt = Serverzeit).
 */
export function answerUpdate(data, uid, idx, patch) {
    if (data.phase !== 'play' || data.idx !== idx) return {}
    const answers = data.round?.answers || {}
    const mine = { ...(answers[uid] || {}) }
    if (patch.own != null && mine.own == null) mine.own = patch.own       // einmal gesetzt = gesperrt
    if (patch.guess != null && mine.own != null && mine.guess == null) mine.guess = patch.guess
    const all = { ...answers, [uid]: mine }
    const uids = Object.keys(data.players || {})
    const done = uids.length === MAX_PLAYERS && uids.every(u => all[u]?.own != null && all[u]?.guess != null)
    return { update: { [`round.answers.${uid}`]: mine }, done: done && !data.round?.doneAt }
}

/** „Weiter“ nach der Aufdeckung; der zweite Druck schaltet zur nächsten Frage (oder zum Ergebnis) */
export function nextUpdate(data, uid, idx) {
    if (data.phase !== 'play' || data.idx !== idx || !data.round?.doneAt) return {}
    const next = { ...(data.round.next || {}), [uid]: true }
    const uids = Object.keys(data.players || {})
    if (!uids.every(u => next[u])) return { update: { [`round.next.${uid}`]: true } }
    const log = [...(data.log || []), { id: data.questions[idx].id, a: data.round.answers }]
    const last = idx + 1 >= (data.questions || []).length
    return {
        update: {
            log, idx: last ? idx : idx + 1,
            round: { answers: {}, doneAt: null, next: {} },
            phase: last ? 'result' : 'play',
            again: {},
        },
        advanced: true,
    }
}
