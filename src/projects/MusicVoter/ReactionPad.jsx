import { useState, useRef, useEffect } from 'react'
import { IconX } from '../../shared/ui/icons'
import { DEFAULT_EMOJIS, MAX_PER_PACKET, emojisIn, sendReactions } from './reactions'
import styles from './MusicVoter.module.css'

const RECENT_KEY = 'mv_recent_emojis'
const readRecent = () => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(e => typeof e === 'string').slice(0, 8) } catch { return [] }
}

/** Emoji-Knopf in der Playlist: Antippen schickt sofort aufs Live-Board, Spammen erlaubt */
export default function ReactionPad({ db, roomId, myName, raised }) {
    const [open, setOpen] = useState(false)
    const [recent, setRecent] = useState(readRecent)
    const [pop, setPop] = useState(null)          // kurzes Feedback am Knopf
    const [custom, setCustom] = useState('')
    const bufRef = useRef([])
    const timerRef = useRef(null)
    const popNo = useRef(0)
    const usedRef = useRef(recent)   // zuletzt genutzt – erst beim Schließen übernehmen, sonst springt die Leiste beim Spammen

    // Antippen sammeln und alle 0,3 s als ein Paket schicken – Spam kostet so kaum Schreibzugriffe
    const flush = () => {
        timerRef.current = null
        const batch = bufRef.current.slice(0, MAX_PER_PACKET)
        bufRef.current = []
        if (batch.length && db && roomId) sendReactions(db, roomId, myName, batch).catch(() => { /* Reaktionen sind nicht wichtig */ })
    }
    useEffect(() => () => { if (timerRef.current) { clearTimeout(timerRef.current); flush() } }, [])   // eslint-disable-line react-hooks/exhaustive-deps

    const send = (emoji) => {
        bufRef.current.push(emoji)
        if (!timerRef.current) timerRef.current = setTimeout(flush, 300)
        setPop({ emoji, key: ++popNo.current })
        usedRef.current = [emoji, ...usedRef.current.filter(e => e !== emoji)].slice(0, 8)
    }
    const toggle = () => {
        if (open) {
            setRecent(usedRef.current)
            try { localStorage.setItem(RECENT_KEY, JSON.stringify(usedRef.current)) } catch { /* optional */ }
        }
        setOpen(o => !o)
    }

    // Über die Handy-Emoji-Tastatur: jedes getippte Emoji geht sofort los
    const onCustom = (e) => {
        const found = emojisIn(e.target.value)
        found.forEach(send)
        setCustom(found.length ? '' : e.target.value.slice(-4))
    }

    const palette = [...new Set([...recent, ...DEFAULT_EMOJIS])].slice(0, 12)

    return (
        <div className={`${styles.mvReact} ${raised ? styles.mvReactRaised : ''}`}>
            {open && (
                <div className={styles.mvReactBar} role="group" aria-label="Reaktion aufs Live-Board schicken">
                    <div className={styles.mvReactRow}>
                        {palette.map(e => (
                            <button key={e} type="button" className={`${styles.mvBtn} ${styles.mvReactEmoji}`} onClick={() => send(e)} aria-label={`${e} schicken`}>{e}</button>
                        ))}
                    </div>
                    <input className={styles.mvReactInput} value={custom} onChange={onCustom} placeholder="Eigenes Emoji tippen …" aria-label="Eigenes Emoji über die Tastatur schicken"
                        autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="send" />
                </div>
            )}
            <button type="button" className={`${styles.mvBtn} ${styles.mvReactToggle}`} onClick={toggle} aria-expanded={open}
                aria-label={open ? 'Reaktionen schließen' : 'Reaktion aufs Live-Board schicken'} title="Reaktionen fürs Live-Board">
                {open ? <IconX size={20} /> : <span aria-hidden="true">😀</span>}
                {pop && <span key={pop.key} className={styles.mvReactPop} aria-hidden="true">{pop.emoji}</span>}
            </button>
        </div>
    )
}
