import { useMemo } from 'react'
import styles from './Testify.module.css'

// Akzentfarben von Testify
const COLORS = ['#C791FF', '#3DDC97', '#FFD166', '#5B9DFF', '#FF7AB6', '#FFFFFF']

// Zufall aus einem Startwert (rein: React bekommt beim erneuten Rendern dasselbe Bild)
const seeded = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Konfetti: klein in einer Karte (ca. 1,5 s) oder über den ganzen Bildschirm (screen, 2–3 s, dichter) */
export default function Confetti({ seed = 1, screen = false, delay = 0 }) {
    const bits = useMemo(() => {
        const rnd = seeded(seed)
        const n = screen ? 110 : 26
        return Array.from({ length: n }, (_, i) => ({
            left: rnd() * 100,
            delay: delay + rnd() * (screen ? 0.9 : 0.35),
            dur: screen ? 2 + rnd() * 1.2 : 1.1 + rnd() * 0.5,
            drift: (rnd() - 0.5) * (screen ? 180 : 70),
            spin: (rnd() - 0.5) * 900,
            w: 5 + rnd() * (screen ? 6 : 4),
            color: COLORS[i % COLORS.length],
        }))
    }, [seed, screen, delay])
    return (
        <div className={screen ? styles.confettiScreen : styles.confetti} aria-hidden="true">
            {bits.map((b, i) => (
                <span key={i} style={{
                    left: `${b.left}%`, width: b.w, height: b.w * 0.45, background: b.color,
                    animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`,
                    '--drift': `${b.drift}px`, '--spin': `${b.spin}deg`, '--fall': screen ? '105dvh' : '240px',
                }} />
            ))}
        </div>
    )
}
