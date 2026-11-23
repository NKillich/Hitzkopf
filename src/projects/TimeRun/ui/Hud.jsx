import { PixelIcon } from './icons'
import { cap, formatTime } from './format'

// Zeitstrahl rechts: Panel 40 × 400 ab y 240, Stufen 10 px, aktuelle 18 px mit Doppelring (Vorlage)
const TL_TOP = 240
const TL_H = 400
const TL_INNER = 12

function Timeline({ hud }) {
    const dots = [...hud.timeline].reverse()   // oben = Zukunft
    const n = dots.length
    const curFromTop = n - hud.stageIndex
    // Mitte des aktuellen Punkts (space-between: erster/letzter Punkt bündig am Innenrand)
    const usable = TL_H - 8 - TL_INNER * 2
    const labelTop = TL_TOP + 4 + TL_INNER + (n > 1 ? (curFromTop / (n - 1)) * (usable - 10) : 0) - 6
    return (
        <>
            <div className="tr-pp" role="img" aria-label={`Zeitstrahl: Stufe ${hud.stageIndex} von ${n}`}
                style={{ position: 'absolute', right: 6, top: TL_TOP, width: 40, height: TL_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: `${TL_INNER}px 0` }}>
                {dots.map(d => {
                    let style = { width: 10, height: 10, background: '#0D0A12', boxShadow: 'inset 0 0 0 2px #4E3F6B' }
                    if (d.status === 'done') style = { width: 10, height: 10, background: d.real ? '#FFB547' : '#3DCF9E' }
                    if (d.status === 'current') style = { width: 18, height: 18, background: '#3DCF9E', boxShadow: '0 0 0 3px #0D0A12, 0 0 0 6px #A6F7DA' }
                    return <div key={d.code} style={{ ...style, flexShrink: 0 }} />
                })}
            </div>
            <div className="tr-pp" style={{ position: 'absolute', right: 50, top: labelTop, padding: '4px 8px' }}>
                <span className="tr-num" style={{ fontSize: 10, color: '#3DCF9E' }}>{hud.stageIndex}/{n} · {Math.floor(hud.progress * 100)}%</span>
            </div>
        </>
    )
}

export function Hud({ state, bridge }) {
    const hud = state.hud
    if (!hud) return null
    const hpFrac = hud.maxHp > 0 ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 0
    return (
        <>
            {/* Panel links oben: Stufe, Jahr, Leben, Level */}
            <div className="tr-pp" style={{ position: 'absolute', left: 6, top: 30, width: 168, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#3DCF9E', lineHeight: 1.05, textTransform: 'uppercase' }}>{hud.code} {hud.name}</span>
                <span style={{ fontSize: 13, color: '#D9CFEA', lineHeight: 1 }}>{hud.year}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label={`Leben ${Math.ceil(hud.hp)} von ${Math.round(hud.maxHp)}`}>
                    <PixelIcon name="heart" size={14} color="#E8483B" />
                    <div className="tr-bar"><div style={{ width: `${hpFrac * 100}%`, background: '#E8483B' }} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label={`Level ${hud.level}`}>
                    <span className="tr-num" style={{ fontSize: 10, color: '#3DCF9E' }}>LV{hud.level}</span>
                    <div className="tr-bar"><div style={{ width: `${hud.xpFrac * 100}%`, background: '#3DCF9E' }} /></div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span className="tr-chip" style={{ color: '#FFD27A' }}>{hud.weapon}</span>
                    {hud.tags.map(t => <span key={t} className="tr-chip">{cap(t)}</span>)}
                </div>
            </div>

            {/* rechts oben: Zeit + Pause */}
            <div style={{ position: 'absolute', right: 6, top: 30, display: 'flex', gap: 6 }}>
                <div className="tr-pp" style={{ display: 'flex', alignItems: 'center', padding: '0 10px', height: 44 }}>
                    <span className="tr-num" style={{ fontSize: 14 }}>{formatTime(hud.timeSec)}</span>
                </div>
                <button type="button" className="tr-iconBtn tr-hit" aria-label="Pause" onClick={() => bridge.call('pause')}>
                    <PixelIcon name="pause" size={14} color="#F4EEDC" />
                </button>
            </div>

            {/* Boss-Leiste */}
            {hud.boss && (
                <div className="tr-pp" style={{ position: 'absolute', left: 6, right: 54, top: 172, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#FF9C7A' }}>Boss: {hud.boss.name}</span>
                    <div className="tr-bar"><div style={{ width: `${hud.boss.frac * 100}%`, background: '#E8483B' }} /></div>
                </div>
            )}

            <Timeline hud={hud} />

            {/* Infokarte zur Stufe */}
            {state.stageCard && (
                <div key={state.stageCard.id} className="tr-pp tr-stageCard" style={{ position: 'absolute', left: 8, right: 56, bottom: 26, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'inset 0 0 0 3px #3DCF9E' }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: '#FFD27A', lineHeight: 1.1 }}>{state.stageCard.code} {state.stageCard.name}</span>
                    <span style={{ fontSize: 12, color: '#A6F7DA' }}>{state.stageCard.range}</span>
                    <span style={{ fontSize: 12, color: '#B8AECB' }}>
                        Waffe: <span style={{ color: '#F4EEDC' }}>{state.stageCard.weapon}</span>
                        {state.stageCard.eating && ' – Kleinere berühren, Größere anknabbern'}
                    </span>
                    <span style={{ fontSize: 14, color: '#D9CFEA', lineHeight: 1.3 }}>{state.stageCard.fact}</span>
                </div>
            )}

            {state.banner && (
                <div key={state.banner.id} className="tr-banner" style={{ position: 'absolute', left: '50%', top: 330, width: 340, textAlign: 'center', fontSize: 34, fontWeight: 700, color: '#FFD27A', textShadow: '4px 4px 0 #0D0A12' }}>
                    {state.banner.text}
                </div>
            )}

            {state.debug && (
                <div style={{ position: 'absolute', left: 8, bottom: 4, right: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#FFD27A' }}>
                    <span className="tr-num" style={{ flexGrow: 1 }}>{hud.fps} FPS · {hud.enemies} Gegner</span>
                    <button type="button" className="tr-hit" style={{ background: 'none', border: 0, color: '#FFD27A', fontSize: 12, padding: 4 }} onClick={() => bridge.call('debugGoal')}>[Ziel]</button>
                    <button type="button" className="tr-hit" style={{ background: 'none', border: 0, color: '#FFD27A', fontSize: 12, padding: 4 }} onClick={() => bridge.call('debugBurst')}>[+300]</button>
                </div>
            )}
        </>
    )
}
