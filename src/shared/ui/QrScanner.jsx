import { useEffect, useRef, useState } from 'react'
import { IconX } from './icons'
import styles from './QrScanner.module.css'


/**
 * QR-Scanner über die Kamera (Rückkamera). Android/Chrome: eingebauter BarcodeDetector; sonst (iPhone) wird jsQR
 * erst jetzt nachgeladen. parse(text) macht aus dem QR-Inhalt einen Code (oder null); onCode(code) bei einem
 * gültigen Code, onClose zum Schließen. Muss in einem Element mit position: relative liegen (App-Rahmen).
 */
export default function QrScanner({ parse, onCode, onClose, invalidText = 'Das ist kein passender Code.' }) {
    const videoRef = useRef(null)
    const [error, setError] = useState(null)
    const [hint, setHint] = useState(null)
    const doneRef = useRef(false)

    useEffect(() => {
        let stream = null
        let stopped = false
        let timer = null
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ;(async () => {
            if (!navigator.mediaDevices?.getUserMedia) { setError('Dieser Browser kann nicht auf die Kamera zugreifen. Scanne den Code mit der Kamera-App.'); return }
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
            } catch (e) {
                setError(e?.name === 'NotAllowedError'
                    ? 'Kein Zugriff auf die Kamera. Erlaube ihn in den Browser-Einstellungen – oder scanne mit der Kamera-App.'
                    : 'Die Kamera konnte nicht gestartet werden. Scanne den Code mit der Kamera-App.')
                return
            }
            if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
            const video = videoRef.current
            video.srcObject = stream
            await video.play().catch(() => {})
            // Erkenner: eingebaut, wenn er QR kann – sonst jsQR
            let detect
            try {
                if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
                    const det = new window.BarcodeDetector({ formats: ['qr_code'] })
                    detect = async () => (await det.detect(video))[0]?.rawValue || null
                }
            } catch { detect = null }
            if (!detect) {
                const { default: jsQR } = await import('jsqr')
                detect = async () => {
                    const w = video.videoWidth, h = video.videoHeight
                    if (!w || !h) return null
                    const scale = Math.min(1, 640 / Math.max(w, h))
                    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
                    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null
                }
            }
            const tick = async () => {
                if (stopped || doneRef.current) return
                try {
                    const text = await detect()
                    if (text) {
                        const code = parse(text)
                        if (code) { doneRef.current = true; navigator.vibrate?.(30); onCode(code); return }
                        setHint(invalidText)
                    }
                } catch { /* nächster Versuch */ }
                timer = setTimeout(tick, 250)
            }
            tick()
        })()
        return () => {
            stopped = true
            clearTimeout(timer)
            stream?.getTracks().forEach(t => t.stop())
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className={styles.scanner} role="dialog" aria-modal="true" aria-label="QR-Code scannen">
            <video ref={videoRef} className={styles.scanVideo} playsInline muted />
            <div className={styles.scanFrame} aria-hidden="true" />
            <p className={styles.scanText}>{error || hint || 'Halte die Kamera auf den QR-Code des Hosts.'}</p>
            <button type="button" className={styles.scanClose} onClick={onClose} aria-label="Scanner schließen"><IconX size={22} /></button>
        </div>
    )
}
