// Darstellung der Identify-Listen in „Musik wählen“ (Gastmodus) und im Studio:
// Kategorie-Reihenfolge, Kachel-Farbe (fest aus dem Namen) und Kachel-Text (Kürzel/Emoji aus dem Studio).

/** Feste Reihenfolge; weitere Kategorien folgen alphabetisch, Listen ohne Kategorie stehen unter „Weitere“ */
export const CATEGORY_ORDER = ['Jahrzehnte', 'Genres', 'Best of', 'Party-Mixe']
export const NO_CATEGORY = 'Weitere'
export const MAX_BADGE = 4

const PALETTE = ['#E4572E', '#E8952F', '#2E86AB', '#7D5BA6', '#2F9A68', '#D7263D', '#1B998B', '#C45BAA', '#5C7AEA', '#D96C4F', '#4F6D7A', '#A9803F']

/** Stabile Farbe aus dem Namen (gleicher Name → gleiche Farbe) */
export function tileColor(name) {
    let h = 0
    for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0
    return PALETTE[h % PALETTE.length]
}

/** Kachel-Text: Kürzel/Emoji aus dem Studio, sonst Anfangsbuchstaben des Namens */
export function tileLabel(list) {
    const b = String(list?.badge || '').trim()
    if (b) return b
    const words = String(list?.name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
    if (!words.length) return '♪'
    return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

/** Kürzel kürzen: höchstens MAX_BADGE Zeichen (ein Emoji zählt als ein Zeichen) */
export function cleanBadge(v) {
    const parts = [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(String(v || '').trim())].map(s => s.segment)
    return parts.slice(0, MAX_BADGE).join('')
}

const catRank = (c) => {
    const i = CATEGORY_ORDER.indexOf(c)
    if (i >= 0) return [0, i]
    return c === NO_CATEGORY ? [2, 0] : [1, 0]
}

/** Listen nach Kategorie gruppieren: [{ category, lists }] in fester Reihenfolge */
export function groupByCategory(lists) {
    const map = new Map()
    for (const l of lists) {
        const c = String(l.category || '').trim() || NO_CATEGORY
        if (!map.has(c)) map.set(c, [])
        map.get(c).push(l)
    }
    return [...map.entries()]
        .sort(([a], [b]) => {
            const [ra, ia] = catRank(a)
            const [rb, ib] = catRank(b)
            return ra - rb || ia - ib || a.localeCompare(b, 'de')
        })
        .map(([category, items]) => ({ category, lists: items }))
}

/** Besteht der Kachel-Text nur aus Emoji? (dann größer darstellen) */
export const isEmojiLabel = (t) => /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f)+$/u.test(String(t || '')) && /\p{Extended_Pictographic}/u.test(String(t || ''))
