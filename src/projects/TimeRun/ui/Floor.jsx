import { useCallback } from 'react'

// Bodentexte der Spielwelt (Stufenname, Beschreibung, Jahre am Lineal) als HTML über dem Spiel:
// Das Phaser-Bild ist nur 390 px breit und wird hochskaliert – Text darin wäre unscharf.
// Die Ebene wird jedes Bild direkt per transform verschoben (bridge.setFloorScroll), ohne React neu zu zeichnen.
export function Floor({ state, bridge }) {
    const attach = useCallback(el => bridge.attachFloor(el), [bridge])
    return (
        <div className="tr-floor" aria-hidden="true">
            <div ref={attach} className="tr-floor-world">
                {state.floor.map(it => <FloorItem key={it.id} it={it} />)}
            </div>
        </div>
    )
}

function FloorItem({ it }) {
    const cls = `tr-fl tr-fl-${it.kind}${it.light ? ' tr-fl-light' : ''}`
    if (it.kind === 'year') return <span className={cls} style={{ top: it.y }}>{it.text}</span>
    return (
        <div className={cls} style={{ top: it.y }}>
            <span className="tr-fl-main">{it.text}</span>
            {it.sub && <span className="tr-fl-sub">{it.sub}</span>}
        </div>
    )
}
