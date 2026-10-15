import { useEffect, useRef } from 'react'
import { IconPlus, IconCheck } from '../../shared/ui/icons'
import styles from './Amplify2.module.css'

const LOCK = 10          // px, ab denen die Richtung feststeht
const THRESHOLD = 0.33   // Anteil der Zeilenbreite, ab dem Loslassen hinzufügt
const BLOCKED_MAX = 44   // gesperrte Zeilen lassen sich nur ein Stück ziehen (federn zurück)

/**
 * Suchtreffer mit „nach rechts wischen = hinzufügen“ (wie bei Spotify). Nur Touch; senkrechtes Scrollen hat Vorrang.
 * mode: 'add' (wischbar) | 'blocked' (federt zurück, onBlocked erklärt warum) | 'off' (kein Wischen, z. B. Album)
 */
export default function SwipeRow({ mode, onAdd, onBlocked, className, children }) {
    const rowRef = useRef(null)
    const frontRef = useRef(null)
    const bgRef = useRef(null)
    const cb = useRef({ mode, onAdd, onBlocked })
    useEffect(() => { cb.current = { mode, onAdd, onBlocked } })

    useEffect(() => {
        const row = rowRef.current, front = frontRef.current, bg = bgRef.current
        if (!row || !front || !bg) return
        let x0 = 0, y0 = 0, dx = 0, state = 'idle', armed = false   // idle | pending | swiping | scrolling
        const set = (px, animate) => {
            front.style.transition = animate ? 'transform 0.25s cubic-bezier(.2, .8, .2, 1)' : 'none'
            front.style.transform = px ? `translateX(${px}px)` : ''
            bg.style.opacity = px > 4 ? '1' : '0'
        }
        const onStart = (e) => {
            if (cb.current.mode === 'off' || e.touches.length > 1) return
            x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; armed = false; state = 'pending'
        }
        const onMove = (e) => {
            if (state === 'idle' || state === 'scrolling') return
            const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0
            if (state === 'pending') {
                if (Math.abs(my) > LOCK && Math.abs(my) > Math.abs(mx)) { state = 'scrolling'; return }
                if (mx < LOCK || Math.abs(mx) < Math.abs(my) * 1.5) return
                state = 'swiping'
            }
            if (e.cancelable) e.preventDefault()   // während des Wischens nicht scrollen
            const width = row.offsetWidth
            dx = cb.current.mode === 'blocked' ? Math.min(BLOCKED_MAX, Math.max(0, mx) * 0.3) : Math.min(width * 0.9, Math.max(0, mx))
            const nowArmed = cb.current.mode === 'add' && dx >= width * THRESHOLD
            if (nowArmed !== armed) {
                armed = nowArmed
                row.classList.toggle(styles.mvSwipeArmed, armed)
                if (armed) navigator.vibrate?.(10)
            }
            set(dx, false)
        }
        const onEnd = () => {
            if (state === 'swiping') {
                if (armed) cb.current.onAdd?.()
                else if (cb.current.mode === 'blocked' && dx >= BLOCKED_MAX * 0.8) cb.current.onBlocked?.()
                set(0, true)
                row.classList.remove(styles.mvSwipeArmed)
            }
            state = 'idle'; armed = false
        }
        row.addEventListener('touchstart', onStart, { passive: true })
        row.addEventListener('touchmove', onMove, { passive: false })
        row.addEventListener('touchend', onEnd)
        row.addEventListener('touchcancel', onEnd)
        return () => {
            row.removeEventListener('touchstart', onStart)
            row.removeEventListener('touchmove', onMove)
            row.removeEventListener('touchend', onEnd)
            row.removeEventListener('touchcancel', onEnd)
        }
    }, [])

    return (
        <li ref={rowRef} className={styles.mvSwipe}>
            <span ref={bgRef} className={styles.mvSwipeBg} aria-hidden="true">
                <span className={styles.mvSwipeIconAdd}><IconPlus size={20} /></span>
                <span className={styles.mvSwipeIconDone}><IconCheck size={20} /></span>
            </span>
            <div ref={frontRef} className={className}>{children}</div>
        </li>
    )
}
