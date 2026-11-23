import { useEffect, useRef, useState } from 'react'
import './TimeRun.css'

// Hülle für das Phaser-Spiel: Phaser wird erst hier geladen (eigener Bundle-Teil), damit die Startseite schlank bleibt.
// Debug-Modus über den Link #timerun/debug (FPS-Anzeige + Knopf „+300 Gegner“).
export default function TimeRun({ onBack, param }) {
    const hostRef = useRef(null)
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let game = null
        let cancelled = false
        import('./game/createGame')
            .then(({ createGame }) => {
                if (cancelled || !hostRef.current) return
                game = createGame(hostRef.current, { debug: String(param ?? '').toLowerCase() === 'debug' })
                setLoading(false)
            })
            .catch(err => { console.error(err); setError('Spiel konnte nicht geladen werden.') })
        return () => {
            cancelled = true
            if (game) game.destroy(true)
        }
    }, [param])

    return (
        <div className="trRoot">
            <div className="trHost" ref={hostRef} />
            {loading && !error && <div className="trMsg">Lädt …</div>}
            {error && <div className="trMsg">{error}</div>}
            <button className="trBack" onClick={onBack} aria-label="Zurück zur Übersicht">←</button>
        </div>
    )
}
