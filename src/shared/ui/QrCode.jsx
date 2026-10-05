import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import styles from './QrCode.module.css'

/** QR-Code als SVG (immer schwarz auf weiß, damit jede Kamera ihn liest) */
export default function QrCode({ text, size = 160, label }) {
    const [svg, setSvg] = useState('')
    useEffect(() => {
        let cancelled = false
        QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#101216', light: '#FFFFFF' } })
            .then((s) => { if (!cancelled) setSvg(s) })
            .catch(() => { /* ohne QR-Code bleibt der Link */ })
        return () => { cancelled = true }
    }, [text])
    return <div role="img" aria-label={label} className={styles.qr} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}
