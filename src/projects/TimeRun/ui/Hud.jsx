import { PixelIcon } from './icons'
import { cap, formatTime } from './format'

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
                <span className="tr-num" style={{ fontSize: 9, color: '#B8AECB' }}>STUFE {hud.stageIndex}/{hud.stageCount} · {Math.floor(hud.progress * 100)}%</span>
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
