import { useMemo } from 'react'
import styles from './Amplify2.module.css'

const COLORS = ['#FF6B2C', '#2BD99A', '#FFD23F', '#8B6CFF', '#FF7AB6', '#4CC9F0']

// Zufall aus einem Startwert (rein, damit React beim erneuten Rendern dasselbe Bild bekommt)
const seeded = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Kurzes Konfetti über den ganzen Bildschirm (nur beim eigenen Nummer-1-Hit). Neuer seed = neuer Regen. */
export default function Confetti({ seed = 1, pieces = 70 }) {
    const bits = useMemo(() => {
        const rnd = seeded(seed)
        return Array.from({ length: pieces }, (_, i) => ({
            left: rnd() * 100,
            delay: rnd() * 0.6,
            dur: 2.2 + rnd() * 1.6,
            drift: (rnd() - 0.5) * 160,
            spin: (rnd() - 0.5) * 900,
            w: 6 + rnd() * 6,
            color: COLORS[i % COLORS.length]
        }))
    }, [seed, pieces])
    return (
        <div className={styles.mvConfetti} aria-hidden="true">
            {bits.map((b, i) => (
                <span key={i} style={{
                    left: `${b.left}%`, width: b.w, height: b.w * 0.45, background: b.color,
                    animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`,
                    '--drift': `${b.drift}px`, '--spin': `${b.spin}deg`
                }} />
            ))}
        </div>
    )
}
