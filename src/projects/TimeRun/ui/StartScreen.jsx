import { PixelIcon } from './icons'

// Startbildschirm nach Vorlage (01 Startscreen) – ohne DNA/Kristalle/Labor, die es noch nicht gibt
export function StartScreen({ state, bridge, onBack }) {
    const best = state.best
    return (
        <div className="tr-screen" style={{ background: '#14101E' }}>
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300, background: '#1B1530' }} />
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 300, height: 8, background: '#241C3A' }} />
            {[[40, 120, '#FFE0A3'], [330, 160, '#A6F7DA'], [280, 90, '#F4EEDC'], [70, 230, '#F4EEDC'], [350, 300, '#FFE0A3']].map(([x, y, c]) => (
                <div key={`${x}-${y}`} aria-hidden="true" style={{ position: 'absolute', left: x, top: y, width: 4, height: 4, background: c }} />
            ))}

            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: '52px 24px 36px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="tr-iconBtn" aria-label="Zurück zur Übersicht" onClick={onBack}>
                        <PixelIcon name="arrowLeft" size={16} color="#F4EEDC" />
                    </button>
                </div>

                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }} aria-hidden="true">
                        <div className="tr-oc" style={{ width: 12, height: 12, background: '#3DCF9E' }} />
                        <div className="tr-oc" style={{ width: 20, height: 20, background: '#3DCF9E' }} />
                        <div className="tr-oc" style={{ width: 30, height: 30, background: '#7FD86B' }} />
                        <div style={{ width: 40, height: 40, background: '#C98A4B', boxShadow: 'inset -4px -4px 0 #8A5A33' }} />
                        <div style={{ width: 52, height: 52, background: '#FFB547', boxShadow: 'inset -5px -5px 0 #B86E12, inset 5px 5px 0 #FFE0A3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PixelIcon name="rocket" size={28} color="#0D0A12" />
                        </div>
                    </div>
                    <h1 style={{ fontSize: 84, lineHeight: 0.85, color: '#FFD27A', textShadow: '5px 5px 0 #8A4B12, 9px 9px 0 #0D0A12' }}>AGES<br />UP</h1>
                    <p style={{ fontSize: 19, color: '#D9CFEA', maxWidth: 270, lineHeight: 1.3 }}>Von der Mikrobe bis ins Weltall. Jede Wahl schreibt die Geschichte neu.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {state.error ? (
                        <p style={{ fontSize: 13, color: '#FF9C7A', whiteSpace: 'pre-wrap' }}>{state.error}</p>
                    ) : (
                        <button type="button" className="tr-bt" disabled={!state.ready} onClick={() => bridge.call('startRun')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, height: 68, fontSize: 26, fontWeight: 700, color: '#0D0A12' }}>
                            <PixelIcon name="play" size={18} color="#0D0A12" />
                            {state.ready ? 'RUN STARTEN' : 'LÄDT …'}
                        </button>
                    )}
                    <p style={{ marginTop: 6, textAlign: 'center', fontSize: 15, color: '#B8AECB' }}>
                        {best
                            ? <>Bester Run: <span style={{ color: '#FFD27A' }}>{best.code} {best.name}</span> · Stufe {best.stageIndex}/{best.stageCount}</>
                            : 'Noch kein Run – viel Glück!'}
                    </p>
                </div>
            </div>
        </div>
    )
}
