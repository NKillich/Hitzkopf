import { useLayoutEffect, useRef, useState } from 'react'
import { IconChevron } from '../../shared/ui/icons'
import styles from './StartScreen.module.css'
import a2 from './Amplify2.module.css'
import { ANIMALS } from './avatars'


const VISIBLE = 7        // so viele Tiere sind gleichzeitig zu sehen (Mitte = gewählt)
const SIDE = 5           // so viele Tiere links und rechts der Mitte werden gezeichnet (Rest kommt beim Ziehen herein)
const ARROW = 18         // px Breite der Pfeil-Zonen links und rechts
const TAP = 6            // px – weniger Bewegung gilt als Antippen
const mod = (i, n) => ((i % n) + n) % n

/**
 * Profilbild-Auswahl: großes Bild oben, darunter ein endloses Karussell aller Tiere. Das Tier in der Mitte ist
 * gewählt – ziehen (Finger oder Maus), Pfeile, Pfeiltasten oder antippen verschieben, die Auswahl folgt sofort.
 */
export default function AvatarPicker({ value, onChange, disabled }) {
    const n = ANIMALS.length
    const found = ANIMALS.indexOf(value)
    const idx = found >= 0 ? found : 0
    const viewRef = useRef(null)
    const stripRef = useRef(null)
    const pendingRef = useRef(null)   // { k, from } – Verschiebung für die Gleit-Animation nach dem Wechsel
    const dragRef = useRef(null)
    const [width, setWidth] = useState(0)

    // Breite messen: Schrittweite so, dass genau VISIBLE Tiere hineinpassen
    useLayoutEffect(() => {
        const el = viewRef.current
        if (!el) return
        const measure = () => setWidth(el.clientWidth)
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    const step = width ? width / VISIBLE : 48
    const size = Math.min(48, Math.round(step - 6))

    const setX = (x, anim) => {
        const el = stripRef.current
        if (!el) return
        el.style.transition = anim ? 'transform 0.25s cubic-bezier(.2, .8, .2, 1)' : 'none'
        el.style.transform = `translateX(${x}px)`
    }
    const move = (k, from = 0) => {
        if (disabled) return
        if (!k) { setX(0, true); return }
        pendingRef.current = { k, from }
        onChange(ANIMALS[mod(idx + k, n)])
    }
    // Nach dem Wechsel steht die Leiste schon um die neue Mitte – kurz versetzt zeichnen und zurückgleiten lassen
    useLayoutEffect(() => {
        const p = pendingRef.current
        pendingRef.current = null
        if (!p) return
        setX(p.k * step + p.from, false)
        requestAnimationFrame(() => setX(0, true))
    }, [idx, step])

    const onPointerDown = (e) => {
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
        const o = e.target.closest?.('[data-o]')?.dataset.o
        dragRef.current = { id: e.pointerId, x: e.clientX, dx: 0, o: o == null ? null : Number(o), captured: false }
    }
    const onPointerMove = (e) => {
        const d = dragRef.current
        if (!d || d.id !== e.pointerId) return
        d.dx = e.clientX - d.x
        if (!d.captured && Math.abs(d.dx) > TAP) {
            d.captured = true
            e.currentTarget.setPointerCapture?.(e.pointerId)
        }
        if (d.captured) setX(d.dx, false)
    }
    const onPointerUp = (e) => {
        const d = dragRef.current
        if (!d || d.id !== e.pointerId) return
        dragRef.current = null
        if (!d.captured) { if (d.o) move(d.o); return }   // Antippen eines Tiers
        // Ziehen: so viele Plätze weiter, wie gezogen wurde (mindestens einer bei deutlichem Wisch)
        let k = -Math.round(d.dx / step)
        if (!k && Math.abs(d.dx) > step / 4) k = d.dx < 0 ? 1 : -1
        move(k, d.dx)
    }
    const onPointerCancel = () => { if (dragRef.current) { dragRef.current = null; setX(0, true) } }

    const offsets = Array.from({ length: SIDE * 2 + 1 }, (_, k) => k - SIDE)
    return (
        <div className={styles.picker}>
            <span key={value} className={styles.bigAvatar} aria-hidden="true">{ANIMALS[idx]}</span>
            <div className={styles.carousel} style={{ '--arrow': `${ARROW}px` }}>
                <button type="button" className={`${a2.mvBtn} ${styles.arrow}`} onClick={() => move(-1)} disabled={disabled} aria-label="Vorheriges Tier">
                    <span className={styles.chevLeft}><IconChevron open={false} /></span>
                </button>
                <div ref={viewRef} className={styles.viewport} role="listbox" aria-label="Profilbild wählen" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) } if (e.key === 'ArrowRight') { e.preventDefault(); move(1) } }}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
                    onDragStart={(e) => e.preventDefault()}>
                    <div ref={stripRef} className={styles.strip}>
                        {offsets.map(o => {
                            const emoji = ANIMALS[mod(idx + o, n)]
                            return (
                                <span key={o} data-o={o} role="option" aria-selected={o === 0} aria-label={`Profilbild ${emoji}`}
                                    className={`${styles.item} ${o === 0 ? styles.itemOn : ''}`}
                                    style={{ width: size, height: size, left: `calc(50% + ${o * step - size / 2}px)`, fontSize: Math.round(size * 0.5) }}>
                                    {emoji}
                                </span>
                            )
                        })}
                    </div>
                </div>
                <button type="button" className={`${a2.mvBtn} ${styles.arrow}`} onClick={() => move(1)} disabled={disabled} aria-label="Nächstes Tier">
                    <span className={styles.chevRight}><IconChevron open={false} /></span>
                </button>
            </div>
        </div>
    )
}
