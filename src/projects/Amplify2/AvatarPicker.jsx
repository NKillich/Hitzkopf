import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './StartScreen.module.css'
import { ANIMALS } from './avatars'


// Maße aus der Vorlage (375 px): Mitte 100 px, Nachbarn 58 px, außen 44 px – dazwischen fließend
const SIZES = [100, 58, 44, 40, 36]       // Kreis-Durchmesser nach Abstand zur Mitte (0, 1, 2, …)
const XS = [0, 90, 160, 222, 280]         // Abstand der Kreismitte zur Mitte in px
const BASE = SIZES[0]
const SLOTS = 4                           // so viele Tiere links und rechts der Mitte werden gezeichnet
const PX_PER_ITEM = 80                    // Ziehen: so viele px = ein Tier weiter
const TAU_FLING = 0.33                    // s – Ausrollen nach dem Wischen (größer = rollt weiter)
const TAU_SNAP = 0.1                      // s – Einrasten nach Antippen, Pfeiltaste, kurzem Loslassen
const MIN_FLING = 1.5                     // Tiere/s – langsamer gilt nicht als Schwung
const TAP = 6                             // px – weniger Bewegung gilt als Antippen
const mod = (i, n) => ((i % n) + n) % n
const lerpTable = (table, d) => {
    const a = Math.min(Math.abs(d), table.length - 1)
    const i = Math.min(Math.floor(a), table.length - 2)
    return table[i] + (table[i + 1] - table[i]) * (a - i)
}

/**
 * Profilbild-Karussell: Das Tier in der Mitte ist groß und gewählt, die Nachbarn werden nach außen kleiner.
 * Ziehen (Finger/Maus/Trackpad) mit Schwung – rollt aus und rastet ein; Antippen eines Tiers rollt es in die Mitte.
 * Positionen werden direkt am DOM gesetzt (kein React-Neuzeichnen pro Bild); gespeichert wird beim Stillstand.
 */
export default function AvatarPicker({ value, onChange, disabled }) {
    const n = ANIMALS.length
    const found = ANIMALS.indexOf(value)
    const idx = found >= 0 ? found : 0
    const wheelRef = useRef(null)
    const slotRefs = useRef([])
    const pos = useRef(idx)               // aktuelle Position als Kommazahl (Index ohne Modulo → endlos)
    const anim = useRef(null)             // { from, target, tau, t0, raf } – laufendes Ausrollen/Einrasten
    const drag = useRef(null)
    const wheelTimer = useRef(null)
    const latest = useRef({ onChange, idx, disabled })
    const [shown, setShown] = useState(idx)   // für Screenreader (aria-valuetext)
    useEffect(() => { latest.current = { onChange, idx, disabled } })

    const paint = () => {
        const p = pos.current
        const base = Math.round(p)
        slotRefs.current.forEach((el, s) => {
            if (!el) return
            const i = base + s - SLOTS
            const d = i - p
            const a = Math.abs(d)
            const emoji = ANIMALS[mod(i, n)]
            if (el.firstChild.textContent !== emoji) el.firstChild.textContent = emoji
            const x = Math.sign(d) * lerpTable(XS, d)
            el.style.transform = `translate(-50%, -50%) translateX(${x.toFixed(2)}px) scale(${(lerpTable(SIZES, d) / BASE).toFixed(4)})`
            el.style.opacity = a <= 1.2 ? '1' : String(Math.max(0, 1 - (a - 1.2) * 0.55))
            el.style.zIndex = String(10 - Math.round(a * 2))
            el.style.setProperty('--on', Math.max(0, 1 - a * 1.6).toFixed(3))
            el.dataset.i = String(i)
        })
    }
    const settle = () => {
        const i = Math.round(pos.current)
        pos.current = i
        paint()
        const k = mod(i, n)
        setShown(k)
        if (k !== latest.current.idx) latest.current.onChange(ANIMALS[k])
    }
    const stop = () => {
        if (anim.current?.raf) cancelAnimationFrame(anim.current.raf)
        anim.current = null
    }
    const frame = (t) => {
        const a = anim.current
        if (!a) return
        if (a.t0 == null) a.t0 = t
        const left = (a.target - a.from) * Math.exp(-(t - a.t0) / 1000 / a.tau)
        if (Math.abs(left) < 0.01) { anim.current = null; pos.current = a.target; settle(); return }
        pos.current = a.target - left
        paint()
        a.raf = requestAnimationFrame(frame)
    }
    const animateTo = (target, tau = TAU_SNAP) => {
        stop()
        if (Math.abs(target - pos.current) < 0.002) { pos.current = target; settle(); return }
        anim.current = { from: pos.current, target, tau, t0: null }
        anim.current.raf = requestAnimationFrame(frame)
    }

    // Wert von außen (z. B. beim Öffnen): ohne Animation dorthin, wenn gerade nichts läuft
    useLayoutEffect(() => {
        if (anim.current || drag.current) return
        if (mod(Math.round(pos.current), n) !== idx) pos.current = idx
        paint()
    })
    useEffect(() => () => {
        if (anim.current?.raf) cancelAnimationFrame(anim.current.raf)
        clearTimeout(wheelTimer.current)
    }, [])

    // Trackpad: nur seitliches Wischen bewegt das Karussell (senkrechtes Mausrad scrollt weiter die Seite)
    useEffect(() => {
        const el = wheelRef.current
        if (!el) return
        const onWheel = (e) => {
            if (latest.current.disabled || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
            e.preventDefault()
            stop()
            pos.current += e.deltaX / PX_PER_ITEM
            paint()
            clearTimeout(wheelTimer.current)
            wheelTimer.current = setTimeout(() => animateTo(Math.round(pos.current)), 120)
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    })

    const onPointerDown = (e) => {
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
        const wasMoving = !!anim.current
        stop()
        const hit = e.target.closest?.('[data-i]')
        drag.current = { id: e.pointerId, x0: e.clientX, p0: pos.current, moved: false, wasMoving,
            hit: hit ? Number(hit.dataset.i) : null, samples: [{ t: e.timeStamp, x: e.clientX }] }
    }
    const onPointerMove = (e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const dx = e.clientX - d.x0
        if (!d.moved && Math.abs(dx) > TAP) {
            d.moved = true
            e.currentTarget.setPointerCapture?.(e.pointerId)
        }
        if (!d.moved) return
        pos.current = d.p0 - dx / PX_PER_ITEM
        paint()
        d.samples.push({ t: e.timeStamp, x: e.clientX })
        if (d.samples.length > 8) d.samples.shift()
    }
    const onPointerUp = (e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        drag.current = null
        if (!d.moved) {
            // Antippen: laufendes Karussell anhalten (einrasten), sonst angetipptes Tier in die Mitte rollen
            animateTo(d.wasMoving || d.hit == null ? Math.round(pos.current) : d.hit)
            return
        }
        // Geschwindigkeit der letzten ~100 ms → Schwung; das Ziel wird vorab auf ein ganzes Tier gerundet
        const recent = d.samples.filter(s => e.timeStamp - s.t < 100)
        const first = recent[0] || d.samples[d.samples.length - 1]
        const dt = (e.timeStamp - first.t) / 1000
        const v = dt > 0.005 ? -((e.clientX - first.x) / PX_PER_ITEM) / dt : 0   // Tiere pro Sekunde
        if (Math.abs(v) < MIN_FLING) { animateTo(Math.round(pos.current)); return }
        animateTo(Math.round(pos.current + v * TAU_FLING), TAU_FLING)
    }
    const onPointerCancel = () => { if (drag.current) { drag.current = null; animateTo(Math.round(pos.current)) } }
    const onKeyDown = (e) => {
        const k = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
        if (disabled || !k) return
        e.preventDefault()
        animateTo(Math.round(anim.current ? anim.current.target : pos.current) + k)
    }

    return (
        <div ref={wheelRef} className={`${styles.wheel} ${disabled ? styles.wheelOff : ''}`}
            role="slider" tabIndex={disabled ? -1 : 0} aria-label="Profilbild wählen" aria-orientation="horizontal"
            aria-valuemin={1} aria-valuemax={n} aria-valuenow={shown + 1} aria-valuetext={`Profilbild ${ANIMALS[shown]}`}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel} onDragStart={(e) => e.preventDefault()}>
            {Array.from({ length: SLOTS * 2 + 1 }, (_, s) => (
                <span key={s} ref={(el) => { slotRefs.current[s] = el }} className={styles.wheelItem}>
                    <span className={styles.wheelEmoji} />
                </span>
            ))}
        </div>
    )
}
