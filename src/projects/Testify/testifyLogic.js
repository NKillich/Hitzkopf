// Testify: Spiellogik ohne React (Fragen ziehen, Punkte, Auswertung, Lobby-Änderungen für Transaktionen).
// Antworten sind immer Indizes: Eins aus 4 / Bildwahl → 0–3, Dies oder das / Schon mal → 0/1, Skala → 0–4 (angezeigt als 1–5),
// Wer von uns? → 0 = „ich“, 1 = „der andere“ (aus Sicht des Antwortenden; ohne Tipp-Schritt).
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

export const TYPE_LABEL = {
    pick4: 'Eins aus 4', pair: 'Dies oder das', scale: 'Skala 1–5', emoji4: 'Bildwahl', yesno: 'Schon mal …?', who: 'Wer von uns?',
}
// Anteil der Fragetypen pro Spiel (wird auf die Rundenzahl verteilt, größter Rest zuerst)
export const TYPE_MIX = { pick4: 0.3, pair: 0.2, scale: 0.15, emoji4: 0.12, yesno: 0.12, who: 0.11 }
export const YESNO = [{ label: 'Ja', icon: '👍' }, { label: 'Nein', icon: '👎' }]
/** Typen mit zwei Kacheln auf einem Bildschirm (eigene Antwort + Tipp zusammen) */
export const isPairLike = (q) => q.type === 'pair' || q.type === 'yesno'
/** Optionen einer Frage (Schon mal …? hat feste Ja/Nein-Kacheln) */
export const optionsOf = (q) => (q.type === 'yesno' ? YESNO : q.options)
/** Name des Themas einer Frage (KI-Fragen bringen ihn mit, feste Fragen über CATEGORIES) */
export const catLabel = (q) => q?.catLabel || CATEGORIES[q?.cat] || q?.cat || ''

export const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim()

/** Gewählte Themen kurz als Text: „Reisen, Musik + 3“ */
export function themesText(themes = []) {
    const names = themes.map(t => CATEGORIES[t] || t)
    if (names.length <= 2) return names.join(', ') || 'Alle Themen'
    return `${names.slice(0, 2).join(', ')} + ${names.length - 2}`
}

// ── Fragen ziehen ───────────────────────────────────────────────────────────
const shuffle = (arr, rnd = Math.random) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

/** Wie viele Fragen je Typ bei n Runden (Anteile aus TYPE_MIX, Rest nach größtem Nachkommaanteil) */
export function typeCounts(n) {
    const raw = Object.entries(TYPE_MIX).map(([t, share]) => ({ t, v: n * share }))
    const want = Object.fromEntries(raw.map(({ t, v }) => [t, Math.floor(v)]))
    let left = n - Object.values(want).reduce((a, b) => a + b, 0)
    for (const { t } of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1))) { if (left-- <= 0) break; want[t]++ }
    return want
}

/**
 * n feste Fragen zu den gewählten Themen: Fragetypen gemischt (TYPE_MIX), gleiches Thema nicht zweimal hintereinander
 * (soweit möglich). used = schon gespielte Fragen-IDs, älteste zuerst: die kommen erst, wenn nichts Neues übrig ist –
 * dann die am längsten nicht gespielten zuerst; reicht auch das nicht, helfen neue Fragen anderer Themen aus.
 * Antworten von „Eins aus 4“ / „Bildwahl“ werden gemischt (beide Handys lesen sie aus der Lobby).
 */
export function pickQuestions(themes, n, used = [], rnd = Math.random) {
    const wanted = new Set(themes?.length ? themes : Object.keys(CATEGORIES))
    const age = new Map(used.map((id, i) => [id, i]))   // kleiner = länger her
    const inThemes = QUESTIONS.filter(q => wanted.has(q.cat))
    const fresh = shuffle(inThemes.filter(q => !age.has(q.id)), rnd)
    const old = [
        ...shuffle(inThemes.filter(q => age.has(q.id)), rnd).sort((a, b) => age.get(a.id) - age.get(b.id)),
        ...shuffle(QUESTIONS.filter(q => !wanted.has(q.cat) && !age.has(q.id)), rnd),
    ]
    const want = typeCounts(n)
    const chosen = []
    const take = (list, type) => {
        for (const q of list) {
            if (chosen.filter(c => c.type === type).length >= want[type]) return
            if (q.type === type && !chosen.includes(q)) chosen.push(q)
        }
    }
    for (const type of Object.keys(TYPE_MIX)) { take(fresh, type); take(old, type) }
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
        if (q.type === 'pick4' || q.type === 'emoji4') q.options = shuffle(q.options, rnd)
        return q
    })
}

// ── Punkte ──────────────────────────────────────────────────────────────────
export const optionCount = (q) => (q.type === 'pick4' || q.type === 'emoji4' ? 4 : q.type === 'scale' ? 5 : 2)

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
        .filter(r => r.q && r.q.type !== 'who' && r.a?.[guesser]?.guess != null && r.a?.[owner]?.own != null)
        .map(r => ({ q: r.q, own: r.a[owner].own, guess: r.a[guesser].guess }))
}

/** Spielstand { uid: Punkte } aus den abgeschlossenen Runden (+ laufende, wenn schon aufgedeckt) */
export function scoreOf(data, uid, otherUid, withCurrent = false) {
    if (!otherUid) return 0
    return entriesFor(data, uid, otherUid, withCurrent).reduce((s, e) => s + points(e.q, e.own, e.guess), 0)
}

export const fmtPoints = (p) => String(p).replace('.', ',')

/** Wer von uns?: Person, die ein Spieler gewählt hat (0 = er selbst, 1 = der andere) als UID */
export const whoPicked = (own, selfUid, otherUid) => (own == null ? null : own === 0 ? selfUid : otherUid)
/** Wer von uns?: haben beide dieselbe Person gewählt? */
export const whoSame = (answers, aUid, bUid) => {
    const a = whoPicked(answers?.[aUid]?.own, aUid, bUid), b = whoPicked(answers?.[bUid]?.own, bUid, aUid)
    return a != null && a === b
}

/** Auswertung am Ende */
export function summary(data, aUid, bUid) {
    const aOnB = entriesFor(data, aUid, bUid, false)
    const bOnA = entriesFor(data, bUid, aUid, false)
    const aKnowsB = knowsPercent(aOnB)
    const bKnowsA = knowsPercent(bOnA)
    // Wer von uns?: zählt nur für den gemeinsamen Wert (gleich gesehen, bereinigt um 50 % Zufall), gewichtet nach Anzahl
    const qsAll = data.questions || []
    const whoRows = (data.log || []).filter((r, i) => qsAll[i]?.type === 'who')
    const whoSameCount = whoRows.filter(r => whoSame(r.a, aUid, bUid)).length
    const knowTogether = (aKnowsB + bKnowsA) / 2
    let together = knowTogether
    if (whoRows.length) {
        const whoPct = Math.max(0, (whoSameCount / whoRows.length - 0.5) / 0.5) * 100
        const w = whoRows.length / Math.max(1, (data.log || []).length)
        together = aOnB.length || bOnA.length ? knowTogether * (1 - w) + whoPct * w : whoPct
    }
    together = Math.round(together)
    const cats = []
    // Themen in der Reihenfolge von CATEGORIES, eigene (KI-)Themen danach in Spielreihenfolge
    const order = [...Object.keys(CATEGORIES), ...(data.questions || []).map(q => q.cat)]
    for (const cat of [...new Set(order)]) {
        const a = aOnB.filter(e => e.q.cat === cat)
        const b = bOnA.filter(e => e.q.cat === cat)
        if (!a.length && !b.length) continue
        cats.push({ cat, label: catLabel((a[0] || b[0]).q), a: knowsPercent(a), b: knowsPercent(b) })
    }
    // Größte Überraschungen: beide falsch zuerst, dann weit daneben (Skala), höchstens 3
    const qs = data.questions || []
    const surprises = (data.log || []).map((r, i) => {
        const q = qs[i]
        const ra = r.a?.[aUid], rb = r.a?.[bUid]
        if (!q || !ra || !rb || q.type === 'who') return null
        const missA = 1 - points(q, rb.own, ra.guess), missB = 1 - points(q, ra.own, rb.guess)
        const far = q.type === 'scale' ? Math.max(Math.abs(rb.own - ra.guess), Math.abs(ra.own - rb.guess)) / 4 : 0
        const weight = missA + missB + far
        return weight >= 1 ? { q, aOwn: ra.own, bOwn: rb.own, weight } : null
    }).filter(Boolean).sort((x, y) => y.weight - x.weight).slice(0, 3)
    return { aKnowsB, bKnowsA, together, title: titleFor(together), cats, surprises, who: { same: whoSameCount, total: whoRows.length } }
}

/** Text einer Antwort (Index) zur Anzeige */
export function answerText(q, i) {
    if (i == null) return '–'
    if (q.type === 'scale') return `${i + 1} · ${q.labels[i]}`
    if (q.type === 'pick4') return q.options[i] ?? '–'
    return optionsOf(q)?.[i]?.label ?? '–'
}

// ── Lobby ändern (für mutateLobby: rein, ohne Nebenwirkungen) ──────────────
/** Gespielte Fragen beider Handys + dieser Lobby, älteste zuerst (für pickQuestions) */
export function playedOf(data) {
    const order = []
    const add = (id) => { const i = order.indexOf(id); if (i >= 0) order.splice(i, 1); order.push(id) }
    for (const p of Object.values(data.players || {})) for (const id of p.played || []) if (!order.includes(id)) order.push(id)
    for (const id of data.used || []) add(id)   // in dieser Lobby gespielt = am frischesten
    return order
}

/** Neues Spiel aus Themen und Rundenzahl (ohne Fragen, die eines der Handys oder diese Lobby schon hatte) */
export function startGame(data, themes, rounds, rnd = Math.random) {
    const questions = pickQuestions(themes, rounds, playedOf(data), rnd)
    const used = [...new Set([...(data.used || []), ...questions.map(q => q.id)])]
    return {
        themes, rounds, phase: 'play', questions, idx: 0, log: [], used,
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
    const q = data.questions?.[idx]
    const complete = (a) => a?.own != null && (q?.type === 'who' || a?.guess != null)   // Wer von uns? hat keinen Tipp
    const done = uids.length === MAX_PLAYERS && uids.every(u => complete(all[u]))
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
