import { useEffect, useRef } from 'react'
import { getApp } from 'firebase/app'
import { getFirestore, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { reactionsRef } from './reactions'
import styles from './LiveBoard.module.css'

const MAX_ON_SCREEN = 150

/** Live-Board: neue Reaktionen fliegen von unten nach oben – zufällig verteilt, zufällig groß */
export default function ReactionRain({ code }) {
    const layerRef = useRef(null)

    useEffect(() => {
        if (!code) return
        const spawn = (emoji) => {
            const layer = layerRef.current
            if (!layer || layer.childElementCount >= MAX_ON_SCREEN) return
            const el = document.createElement('span')
            el.className = styles.rrEmoji
            el.textContent = emoji
            el.style.left = `${2 + Math.random() * 92}%`
            el.style.fontSize = `${3 + Math.random() * 9}vmin`
            el.style.setProperty('--dur', `${3.5 + Math.random() * 3}s`)
            el.style.setProperty('--sway', `${(Math.random() - 0.5) * 16}vmin`)
            el.addEventListener('animationend', () => el.remove())
            layer.appendChild(el)
        }
        let first = true
        const timers = []
        const unsub = onSnapshot(query(reactionsRef(getFirestore(getApp()), code), orderBy('t', 'desc'), limit(20)), (snap) => {
            if (first) { first = false; return }   // Alte Reaktionen nicht nachspielen
            snap.docChanges().forEach(ch => {
                if (ch.type !== 'added') return
                ;(ch.doc.data().e || []).forEach((e, i) => timers.push(setTimeout(() => spawn(String(e).slice(0, 16)), i * 90)))
            })
        }, () => { /* ohne Reaktionen weiter */ })
        return () => { unsub(); timers.forEach(clearTimeout) }
    }, [code])

    return <div ref={layerRef} className={styles.rrLayer} aria-hidden="true" />
}
