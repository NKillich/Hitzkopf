import { useLayoutEffect, useRef } from 'react'
import { IconChevron } from '../../shared/ui/icons'
import styles from './StartScreen.module.css'
import a2 from './Amplify2.module.css'
import { ANIMALS } from './avatars'


const ITEM = 52          // px pro Tier inkl. Abstand
const SIDE = 5           // so viele Tiere links und rechts der Mitte werden gezeichnet
const mod = (i, n) => ((i % n) + n) % n

/**
 * Profilbild-Auswahl: großes Bild oben, darunter ein endloses Karussell aller Tiere. Das Tier in der Mitte ist
 * gewählt – wischen, Pfeile oder antippen verschieben, die Auswahl folgt sofort (ohne Bestätigen).
 */
export default function AvatarPicker({ value, onChange, disabled }) {
    const n = ANIMALS.length
    const found = ANIMALS.indexOf(value)
    const idx = found >= 0 ? found : 0
    const stripRef = useRef(null)
    const pendingRef = useRef(null)   // { k, from } – Verschiebung für die Gleit-Animation nach dem Wechsel
    const dragRef = useRef(null)

    const move = (k, from = 0) => {
        if (disabled) return
        if (!k) { animateBack(from); return }
        pendingRef.current = { k, from }
        onChange(ANIMALS[mod(idx + k, n)])
    }
    const animateBack = (from) => {
        const el = stripRef.current
        if (!el || !from) return
        el.style.transition = 'transform 0.2s ease'
        el.style.transform = 'translateX(0)'
    }
    // Nach dem Wechsel steht die Leiste schon um die neue Mitte – kurz versetzt zeichnen und zurückgleiten lassen
    useLayoutEffect(() => {
        const p = pendingRef.current
        pendingRef.current = null
        const el = stripRef.current
        if (!p || !el) return
        el.style.transition = 'none'
        el.style.transform = `translateX(${p.k * ITEM + p.from}px)`
        requestAnimationFrame(() => {
            el.style.transition = 'transform 0.25s cubic-bezier(.2, .8, .2, 1)'
            el.style.transform = 'translateX(0)'
        })
    }, [idx])

    const onTouchStart = (e) => { if (!disabled) dragRef.current = { x: e.touches[0].clientX, dx: 0 } }
    const onTouchMove = (e) => {
        const d = dragRef.current
        const el = stripRef.current
        if (!d || !el) return
        d.dx = e.touches[0].clientX - d.x
        el.style.transition = 'none'
        el.style.transform = `translateX(${d.dx}px)`
    }
    const onTouchEnd = () => {
        const d = dragRef.current
        dragRef.current = null
        if (!d) return
        move(-Math.round(d.dx / ITEM), d.dx)
    }

    const offsets = Array.from({ length: SIDE * 2 + 1 }, (_, k) => k - SIDE)
    return (
        <div className={styles.picker}>
            <span key={value} className={styles.bigAvatar} aria-hidden="true">{ANIMALS[idx]}</span>
            <div className={styles.carousel} role="listbox" aria-label="Profilbild wählen" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'ArrowLeft') move(-1); if (e.key === 'ArrowRight') move(1) }}
                onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
                <div ref={stripRef} className={styles.strip}>
                    {offsets.map(o => {
                        const emoji = ANIMALS[mod(idx + o, n)]
                        return (
                            <button key={o} type="button" role="option" aria-selected={o === 0} tabIndex={-1}
                                className={`${a2.mvBtn} ${styles.item} ${o === 0 ? styles.itemOn : ''}`} onClick={() => move(o)} aria-label={`Profilbild ${emoji}`}>
                                {emoji}
                            </button>
                        )
                    })}
                </div>
                <button type="button" className={`${a2.mvBtn} ${styles.arrow} ${styles.arrowLeft}`} onClick={() => move(-1)} aria-label="Vorheriges Tier"><span className={styles.chevLeft}><IconChevron open={false} /></span></button>
                <button type="button" className={`${a2.mvBtn} ${styles.arrow} ${styles.arrowRight}`} onClick={() => move(1)} aria-label="Nächstes Tier"><span className={styles.chevRight}><IconChevron open={false} /></span></button>
            </div>
        </div>
    )
}
