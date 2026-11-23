import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/500.css'
import '@fontsource/pixelify-sans/600.css'
import '@fontsource/pixelify-sans/700.css'
import '@fontsource/silkscreen/400.css'
import './TimeRun.css'
import './ui/ui.css'
import { UiBridge } from './game/bridge'
import { Hud } from './ui/Hud'
import { StartScreen } from './ui/StartScreen'
import { EndScreen, Evolution, LevelUp, PauseMenu } from './ui/Overlays'

const W = 390
const H = 844

// Hülle für das Phaser-Spiel (Ages Up, Code-Name TimeRun): Phaser wird erst hier geladen (eigener Bundle-Teil).
// Die Oberfläche ist React und liegt passgenau über dem Spiel (gleiche Skalierung wie Phaser „FIT“).
// Debug-Modus über den Link #timerun/debug (FPS, „[Ziel]“, „[+300]“).
export default function TimeRun({ onBack, param }) {
    const debug = String(param ?? '').toLowerCase() === 'debug'
    const rootRef = useRef(null)
    const hostRef = useRef(null)
    const [bridge] = useState(() => new UiBridge(debug))
    const state = useSyncExternalStore(bridge.subscribe, bridge.getState)
    const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 })
    const [loadError, setLoadError] = useState(null)

    useEffect(() => {
        let game = null
        let cancelled = false
        import('./game/createGame')
            .then(({ createGame }) => {
                if (cancelled || !hostRef.current) return
                game = createGame(hostRef.current, { debug, bridge })
            })
            .catch(err => { console.error(err); setLoadError('Spiel konnte nicht geladen werden.') })
        return () => {
            cancelled = true
            if (game) game.destroy(true)
        }
    }, [bridge, debug])

    // Oberfläche wie Phaser skalieren und zentrieren
    useLayoutEffect(() => {
        const el = rootRef.current
        if (!el) return undefined
        const update = () => {
            const { width, height } = el.getBoundingClientRect()
            const scale = Math.min(width / W, height / H)
            setFit({ scale, left: (width - W * scale) / 2, top: (height - H * scale) / 2 })
        }
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Tab im Hintergrund → Pause
    useEffect(() => {
        const onHide = () => { if (document.hidden) bridge.call('pause') }
        document.addEventListener('visibilitychange', onHide)
        return () => document.removeEventListener('visibilitychange', onHide)
    }, [bridge])

    const ov = state.overlay
    const run = state.screen === 'run'
    return (
        <div className="trRoot" ref={rootRef}>
            <div className="trHost" ref={hostRef} />
            <div className="trUi" style={{ transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})` }}>
                {run && <Hud state={state} bridge={bridge} />}
                {run && ov?.type === 'levelup' && <LevelUp state={state} bridge={bridge} />}
                {run && ov?.type === 'evolution' && <Evolution state={state} bridge={bridge} />}
                {run && ov?.type === 'pause' && <PauseMenu state={state} bridge={bridge} />}
                {run && ov?.type === 'end' && <EndScreen state={state} bridge={bridge} />}
                {!run && <StartScreen state={loadError ? { ...state, error: loadError } : state} bridge={bridge} onBack={onBack} />}
            </div>
        </div>
    )
}
