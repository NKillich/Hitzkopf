import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { IconPause, IconPlay, IconX } from '../../shared/ui/icons'
import { BONUS_ARTIST, BONUS_TITLE, cleanTitle, normTitle } from './songGuess.js'
import styles from './SecondSound.module.css'

// Vorschläge aus der Spotify-Suche, kurz nach dem Tippen. scope: weitere Eingabe, von der die Suche abhängt (z. B. Interpret)
function useSuggestions(query, enabled, search, scope = '') {
    const [found, setFound] = useState({ q: '', items: [] })   // Treffer gehören immer zu einem Suchwort (+ scope)
    const searchRef = useRef(search)
    useEffect(() => { searchRef.current = search })
    const q = query.trim()
    const key = `${q}\u0000${scope}`
    const active = enabled && q.length >= 2
    useEffect(() => {
        if (!active) return
        let alive = true
        const id = setTimeout(() => {
            searchRef.current(q)
                .then(items => { if (alive) setFound({ q: key, items }) })
                .catch(() => { if (alive) setFound({ q: key, items: [] }) })
        }, 300)
        return () => { alive = false; clearTimeout(id) }
    }, [q, key, active])
    return active && found.q === key ? found.items : []
}

/**
 * „Bonuspunkte sammeln?“ – Interpret, Titel und Jahr tippen (alles freiwillig).
 * Interpret/Titel mit Vorschlägen aus der Spotify-Suche; das Jahr ist „doppelt oder nichts“.
 */
export default function BonusSheet({ open, svc, onClose, onSkip, onCheck, busy, yearAvailable, isPlaying, onPlayToggle, returnFocusRef }) {
    const [artistQ, setArtistQ] = useState('')
    const [artistSel, setArtistSel] = useState(null)      // { id, name } aus den Vorschlägen
    const [titleQ, setTitleQ] = useState('')
    const [titlePicked, setTitlePicked] = useState(false)
    const [year, setYear] = useState('')
    const [focus, setFocus] = useState(null)              // 'artist' | 'title' – nur dort Vorschläge zeigen

    const artists = useSuggestions(artistQ, focus === 'artist' && !artistSel, (q) => svc.searchArtists(q, 5))
    // Mit Interpret: nur Songs dieses Interpreten (ausgewählt → per ID, getippt → per Name in der Suche)
    const artistName = artistQ.trim()
    const titles = useSuggestions(titleQ, focus === 'title' && !titlePicked, async (q) => {
        const query = artistName ? `track:${q} artist:"${artistName.replace(/"/g, '')}"` : `track:${q}`
        const res = await svc.searchPage(query, 0, 'track')
        const seen = new Set()
        const out = []
        for (const t of res.tracks || []) {
            if (artistSel?.id && !(t.artistIds || []).includes(artistSel.id)) continue
            const key = normTitle(t.title)
            if (!key || seen.has(key)) continue
            seen.add(key)
            out.push(cleanTitle(t.title))
            if (out.length >= 5) break
        }
        return out
    }, `${artistSel?.id || ''}|${artistName.toLowerCase()}`)

    const filled = !!(artistQ.trim() || titleQ.trim() || year.trim())
    const yearOk = !year || /^\d{4}$/.test(year)

    const submit = () => {
        if (!filled) { onSkip(); return }
        if (!yearOk) return
        onCheck({ artist: { id: artistSel?.id || null, name: artistQ.trim() }, title: titleQ.trim(), year: year.trim() })
    }

    return (
        <BottomSheet open={open} onClose={onClose} labelledBy="sr-bonus-title" busy={busy} returnFocusRef={returnFocusRef}>
            <div className={styles.srBonusHead}>
                <h2 id="sr-bonus-title" className={styles.srBonusTitle}>Bonuspunkte sammeln?</h2>
                <button type="button" className={`${styles.srBtn} ${styles.srBonusPlay}`} onClick={onPlayToggle}
                    aria-label={isPlaying ? 'Pause' : 'Weiterhören'} title={isPlaying ? 'Pause' : 'Weiterhören'}>
                    {isPlaying ? <IconPause size={20} /> : <IconPlay size={20} />}
                </button>
            </div>
            <p className={styles.srBonusText}>Richtiger Interpret +{BONUS_ARTIST}, richtiger Titel +{BONUS_TITLE}. Ohne Eingabe zählt der Song als nicht erraten.</p>

            <div className={styles.srBonusField}>
                <label htmlFor="sr-tip-artist" className={styles.srLabel}>Interpret <span className={styles.srBonusPts}>+{BONUS_ARTIST}</span></label>
                <div className={styles.srInputWrap}>
                    <input id="sr-tip-artist" className={`${styles.srInput} ${styles.srBonusInput}`} value={artistQ} autoComplete="off"
                        placeholder="z. B. Eminem" onFocus={() => setFocus('artist')}
                        onChange={e => { setArtistQ(e.target.value); setArtistSel(null) }} />
                    {artistQ && (
                        <button type="button" className={`${styles.srBtn} ${styles.srInputClear}`} aria-label="Interpret löschen"
                            onClick={() => { setArtistQ(''); setArtistSel(null) }}><IconX size={16} w={2.6} /></button>
                    )}
                </div>
                {focus === 'artist' && !artistSel && artists.length > 0 && (
                    <ul className={styles.srSuggest} data-no-swipe>
                        {artists.map(a => (
                            <li key={a.id}>
                                <button type="button" className={`${styles.srBtn} ${styles.srSuggestItem}`}
                                    onClick={() => { setArtistSel({ id: a.id, name: a.name }); setArtistQ(a.name) }}>
                                    {a.imageUrl ? <img src={a.imageUrl} alt="" className={styles.srSuggestImg} /> : <span className={styles.srSuggestImg} />}
                                    <span>{a.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className={styles.srBonusField}>
                <label htmlFor="sr-tip-title" className={styles.srLabel}>Titel <span className={styles.srBonusPts}>+{BONUS_TITLE}</span></label>
                <div className={styles.srInputWrap}>
                    <input id="sr-tip-title" className={`${styles.srInput} ${styles.srBonusInput}`} value={titleQ} autoComplete="off"
                        placeholder={artistName ? `Songtitel von ${artistName}` : 'Songtitel'} onFocus={() => setFocus('title')}
                        onChange={e => { setTitleQ(e.target.value); setTitlePicked(false) }} />
                    {titleQ && (
                        <button type="button" className={`${styles.srBtn} ${styles.srInputClear}`} aria-label="Titel löschen"
                            onClick={() => { setTitleQ(''); setTitlePicked(false) }}><IconX size={16} w={2.6} /></button>
                    )}
                </div>
                {focus === 'title' && !titlePicked && titles.length > 0 && (
                    <ul className={styles.srSuggest} data-no-swipe>
                        {titles.map(t => (
                            <li key={t}>
                                <button type="button" className={`${styles.srBtn} ${styles.srSuggestItem}`}
                                    onClick={() => { setTitleQ(t); setTitlePicked(true) }}>
                                    <span>{t}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className={styles.srBonusField}>
                <label htmlFor="sr-tip-year" className={styles.srLabel}>Jahr <span className={styles.srBonusPts}>doppelt oder nichts</span></label>
                <input id="sr-tip-year" className={`${styles.srInput} ${styles.srBonusInput} ${styles.srBonusYear}`} value={year} autoComplete="off"
                    inputMode="numeric" maxLength={4} placeholder={yearAvailable ? 'z. B. 1985' : 'nicht verfügbar'} disabled={!yearAvailable}
                    onFocus={() => setFocus('year')}
                    onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                <p className={styles.srBonusHint}>Exakt richtig verdoppelt alle Punkte dieses Songs – falsch gibt 0.</p>
            </div>

            <button type="button" className={`${styles.srBtn} ${filled ? styles.srBonusGo : styles.srBonusSkip}`} onClick={submit} disabled={filled && (busy || !yearOk)}>
                {filled && busy ? 'Wird geprüft …' : (filled ? 'Prüfen' : 'Nicht erraten')}
            </button>
        </BottomSheet>
    )
}
