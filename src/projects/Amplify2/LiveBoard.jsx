import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react'
import { getApp } from 'firebase/app'
import '../../firebase.js'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, onSnapshot } from 'firebase/firestore'
import CoverArt from '../../shared/ui/CoverArt'
import QrCode from '../../shared/ui/QrCode'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import { IconMoon, IconSun, IconBack, IconUsers, IconNote, IconStar, IconFlame, IconMic, IconClock, IconAlert, IconTrophy, IconWave, IconLock, IconExpand, IconShrink } from '../../shared/ui/icons'
import { joinLink } from './links'
import { scoreOf, voteCounts, byScore, mmss, nowPosition, nextRoundInMs, ruleLabel, ruleEmoji, currentRoundNo, liveNowPlaying, upcomingQueue, DEFAULT_BATCH, isNew } from './amplifyLogic'
import ReactionRain from './ReactionRain'
import { IconArrowUp, IconArrowDown } from './icons'
import styles from './LiveBoard.module.css'

// Bühne: im Querformat wird das Board für 1600 × 900 gebaut und als Ganzes auf das Fenster skaliert –
// so passt auf jedem Bildschirm (TV, Beamer, Laptop, Tablet quer) alles ohne Scrollen hinein.
const STAGE_W = 1600
const STAGE_H = 900
const STAGE_W_MAX = 2100   // ab ~21:9 nicht weiter dehnen
const STAGE_H_MAX = 1250   // ab ~5:4 nicht weiter strecken
const calcStage = () => {
    const W = window.innerWidth, H = window.innerHeight
    if (W < 900 || W / H < 1.2) return null
    // Gleiche Skalierung wie vorher, aber die Fläche bekommt das Seitenverhältnis des Fensters → keine Seitenränder
    const scale = Math.min(W / STAGE_W, H / STAGE_H)
    return { scale, w: Math.round(Math.min(W / scale, STAGE_W_MAX)), h: Math.round(Math.min(H / scale, STAGE_H_MAX)) }
}
const hoursMinutes = (ms) => {
    const min = Math.round((ms || 0) / 60000)
    if (min < 60) return `${min} Min.`
    return `${Math.floor(min / 60)} Std. ${min % 60} Min.`
}
const firstArtist = (a) => String(a || '').split(',')[0].trim()

// Fun Facts aus dem Verlauf (gespielte Songs) und dem aktuellen Stand
function buildFacts(history, players, pool, data) {
    const facts = []
    if (data?.streakEnabled) {
        const [name, st] = Object.entries(data.streaks || {}).filter(([n]) => data.players?.[n]).sort((a, b) => (b[1].current || 0) - (a[1].current || 0))[0] || []
        if (name && st.current > 0) facts.push({ icon: <span aria-hidden="true">🔥</span>, label: 'Streak', value: name, sub: st.current === 1 ? 'Platz-1-Hit in der letzten Runde' : `${st.current}× Platz 1 in Folge` })
    }
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
    const roundsDone = currentRoundNo(data)
    if (roundsDone > 0 && facts.length < 4) facts.push({ icon: <IconTrophy size={20} />, label: 'Gespielt', value: `${roundsDone} ${roundsDone === 1 ? 'Runde' : 'Runden'}`, sub: 'heute Abend' })
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

export default function LiveBoard2({ roomCode, onBack }) {
    const { isDark, toggleTheme } = useTheme()
    const [code, setCode] = useState(roomCode || '')
    const [codeDraft, setCodeDraft] = useState('')
    const [data, setData] = useState(null)
    const [status, setStatus] = useState(roomCode ? 'loading' : 'nocode')   // nocode | loading | ok | missing | error
    const [clock, setClock] = useState(() => Date.now())   // Uhrzeit für Fortschritt und Countdowns
    const [reveal, setReveal] = useState(null)             // Siegeranimation, wenn eine Runde an Spotify geht
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
                unsub = onSnapshot(doc(getFirestore(getApp()), 'amplify2Lobbies', code), (snap) => {
                    if (snap.exists() && (snap.data().status ?? 'active') === 'active') {
                        const next = snap.data()
                        // Neue Runde erkennen (nicht beim ersten Laden)
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
    const queueAll = data ? upcomingQueue(data, clock) : []
    const setRowRef = useFlip(ranked.slice(0, 10).map(i => i.id).join('|'), stage?.scale || 1)

    const openCode = (e) => {
        e.preventDefault()
        const c = codeDraft.trim().toUpperCase()
        if (!/^[A-Z0-9]{4,10}$/.test(c)) return
        window.history.replaceState(null, '', `#live2/${c}`)
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
                    <h1 className={styles.lbCenterTitle}>Amplify 2.0 Live</h1>
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
    const batchSize = data.batchSize || DEFAULT_BATCH
    const round = currentRoundNo(data)
    // Hochgerechnet, falls das Host-Gerät gerade im Hintergrund ist und keinen Songwechsel meldet
    const now = liveNowPlaying(data, clock)
    const nowPos = nowPosition(now, clock)
    const nowItem = now ? playlist.find(i => i.spotifyId === now.trackId) : null
    const queue = queueAll
    const facts = buildFacts(history, players, pool.length, data)
    const playedIds = new Set(history.map(h => h.spotifyId).filter(Boolean))
    const waiting = !!data.pendingBatch
    const nextRound = nextRoundInMs(data, clock)
    const rule = data.roundRule

    // Im Voting: die Top 10 – die besten N kommen weiter (grün). Neue Songs dahinter bekommen eine eigene Zeile.
    const top10 = ranked.slice(0, 10)
    const newcomers = ranked.slice(10).filter(i => isNew(i, clock)).slice(0, 6)
    const live = !!now?.isPlaying
    const emojiOf = (name) => data.players?.[name]?.emoji || '🙂'
    const cover = (src, seed, by, size) => (
        <span className={styles.lb2Cover} style={{ width: size, height: size }}>
            <CoverArt src={src} seed={seed} size={size} radius={Math.round(size * 0.22)} />
            {by && <span className={styles.lb2Badge} title={`von ${by}`}>{emojiOf(by)}</span>}
        </span>
    )
    const queueShown = queue.slice(0, 4)

    return (
        <div className={`${styles.lbRoot} ${isDark ? theme.dark : theme.light} ${stage ? styles.lbStageMode : ''}`}>
            <div className={stage ? styles.lbStage : styles.lbFlow} style={stage ? { width: stage.w, height: stage.h, transform: `translate(-50%, -50%) scale(${stage.scale})` } : undefined}>
            <div className={styles.lbBoard}>
                <header className={styles.lb2Top}>
                    {topButtons}
                    <div className={styles.lb2Brand}>
                        <span className={styles.lb2Logo}>Amplify <span>Live</span></span>
                        <span className={styles.lb2Sub}>
                            <span className={`${styles.lb2Dot} ${live ? styles.lb2DotLive : ''}`} aria-hidden="true" />
                            Gemeinsame Playlist{live ? ' · Live' : ''} · von {data.host} · <IconUsers size={14} /> {players} dabei
                        </span>
                    </div>
                    {rule && <span className={styles.lb2Chip}>{ruleEmoji(rule)} {ruleLabel(rule)}</span>}
                    {round > 0 && nextRound != null && !waiting && (
                        <span className={styles.lb2Chip}>Nächste Runde <strong>{nextRound > 0 ? mmss(nextRound) : (pool.length ? 'gleich' : 'sobald Songs da sind')}</strong></span>
                    )}
                    <div className={styles.lbJoin}>
                        <QrCode text={joinLink(code)} size={92} label={`QR-Code zum Mitmachen, Raumcode ${code}`} />
                        <span className={styles.lbJoinText}>
                            <span className={styles.lbJoinLabel}>Mitmachen</span>
                            <span className={styles.lbJoinCode}>{code}</span>
                        </span>
                    </div>
                </header>

                <main className={styles.lb2Grid}>
                    <div className={styles.lb2Left}>
                        {now ? (
                            <section className={styles.lb2Now} aria-label="Läuft gerade">
                                <div className={styles.lb2NowRow}>
                                    {cover(now.imageUrl, now.trackId, nowItem?.addedBy, 150)}
                                    <div className={styles.lb2Text}>
                                        <span className={styles.lb2NowTag}>{now.isPlaying ? <><IconWave size={16} />Läuft</> : 'Pausiert'}</span>
                                        <h2 className={styles.lb2NowTitle}>{now.trackName}</h2>
                                        <span className={styles.lb2NowArtist}>{now.artist}</span>
                                        {nowItem?.addedBy && <span className={styles.lb2By}>{emojiOf(nowItem.addedBy)} {nowItem.addedBy}</span>}
                                    </div>
                                </div>
                                <div className={styles.lb2Progress}>
                                    <span>{mmss(nowPos)}</span>
                                    <span className={styles.lb2Bar} aria-hidden="true"><span style={{ width: `${now.durationMs ? Math.min(100, (nowPos / now.durationMs) * 100) : 0}%` }} /></span>
                                    <span>{mmss(now.durationMs)}</span>
                                </div>
                            </section>
                        ) : (
                            <section className={`${styles.lb2Now} ${styles.lb2NowIdle}`}>
                                <span className={styles.lbEmptyIcon}><IconNote size={28} /></span>
                                <p className={styles.lb2NowTitle}>{round === 0 ? 'Gleich geht’s los' : waiting ? 'Die Runde geht an Spotify' : 'Gerade läuft nichts'}</p>
                                <p className={styles.lbMuted}>{round === 0 ? 'QR-Code scannen, Songs vorschlagen und voten.' : 'Sobald der Host abspielt, erscheint der Song hier.'}</p>
                            </section>
                        )}

                        {queue.length > 0 && (
                            <section className={styles.lb2Section}>
                                <div className={styles.lb2Head}>
                                    <h2 className={styles.lb2HeadTitle}>Als Nächstes</h2>
                                    <span className={styles.lb2HeadMeta}><IconLock size={18} /></span>
                                </div>
                                <ol className={styles.lb2List}>
                                    {queueShown.map(item => (
                                        <li key={item.id} className={styles.lb2Row}>
                                            {cover(item.imageUrl, item.spotifyId || item.id, item.addedBy, 46)}
                                            <span className={styles.lb2Text}>
                                                <span className={styles.lb2Title}>{item.title}</span>
                                                <span className={styles.lb2Artist}>{item.artist}</span>
                                            </span>
                                            <span className={styles.lb2Time}>{mmss(item.duration)}</span>
                                        </li>
                                    ))}
                                </ol>
                                {queue.length > queueShown.length && <p className={styles.lb2More}>+ {queue.length - queueShown.length} weitere</p>}
                            </section>
                        )}

                        {newcomers.length > 0 && (
                            <section className={styles.lb2Section}>
                                <div className={styles.lb2Head}>
                                    <h2 className={styles.lb2HeadTitle}>✨ Neu im Rennen</h2>
                                    <span className={styles.lb2HeadMeta}>brauchen noch Stimmen</span>
                                </div>
                                <ul className={styles.lb2NewList}>
                                    {newcomers.map(item => (
                                        <li key={item.id} className={styles.lb2NewItem}>
                                            {cover(item.imageUrl, item.spotifyId || item.id, item.addedBy, 38)}
                                            <span className={styles.lb2Text}>
                                                <span className={styles.lb2Title}>{item.title}</span>
                                                <span className={styles.lb2Artist}>{item.artist}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>

                    <section className={styles.lb2Right} aria-label="Im Voting">
                        <div className={styles.lb2Head}>
                            <h2 className={styles.lb2HeadTitle}>Im Voting</h2>
                            <span className={styles.lb2HeadMeta}>{batchSize === 1 ? 'Platz 1 kommt weiter' : `Die besten ${batchSize} kommen weiter`} · {pool.length} {pool.length === 1 ? 'Song' : 'Songs'}</span>
                        </div>
                        {top10.length === 0 ? (
                            <div className={styles.lb2Empty}>
                                <span className={styles.lbEmptyIcon}><IconNote size={28} /></span>
                                <p className={styles.lb2NowTitle}>Noch keine Songs</p>
                                <p className={styles.lbMuted}>Scanne den QR-Code und schlag den ersten Song vor.</p>
                            </div>
                        ) : (
                            <ol className={styles.lb2List}>
                                {top10.map((item, i) => {
                                    const { up, down } = voteCounts(item)
                                    const score = scoreOf(item)
                                    return (
                                        <Fragment key={item.id}>
                                            {i === batchSize && <li className={styles.lb2Cut} aria-hidden="true"><span><IconArrowUp size={16} /></span></li>}
                                            <li ref={setRowRef(item.id)} className={`${styles.lb2Row} ${i < batchSize ? styles.lb2RowTop : ''}`}>
                                                <span className={styles.lb2No}>{i + 1}</span>
                                                {cover(item.imageUrl, item.spotifyId || item.id, item.addedBy, 42)}
                                                <span className={styles.lb2Text}>
                                                    <span className={styles.lb2Title}>{item.title}</span>
                                                    <span className={styles.lb2Artist}>{isNew(item, clock) && <span className={styles.lbNew}>✨ NEU</span>}{playedIds.has(item.spotifyId) && <span className={styles.lbPlayed}>Lief schon</span>}{item.artist}</span>
                                                </span>
                                                <span className={styles.lb2Pill} aria-label={`${score} Punkte: ${up}× hoch, ${down}× runter`}>
                                                    <span className={styles.lb2PillUp}><IconArrowUp size={16} />{up}</span>
                                                    <strong key={score} className={styles.lb2Score}>{score}</strong>
                                                    <span className={styles.lb2PillDown}><IconArrowDown size={16} />{down}</span>
                                                </span>
                                            </li>
                                        </Fragment>
                                    )
                                })}
                            </ol>
                        )}
                        {ranked.length > 10 && <p className={styles.lb2More}>+ {ranked.length - 10} weitere im Rennen</p>}
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

            <ReactionRain code={code} />

            {reveal && (
                <div className={styles.lbReveal} role="dialog" aria-label={`Runde ${reveal.round} geht an Spotify`} onClick={() => setReveal(null)}>
                    <div className={styles.lbRevealInner}>
                        <span className={styles.lbRevealKicker}><IconTrophy size={26} />Runde {reveal.round} geht an Spotify</span>
                        <h2 className={styles.lbRevealTitle}>Die Gewinner</h2>
                        <ol className={styles.lbPodium}>
                            {reveal.top.map((t, i) => {
                                const place = t.place ?? i + 1
                                return (
                                <li key={t.spotifyId || i} className={`${styles.lbPodiumItem} ${styles[`lbPlace${Math.min(place, 3)}`]}`} style={{ animationDelay: `${0.5 + (reveal.top.length - 1 - i) * 1.1}s` }}>
                                    <span className={styles.lbPodiumPlace}>{place}</span>
                                    <CoverArt src={t.imageUrl} seed={t.spotifyId || t.title} size={place === 1 ? (reveal.top.length > 4 ? 160 : 200) : 150} radius={20} />
                                    <span className={styles.lbPodiumTitle}>{t.title}</span>
                                    <span className={styles.lbPodiumBy}>{data.players?.[t.addedBy]?.emoji || '🙂'} <strong>{t.addedBy}</strong></span>
                                    <span className={styles.lbPodiumScore}>{t.score > 0 ? '+' : ''}{t.score} <small>({t.up}× hoch{t.down ? ` · ${t.down}× runter` : ''})</small></span>
                                </li>
                                )
                            })}
                        </ol>
                    </div>
                </div>
            )}
        </div>
    )
}
