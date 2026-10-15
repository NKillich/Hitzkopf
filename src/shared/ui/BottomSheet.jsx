import { useEffect, useLayoutEffect, useRef } from 'react'
import styles from './BottomSheet.module.css'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const NO_SWIPE = 'input, textarea, select, [data-no-swipe]'

/**
 * Bottom-Sheet im neuen Design. Muss in einem Element mit position: relative liegen (App-Rahmen).
 * Fokus wandert hinein, Tab bleibt im Dialog, Escape/Tipp daneben schließt, danach Fokus zurück.
 * Nach unten wischen schließt ebenfalls (Touch überall, solange der Inhalt oben steht; Maus am Griff).
 */
export function BottomSheet({ open, onClose, labelledBy, busy, initialFocusRef, returnFocusRef, children }) {
    const sheetRef = useRef(null)
    const closeRef = useRef(onClose)
    const busyRef = useRef(busy)
    useLayoutEffect(() => {
        closeRef.current = onClose
        busyRef.current = busy
    })

    useEffect(() => {
        if (!open) return
        const back = returnFocusRef?.current ?? document.activeElement
        const first = initialFocusRef?.current ?? sheetRef.current?.querySelector(FOCUSABLE)
        first?.focus()
        const onKey = (e) => { if (e.key === 'Escape' && !busyRef.current) closeRef.current?.() }
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            back?.focus?.()
        }
    }, [open, initialFocusRef, returnFocusRef])

    // Wischen zum Schließen: Sheet folgt dem Finger nach unten; weit genug oder schnell genug → zu, sonst zurück
    useEffect(() => {
        const sheet = sheetRef.current
        if (!open || !sheet) return
        let startY = null, t0 = 0, dy = 0, dragging = false
        const start = (y, target, fromGrab) => {
            if (busyRef.current || !closeRef.current) return
            if (!fromGrab && (sheet.scrollTop > 0 || target.closest?.(NO_SWIPE))) return
            startY = y; t0 = performance.now(); dy = 0; dragging = false
        }
        const move = (y, e) => {
            if (startY == null) return
            const d = y - startY
            if (!dragging) {
                if (d < -6) { startY = null; return }   // nach oben → ganz normal scrollen
                if (d < 6) return
                dragging = true
                sheet.style.transition = 'none'
            }
            if (e.cancelable) e.preventDefault()   // kein Scrollen/Neuladen der Seite während des Ziehens
            dy = Math.max(0, d)
            sheet.style.transform = `translateY(${dy}px)`
        }
        const end = () => {
            if (startY == null) return
            startY = null
            if (!dragging) return
            const fast = dy / Math.max(1, performance.now() - t0) > 0.6
            if (dy > Math.min(120, sheet.offsetHeight * 0.3) || (fast && dy > 30)) {
                sheet.style.transition = 'transform 0.18s ease-in'
                sheet.style.transform = `translateY(${sheet.offsetHeight}px)`
                setTimeout(() => closeRef.current?.(), 170)
            } else {
                sheet.style.transition = 'transform 0.25s cubic-bezier(.2, .8, .2, 1)'
                sheet.style.transform = ''
            }
        }
        const onTouchStart = (e) => start(e.touches[0].clientY, e.target, false)
        const onTouchMove = (e) => move(e.touches[0].clientY, e)
        // Maus/Stift: nur am Griff (sonst würde Text markieren zum Schließen)
        const grab = sheet.querySelector('[data-grab]')
        const onPointerMove = (e) => move(e.clientY, e)
        const onPointerUp = () => { end(); window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp) }
        const onPointerDown = (e) => {
            if (e.pointerType === 'touch') return
            start(e.clientY, e.target, true)
            window.addEventListener('pointermove', onPointerMove)
            window.addEventListener('pointerup', onPointerUp)
        }
        sheet.addEventListener('touchstart', onTouchStart, { passive: true })
        sheet.addEventListener('touchmove', onTouchMove, { passive: false })
        sheet.addEventListener('touchend', end)
        sheet.addEventListener('touchcancel', end)
        grab?.addEventListener('pointerdown', onPointerDown)
        return () => {
            sheet.removeEventListener('touchstart', onTouchStart)
            sheet.removeEventListener('touchmove', onTouchMove)
            sheet.removeEventListener('touchend', end)
            sheet.removeEventListener('touchcancel', end)
            grab?.removeEventListener('pointerdown', onPointerDown)
            onPointerUp()
        }
    }, [open])

    if (!open) return null
    return (
        <div className={styles.scrim} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}>
            <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={styles.sheet}
                onKeyDown={(e) => {
                    if (e.key !== 'Tab') return
                    const items = e.currentTarget.querySelectorAll(FOCUSABLE)
                    if (!items.length) return
                    const first = items[0], last = items[items.length - 1]
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
                }}>
                <span className={styles.grab} data-grab aria-hidden="true" />
                {children}
            </div>
        </div>
    )
}

/** Sicherheitsabfrage: sicherer Weg (Abbrechen) als Hauptbutton, die Aktion darunter in Rot */
export function ConfirmSheet({ open, title, text, cancelLabel = 'Abbrechen', confirmLabel, onCancel, onConfirm, returnFocusRef, busy }) {
    const cancelRef = useRef(null)
    return (
        <BottomSheet open={open} onClose={onCancel} labelledBy="ui-confirm-title" busy={busy} initialFocusRef={cancelRef} returnFocusRef={returnFocusRef}>
            <h2 id="ui-confirm-title" className={styles.title}>{title}</h2>
            {text && <p className={styles.text}>{text}</p>}
            <button ref={cancelRef} type="button" className={`${styles.btn} ${styles.primary}`} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
            <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={onConfirm} disabled={busy}>{busy ? 'Einen Moment …' : confirmLabel}</button>
        </BottomSheet>
    )
}
