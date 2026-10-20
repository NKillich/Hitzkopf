// Prüft die Logik der KI-Fragen (functions/testifyCore.js) ohne Server und ohne API-Schlüssel:
//   node scripts/testify-ki-test.mjs
import { createRequire } from 'module'
import assert from 'assert/strict'
const require = createRequire(import.meta.url)
const core = require('../functions/testifyCore.js')

// Themen
const themes = core.resolveThemes(['reisen', 'liebe', 'quatsch'], ['  Herr   der Ringe ', 'herr der ringe', '<b>x</b>', 'Harry Potter', 'a', 'b', 'c', 'd', 'e'])
assert.deepEqual(themes.map(t => t.key), ['reisen', 'liebe', 'c-herr-der-ringe', 'c-b-x-b', 'c-harry-potter'])
assert.equal(themes[2].label, 'Herr der Ringe')
assert.equal(core.resolveThemes([], []).some(t => t.key === 'liebe'), false, 'ohne Auswahl: alle außer Paar & Liebe')

// Spielplan: Mischung wie im Spiel, Themen reihum
const plan = core.makePlan(15, themes)
assert.equal(plan.length, 15)
const types = plan.reduce((m, p) => ((m[p.type] = (m[p.type] || 0) + 1), m), {})
assert.deepEqual(types, core.typeCounts(15))
for (const t of themes) assert.ok(plan.filter(p => p.theme.key === t.key).length === 3, 'jedes Thema 3×')

// Pool: passender Typ + Thema, gespielte nicht, keine Doppelung
const pool = [
    { id: 'p1', cat: plan[0].theme.key, type: plan[0].type, own: 'A', up: 5, down: 0 },
    { id: 'p2', cat: plan[0].theme.key, type: plan[0].type, own: 'B', up: 0, down: 3 },
    { id: 'p3', cat: plan[0].theme.key, type: plan[0].type, own: 'C' },
]
const hits = core.fillFromPool(plan, pool, ['p1'])
assert.ok(hits[0] && hits[0].id !== 'p1', 'gespielte Frage wird übersprungen')
assert.equal(new Set(hits.filter(Boolean).map(h => h.id)).size, hits.filter(Boolean).length)

// Prüfung einzelner Vorschläge
const slot = (type, label = 'Herr der Ringe') => ({ slot: 1, type, theme: { key: 'c-x', label, custom: true } })
const base = { other: '', options: [], items: [], labels: [], quality: 4 }
const ok = (raw, s) => core.toQuestion({ ...base, ...raw }, s)
assert.ok(ok({ type: 'pick4', own: 'Was hättest du mit dem Ring gemacht?', other: 'Was hätte {n} mit dem Ring gemacht?', options: ['Werfen', 'Behalten', 'Verkaufen', 'Gandalf geben'] }, slot('pick4')))
assert.equal(ok({ type: 'pick4', own: 'Was hättest du gemacht?', other: 'Was hätte er gemacht?', options: ['a', 'b', 'c', 'd'] }, slot('pick4')), null, 'other ohne {n}')
assert.equal(ok({ type: 'pick4', own: 'Was hättest du gemacht?', other: 'Was hätte {n} gemacht?', options: ['a', 'a', 'c', 'd'] }, slot('pick4')), null, 'doppelte Antworten')
assert.equal(ok({ type: 'pick4', own: 'Was hätte man gemacht?', other: 'Was hätte {n} gemacht?', options: ['a', 'b', 'c', 'd'] }, slot('pick4')), null, 'own ohne du')
assert.ok(ok({ type: 'emoji4', own: 'Welches Volk passt zu dir?', other: 'Welches Volk passt zu {n}?', items: [{ label: 'Hobbits', icon: '🧑‍🌾' }, { label: 'Elben', icon: '🧝' }, { label: 'Zwerge', icon: '⛏️' }, { label: 'Menschen', icon: '🛡️' }] }, slot('emoji4')))
assert.equal(ok({ type: 'emoji4', own: 'Welches Volk passt zu dir?', other: 'Welches Volk passt zu {n}?', items: [{ label: 'Hobbits', icon: 'H' }, { label: 'Elben', icon: '🧝' }, { label: 'Zwerge', icon: '⛏️' }, { label: 'Menschen', icon: '🛡️' }] }, slot('emoji4')), null, 'kein Emoji')
assert.ok(ok({ type: 'who', own: 'Wer würde eher den Ring tragen – du oder {n}?' }, slot('who')))
assert.equal(ok({ type: 'who', own: 'Wer würde eher den Ring tragen?' }, slot('who')), null, 'who ohne {n}')
assert.ok(ok({ type: 'scale', own: 'Wie mutig wärst du in Mordor?', other: 'Wie mutig wäre {n} in Mordor?', labels: ['Gar nicht', 'Etwas', 'Mittel', 'Sehr', 'Frodo-Level'] }, slot('scale')))
assert.ok(ok({ type: 'yesno', own: 'Hast du schon mal alle Filme an einem Tag geschaut?', other: 'Hat {n} schon mal alle Filme an einem Tag geschaut?' }, slot('yesno')))
assert.equal(ok({ type: 'pair', own: 'Was ist dir lieber?', other: 'Was ist {n} lieber?', items: [{ label: 'A', icon: '🅰️' }] }, slot('pair')), null, 'pair braucht 2')

// Bester Vorschlag je Platz, Dubletten raus
const slots = [slot('who'), { ...slot('yesno'), slot: 2 }]
const output = {
    questions: [
        { ...base, slot: 1, type: 'who', own: 'Wer würde eher den Ring tragen – du oder {n}?', quality: 3 },
        { ...base, slot: 1, type: 'who', own: 'Wer wäre der bessere Gefährte – du oder {n}?', quality: 5 },
        { ...base, slot: 2, type: 'yesno', own: 'Hast du schon mal die Bücher gelesen?', other: 'Hat {n} schon mal die Bücher gelesen?', quality: 4 },
        { ...base, slot: 9, type: 'yesno', own: 'Fremder Platz?', other: '{n}?', quality: 5 },
    ],
    customThemes: [{ input: 'Herr der Ringe', label: 'Herr der Ringe', shareable: true }, { input: 'Lisas Ex', label: 'Lisas Ex', shareable: false }],
}
const best = core.pickBest(output, slots, ['Hast du schon mal die Bücher gelesen?'])
assert.equal(best.get(1).own, 'Wer wäre der bessere Gefährte – du oder {n}?', 'höchste quality')
assert.equal(best.has(2), false, 'schon vorhandene Frage fliegt raus')
const share = core.shareableKeys(output, [{ key: 'c-herr-der-ringe', label: 'Herr der Ringe' }, { key: 'c-lisas-ex', label: 'Lisas Ex' }])
assert.deepEqual([...share], ['c-herr-der-ringe'])

// Nachricht an die KI ist reines JSON
const msg = JSON.parse(core.buildUserMessage(plan.slice(0, 2), themes.filter(t => t.custom), ['x']))
assert.equal(msg.plaetze.length, 2)
assert.ok(core.SYSTEM_PROMPT.length > 1000)

console.log('Alle KI-Logik-Tests bestanden.')
