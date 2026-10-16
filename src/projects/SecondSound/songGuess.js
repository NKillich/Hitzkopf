// Logik für Tipp-Bonus und Joker in „Song raten“ (ohne React, damit leicht testbar)

export const BONUS_ARTIST = 2
export const BONUS_TITLE = 2

export const JOKERS = [
    { id: 'blur', name: 'Cover verschwommen', desc: 'Zeigt das Albumcover stark verschwommen.', cost: 2 },
    { id: 'letters', name: 'Anfangsbuchstaben', desc: 'Zeigt den Titel als ersten Buchstaben pro Wort, z. B. „M_ B_________“.', cost: 2 },
    { id: 'decade', name: 'Jahrzehnt', desc: 'Zeigt das Jahrzehnt, z. B. „80er“.', cost: 3 }
]

// Kleinbuchstaben, ohne Akzente, nur Buchstaben/Ziffern, einfache Leerzeichen
const basic = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Titel ohne Versions-Zusätze: „Africa - Remastered 2011“, „Song (feat. X)“, „Song [Live]“ → „Africa“, „Song“ */
export const cleanTitle = (title) => String(title || '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+feat\.?\s.*$/i, '')
    .trim() || String(title || '').trim()

export const normTitle = (title) => basic(cleanTitle(title))
export const normName = (name) => basic(name).replace(/^the /, '')

/** „Mr. Brightside“ → „M_ B_________“ (Satzzeichen bleiben, Ziffern auch) */
export const titleHint = (title) => cleanTitle(title)
    .split(/\s+/)
    .map(w => {
        let first = true
        return [...w].map(ch => {
            if (!/\p{L}/u.test(ch)) return ch
            if (first) { first = false; return ch.toUpperCase() }
            return '_'
        }).join('')
    })
    .join(' ')

export const decadeLabel = (year) => {
    const y = Number(year)
    if (!y) return null
    const d = Math.floor(y / 10) * 10
    return d >= 2000 ? `${d}er` : `${String(d).slice(2)}er`
}

/**
 * Song-Metadaten für die Prüfung: Interpreten (IDs + Namen) und das FRÜHESTE Erscheinungsjahr.
 * Spotify kennt nur das Album-Datum – bei Best-ofs/Neuauflagen ist das zu spät, daher zusätzlich suchen.
 */
export async function loadTrackMeta(svc, trackId) {
    const t = await svc.getTrack(trackId)
    const artists = (t?.artists || []).map(a => ({ id: a.id, name: a.name }))
    let year = parseInt(t?.album?.release_date, 10) || null
    try {
        const title = cleanTitle(t?.name)
        const first = artists[0]?.name
        if (title && first) {
            const ids = new Set(artists.map(a => a.id))
            const res = await svc.searchPage(`track:"${title}" artist:"${first}"`, 0, 'track')
            for (const s of res.tracks || []) {
                const same = normTitle(s.title) === normTitle(t.name) && (s.artistIds || []).some(id => ids.has(id))
                if (same && s.releaseYear && (!year || s.releaseYear < year)) year = s.releaseYear
            }
        }
    } catch { /* dann eben das Album-Jahr */ }
    return { id: trackId, name: t?.name || '', artists, year }
}

/**
 * Tipp prüfen. tip = { artist: { id?, name }, title: string, year: string }; leere Felder zählen nicht.
 * Gibt { artist, title, year } mit true/false (getippt) bzw. null (nicht getippt) zurück.
 */
export function checkTip(tip, meta) {
    const res = { artist: null, title: null, year: null }
    const artistName = tip.artist?.name?.trim()
    if (artistName) {
        res.artist = (meta.artists || []).some(a => (tip.artist.id && a.id === tip.artist.id) || normName(a.name) === normName(artistName))
    }
    if (tip.title?.trim()) res.title = normTitle(tip.title) === normTitle(meta.name)
    if (String(tip.year || '').trim()) res.year = Number(tip.year) === Number(meta.year)
    return res
}

export const tipGiven = (r) => !!r && (r.artist !== null || r.title !== null || r.year !== null)
export const tipAnyHit = (r) => !!r && (r.artist === true || r.title === true || r.year === true)

/** Punkte eines Songs: (Stufe falls erraten + Bonus) × Jahr (richtig ×2, falsch ×0, nicht getippt ×1) */
export function songScore({ stagePoints, correct, tip }) {
    const base = correct ? stagePoints : 0
    const bonus = tip ? (tip.artist === true ? BONUS_ARTIST : 0) + (tip.title === true ? BONUS_TITLE : 0) : 0
    const mult = !tip || tip.year === null ? 1 : (tip.year ? 2 : 0)
    return { base, bonus, mult, total: (base + bonus) * mult }
}

/** Kurztext für das Ergebnis eines Tipps, z. B. „Titel + Interpret erraten · Jahr daneben“ */
export function tipSummary(r) {
    if (!tipGiven(r)) return ''
    if (r.artist === true && r.title === true && r.year === true) return 'Alles erraten'
    const hits = [r.title === true && 'Titel', r.artist === true && 'Interpret', r.year === true && 'Jahr'].filter(Boolean)
    const parts = []
    if (hits.length) parts.push(`${hits.join(' + ')} erraten`)
    else parts.push('Leider daneben')
    if (hits.length && r.year === false) parts.push('Jahr daneben')
    return parts.join(' · ')
}
