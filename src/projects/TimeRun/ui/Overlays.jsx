import { useState } from 'react'
import { PixelIcon } from './icons'
import { cap, formatTime, GUARD_MS } from './format'

// Evolutionskarten: Farben wie in der Vorlage (orange, mint, grün, blau)
const EVO_COLORS = [
    { border: '#3DCF9E', inner: '#1E8A66', fill: '#3DCF9E', shade: '#1E8A66', light: '#A6F7DA', tag: '#A6F7DA' },
    { border: '#E8603B', inner: '#7A2E1E', fill: '#E8603B', shade: '#A33A20', light: '#FF9C7A', tag: '#FF9C7A' },
    { border: '#A6F07A', inner: '#4E8A2E', fill: '#7FD86B', shade: '#4E8A2E', light: '#C6F7A6', tag: '#C6F7A6' },
    { border: '#4EA8FF', inner: '#1F4E80', fill: '#4EA8FF', shade: '#1F4E80', light: '#BFE0FF', tag: '#BFE0FF' },
]

/** Klick nur, wenn die Auswahl schon kurz offen ist (Finger vom Joystick). */
function guarded(state, fn) {
    return () => { if (performance.now() - state.overlayAt >= GUARD_MS) fn() }
}

const RARITY_CARD = {
    common: { label: 'NORMAL', rc: '#B8AECB', ib: '#4E3F6B', bg: '#2A2140', icon: '#E8D9F5' },
    rare: { label: 'SELTEN', rc: '#4EA8FF', ib: '#1F4E80', bg: '#1A2340', icon: '#BFE0FF' },
    epic: { label: 'EPISCH', rc: '#B57CFF', ib: '#5B3A8A', bg: '#2A1A40', icon: '#E3CCFF' },
    legendary: { label: 'LEGENDÄR', rc: '#FFB547', ib: '#8A5A1B', bg: '#2E2214', icon: '#FFE0A3' },
}

// Level-up nach Entwurf „03 Level-up“: Spiel bleibt oben sichtbar, unten 3 Karten nebeneinander.
// Antippen wählt aus (Details oben), erst der grüne Knopf übernimmt.
export function LevelUp({ state, bridge }) {
    const o = state.overlay
    // Neue Karten (Neu würfeln / nächstes Level) → Auswahl zurücksetzen
    return <LevelUpPanel key={state.overlayAt} o={o} state={state} bridge={bridge} />
}

function LevelUpPanel({ o, state, bridge }) {
    const [sel, setSel] = useState(null)
    const s = sel === null ? null : o.choices[sel]
    return (
        <div className="tr-screen tr-lv">
            <div className="tr-lv-shade" />
            <div className="tr-lv-panel" />
            <div className="tr-lv-head">
                <div className="tr-lv-title">
                    <span className="tr-num tr-lv-level">LEVEL {o.level}</span>
                    <h1>Wähle ein Upgrade</h1>
                </div>
            </div>

            <div className="tr-lv-body">
                <div className="tr-pp tr-lv-detail" aria-live="polite">
                    {!s && <span className="tr-lv-hint">Tippe auf eine Karte für Details</span>}
                    {s && (
                        <>
                            <div className="tr-lv-dHead">
                                <span className="tr-lv-dName">{s.name}</span>
                                <span className="tr-num tr-lv-dLv">{s.level === 0 ? 'NEU · LV 1' : `LV ${s.level} → ${s.level + 1} / ${s.maxLevel}`}</span>
                            </div>
                            <span className="tr-lv-dEffect">{s.effect.replace(/\.$/, '')}</span>
                            {s.fact && <span className="tr-lv-dFact">Fakt: {s.fact}</span>}
                        </>
                    )}
                </div>

                <div className="tr-lv-cards">
                    {o.choices.map((c, i) => <UpgradeCardView key={`${c.name}-${i}`} c={c} on={sel === i} dim={sel !== null && sel !== i} onPick={() => setSel(i)} />)}
                </div>

                <div style={{ flexGrow: 1 }} />

                <div className="tr-lv-actions">
                    <button type="button" className="tr-bg tr-lv-reroll" disabled={o.rerolls <= 0}
                        aria-label={`Neu würfeln, ${o.rerolls} übrig`}
                        onClick={guarded(state, () => bridge.call('reroll'))}>
                        <svg width="24" height="24" viewBox="0 0 8 8" shapeRendering="crispEdges" fill="#F4EEDC" aria-hidden="true"><path d="M2 0h4v1h1v1H6v1H5V2H2v1H1v2h1v1h3V5h1v1h1v1H6v1H2V7H1V6H0V2h1V1h1zM5 0h3v3H7V1H5z" /></svg>
                        <span className="tr-num tr-lv-rerollN">{o.rerolls}</span>
                    </button>
                    {s
                        ? <button type="button" className="tr-bt tr-lv-go" onClick={guarded(state, () => bridge.call('pickUpgrade', sel))}>
                            {s.level === 0 ? `${s.name} lernen` : `${s.name} verbessern`}
                        </button>
                        : <div className="tr-lv-wait">Karte antippen</div>}
                </div>
            </div>
        </div>
    )
}

function UpgradeCardView({ c, on, dim, onPick }) {
    const r = RARITY_CARD[c.rarity] ?? RARITY_CARD.common
    const isNew = c.level === 0
    const pips = Array.from({ length: Math.max(1, c.maxLevel) }, (_, i) => i < c.level ? 'done' : i === c.level ? 'next' : 'open')
    return (
        <button type="button" className={`tr-lv-card${on ? ' tr-on' : ''}${dim ? ' tr-dimmed' : ''}`} aria-pressed={on}
            aria-label={`${c.name}, ${isNew ? 'neu' : `Level ${c.level} auf ${c.level + 1}`}`}
            style={{ '--rc': r.rc, '--ib': r.ib, '--cbg': r.bg }}
            onClick={onPick}>
            {c.rarity !== 'common' && <div className="tr-lv-band" />}
            <div className="tr-lv-icon"><PixelIcon name={c.icon} size={28} color={r.icon} /></div>
            <span className="tr-lv-name">{c.name}</span>
            <span className="tr-num tr-lv-chip" style={{ color: '#0D0A12', background: r.rc }}>{r.label}</span>
            <div className="tr-lv-pips">{pips.map((p, i) => <div key={i} className={`tr-pip tr-pip-${p}`} />)}</div>
            <span className="tr-num" style={{ fontSize: 11, color: isNew ? '#FFD27A' : '#3DCF9E' }}>{isNew ? 'NEU' : `LV ${c.level}→${c.level + 1}`}</span>
            <span className="tr-num tr-lv-chip" style={c.kind === 'weapon' ? { color: '#FFB199', background: '#3A1A14' } : { color: '#A6F7DA', background: '#123A30' }}>
                {c.kind === 'weapon' ? 'WAFFE' : 'PASSIV'}
            </span>
            {on && (
                <div className="tr-lv-check">
                    <svg width="12" height="10" viewBox="0 0 7 6" shapeRendering="crispEdges" fill="#0D0A12" aria-hidden="true"><path d="M6 0h1v2H6v1H5v1H4v1H3v1H2V5H1V4H0V2h1v1h1v1h1V3h1V2h1V1h1z" /></svg>
                </div>
            )}
        </button>
    )
}

export function Evolution({ state, bridge }) {
    const o = state.overlay
    return (
        <div className="tr-screen tr-dim" style={{ background: 'rgba(20, 16, 30, 0.96)' }}>
            <div style={{ height: '100%', boxSizing: 'border-box', padding: '56px 24px 30px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, color: '#B8AECB' }}>{o.fromName}</span>
                    <svg width="36" height="12" viewBox="0 0 12 4" shapeRendering="crispEdges" fill="#3DCF9E" aria-hidden="true"><path d="M0 1h9V0h1v1h1v1h1v1h-1v1h-1V3H9V2H0z" /></svg>
                    <span style={{ fontSize: 16, color: '#3DCF9E', fontWeight: 700 }}>{o.toCode} {o.toName}</span>
                </div>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <h1 style={{ fontSize: 36, lineHeight: 1.05, color: '#FFD27A', textShadow: '4px 4px 0 #0D0A12' }}>Wohin entwickelst du dich?</h1>
                    <p style={{ fontSize: 15, color: '#B8AECB' }}>{o.range}</p>
                    {o.future && <p style={{ fontSize: 14, color: '#FFB547' }}>Ab hier ist alles Zukunft – es gibt keine echte Zeitlinie.</p>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px' }}>
                    {o.options.map((c, i) => {
                        const col = EVO_COLORS[i % EVO_COLORS.length]
                        return (
                            <button key={`${c.name}-${i}`} type="button" className="tr-card tr-col"
                                style={{ border: `4px solid ${col.border}`, boxShadow: `inset 0 0 0 3px ${col.inner}` }}
                                onClick={guarded(state, () => bridge.call('pickEvolution', i))}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div className="tr-oc" style={{ width: 48, height: 48, flexShrink: 0, background: col.fill, boxShadow: `inset -5px -5px 0 ${col.shade}, inset 5px 5px 0 ${col.light}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <PixelIcon name={c.icon} size={22} color="#0D0A12" />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                        <span style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.1 }}>{c.name}</span>
                                        <span style={{ fontSize: 14, color: '#D9CFEA', lineHeight: 1.3 }}>{c.desc}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
                                    {c.grants.length > 0 && <span style={{ fontSize: 13, color: '#B8AECB' }}>gibt</span>}
                                    {c.grants.map(g => <span key={g} className="tr-tag" style={{ color: col.tag }}>{g}</span>)}
                                    {c.real && <span className="tr-num" style={{ fontSize: 9, color: '#0D0A12', background: '#FFB547', padding: '3px 6px', marginLeft: 'auto' }}>★ ECHTE ZEITLINIE</span>}
                                    {!c.real && c.general && <span className="tr-num" style={{ fontSize: 9, color: '#0D0A12', background: '#B8AECB', padding: '3px 6px', marginLeft: 'auto' }}>ALLGEMEIN</span>}
                                </div>
                            </button>
                        )
                    })}
                </div>

                <div style={{ flexGrow: 1 }} />

                <div className="tr-pp" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
                    <span style={{ fontSize: 14, color: '#B8AECB' }}>Deine Tags bisher</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {o.tags.length ? o.tags.map(t => <span key={t} className="tr-tag" style={{ color: '#F4EEDC' }}>{t}</span>)
                            : <span style={{ fontSize: 13, color: '#8F86A3' }}>noch keine</span>}
                    </div>
                    {o.path.length > 0 && <span style={{ fontSize: 12, color: '#8F86A3', lineHeight: 1.3 }}>Bisher: {o.path.join(' → ')}</span>}
                </div>
            </div>
        </div>
    )
}

export function PauseMenu({ state, bridge }) {
    const hud = state.hud
    return (
        <div className="tr-screen tr-dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div className="tr-pp tr-pause" style={{ width: '100%', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
                <h1 style={{ fontSize: 40, color: '#FFD27A', textShadow: '4px 4px 0 #0D0A12' }}>Pause</h1>
                {hud && (
                    <p style={{ fontSize: 15, color: '#D9CFEA' }}>
                        {hud.code} {hud.name} · {hud.year}<br />
                        <span style={{ color: '#B8AECB' }}>Level {hud.level} · {formatTime(hud.timeSec)}</span>
                    </p>
                )}
                {hud && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span className="tr-chip" style={{ color: '#FFD27A' }}>{hud.weapon}</span>
                        {hud.tags.map(t => <span key={t} className="tr-chip">{cap(t)}</span>)}
                    </div>
                )}
                <button type="button" className="tr-bt" style={{ height: 64, fontSize: 23, fontWeight: 700, color: '#0D0A12', marginTop: 6 }} onClick={() => bridge.call('resume')}>WEITER</button>
                <button type="button" className="tr-bg" style={{ height: 56, fontSize: 19, fontWeight: 600 }} onClick={() => bridge.call('restart')}>Neu starten</button>
                <button type="button" className="tr-bg" style={{ height: 56, fontSize: 19, fontWeight: 600 }} onClick={() => bridge.call('toMenu')}>Zum Startbildschirm</button>
                {state.overlay?.stages && <Teleporter stages={state.overlay.stages} current={hud?.code} bridge={bridge} />}
            </div>
        </div>
    )
}

/** Entwickler-Werkzeug (nur #timerun/debug): an Start, Mitte oder Ende jeder Stufe springen. */
function Teleporter({ stages, current, bridge }) {
    const spots = [[0, 'Start'], [0.5, 'Mitte']]
    return (
        <div className="tr-tp">
            <h2>Teleporter</h2>
            <p>Echte Zeitlinie, Level passend zur Stufe</p>
            {stages.map(s => (
                <div key={s.id} className={`tr-tp-row${s.code === current ? ' tr-tp-cur' : ''}`}>
                    <span className="tr-num tr-tp-code">{s.code}</span>
                    <span className="tr-tp-name">{s.name}</span>
                    {spots.map(([at, label]) => (
                        <button key={label} type="button" className="tr-tp-go" onClick={() => bridge.call('teleport', s.id, at)}>{label}</button>
                    ))}
                    <button type="button" className="tr-tp-go" onClick={() => bridge.call('teleport', s.id, 1)}>{s.boss ? 'Boss' : 'Ende'}</button>
                </div>
            ))}
        </div>
    )
}

export function EndScreen({ state, bridge }) {
    const o = state.overlay
    const segs = Array.from({ length: o.stageCount }, (_, i) => {
        const n = i + 1
        if (o.won || n < o.stageIndex) return '#3DCF9E'
        if (n === o.stageIndex) return '#FFB547'
        return '#0D0A12'
    })
    return (
        <div className="tr-screen" style={{ background: '#14101E' }}>
            <div style={{ height: '100%', boxSizing: 'border-box', padding: '60px 22px 30px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                    <span className="tr-num" style={{ fontSize: 13, color: '#0D0A12', background: o.won ? '#3DCF9E' : '#E8603B', padding: '4px 10px' }}>
                        {o.won ? 'GESCHAFFT' : 'RUN BEENDET'}
                    </span>
                    <h1 style={{ fontSize: 38, lineHeight: 1.05, color: '#FFD27A', textShadow: '4px 4px 0 #0D0A12' }}>
                        {o.won ? 'Ankunft in den Sternen!' : `Bis ${o.reachedCode} ${o.reachedName}`}
                    </h1>
                    <p style={{ fontSize: 16, color: '#B8AECB' }}>
                        Stufe {o.won ? o.stageCount : o.stageIndex} von {o.stageCount}{o.newRecord ? ' · Neuer Rekord' : ''}
                    </p>
                    <p style={{ fontSize: 13, color: '#8F86A3' }}>{o.year}</p>
                </div>

                <div className="tr-pp" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#B8AECB' }}><span>Ur-Zellen</span><span>Tiefe Raumfahrt</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${o.stageCount}, minmax(0, 1fr))`, gap: 3 }}>
                        {segs.map((c, i) => <div key={i} style={{ height: 12, background: c }} />)}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    {[[formatTime(o.timeSec), 'Zeit'], [o.kills, 'Besiegt'], [o.level, 'Level']].map(([v, l]) => (
                        <div key={l} className="tr-pp" style={{ padding: '12px 6px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className="tr-num" style={{ fontSize: 18 }}>{v}</span>
                            <span style={{ fontSize: 13, color: '#B8AECB' }}>{l}</span>
                        </div>
                    ))}
                </div>

                {o.pastCount > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', background: '#3A2A10', border: '4px solid #0D0A12', boxShadow: 'inset 0 0 0 3px #FFB547' }}>
                        <span className="tr-num" style={{ fontSize: 10, color: '#FFB547' }}>ECHTE ZEITLINIE</span>
                        <span style={{ fontSize: 19, fontWeight: 700 }}>{o.realCount} von {o.pastCount} Entscheidungen</span>
                        {o.badge && <span style={{ fontSize: 14, color: '#FFE0A3' }}>★ Abzeichen: genau wie in Wirklichkeit!</span>}
                    </div>
                )}

                {o.path.length > 0 && (
                    <div className="tr-pp" style={{ padding: '10px 14px', fontSize: 13, color: '#D9CFEA', lineHeight: 1.45 }}>
                        <span style={{ color: '#B8AECB' }}>Dein Weg: </span>
                        {o.path.map((p, i) => (
                            <span key={i}>{i > 0 && ' → '}<span style={{ color: p.real ? '#FFD27A' : '#D9CFEA' }}>{p.real ? '★ ' : ''}{cap(p.name)}</span></span>
                        ))}
                    </div>
                )}

                <div style={{ flexGrow: 1 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <button type="button" className="tr-bt" style={{ height: 64, fontSize: 23, fontWeight: 700, color: '#0D0A12' }} onClick={() => bridge.call('restart')}>NOCHMAL</button>
                    <button type="button" className="tr-bg" style={{ height: 56, fontSize: 19, fontWeight: 600 }} onClick={() => bridge.call('toMenu')}>Startbildschirm</button>
                </div>
            </div>
        </div>
    )
}
