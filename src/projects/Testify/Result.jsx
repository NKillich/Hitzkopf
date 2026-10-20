import { useEffect, useState } from 'react'
import { IconX, IconShare, IconInfo, IconRetry } from '../../shared/ui/icons'
import { summary, answerText, themesText } from './testifyLogic'
import styles from './Testify.module.css'

// Zahl zählt beim Erscheinen von 0 hoch (ca. 1,2 s, wird zum Ende langsamer)
function useCountUp(target, ms = 1200) {
    const [value, setValue] = useState(0)
    useEffect(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            const id = setTimeout(() => setValue(target), 0)
            return () => clearTimeout(id)
        }
        let raf = 0
        const t0 = performance.now()
        const step = (t) => {
            const p = Math.min(1, (t - t0) / ms)
            setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
            if (p < 1) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
        return () => cancelAnimationFrame(raf)
    }, [target, ms])
    return value
}

// Balken und Ring füllen sich erst nach dem ersten Bild (sonst gibt es keinen Übergang)
function useFilled() {
    const [filled, setFilled] = useState(false)
    useEffect(() => {
        const id = setTimeout(() => setFilled(true), 60)
        return () => clearTimeout(id)
    }, [])
    return filled
}

const Pct = ({ value }) => <>{useCountUp(value)}&nbsp;%</>

/** Ergebnis: wer kennt wen wie gut, gemeinsamer Wert mit Titel, Kategorien, größte Überraschungen */
export default function Result({ data, uid, me, other, isHost, onAgain, onEnd, onShare }) {
    const filled = useFilled()
    const s = summary(data, uid, other?.uid)
    const together = useCountUp(s.together)
    const oName = other?.name || 'dein Gegenüber'
    const hostName = isHost ? me?.name : other?.name
    const r = 66
    const len = 2 * Math.PI * r
    const iAgain = !!data.again?.[uid]
    const hostSetup = data.phase === 'setup'
    const bar = (value, blue, thin) => (
        <div className={`${styles.track} ${thin ? styles.trackThin : ''}`}>
            <span className={`${styles.trackFill} ${blue ? styles.trackBlue : ''}`} style={{ width: filled ? `${value}%` : 0 }} />
        </div>
    )
    const total = (data.log || []).length

    return (
        <section className={styles.screen}>
            <header className={styles.header}>
                <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={onEnd} aria-label="Spiel beenden"><IconX size={20} /></button>
                <div className={styles.headTitle}><h1>Ergebnis</h1></div>
                <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={() => onShare(s)} aria-label="Ergebnis teilen"><IconShare /></button>
            </header>
            <div className={styles.scroll}>
                <div className={styles.heroCard}>
                    <div className={styles.ring} role="img" aria-label={`${s.together} Prozent gemeinsam`}>
                        <svg viewBox="0 0 144 144" aria-hidden="true">
                            <circle className={styles.ringTrack} cx="72" cy="72" r={r} />
                            <circle className={styles.ringFill} cx="72" cy="72" r={r} strokeDasharray={len}
                                strokeDashoffset={filled ? len * (1 - s.together / 100) : len} />
                        </svg>
                        <span className={styles.ringText} aria-hidden="true">
                            <span className={styles.ringPct}>{together}&nbsp;%</span>
                            <span className={styles.ringSub}>gemeinsam</span>
                        </span>
                    </div>
                    <h2 className={styles.heroTitle}>{s.title}</h2>
                    <p className={styles.heroMeta}>{me?.emoji} {me?.name} & {other?.emoji} {oName} · {total} Fragen · {themesText(data.themes)}</p>
                </div>

                <div className={styles.knowCard}>
                    <div className={styles.knowHead}>
                        <span className={styles.knowText}>{me?.name} kennt {oName} zu</span>
                        <span className={styles.knowPct}><Pct value={s.aKnowsB} /></span>
                    </div>
                    {bar(s.aKnowsB, false)}
                </div>
                <div className={`${styles.knowCard} ${styles.knowBlue}`}>
                    <div className={styles.knowHead}>
                        <span className={styles.knowText}>{oName} kennt {me?.name} zu</span>
                        <span className={styles.knowPct}><Pct value={s.bKnowsA} /></span>
                    </div>
                    {bar(s.bKnowsA, true)}
                </div>
                <p className={styles.infoLine}><IconInfo />Bereinigt um Zufallstreffer – reines Raten ergibt 0&nbsp;%</p>
                {s.who.total > 0 && (
                    <div className={styles.knowCard}>
                        <div className={styles.knowHead}>
                            <span className={styles.knowText}>Wer von uns? Gleich gesehen</span>
                            <span className={styles.knowPct}>{s.who.same}&nbsp;/&nbsp;{s.who.total}</span>
                        </div>
                        {bar(Math.round((s.who.same / s.who.total) * 100), false)}
                    </div>
                )}

                {s.cats.length > 0 && (<>
                    <h2 className={styles.secTitle}>
                        Nach Kategorien
                        <span className={styles.legendRow}>
                            <span><i className={styles.legendDot} />{me?.name}</span>
                            <span><i className={`${styles.legendDot} ${styles.legendDotBlue}`} />{oName}</span>
                        </span>
                    </h2>
                    <div className={styles.catList}>
                        {s.cats.map(c => (
                            <div key={c.cat} className={styles.catRow}>
                                <div className={styles.catHead}>
                                    <span className={styles.catName}>{c.label}</span>
                                    <span className={styles.catPct}>{c.a}&nbsp;% · {c.b}&nbsp;%</span>
                                </div>
                                {bar(c.a, false, true)}
                                {bar(c.b, true, true)}
                            </div>
                        ))}
                    </div>
                </>)}

                {s.surprises.length > 0 && (<>
                    <h2 className={styles.secTitle}>Größte Überraschungen</h2>
                    {s.surprises.map(x => (
                        <div key={x.q.id} className={styles.surprise}>
                            <p className={styles.surpriseQ}>{x.q.own}</p>
                            <p className={styles.surpriseRow}><span aria-hidden="true">{me?.emoji}</span>{me?.name}: <b>{answerText(x.q, x.aOwn)}</b></p>
                            <p className={styles.surpriseRow} style={{ marginTop: 4 }}><span aria-hidden="true">{other?.emoji}</span>{oName}: <b>{answerText(x.q, x.bOwn)}</b></p>
                        </div>
                    ))}
                </>)}
            </div>

            <div className={styles.footer}>
                {!isHost && (iAgain || hostSetup) && (
                    <p className={styles.footNote} role="status">
                        <span className={`${styles.dot} ${iAgain ? styles.dotWait : styles.dotOk}`} />
                        {iAgain
                            ? (hostSetup ? `${hostName} stellt gerade ein neues Spiel ein` : `Warten auf ${hostName} …`)
                            : `${hostName} möchte nochmal spielen`}
                    </p>
                )}
                <div className={styles.footerRow}>
                    <button type="button" className={`${styles.btn} ${styles.secondary}`} onClick={onEnd}>Beenden</button>
                    {!isHost && iAgain
                        ? <button type="button" className={`${styles.btn} ${styles.primaryOff}`} disabled>Warte auf {hostName} …</button>
                        : <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={onAgain}><IconRetry size={20} />{isHost ? 'Nochmal' : 'Nochmal spielen'}</button>}
                </div>
            </div>
        </section>
    )
}
