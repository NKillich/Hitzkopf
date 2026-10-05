import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { getApp } from 'firebase/app'
import '../../firebase.js'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, onSnapshot } from 'firebase/firestore'
import CoverArt from '../../shared/ui/CoverArt'
import QrCode from '../../shared/ui/QrCode'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import { IconMoon, IconSun, IconBack, IconThumbUp, IconThumbDown, IconUsers, IconNote, IconStar, IconFlame, IconMic, IconClock, IconAlert, IconCheck, IconTrophy, IconExpand, IconShrink } from '../../shared/ui/icons'
import { joinLink } from './links'
import { scoreOf, voteCounts, byScore, mmss, nowPosition, queueRemainingMs, nextVotingInMs, ruleLabel, ruleEmoji, FALLBACK_DURATION } from './amplifyLogic'
import styles from './LiveBoard.module.css'

const STEPS = [
    { id: 'songwahl', label: 'Songs einreichen' },
    { id: 'abstimmung', label: 'Abstimmen' },
    { id: 'laeuft', label: 'Playlist läuft' }
]
const PHASE_CLASS = { songwahl: 'lbCollect', abstimmung: 'lbVote', laeuft: 'lbLive' }
const FLASH_TEXT = { songwahl: 'Jetzt Songs einreichen!', abstimmung: 'Jetzt abstimmen!', laeuft: 'Die Gewinner laufen!' }

// Bühne: im Querformat wird das Board für 1600 × 900 gebaut und als Ganzes auf das Fenster skaliert –
// so passt auf jedem Bildschirm (TV, Beamer, Laptop, Tablet quer) alles ohne Scrollen hinein.
const STAGE_W = 1600
const STAGE_H = 900
const calcStage = () => {
    const w = window.innerWidth, h = window.innerHeight
    return w >= 900 && w / h >= 1.2 ? { scale: Math.min(w / STAGE_W, h / STAGE_H) } : null
}
// Plätze pro Liste auf der Bühne (mehr → automatisch blättern)
const STAGE_RANK_ROWS = 5
const STAGE_QUEUE_ROWS = 3
const PAGE_MS = 8000

/** Blättert eine lange Liste automatisch weiter (Seite 1/3 …) */
function usePager(count, perPage, enabled) {
    const pages = enabled ? Math.max(1, Math.ceil(count / perPage)) : 1
    const [page, setPage] = useState(0)
    useEffect(() => {
        if (pages <= 1) return
        const id = setInterval(() => setPage(p => p + 1), PAGE_MS)
        return () => clearInterval(id)
    }, [pages])
    return { page: page % pages, pages }
}

const hoursMinutes = (ms) => {
    const min = Math.round((ms || 0) / 60000)
    if (min < 60) return `${min} Min.`
    return `${Math.floor(min / 60)} Std. ${min % 60} Min.`
}
const firstArtist = (a) => String(a || '').split(',')[0].trim()

// Fun Facts aus dem Verlauf (gespielte Songs) und dem aktuellen Stand
function buildFacts(history, players, pool) {
    const facts = []
    if (history.length) {
        const totalMs = history.reduce((s, h) => s + (h.durationMs || 0), 0)
        facts.push({ icon: <IconNote size={20} />, label: 'Bisher gelaufen', value: `${history.length} ${history.length === 1 ? 'Song' : 'Songs'}`, sub: totalMs ? hoursMinutes(totalMs) + ' Musik' : null })

        const byArtist = {}
        history.forEach(h => { const a = firstArtist(h.artist); if (a) byArtist[a] = (byArtist[a] || 0) + 1 })
        const [topArtist, artistCount] = Object.entries(byArtist).sort((a, b) => b[1] - a[1])[0] || []
        if (topArtist && artistCount > 1) facts.push({ icon: <IconMic size={20} />, label: 'Meistgespielt', value: topArtist, sub: `${artistCount}× gelaufen` })

        const best = [...history].sort((a, b) => (b.score || 0) - (a.score || 0))[0]
        if (best && best.score > 0) facts.push({ icon: <IconStar size={20} />, label: 'Beliebtester Song', value: best.title, sub: `+${best.score} · von ${best.addedBy}` })

        const controversial = [...history].filter(h => h.up > 0 && h.down > 0).sort((a, b) => Math.min(b.up, b.down) - Math.min(a.up, a.down))[0]
        if (controversial) facts.push({ icon: <IconFlame size={20} />, label: 'Umstrittenster Song', value: controversial.title, sub: `${controversial.up}× hoch · ${controversial.down}× runter` })

        const byDj = {}
        history.forEach(h => { if (h.addedBy) byDj[h.addedBy] = (byDj[h.addedBy] || 0) + 1 })
        const [topDj, djCount] = Object.entries(byDj).sort((a, b) => b[1] - a[1])[0] || []
        if (topDj && djCount > 1) facts.push({ icon: <IconUsers size={20} />, label: 'Bester DJ', value: topDj, sub: `${djCount} Songs gelaufen` })
    }
    if (facts.length < 4) facts.push({ icon: <IconUsers size={20} />, label: 'Dabei', value: `${players} ${players === 1 ? 'Person' : 'Leute'}`, sub: null })
    if (facts.length < 4) facts.push({ icon: <IconNote size={20} />, label: 'Im Rennen', value: `${pool} ${pool === 1 ? 'Song' : 'Songs'}`, sub: 'für die nächste Runde' })
    return facts.slice(0, 4)
}

/** Platzwechsel weich animieren (FLIP): alte Position merken, neue messen, Differenz zurückgleiten lassen */
function useFlip(orderKey, scale = 1) {
    const nodes = useRef(new Map())
    const lastTops = useRef(new Map())
    useLayoutEffect(() => {
        const tops = new Map()
        nodes.current.forEach((el, k) => tops.set(k, el.getBoundingClientRect().top))
        tops.forEach((top, k) => {
            const before = lastTops.current.get(k)
            const el = nodes.current.get(k)
            if (before == null || !el || Math.abs(before - top) < 1) return
            el.style.transition = 'none'
            // Auf der skalierten Bühne sind gemessene Pixel größer/kleiner als die inneren
            el.style.transform = `translateY(${(before - top) / scale}px)`
            requestAnimationFrame(() => {
                el.style.transition = 'transform 0.6s cubic-bezier(.2, .8, .2, 1)'
                el.style.transform = ''
            })
        })
        lastTops.current = tops
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderKey])
    return (key) => (el) => { if (el) nodes.current.set(key, el); else nodes.current.delete(key) }
}

export default function LiveBoard({ roomCode, onBack }) {
    const { isDark, toggleTheme } = useTheme()
    const [code, setCode] = useState(roomCode || '')
    const [codeDraft, setCodeDraft] = useState('')
    const [data, setData] = useState(null)
    const [status, setStatus] = useState(roomCode ? 'loading' : 'nocode')   // nocode | loading | ok | missing | error
    const [clock, setClock] = useState(() => Date.now())   // Uhrzeit für Fortschritt und Countdowns
    const [flash, setFlash] = useState(null)               // kurze Farbwelle beim Phasenwechsel
    const [reveal, setReveal] = useState(null)             // Gewinner-Enthüllung
    const lastPhaseRef = useRef(null)
    const seenResultRef = useRef(null)
    const [stage, setStage] = useState(calcStage)
    const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement)

    // Bühne an Fenstergröße anpassen; Vollbild-Status mitverfolgen
    useEffect(() => {
        const onResize = () => setStage(calcStage())
        const onFs = () => setFullscreen(!!document.fullscreenElement)
        window.addEventListener('resize', onResize)
        document.addEventListener('fullscreenchange', onFs)
        return () => { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs) }
    }, [])
    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.()
        else document.documentElement.requestFullscreen?.().catch(() => { /* z. B. iOS: kein Vollbild */ })
    }

    // Lobby live mitlesen (anonymer Login reicht laut Firestore-Regeln, kein Beitritt)
    useEffect(() => {
        if (!code) return
        let unsub = null
        let cancelled = false
        ;(async () => {
            try {
                const auth = getAuth(getApp())
                await auth.authStateReady()
                if (!auth.currentUser) await signInAnonymously(auth)
                if (cancelled) return
                unsub = onSnapshot(doc(getFirestore(getApp()), 'musicVoterLobbies', code), (snap) => {
                    if (snap.exists() && (snap.data().status ?? 'active') === 'active') {
                        const next = snap.data()
                        // Phasenwechsel und neue Ergebnisse erkennen (nicht beim ersten Laden)
                        const phase = next.lobbyPhase || 'songwahl'
                        if (lastPhaseRef.current && lastPhaseRef.current !== phase) setFlash({ phase, key: Date.now() })
                        lastPhaseRef.current = phase
                        const res = next.lastResult
                        if (seenResultRef.current === null) seenResultRef.current = res?.round ?? 0
                        else if (res && res.round !== seenResultRef.current) {
                            seenResultRef.current = res.round
                            if (Date.now() - res.at < 60000) setReveal(res)
                        }
                        setData(next)
                        setStatus('ok')
                    }
                    else { setData(null); setStatus('missing') }
                }, () => setStatus('error'))
            } catch {
                if (!cancelled) setStatus('error')
            }
        })()
        return () => { cancelled = true; unsub?.() }
    }, [code])

    useEffect(() => {
        const id = setInterval(() => setClock(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        if (!flash) return
        const id = setTimeout(() => setFlash(null), 1800)
        return () => clearTimeout(id)
    }, [flash])
    useEffect(() => {
        if (!reveal) return
        const id = setTimeout(() => setReveal(null), 15000)
        return () => clearTimeout(id)
    }, [reveal])

    // Bildschirm wach halten (Tablet/TV als Dauer-Anzeige)
    useEffect(() => {
        let lock = null
        const request = async () => {
            try { lock = await navigator.wakeLock?.request('screen') } catch { /* nicht unterstützt */ }
        }
        const onVisible = () => { if (document.visibilityState === 'visible') request() }
        request()
        document.addEventListener('visibilitychange', onVisible)
        return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release?.() }
    }, [])

    const playlist = data?.playlist || []
    const pool = playlist.filter(i => i.queuedRound == null)
    const ranked = [...pool].sort(byScore)
    const phase = data?.lobbyPhase || 'songwahl'
    const isVoting = phase === 'abstimmung'
    const listAll = isVoting ? ranked : [...pool].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    const pager = usePager(listAll.length, STAGE_RANK_ROWS, !!stage)
    const pageStart = stage ? pager.page * STAGE_RANK_ROWS : 0
    const visibleList = stage ? listAll.slice(pageStart, pageStart + STAGE_RANK_ROWS) : listAll
    const setRowRef = useFlip(isVoting ? visibleList.map(i => i.id).join('|') + '#' + pager.page : 'off', stage?.scale || 1)

    const openCode = (e) => {
        e.preventDefault()
        const c = codeDraft.trim().toUpperCase()
        if (!/^[A-Z0-9]{4,10}$/.test(c)) return
        window.history.replaceState(null, '', `#live/${c}`)
        setStatus('loading')
        setCode(c)
    }

    const themeLabel = isDark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'
    const topButtons = (
        <div className={styles.lbTopButtons}>
            <button type="button" className={styles.lbIconBtn} onClick={onBack} aria-label="Zum Menü" title="Zum Menü"><IconBack /></button>
            <button type="button" className={styles.lbIconBtn} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>{isDark ? <IconSun /> : <IconMoon />}</button>
            {document.fullscreenEnabled && (
                <button type="button" className={styles.lbIconBtn} onClick={toggleFullscreen} aria-label={fullscreen ? 'Vollbild beenden' : 'Vollbild'} title={fullscreen ? 'Vollbild beenden (Esc)' : 'Vollbild'}>
                    {fullscreen ? <IconShrink /> : <IconExpand />}
                </button>
            )}
        </div>
    )

    if (status !== 'ok') {
        return (
            <div className={`${styles.lbRoot} ${isDark ? theme.dark : theme.light}`}>
                <div className={styles.lbCenter}>
                    {topButtons}
                    <span className={styles.lbBigEmoji} aria-hidden="true">📺</span>
                    <h1 className={styles.lbCenterTitle}>Amplify Live</h1>
                    {status === 'loading' && <p className={styles.lbMuted}>Playlist {code} wird geladen …</p>}
                    {status === 'missing' && <p className={styles.lbMuted}>Die Playlist {code} gibt es nicht (mehr). Vielleicht wurde sie geschlossen.</p>}
                    {status === 'error' && <p className={styles.lbMuted}><IconAlert size={18} /> Verbindung fehlgeschlagen. Prüf das Internet und lade die Seite neu.</p>}
                    {(status === 'nocode' || status === 'missing') && (
                        <form className={styles.lbCodeForm} onSubmit={openCode}>
                            <label htmlFor="lb-code" className={styles.lbMuted}>Raumcode der Playlist</label>
                            <div className={styles.lbCodeRow}>
                                <input id="lb-code" className={styles.lbCodeInput} value={codeDraft} onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                                    placeholder="ABC123" maxLength={10} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
                                <button type="submit" className={styles.lbCodeBtn} disabled={!/^[A-Z0-9]{4,10}$/.test(codeDraft.trim())}>Anzeigen</button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        )
    }

    const history = data.history || []
    const players = Object.keys(data.players || {}).length
    const batchSize = data.batchSize || 10
    const now = data.nowPlaying
    const nowPos = nowPosition(now, clock)
    const nowItem = now ? playlist.find(i => i.spotifyId === now.trackId) : null
    const queue = playlist.filter(i => i.queuedRound != null && i.spotifyId !== now?.trackId).sort(byScore)
    const maxAbs = Math.max(1, ...pool.map(i => { const c = voteCounts(i); return Math.max(c.up, c.down) }))
    const votingLeft = isVoting && data.phaseEndsAt ? Math.max(0, data.phaseEndsAt - clock) : 0
    const voters = new Set(pool.flatMap(i => Object.entries(i.votes || {}).filter(([, v]) => v !== 0).map(([n]) => n))).size
    const totalVotes = pool.reduce((s, i) => s + Object.values(i.votes || {}).filter(v => v !== 0).length, 0)
    const facts = buildFacts(history, players, pool.length)
    const playedIds = new Set(history.map(h => h.spotifyId).filter(Boolean))
    const waiting = !!data.pendingBatch
    const remaining = queueRemainingMs(data, clock)
    const nextVoting = nextVotingInMs(data, clock)
    const rule = data.roundRule

    // Fortschritt der aktiven Phase (0–1)
    let progress = null
    if (isVoting && data.phaseEndsAt) {
        const start = data.phaseStartedAt || (data.phaseEndsAt - (data.votingDurationSec || 120) * 1000)
        progress = Math.min(1, Math.max(0, (clock - start) / (data.phaseEndsAt - start)))
    } else if (phase === 'laeuft' && remaining != null) {
        const queuedRounds = playlist.filter(i => i.queuedRound != null).map(i => i.queuedRound)
        const round = queuedRounds.length ? Math.min(...queuedRounds) : null
        const played = history.filter(h => h.round === round).reduce((s, h) => s + (h.durationMs || FALLBACK_DURATION), 0)
            + (nowItem ? nowPos : 0)
        progress = played + remaining > 0 ? Math.min(1, played / (played + remaining)) : null
    }

    // Kopf an Kopf: gleiche Punkte wie ein Nachbar (mit Stimmen) – und an der Grenze "kommt weiter"
    const hasVotes = (it) => !!it && Object.values(it.votes || {}).some(v => v !== 0)
    const tied = (i) => {
        const s = scoreOf(ranked[i])
        return [ranked[i - 1], ranked[i + 1]].some(n => n && scoreOf(n) === s && (hasVotes(n) || hasVotes(ranked[i])))
    }
    const cutTie = isVoting && ranked.length > batchSize && scoreOf(ranked[batchSize - 1]) === scoreOf(ranked[batchSize])
        && (hasVotes(ranked[batchSize]) || hasVotes(ranked[batchSize - 1]))

    // Großes Aufforderungs-Banner
    let banner
    if (isVoting) {
        banner = { title: 'Jetzt abstimmen!', timer: votingLeft > 0 ? mmss(votingLeft) : null, urgent: votingLeft > 0 && votingLeft <= 15000, sub: votingLeft > 0 ? `${voters} von ${players} haben abgestimmt · ${totalVotes} ${totalVotes === 1 ? 'Stimme' : 'Stimmen'}` : 'Wird ausgewertet …' }
    } else if (phase === 'laeuft') {
        if (waiting) banner = { title: 'Gleich geht’s los', sub: 'Die Gewinner warten auf Spotify …' }
        else banner = {
            title: nextVoting != null && nextVoting > 0 ? 'Nächste Runde: Songs einreichen!' : 'Die Playlist läuft',
            lines: [remaining != null ? ['Noch Musik', mmss(remaining)] : null, nextVoting != null ? ['Nächste Abstimmung', nextVoting > 0 ? `in ${mmss(nextVoting)}` : 'gleich'] : null].filter(Boolean),
            sub: pool.length ? `${pool.length} ${pool.length === 1 ? 'Song' : 'Songs'} im Rennen` : 'Noch keine Songs für die nächste Runde'
        }
    } else {
        banner = { title: 'Jetzt Songs einreichen!', sub: `${pool.length} ${pool.length === 1 ? 'Song' : 'Songs'} im Rennen · der Host startet gleich die Abstimmung`, qr: true }
    }

    const queueRows = stage ? STAGE_QUEUE_ROWS : 6
    const stepIndex = STEPS.findIndex(s => s.id === phase)

    return (
        <div className={`${styles.lbRoot} ${isDark ? theme.dark : theme.light} ${styles[PHASE_CLASS[phase]]} ${stage ? styles.lbStageMode : ''}`}>
            <div className={stage ? styles.lbStage : styles.lbFlow} style={stage ? { width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${stage.scale})` } : undefined}>
            <div className={styles.lbBoard}>
                <header className={styles.lbTop}>
                    {topButtons}
                    <div className={styles.lbBrand}>
                        <span className={styles.lbLogo}>Amplify <span>Live</span></span>
                        <span className={styles.lbMeta}>Playlist von {data.host} · <IconUsers size={14} /> {players} dabei</span>
                    </div>
                    <ol className={styles.lbSteps} aria-label="Ablauf">
                        {STEPS.map((s, i) => (
                            <li key={s.id} className={`${styles.lbStep} ${i === stepIndex ? styles.lbStepOn : ''} ${i < stepIndex ? styles.lbStepDone : ''}`} aria-current={i === stepIndex ? 'step' : undefined}>
                                <span className={styles.lbStepLabel}>{i < stepIndex ? <IconCheck size={14} /> : <span className={styles.lbStepNo}>{i + 1}</span>}{s.label}</span>
                                <span className={styles.lbStepBar}>
                                    <span className={progress == null && i === stepIndex ? styles.lbStepIndeterminate : ''}
                                        style={{ width: i < stepIndex ? '100%' : i === stepIndex ? `${Math.round((progress ?? 0) * 100)}%` : '0%' }} />
                                </span>
                            </li>
                        ))}
                    </ol>
                    <div className={styles.lbJoin}>
                        <QrCode text={joinLink(code)} size={76} label={`QR-Code zum Mitmachen, Raumcode ${code}`} />
                        <span className={styles.lbJoinText}>
                            <span className={styles.lbJoinLabel}>Mitmachen</span>
                            <span className={styles.lbJoinCode}>{code}</span>
                        </span>
                    </div>
                </header>

                <section className={`${styles.lbCall} ${banner.urgent ? styles.lbCallUrgent : ''}`} aria-live="polite">
                    <div className={styles.lbCallText}>
                        <h1 className={styles.lbCallTitle}>{banner.title}</h1>
                        <p className={styles.lbCallSub}>
                            {rule && <span className={styles.lbRule}>{ruleEmoji(rule)} {ruleLabel(rule)}</span>}
                            {banner.sub}
                        </p>
                    </div>
                    {banner.timer && <span className={styles.lbCallTimer} role="timer">{banner.timer}</span>}
                    {banner.lines?.length > 0 && (
                        <div className={styles.lbCallLines}>
                            {banner.lines.map(([label, value]) => (
                                <span key={label} className={styles.lbCallLine}><span>{label}</span><strong>{value}</strong></span>
                            ))}
                        </div>
                    )}
                    {banner.qr && (
                        <div className={styles.lbCallQr}>
                            <QrCode text={joinLink(code)} size={112} label={`QR-Code zum Mitmachen, Raumcode ${code}`} />
                        </div>
                    )}
                </section>

                <main className={styles.lbGrid}>
                    <section className={styles.lbNowCol} aria-label="Läuft gerade">
                        {now ? (
                            <div className={styles.lbNow}>
                                <div className={styles.lbNowCover}>
                                    <CoverArt src={now.imageUrl} seed={now.trackId} size={240} radius={22} />
                                </div>
                                <div className={styles.lbNowText}>
                                    <span className={styles.lbKicker}>{now.isPlaying ? 'Läuft gerade' : 'Pausiert'}</span>
                                    <h2 className={styles.lbNowTitle}>{now.trackName}</h2>
                                    <p className={styles.lbNowArtist}>{now.artist}</p>
                                    {nowItem?.addedBy && <p className={styles.lbBy}>eingereicht von <strong>{nowItem.addedBy}</strong></p>}
                                    <div className={styles.lbBar} aria-hidden="true"><span style={{ width: `${now.durationMs ? Math.min(100, (nowPos / now.durationMs) * 100) : 0}%` }} /></div>
                                    <div className={styles.lbTimes}><span>{mmss(nowPos)}</span><span>{mmss(now.durationMs)}</span></div>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.lbNowEmpty}>
                                <span className={styles.lbEmptyIcon}><IconNote size={28} /></span>
                                <p className={styles.lbNowEmptyTitle}>{waiting ? 'Gleich geht’s los' : 'Gerade läuft nichts'}</p>
                                <p className={styles.lbMuted}>{waiting ? 'Die Gewinner warten darauf, dass Spotify startet.' : 'Sobald der Host abspielt, erscheint der Song hier.'}</p>
                            </div>
                        )}

                        <div className={styles.lbSection}>
                            <h2 className={styles.lbSectionTitle}>Als Nächstes <span>{queue.length}</span></h2>
                            {queue.length === 0 ? (
                                <p className={styles.lbMuted}>Die Warteschlange ist leer – die nächste Abstimmung füllt sie.</p>
                            ) : (
                                <ol className={styles.lbQueue}>
                                    {queue.slice(0, queueRows).map((item, i) => (
                                        <li key={item.id} className={styles.lbQueueItem}>
                                            <span className={styles.lbQueueRank}>{i + 1}</span>
                                            <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={44} radius={9} />
                                            <span className={styles.lbText}>
                                                <span className={styles.lbTitle}>{item.title}</span>
                                                <span className={styles.lbSub}>{item.artist} · von {item.addedBy}</span>
                                            </span>
                                        </li>
                                    ))}
                                    {queue.length > queueRows && <li className={styles.lbMore}>+ {queue.length - queueRows} weitere</li>}
                                </ol>
                            )}
                        </div>
                    </section>

                    <section className={styles.lbPanel} aria-label={isVoting ? 'Live-Abstimmung' : 'Eingereichte Songs'}>
                        <div className={styles.lbPanelHead}>
                            <h2 className={styles.lbPanelTitle}>{isVoting ? 'Live-Abstimmung' : 'Im Rennen für die nächste Runde'}</h2>
                            <span className={styles.lbPanelMeta}>
                                {isVoting ? `Top ${batchSize} kommen in die Warteschlange` : `${pool.length} ${pool.length === 1 ? 'Song' : 'Songs'} eingereicht`}
                                {cutTie && <span className={styles.lbTieBanner}>Kopf an Kopf um Platz {batchSize}!</span>}
                                {pager.pages > 1 && <span className={styles.lbPage}>Seite {pager.page + 1}/{pager.pages}</span>}
                            </span>
                        </div>
                        {listAll.length === 0 ? (
                            <div className={styles.lbNowEmpty}>
                                <span className={styles.lbEmptyIcon}><IconNote size={28} /></span>
                                <p className={styles.lbNowEmptyTitle}>Noch keine Songs</p>
                                <p className={styles.lbMuted}>Scanne den QR-Code und reich den ersten Song ein.</p>
                            </div>
                        ) : (
                            <ol key={pager.page} className={`${styles.lbRank} ${pager.pages > 1 ? styles.lbRankPaged : ''}`}>
                                {visibleList.map((item, idx) => {
                                    const i = pageStart + idx
                                    const { up, down } = voteCounts(item)
                                    const score = scoreOf(item)
                                    const inTop = isVoting && i < batchSize
                                    return (
                                        <li key={item.id} ref={isVoting ? setRowRef(item.id) : undefined}
                                            className={`${styles.lbRankItem} ${inTop ? styles.lbRankTop : ''} ${isVoting && i === batchSize ? styles.lbRankCut : ''}`}>
                                            {isVoting && <span className={styles.lbPos}>{i + 1}</span>}
                                            <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={52} radius={11} />
                                            <span className={styles.lbText}>
                                                <span className={styles.lbTitle}>{item.title}</span>
                                                <span className={styles.lbSub}>{playedIds.has(item.spotifyId) && <span className={styles.lbPlayed}>Lief schon</span>}{item.artist} · von <strong>{item.addedBy}</strong></span>
                                                {isVoting && (
                                                    <span className={styles.lbVotes} aria-label={`${up} Daumen hoch, ${down} Daumen runter`}>
                                                        <span className={styles.lbVoteUp} style={{ width: `${(up / maxAbs) * 50}%` }} />
                                                        <span className={styles.lbVoteDown} style={{ width: `${(down / maxAbs) * 50}%` }} />
                                                    </span>
                                                )}
                                            </span>
                                            {isVoting && tied(i) && <span className={styles.lbTie}>Kopf an Kopf</span>}
                                            {isVoting && (
                                                <span className={styles.lbScoreBox}>
                                                    <span key={score} className={styles.lbScore}>{score > 0 ? '+' : ''}{score}</span>
                                                    <span className={styles.lbCounts}><IconThumbUp size={13} />{up} <IconThumbDown size={13} />{down}</span>
                                                </span>
                                            )}
                                        </li>
                                    )
                                })}
                            </ol>
                        )}
                    </section>
                </main>

                <footer className={styles.lbFacts} aria-label="Fun Facts">
                    {facts.map(f => (
                        <div key={f.label} className={styles.lbFact}>
                            <span className={styles.lbFactIcon}>{f.icon}</span>
                            <span className={styles.lbText}>
                                <span className={styles.lbFactLabel}>{f.label}</span>
                                <span className={styles.lbFactValue}>{f.value}</span>
                                {f.sub && <span className={styles.lbSub}>{f.sub}</span>}
                            </span>
                        </div>
                    ))}
                    {history.length === 0 && (
                        <div className={`${styles.lbFact} ${styles.lbFactHint}`}>
                            <span className={styles.lbFactIcon}><IconClock size={20} /></span>
                            <span className={styles.lbSub}>Mehr Fun Facts erscheinen, sobald die ersten Songs gelaufen sind.</span>
                        </div>
                    )}
                </footer>
            </div>
            </div>

            {flash && (
                <div key={flash.key} className={`${styles.lbFlash} ${styles[PHASE_CLASS[flash.phase]]}`} aria-hidden="true">
                    <span>{FLASH_TEXT[flash.phase]}</span>
                </div>
            )}

            {reveal && (
                <div className={styles.lbReveal} role="dialog" aria-label={`Runde ${reveal.round}: die Gewinner`} onClick={() => setReveal(null)}>
                    <div className={styles.lbRevealInner}>
                        <span className={styles.lbRevealKicker}><IconTrophy size={26} />Runde {reveal.round} ist entschieden</span>
                        <h2 className={styles.lbRevealTitle}>Die Gewinner</h2>
                        <ol className={styles.lbPodium}>
                            {reveal.top.map((t, i) => (
                                <li key={t.spotifyId || i} className={`${styles.lbPodiumItem} ${styles[`lbPlace${i + 1}`]}`} style={{ animationDelay: `${0.5 + (reveal.top.length - 1 - i) * 1.1}s` }}>
                                    <span className={styles.lbPodiumPlace}>{i + 1}</span>
                                    <CoverArt src={t.imageUrl} seed={t.spotifyId || t.title} size={i === 0 ? 200 : 150} radius={20} />
                                    <span className={styles.lbPodiumTitle}>{t.title}</span>
                                    <span className={styles.lbPodiumBy}>von <strong>{t.addedBy}</strong></span>
                                    <span className={styles.lbPodiumScore}>{t.score > 0 ? '+' : ''}{t.score} <small>({t.up}× hoch{t.down ? ` · ${t.down}× runter` : ''})</small></span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            )}
        </div>
    )
}
