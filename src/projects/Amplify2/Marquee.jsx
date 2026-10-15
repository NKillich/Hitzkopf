import { useLayoutEffect, useRef } from 'react'

const SPEED = 30      // px pro Sekunde – langsam genug zum Mitlesen
const PAUSE = 1500    // ms Pause an jedem Ende

/**
 * Text, der nicht in die Zeile passt, läuft langsam nach links und wieder zurück (mit Pause an beiden Enden).
 * Passt er, steht er still. Bei „Bewegung reduzieren“ bleibt es beim „…“.
 * className bekommt das äußere Element (z. B. mvRowName mit overflow: hidden).
 */
export default function Marquee({ className, children }) {
    const outerRef = useRef(null)
    const innerRef = useRef(null)
    useLayoutEffect(() => {
        const outer = outerRef.current
        const inner = innerRef.current
        if (!outer || !inner || typeof ResizeObserver === 'undefined' || !inner.animate) return
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
        let anim = null
        let lastDist = 0
        const update = () => {
            const dist = Math.ceil(outer.scrollWidth - outer.clientWidth)
            if (dist === lastDist) return
            lastDist = dist
            anim?.cancel()
            anim = null
            if (dist <= 2) { inner.style.display = ''; outer.style.textOverflow = ''; return }
            inner.style.display = 'inline-block'
            outer.style.textOverflow = 'clip'
            const move = (dist / SPEED) * 1000
            const total = 2 * move + 2 * PAUSE
            const p = PAUSE / total
            const x = `translateX(${-dist}px)`
            anim = inner.animate([
                { transform: 'translateX(0)', offset: 0 },
                { transform: 'translateX(0)', offset: p, easing: 'ease-in-out' },
                { transform: x, offset: 0.5 },
                { transform: x, offset: 0.5 + p, easing: 'ease-in-out' },
                { transform: 'translateX(0)', offset: 1 }
            ], { duration: total, iterations: Infinity })
        }
        // Neu messen, wenn sich Breite oder Text ändern – erst ohne Animation (sonst zählt die Verschiebung mit)
        const remeasure = () => { lastDist = -1; anim?.cancel(); anim = null; inner.style.display = ''; update() }
        const ro = new ResizeObserver(remeasure)
        ro.observe(outer)
        const mo = new MutationObserver(remeasure)
        mo.observe(inner, { childList: true, subtree: true, characterData: true })
        update()
        return () => { ro.disconnect(); mo.disconnect(); anim?.cancel(); inner.style.display = ''; outer.style.textOverflow = '' }
    }, [])
    return <span ref={outerRef} className={className}><span ref={innerRef}>{children}</span></span>
}
