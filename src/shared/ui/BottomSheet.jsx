import { useEffect, useLayoutEffect, useRef } from 'react'
import styles from './BottomSheet.module.css'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Bottom-Sheet im neuen Design. Muss in einem Element mit position: relative liegen (App-Rahmen).
 * Fokus wandert hinein, Tab bleibt im Dialog, Escape/Tipp daneben schließt, danach Fokus zurück.
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
                <span className={styles.grab} aria-hidden="true" />
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
