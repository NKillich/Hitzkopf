import { useEffect, useState } from 'react'
import { IconX, IconCheck, IconLock, IconInfo } from '../../shared/ui/icons'
import { IconGrid, IconSwap, IconScale, IconArrow, IconMinus, IconFriends, IconCards } from './icons'
import Confetti from './Confetti'
import {
    BOTH_MS, COUNT_MS, REVEAL_AT, SCORE_DELAY, TYPE_LABEL, catLabel, verdict, answerText, scoreOf, fmtPoints,
    isPairLike, optionsOf, whoSame,
} from './testifyLogic'
import styles from './Testify.module.css'

const LETTERS = ['A', 'B', 'C', 'D']
const TYPE_ICON = {
    pick4: <IconGrid />, pair: <IconSwap />, scale: <IconScale />, emoji4: <IconCards />, yesno: <IconCheck size={16} w={2.6} />, who: <IconFriends size={16} />,
}

// Uhr für den Ablauf nach dem zweiten „Fertig“: alle 100 ms neu zeichnen, bis Zeitpunkt until erreicht ist
function useNow(until) {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (until == null) return
        let id = null
        const tick = () => {
            const n = Date.now()
            setNow(n)
            if (n > until) clearInterval(id)
        }
        id = setInterval(tick, 100)
        const first = setTimeout(tick, 0)
        return () => { clearInterval(id); clearTimeout(first) }
    }, [until])
    return now
}

// Frage über den anderen: {n} wird zum Namen (lila hervorgehoben)
const WithName = ({ text, name }) => {
    const parts = String(text).split('{n}')
    return parts.map((p, i) => (
        <span key={i}>{p}{i < parts.length - 1 && <span className={styles.who}>{name}</span>}</span>
    ))
}

// Zahl im Spielstand: pulsiert und leuchtet grün, wenn sie sich ändert (nicht beim ersten Anzeigen)
function ScoreNum({ value }) {
    const [first] = useState(value)
    const changed = value !== first
    return <span key={value} className={`${styles.scoreNum} ${changed ? styles.scoreBump : ''}`}>{fmtPoints(value)}</span>
}

function GameHead({ idx, total, me, other, myScore, otherScore, onLeave }) {
    return (
        <header className={styles.gameHead}>
            <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={onLeave} aria-label="Spiel verlassen"><IconX size={20} /></button>
            <div className={styles.progress}>
                <span className={styles.progressLabel}>Frage {idx + 1} von {total}</span>
                <span className={styles.bar} aria-hidden="true">
                    {Array.from({ length: total }, (_, i) => <i key={i} className={i < idx ? styles.barDone : i === idx ? styles.barNow : ''} />)}
                </span>
            </div>
            <div className={styles.score} aria-label={`Spielstand: du ${fmtPoints(myScore)}, ${other?.name} ${fmtPoints(otherScore)}`}>
                <span className={styles.scoreEmoji} aria-hidden="true">{me?.emoji}</span>
                <ScoreNum value={myScore} />
                <span className={styles.scoreColon}>:</span>
                <ScoreNum value={otherScore} />
                <span className={styles.scoreEmoji} aria-hidden="true">{other?.emoji}</span>
            </div>
        </header>
    )
}

/** Eine Runde: eigene Antwort → Tipp → warten → Countdown → Aufdeckung → Weiter */
export default function Round({ data, uid, me, other, doneLocal, onAnswer, onNext, onLeave }) {
    const idx = data.idx
    const q = data.questions[idx]
    const total = data.questions.length
    const answers = data.round?.answers || {}
    const mine = answers[uid] || {}
    const theirs = (other && answers[other.uid]) || {}
    const oName = other?.name || 'dein Gegenüber'

    const [sel, setSel] = useState(null)          // eigene Auswahl (noch nicht gesendet)
    const [gsel, setGsel] = useState(null)        // Tipp (noch nicht gesendet)
    const [ownSent, setOwnSent] = useState(null)  // gesendet, Firestore hat noch nicht geantwortet
    const [guessSent, setGuessSent] = useState(null)
    const [nextSent, setNextSent] = useState(false)
    const own = mine.own ?? ownSent
    const guess = mine.guess ?? guessSent

    const revealing = doneLocal != null
    const now = useNow(revealing ? doneLocal + REVEAL_AT + SCORE_DELAY + 300 : null)
    const t = revealing ? now - doneLocal : -1
    let step
    const isWho = q.type === 'who'
    if (!revealing) step = own == null ? (isPairLike(q) ? 'pair' : isWho ? 'who' : 'own') : guess == null && !isWho ? 'guess' : 'wait'
    else step = t < BOTH_MS ? 'wait' : t < REVEAL_AT ? 'count' : 'reveal'

    const withCurrent = step === 'reveal' && t >= REVEAL_AT + SCORE_DELAY
    const myScore = other ? scoreOf(data, uid, other.uid, withCurrent) : 0
    const otherScore = other ? scoreOf(data, other.uid, uid, withCurrent) : 0
    const head = <GameHead idx={idx} total={total} me={me} other={other} myScore={myScore} otherScore={otherScore} onLeave={onLeave} />

    const sendOwn = async () => {
        if (sel == null) return
        setOwnSent(sel)
        try { await onAnswer({ own: sel }) } catch { setOwnSent(null) }
    }
    const sendGuess = async () => {
        if (gsel == null) return
        setGuessSent(gsel)
        try { await onAnswer({ guess: gsel }) } catch { setGuessSent(null) }
    }
    const sendPair = async () => {
        if (sel == null || gsel == null) return
        setOwnSent(sel); setGuessSent(gsel)
        try { await onAnswer({ own: sel, guess: gsel }) } catch { setOwnSent(null); setGuessSent(null) }
    }
    const sendNext = async () => {
        setNextSent(true)
        try { await onNext() } catch { setNextSent(false) }
    }

    // Stand des anderen (Fußzeile beim Tippen)
    const theirNote = isWho
        ? (theirs.own == null
            ? <p className={styles.footNote}><span className={`${styles.dot} ${styles.dotWait}`} />{oName} überlegt noch</p>
            : <p className={styles.footNote}><span className={`${styles.dot} ${styles.dotOk}`} />{oName} ist schon fertig</p>)
        : theirs.own == null
        ? <p className={styles.footNote}><span className={`${styles.dot} ${styles.dotWait}`} />{oName} beantwortet gerade die eigene Frage</p>
        : theirs.guess == null
            ? <p className={styles.footNote}><span className={`${styles.dot} ${styles.dotWait}`} />{oName} tippt gerade für dich</p>
            : <p className={styles.footNote}><span className={`${styles.dot} ${styles.dotOk}`} />{oName} ist schon fertig</p>

    const stepsBar = (guessing) => (
        <div className={styles.steps} aria-label={guessing ? 'Schritt 2 von 2' : 'Schritt 1 von 2'}>
            <span className={`${styles.step} ${guessing ? '' : styles.stepOn}`}>
                {guessing && <span className={styles.stepCheck}><IconCheck size={15} /></span>}1 · Du
            </span>
            <span className={`${styles.step} ${guessing ? styles.stepOn : ''}`}>2 · Errate {oName}</span>
        </div>
    )

    // ── Eins aus 4 / Skala: eigene Antwort und Tipp ─────────────────────────
    if (step === 'own' || step === 'guess') {
        const guessing = step === 'guess'
        const value = guessing ? gsel : sel
        const setValue = guessing ? setGsel : setSel
        const tags = guessing ? (
            <div className={styles.tags}>
                <span className={`${styles.chip} ${styles.chipPerson}`}><span className={styles.chipEmoji} aria-hidden="true">{other?.emoji}</span>Über {oName}</span>
                <span className={styles.tagMuted}>{TYPE_LABEL[q.type]} · {catLabel(q)}</span>
            </div>
        ) : (
            <div className={styles.tags}>
                <span className={styles.chip}>{TYPE_ICON[q.type]}{TYPE_LABEL[q.type]}</span>
                <span className={styles.tagMuted}>{catLabel(q)}</span>
            </div>
        )
        const title = <h1 className={styles.question}>{guessing ? <WithName text={q.other} name={oName} /> : q.own}</h1>
        const ready = value != null
        const footer = (
            <div className={styles.footer}>
                {guessing ? theirNote : q.type === 'scale'
                    ? <p className={styles.footNote}><IconInfo />1 daneben zählt beim Raten als „knapp“</p>
                    : <p className={styles.footNote}><IconLock size={17} />Nach „Weiter“ ist deine Antwort gesperrt</p>}
                <button type="button" className={`${styles.btn} ${ready ? styles.primary : styles.primaryOff}`} disabled={!ready}
                    onClick={guessing ? sendGuess : sendOwn}>
                    {guessing ? <>Fertig<IconCheck size={20} /></> : <>Weiter<IconArrow /></>}
                </button>
            </div>
        )

        if (q.type === 'scale') {
            const shown = value
            return (
                <section className={styles.screen}>
                    {head}
                    <div className={styles.scroll}>
                        {stepsBar(guessing)}
                        {tags}
                        {title}
                        <div className={styles.scaleBig} aria-live="polite">
                            <span className={`${styles.scaleNum} ${shown == null ? styles.scaleNumEmpty : ''}`}>{shown == null ? '?' : shown + 1}</span>
                            <span className={styles.scaleLabel}>{shown == null ? 'Wähle 1 bis 5' : q.labels[shown]}</span>
                        </div>
                        <div className={styles.scaleRow} role="radiogroup" aria-label="Wert von 1 bis 5">
                            {q.labels.map((label, i) => (
                                <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i + 1} – ${label}`}
                                    className={`${styles.btn} ${styles.scaleBtn} ${value === i ? styles.scaleBtnOn : ''}`} onClick={() => setValue(i)}>
                                    {i + 1}
                                    {guessing && own === i && <span className={styles.scaleMine} title="Deine Antwort"><IconLock size={12} w={2.6} /></span>}
                                </button>
                            ))}
                        </div>
                        <div className={styles.scaleEnds}><span>{q.labels[0]}</span><span>{q.labels[4]}</span></div>
                    </div>
                    {footer}
                </section>
            )
        }

        if (q.type === 'emoji4') {
            return (
                <section className={styles.screen}>
                    {head}
                    <div className={styles.scroll}>
                        {stepsBar(guessing)}
                        {tags}
                        {title}
                        <div className={`${styles.pairGrid} ${styles.emojiGrid}`} role="radiogroup">
                            {q.options.map((opt, i) => (
                                <button key={opt.label} type="button" role="radio" aria-checked={value === i}
                                    className={`${styles.btn} ${styles.tile} ${styles.emojiTile} ${value === i ? styles.tileOn : ''}`} onClick={() => setValue(i)}>
                                    <span className={styles.emojiBig} aria-hidden="true">{opt.icon}</span>
                                    <span className={styles.tileText}>{opt.label}</span>
                                    {guessing && own === i && value !== i && <span className={`${styles.mine} ${styles.mineCorner}`}><IconLock size={13} w={2.6} />Deine</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                    {footer}
                </section>
            )
        }

        return (
            <section className={styles.screen}>
                {head}
                <div className={styles.scroll}>
                    {stepsBar(guessing)}
                    {tags}
                    {title}
                    <div className={styles.options} role="radiogroup">
                        {q.options.map((opt, i) => (
                            <button key={opt} type="button" role="radio" aria-checked={value === i}
                                className={`${styles.btn} ${styles.option} ${value === i ? styles.optionOn : ''}`} onClick={() => setValue(i)}>
                                <span className={styles.letter}>{LETTERS[i]}</span>
                                <span className={styles.optionText}>{opt}</span>
                                {guessing && own === i && value !== i && <span className={styles.mine}><IconLock size={13} w={2.6} />Deine</span>}
                                {value === i && <span className={styles.optionCheck}><IconCheck size={22} w={2.6} /></span>}
                            </button>
                        ))}
                    </div>
                </div>
                {footer}
            </section>
        )
    }

    // ── Dies oder das: beides auf einem Bildschirm ──────────────────────────
    if (step === 'pair') {
        const tiles = (value, setValue, label) => (
            <div className={styles.pairGrid} role="radiogroup" aria-label={label}>
                {optionsOf(q).map((opt, i) => (
                    <button key={opt.label} type="button" role="radio" aria-checked={value === i}
                        className={`${styles.btn} ${styles.tile} ${value === i ? styles.tileOn : ''}`} onClick={() => setValue(i)}>
                        <span className={styles.tileIcon} aria-hidden="true">{opt.icon}</span>
                        <span className={styles.tileText}>{opt.label}</span>
                    </button>
                ))}
            </div>
        )
        const ready = sel != null && gsel != null
        return (
            <section className={styles.screen}>
                {head}
                <div className={styles.scroll}>
                    <div className={styles.tags} style={{ marginTop: 14 }}>
                        <span className={styles.chip}>{TYPE_ICON[q.type]}{TYPE_LABEL[q.type]}</span>
                        <span className={styles.tagMuted}>{catLabel(q)} · beides auf einem Bildschirm</span>
                    </div>
                    <h1 className={styles.pairHead}><span className={styles.pairNum}>1</span>{q.own}</h1>
                    {tiles(sel, setSel, 'Deine Antwort')}
                    <div className={styles.pairDivider} />
                    <h2 className={styles.pairHead}><span className={styles.pairNumEmoji} aria-hidden="true">{other?.emoji}</span>
                        <span><WithName text={q.other} name={oName} /></span>
                    </h2>
                    {tiles(gsel, setGsel, `Tipp für ${oName}`)}
                </div>
                <div className={styles.footer}>
                    <button type="button" className={`${styles.btn} ${ready ? styles.primary : styles.primaryOff}`} disabled={!ready} onClick={sendPair}>
                        {sel == null ? 'Wähle deine Antwort' : gsel == null ? `Tippe noch für ${oName}` : <>Fertig<IconCheck size={20} /></>}
                    </button>
                </div>
            </section>
        )
    }

    // ── Wer von uns?: beide wählen eine Person, kein Tipp ───────────────────
    if (step === 'who') {
        const people = [{ p: me, label: 'Ich' }, { p: other, label: oName }]
        return (
            <section className={styles.screen}>
                {head}
                <div className={styles.scroll}>
                    <div className={styles.tags} style={{ marginTop: 14 }}>
                        <span className={styles.chip}>{TYPE_ICON.who}{TYPE_LABEL.who}</span>
                        <span className={styles.tagMuted}>{catLabel(q)} · ihr antwortet beide</span>
                    </div>
                    <h1 className={styles.question}><WithName text={q.own} name={oName} /></h1>
                    <div className={`${styles.pairGrid} ${styles.whoGrid}`} role="radiogroup" aria-label="Wer?">
                        {people.map(({ p, label }, i) => (
                            <button key={i} type="button" role="radio" aria-checked={sel === i}
                                className={`${styles.btn} ${styles.tile} ${styles.whoTile} ${sel === i ? styles.tileOn : ''}`} onClick={() => setSel(i)}>
                                <span className={styles.whoAvatar} aria-hidden="true">{p?.emoji}</span>
                                <span className={styles.tileText}>{label}</span>
                            </button>
                        ))}
                    </div>
                    <p className={styles.whoHint}><IconInfo />Wählt ihr dieselbe Person, habt ihr die gleiche Wellenlänge.</p>
                </div>
                <div className={styles.footer}>
                    {theirNote}
                    <button type="button" className={`${styles.btn} ${sel != null ? styles.primary : styles.primaryOff}`} disabled={sel == null} onClick={sendOwn}>
                        Fertig<IconCheck size={20} />
                    </button>
                </div>
            </section>
        )
    }

    // ── Warten auf den anderen / beide fertig ───────────────────────────────
    if (step === 'wait') {
        const theirDone = revealing || (theirs.own != null && (isWho || theirs.guess != null))
        const whoText = (i) => (i == null ? '–' : i === 0 ? 'Ich' : oName)
        return (
            <section className={styles.screen}>
                {head}
                <div className={styles.scroll}>
                    <div className={styles.waitBox} role="status" aria-live="polite">
                        <div className={`${styles.waitAvatar} ${theirDone ? styles.waitAvatarDone : ''}`} aria-hidden="true">
                            {other?.emoji}
                            {theirDone && <span className={styles.waitBadge}><IconCheck size={20} w={3} /></span>}
                        </div>
                        <h1 className={styles.waitTitle}>{theirDone ? 'Beide fertig!' : `Warte auf ${oName} …`}</h1>
                        <p className={styles.waitSub}>
                            {theirDone ? 'Gleich wird aufgedeckt' : isWho ? `${oName} überlegt noch` : theirs.own == null ? `${oName} beantwortet noch die eigene Frage` : `${oName} tippt noch für dich`}
                        </p>
                        <div className={styles.statusList}>
                            <div className={styles.statusRow}>
                                <span className={styles.avatar} aria-hidden="true">{me?.emoji}</span>
                                <span className={styles.statusName}>Du</span>
                                <span className={styles.statusOk}><IconCheck size={16} w={3} />Bestätigt</span>
                            </div>
                            <div className={styles.statusRow}>
                                <span className={styles.avatar} aria-hidden="true">{other?.emoji}</span>
                                <span className={styles.statusName}>{oName}</span>
                                {theirDone
                                    ? <span className={styles.statusOk}><IconCheck size={16} w={3} />Bestätigt</span>
                                    : <span className={styles.statusWait}><span className={`${styles.dots} ${styles.dotsSm}`} aria-hidden="true"><i /><i /><i /></span>tippt noch</span>}
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.footer}>
                    {isWho ? (
                        <div className={styles.locked}>
                            <span className={styles.lockedLabel}><IconLock size={14} />Deine Wahl</span>
                            <span className={styles.lockedValue}>{whoText(own)}</span>
                        </div>
                    ) : (
                        <div className={styles.lockedGrid}>
                            <div className={styles.locked}>
                                <span className={styles.lockedLabel}><IconLock size={14} />Deine Antwort</span>
                                <span className={styles.lockedValue}>{answerText(q, own)}</span>
                            </div>
                            <div className={styles.locked}>
                                <span className={styles.lockedLabel}><IconLock size={14} />Tipp für {oName}</span>
                                <span className={styles.lockedValue}>{answerText(q, guess)}</span>
                            </div>
                        </div>
                    )}
                    {theirDone
                        ? <button type="button" className={`${styles.btn} ${styles.primary}`} disabled>Aufdeckung startet …</button>
                        : <button type="button" className={`${styles.btn} ${styles.primaryOff}`} disabled>Warte auf {oName} …</button>}
                </div>
            </section>
        )
    }

    // ── Countdown 3 – 2 – 1 – Los! (auf beiden Handys zur selben Serverzeit) ─
    if (step === 'count') {
        return (
            <section className={styles.screen}>
                {head}
                <Countdown elapsed={t - BOTH_MS} me={me} other={other} />
            </section>
        )
    }

    // ── Aufdeckung ──────────────────────────────────────────────────────────
    const iPressedNext = nextSent || !!data.round?.next?.[uid]
    const theyPressedNext = !!data.round?.next?.[other?.uid]
    const nextFooter = (
        <div className={styles.footer}>
            <p className={styles.footNote}>
                <span className={`${styles.dot} ${theyPressedNext ? styles.dotOk : ''}`} />
                {theyPressedNext ? `${oName} hat „Weiter“ gedrückt` : `${oName} schaut noch`}
            </p>
            {iPressedNext && theyPressedNext
                ? <button type="button" className={`${styles.btn} ${styles.primary}`} disabled>{idx + 1 >= total ? 'Ergebnis kommt …' : 'Nächste Frage …'}</button>
                : iPressedNext
                ? <button type="button" className={`${styles.btn} ${styles.primaryOff}`} disabled>Warte auf {oName} …</button>
                : <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={sendNext}>{idx + 1 >= total ? 'Zum Ergebnis' : 'Weiter'}<IconArrow /></button>}
        </div>
    )
    if (isWho) {
        const same = whoSame(answers, uid, other?.uid)
        const pickOf = (a, self, o) => (a == null ? null : a === 0 ? self : o)
        const mePick = pickOf(mine.own, me, other), themPick = pickOf(theirs.own, other, me)
        const name = (p) => (p?.uid === uid ? 'dich' : p?.name)
        return (
            <section className={styles.screen}>
                {head}
                <div className={styles.scroll}>
                    <p className={styles.revealMeta}>{TYPE_LABEL.who} · {catLabel(q)}</p>
                    <h1 className={styles.revealQ}><WithName text={q.own} name={oName} /></h1>
                    {same ? (
                        <div className={styles.banner} role="status">
                            <p className={styles.bannerTitle}>Gleiche Wellenlänge! 💞</p>
                            <p className={styles.bannerSub}>Ihr seid euch einig: {mePick?.uid === uid ? 'du' : mePick?.name}</p>
                        </div>
                    ) : (
                        <div className={`${styles.banner} ${styles.bannerOff}`} role="status">
                            <p className={styles.bannerTitle}>Ihr seht das anders 🤔</p>
                            <p className={styles.bannerSub}>Jeder zeigt auf jemand anderen</p>
                        </div>
                    )}
                    <h2 className={styles.answersTitle}>Eure Wahl</h2>
                    <div className={styles.answerList}>
                        {[[me, mePick], [other, themPick]].map(([p, pick]) => (
                            <div key={p?.uid} className={styles.answerRow}>
                                <span className={styles.avatar} aria-hidden="true">{p?.emoji}</span>
                                <span className={styles.answerName}>{p?.uid === uid ? 'Du' : p?.name} {p?.uid === uid ? 'zeigst' : 'zeigt'} auf</span>
                                <span className={styles.answerValue}>{pick?.emoji} {pick?.uid === p?.uid ? (p?.uid === uid ? 'dich selbst' : 'sich selbst') : name(pick)}</span>
                            </div>
                        ))}
                    </div>
                    <p className={styles.whoHint}><IconInfo />Zählt nur für euren gemeinsamen Wert, nicht für den Spielstand.</p>
                </div>
                {same && <Confetti screen seed={idx + 101} delay={0.45} />}
                {nextFooter}
            </section>
        )
    }
    const vMe = verdict(q, theirs.own, mine.guess)
    const vThem = verdict(q, mine.own, theirs.guess)
    const bothRight = vMe === 'right' && vThem === 'right'
    return (
        <section className={styles.screen}>
            {head}
            <div className={styles.scroll}>
                <p className={styles.revealMeta}>{TYPE_LABEL[q.type]} · {catLabel(q)}</p>
                <h1 className={styles.revealQ}>{q.own}</h1>
                {bothRight && (
                    <div className={styles.banner} role="status">
                        <p className={styles.bannerTitle}>Gleiche Wellenlänge! 💞</p>
                        <p className={styles.bannerSub}>Ihr habt beide richtig getippt</p>
                    </div>
                )}
                <div className={styles.cards}>
                    <RevealCard q={q} v={vMe} dir="me" from={me} to={other} guess={mine.guess} answer={theirs.own} oName={oName} confetti={!bothRight} seed={idx * 2 + 1} />
                    <RevealCard q={q} v={vThem} dir="them" from={other} to={me} guess={theirs.guess} answer={mine.own} oName={oName} confetti={!bothRight} seed={idx * 2 + 2} />
                </div>
                {q.type === 'scale' && (
                    <div className={styles.legend} aria-hidden="true">
                        <span><i className={styles.legendFill} />Antwort</span>
                        <span><i className={styles.legendRing} />Tipp</span>
                    </div>
                )}
                {(q.type === 'pick4' || q.type === 'emoji4') && (<>
                    <h2 className={styles.answersTitle}>Eure Antworten</h2>
                    <div className={styles.answerList}>
                        {[[me, mine.own], [other, theirs.own]].map(([p, a]) => (
                            <div key={p?.uid} className={styles.answerRow}>
                                <span className={styles.avatar} aria-hidden="true">{p?.emoji}</span>
                                <span className={styles.answerName}>{p?.name}</span>
                                <span className={styles.answerValue}>{answerText(q, a)}</span>
                            </div>
                        ))}
                    </div>
                </>)}
            </div>
            {bothRight && <Confetti screen seed={idx + 101} delay={0.45} />}
            {nextFooter}
        </section>
    )
}

function Countdown({ elapsed, me, other }) {
    const [start] = useState(() => Math.max(0, elapsed))   // Ring startet passend zur Serverzeit (auch nach Neuladen)
    const r = 110.5
    const len = 2 * Math.PI * r
    const left = Math.ceil((COUNT_MS - elapsed) / 1000)
    const go = elapsed >= COUNT_MS
    return (
        <div className={styles.countBox} role="status" aria-live="assertive">
            <p className={styles.countLabel}>AUFDECKUNG IN</p>
            <div className={`${styles.countRing} ${go ? styles.countRingFull : ''}`}>
                <svg viewBox="0 0 230 230" aria-hidden="true">
                    <circle className={styles.countTrack} cx="115" cy="115" r={r} />
                    {!go && <circle className={styles.countFill} cx="115" cy="115" r={r} strokeDasharray={len}
                        style={{ '--len': len, animationDelay: `-${start}ms` }} />}
                </svg>
                {go
                    ? <span className={styles.countGo}>Los!</span>
                    : <span key={left} className={styles.countNum}>{left}</span>}
            </div>
            <div className={styles.chips}>
                {[me, other].map(p => p && (
                    <span key={p.uid} className={styles.personChip}>
                        <span className={styles.avatar} aria-hidden="true">{p.emoji}</span>{p.name}<IconCheck size={16} w={3} />
                    </span>
                ))}
            </div>
        </div>
    )
}

function RevealCard({ q, v, dir, from, to, guess, answer, oName, confetti, seed }) {
    const tone = v === 'right' ? styles.rRight : v === 'close' ? styles.rClose : styles.rWrong
    const label = v === 'right' ? 'Richtig' : v === 'close' ? 'Knapp' : 'Falsch'
    const icon = v === 'right' ? <IconCheck size={20} w={3} /> : v === 'close' ? <IconMinus size={18} /> : <IconX size={18} w={3} />
    const mineDir = dir === 'me'
    const tipLabel = mineDir ? 'Dein Tipp' : `Tipp von ${oName}`
    const pointFor = mineDir ? 'dich' : oName
    let body
    if (q.type === 'scale') {
        const diff = Math.abs((answer ?? 0) - (guess ?? 0))
        body = (<>
            <div className={styles.rDots} aria-label={`Antwort ${answer + 1}, Tipp ${guess + 1}`}>
                {[0, 1, 2, 3, 4].map(i => (
                    <span key={i} className={`${styles.rDot} ${i === answer ? styles.rDotAnswer : ''} ${i === guess && i !== answer ? styles.rDotGuess : ''}`}>{i + 1}</span>
                ))}
            </div>
            <div className={styles.rLine} />
            <p className={styles.rText}>Tipp {guess + 1} · {mineDir ? `${oName}: ${answer + 1}` : `Richtig: ${answer + 1}`}</p>
            <p className={styles.rPoint} style={{ marginTop: 2 }}>
                {v === 'right' ? `+1 Punkt für ${pointFor}` : v === 'close' ? '1 daneben · +½' : `${diff} daneben · 0`}
            </p>
        </>)
    } else if (isPairLike(q)) {
        body = (<>
            {v !== 'right' && (<>
                <p className={styles.rLabel}>{tipLabel}</p>
                <p className={`${styles.rValue} ${styles.rStrike}`}>{answerText(q, guess)}</p>
            </>)}
            <div className={styles.rLine} />
            <p className={styles.rLabel}>{q.type === 'yesno' ? (mineDir ? `${oName} sagt` : 'Du sagst') : (mineDir ? `${oName} wählt` : 'Du wählst')}</p>
            <p className={styles.rValue}>{answerText(q, answer)}</p>
        </>)
    } else {
        body = v === 'right' ? (<>
            <p className={styles.rLabel}>{tipLabel}</p>
            <p className={styles.rValue}>{answerText(q, guess)}</p>
            <div className={styles.rLine} />
            <p className={styles.rPoint}>+1 Punkt für {pointFor}</p>
        </>) : (<>
            <p className={styles.rLabel}>{tipLabel}</p>
            <p className={`${styles.rValue} ${styles.rStrike}`}>{answerText(q, guess)}</p>
            <div className={styles.rLine} />
            <p className={styles.rLabel}>Richtig wäre</p>
            <p className={styles.rValue}>{answerText(q, answer)}</p>
        </>)
    }
    return (
        <div className={`${styles.rcard} ${tone}`}>
            <p className={styles.rDir}>
                <span className={styles.rEmoji} aria-hidden="true">{from?.emoji}</span>
                <span className={styles.rArrow} aria-hidden="true"><IconArrow size={12} /></span>
                <span className={styles.rEmoji} aria-hidden="true">{to?.emoji}</span>
                <span className={styles.rDirText}>{mineDir ? `Du über ${oName}` : `${oName} über dich`}</span>
            </p>
            <p className={styles.rVerdict}><span className={styles.rIcon}>{icon}</span>{label}</p>
            {body}
            {confetti && v === 'right' && <Confetti seed={seed} delay={0.3} />}
        </div>
    )
}
