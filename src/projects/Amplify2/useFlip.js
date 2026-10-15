import { useLayoutEffect, useRef } from 'react'

/** Platzwechsel weich animieren (FLIP): alte Position merken, neue messen, Differenz zurückgleiten lassen (App und Live-Board) */
export default function useFlip(orderKey, scale = 1) {
    const nodes = useRef(new Map())
    const lastTops = useRef(new Map())
    useLayoutEffect(() => {
        const tops = new Map()
        nodes.current.forEach((el, k) => tops.set(k, el.getBoundingClientRect().top))
        tops.forEach((top, k) => {
            const before = lastTops.current.get(k)
            const el = nodes.current.get(k)
            if (before == null || !el || Math.abs(before - top) < 1) return
            el.style.transition = 'none'
            // Auf der skalierten Bühne sind gemessene Pixel größer/kleiner als die inneren
            el.style.transform = `translateY(${(before - top) / scale}px)`
            requestAnimationFrame(() => {
                el.style.transition = 'transform 0.6s cubic-bezier(.2, .8, .2, 1)'
                el.style.transform = ''
            })
        })
        lastTops.current = tops
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderKey])
    return (key) => (el) => { if (el) nodes.current.set(key, el); else nodes.current.delete(key) }
}
