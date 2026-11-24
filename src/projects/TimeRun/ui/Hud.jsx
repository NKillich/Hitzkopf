import { useLayoutEffect, useRef } from 'react'
import { PixelIcon } from './icons'
import { formatTime } from './format'

const NAME_PX = 17
const NAME_MIN_PX = 13

/** Stufenname: Schrift so weit verkleinern, dass er in eine Zeile passt (danach „…“). */
function StageName({ text, width }) {
    const ref = useRef(null)
    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        el.style.fontSize = `${NAME_PX}px`
        if (el.scrollWidth > el.clientWidth) {
            el.style.fontSize = `${Math.max(NAME_MIN_PX, Math.floor((NAME_PX * el.clientWidth) / el.scrollWidth))}px`
        }
    }, [text, width])
    return <span ref={ref} className="tr-hud-name">{text}</span>
}

// HUD nach Vorlage: Zeile 1 Stufe + Zeit + Pause, Zeile 2 (volle Breite) Leben + Level/Erfahrung,
// Zeile 3 Fortschritt (ein Kästchen je Stufe). Beim Level-up nur Zeile 1 (Stufe + Zeit), wie im Entwurf.
export function Hud({ state, bridge }) {
    const hud = state.hud
    if (!hud) return null
    const compact = state.overlay?.type === 'levelup'
    const hpFrac = hud.maxHp > 0 ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 0
    return (
        <>
            {/* Zeile 1: Stufe + Jahr */}
            <div className="tr-pp tr-hud-stage" style={{ width: compact ? 246 : 236 }}>
                <span className="tr-num tr-hud-code">{hud.code}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <StageName text={hud.name} width={compact ? 246 : 236} />
                    {!compact && <span className="tr-hud-year">{hud.year}</span>}
                </div>
            </div>
            <div className="tr-pp tr-hud-time" style={compact ? { left: 260, width: 122 } : undefined}>
                <span className="tr-num" style={{ fontSize: 14 }}>{formatTime(hud.timeSec)}</span>
            </div>
            {!compact && (
                <button type="button" className="tr-iconBtn tr-hit tr-hud-pause" aria-label="Pause" onClick={() => bridge.call('pause')}>
                    <PixelIcon name="pause" size={16} color="#F4EEDC" />
                </button>
            )}

            {!compact && (
                <>
                    {/* Zeile 2: Leben + Level/Erfahrung über die volle Breite */}
                    <div className="tr-pp tr-hud-bars">
                        <div className="tr-hud-pair" aria-label={`Leben ${Math.ceil(hud.hp)} von ${Math.round(hud.maxHp)}`}>
                            <PixelIcon name="heart" size={14} color="#E8483B" />
                            <div className="tr-bar"><div style={{ width: `${hpFrac * 100}%`, background: '#E8483B' }} /></div>
                        </div>
                        <div className="tr-hud-pair" aria-label={`Level ${hud.level}, Erfahrung ${hud.xp} von ${hud.xpNeeded}`}>
                            <span className="tr-num" style={{ fontSize: 10, color: '#3DCF9E' }}>LV{hud.level}</span>
                            <div className="tr-bar"><div style={{ width: `${hud.xpFrac * 100}%`, background: '#3DCF9E' }} /></div>
                            <span className="tr-num tr-hud-xp">{hud.xp}/{hud.xpNeeded}</span>
                        </div>
                    </div>

                    {/* Zeile 3: Fortschritt über alle Stufen */}
                    <div className="tr-hud-prog" aria-label={`Stufe ${hud.stageIndex} von ${hud.stageCount}, ${Math.floor(hud.progress * 100)} Prozent`}>
                        <div className="tr-hud-segs">
                            {hud.timeline.map((t, i) => <div key={i} className={`tr-seg tr-seg-${t.status}`} />)}
                        </div>
                        <span className="tr-num tr-hud-progText">{hud.stageIndex}/{hud.stageCount} · {Math.floor(hud.progress * 100)}%</span>
                    </div>
                </>
            )}

            {/* Boss-Leiste */}
            {hud.boss && !compact && (
                <div className="tr-pp" style={{ position: 'absolute', left: 8, right: 8, top: 150, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#FF9C7A' }}>Boss: {hud.boss.name}</span>
                    <div className="tr-bar"><div style={{ width: `${hud.boss.frac * 100}%`, background: '#E8483B' }} /></div>
                </div>
            )}

            {state.banner && (
                <div key={state.banner.id} className="tr-banner" style={{ position: 'absolute', left: '50%', top: 330, width: 340, textAlign: 'center', fontSize: 34, fontWeight: 700, color: '#FFD27A', textShadow: '4px 4px 0 #0D0A12' }}>
                    {state.banner.text}
                </div>
            )}

            {/* Hinweis (Onboarding, Easter Egg) unter der Figur */}
            {state.hint && !compact && (
                <div className="tr-hint" key={state.hint.text}>
                    {state.hint.swipe && <div className="tr-hint-stick" aria-hidden="true"><div /></div>}
                    <span>{state.hint.text}</span>
                </div>
            )}

            {/* Leiste unten: bisherige Upgrades mit Level (lässt Berührungen durch → Joystick geht auch hier) */}
            {!compact && hud.owned.length > 0 && (
                <div className="tr-owned" style={{ bottom: state.debug ? 28 : 12 }} aria-label="Deine Upgrades">
                    {hud.owned.map(u => (
                        <div key={u.id} className="tr-owned-slot" title={`${u.name} Level ${u.level}`}>
                            <PixelIcon name={u.icon} size={16} color="#E8D9F5" />
                            <span className={`tr-num tr-owned-lv${u.level >= u.maxLevel ? ' tr-max' : ''}`}>{u.level >= u.maxLevel ? 'MAX' : u.level}</span>
                        </div>
                    ))}
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
