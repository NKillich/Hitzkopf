import { useState, useEffect } from 'react'
import { getApp } from 'firebase/app'
import '../../firebase.js'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, onSnapshot } from 'firebase/firestore'
import CoverArt from '../../shared/ui/CoverArt'
import QrCode from '../../shared/ui/QrCode'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import { IconMoon, IconSun, IconBack, IconThumbUp, IconThumbDown, IconUsers, IconNote, IconStar, IconFlame, IconMic, IconClock, IconAlert } from '../../shared/ui/icons'
import { joinLink } from './links'
import styles from './LiveBoard.module.css'

const PHASES = {
    songwahl: { label: 'Songs werden gesammelt', dot: 'lbDotCollect' },
    abstimmung: { label: 'Abstimmung läuft', dot: 'lbDotVote' },
    laeuft: { label: 'Playlist läuft', dot: 'lbDotLive' }
}

const scoreOf = (item) => Object.values(item.votes || {}).reduce((s, v) => s + v, 0)
const countsOf = (item) => {
    const vals = Object.values(item.votes || {})
    return { up: vals.filter(v => v === 1).length, down: vals.filter(v => v === -1).length }
}
const mmss = (ms) => {
    const t = Math.max(0, Math.floor((ms || 0) / 1000))
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
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

export default function LiveBoard({ roomCode, onBack }) {
    const { isDark, toggleTheme } = useTheme()
    const [code, setCode] = useState(roomCode || '')
    const [codeDraft, setCodeDraft] = useState('')
    const [data, setData] = useState(null)
    const [status, setStatus] = useState(roomCode ? 'loading' : 'nocode')   // nocode | loading | ok | missing | error
    const [clock, setClock] = useState(() => Date.now())   // Uhrzeit für Fortschritt und Countdown

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
                    if (snap.exists() && (snap.data().status ?? 'active') === 'active') { setData(snap.data()); setStatus('ok') }
                    else { setData(null); setStatus('missing') }
                }, () => setStatus('error'))
            } catch {
                if (!cancelled) setStatus('error')
            }
        })()
        return () => { cancelled = true; unsub?.() }
    }, [code])

    // Fortschritt und Countdown jede Sekunde neu zeichnen
    useEffect(() => {
        const id = setInterval(() => setClock(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

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

    const openCode = (e) => {
        e.preventDefault()
        const c = codeDraft.trim().toUpperCase()
        if (!/^[A-Z0-9]{4,10}$/.test(c)) return
        window.history.replaceState(null, '', `#live/${c}`)
        setStatus('loading')
        setCode(c)
    }

    const rootClass = `${styles.lbRoot} ${isDark ? theme.dark : theme.light}`
    const themeLabel = isDark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'
    const topButtons = (
        <div className={styles.lbTopButtons}>
            <button type="button" className={styles.lbIconBtn} onClick={onBack} aria-label="Zum Menü" title="Zum Menü"><IconBack /></button>
            <button type="button" className={styles.lbIconBtn} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>{isDark ? <IconSun /> : <IconMoon />}</button>
        </div>
    )

    if (status !== 'ok') {
        return (
            <div className={rootClass}>
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

    const phase = data.lobbyPhase || 'songwahl'
    const phaseInfo = PHASES[phase] || PHASES.songwahl
    const playlist = data.playlist || []
    const history = data.history || []
    const players = Object.keys(data.players || {}).length
    const batchSize = data.batchSize || 10
    const now = data.nowPlaying
    const nowPos = now ? (now.isPlaying ? Math.min((now.positionMs || 0) + (clock - (now.updatedAt || 0)), now.durationMs || 0) : (now.positionMs || 0)) : 0
    const nowItem = now ? playlist.find(i => i.spotifyId === now.trackId) : null
    const queue = playlist.filter(i => i.queuedRound != null && i.spotifyId !== now?.trackId)
        .sort((a, b) => scoreOf(b) - scoreOf(a) || (a.addedAt || 0) - (b.addedAt || 0))
    const pool = playlist.filter(i => i.queuedRound == null)
    const ranked = [...pool].sort((a, b) => scoreOf(b) - scoreOf(a) || (a.addedAt || 0) - (b.addedAt || 0))
    const newest = [...pool].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    const maxAbs = Math.max(1, ...pool.map(i => { const c = countsOf(i); return Math.max(c.up, c.down) }))
    const remaining = phase === 'abstimmung' && data.phaseEndsAt ? data.phaseEndsAt - clock : 0
    const voters = new Set(pool.flatMap(i => Object.entries(i.votes || {}).filter(([, v]) => v !== 0).map(([n]) => n))).size
    const facts = buildFacts(history, players, pool.length)
    const isVoting = phase === 'abstimmung'
    const playedIds = new Set(history.map(h => h.spotifyId).filter(Boolean))
    const list = isVoting ? ranked : newest

    return (
        <div className={rootClass}>
            <div className={styles.lbBoard}>
                <header className={styles.lbTop}>
                    {topButtons}
                    <div className={styles.lbBrand}>
                        <span className={styles.lbLogo}>Amplify <span>Live</span></span>
                        <span className={styles.lbMeta}>Playlist von {data.host} · <IconUsers size={14} /> {players} dabei</span>
                    </div>
                    <div className={styles.lbPhase}>
                        <span className={`${styles.lbDot} ${styles[phaseInfo.dot]}`} aria-hidden="true" />
                        <span>{phaseInfo.label}</span>
                        {isVoting && remaining > 0 && <span className={styles.lbTimer}>{mmss(remaining)}</span>}
                    </div>
                    <div className={styles.lbJoin}>
                        <QrCode text={joinLink(code)} size={76} label={`QR-Code zum Mitmachen, Raumcode ${code}`} />
                        <span className={styles.lbJoinText}>
                            <span className={styles.lbJoinLabel}>Mitmachen</span>
                            <span className={styles.lbJoinCode}>{code}</span>
                        </span>
                    </div>
                </header>

                <main className={styles.lbGrid}>
                    <section className={styles.lbNowCol} aria-label="Läuft gerade">
                        {now ? (
                            <div className={styles.lbNow}>
                                <div className={styles.lbNowCover}>
                                    <CoverArt src={now.imageUrl} seed={now.trackId} size={240} radius={22} />
                                </div>
                                <div className={styles.lbNowText}>
                                    <span className={styles.lbKicker}>{now.isPlaying ? 'Läuft gerade' : 'Pausiert'}</span>
                                    <h1 className={styles.lbNowTitle}>{now.trackName}</h1>
                                    <p className={styles.lbNowArtist}>{now.artist}</p>
                                    {nowItem?.addedBy && <p className={styles.lbBy}>eingereicht von <strong>{nowItem.addedBy}</strong></p>}
                                    <div className={styles.lbBar} aria-hidden="true"><span style={{ width: `${now.durationMs ? Math.min(100, (nowPos / now.durationMs) * 100) : 0}%` }} /></div>
                                    <div className={styles.lbTimes}><span>{mmss(nowPos)}</span><span>{mmss(now.durationMs)}</span></div>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.lbNowEmpty}>
                                <span className={styles.lbEmptyIcon}><IconNote size={28} /></span>
                                <p className={styles.lbNowEmptyTitle}>Gerade läuft nichts</p>
                                <p className={styles.lbMuted}>Sobald der Host abspielt, erscheint der Song hier.</p>
                            </div>
                        )}

                        <div className={styles.lbSection}>
                            <h2 className={styles.lbSectionTitle}>Als Nächstes <span>{queue.length}</span></h2>
                            {queue.length === 0 ? (
                                <p className={styles.lbMuted}>Die Warteschlange ist leer – die nächste Abstimmung füllt sie.</p>
                            ) : (
                                <ol className={styles.lbQueue}>
                                    {queue.slice(0, 6).map((item, i) => (
                                        <li key={item.id} className={styles.lbQueueItem}>
                                            <span className={styles.lbQueueRank}>{i + 1}</span>
                                            <CoverArt src={item.imageUrl} seed={item.spotifyId || item.id} size={44} radius={9} />
                                            <span className={styles.lbText}>
                                                <span className={styles.lbTitle}>{item.title}</span>
                                                <span className={styles.lbSub}>{item.artist} · von {item.addedBy}</span>
                                            </span>
                                        </li>
                                    ))}
                                    {queue.length > 6 && <li className={styles.lbMore}>+ {queue.length - 6} weitere</li>}
                                </ol>
                            )}
                        </div>
                    </section>

                    <section className={styles.lbPanel} aria-label={isVoting ? 'Live-Abstimmung' : 'Eingereichte Songs'}>
                        <div className={styles.lbPanelHead}>
                            <h2 className={styles.lbPanelTitle}>{isVoting ? 'Live-Abstimmung' : 'Für die nächste Runde'}</h2>
                            <span className={styles.lbPanelMeta}>
                                {isVoting ? `${voters} von ${players} haben abgestimmt · Top ${batchSize} kommen weiter` : `${pool.length} ${pool.length === 1 ? 'Song' : 'Songs'} eingereicht`}
                            </span>
                        </div>
                        {list.length === 0 ? (
                            <div className={styles.lbNowEmpty}>
                                <span className={styles.lbEmptyIcon}><IconNote size={28} /></span>
                                <p className={styles.lbNowEmptyTitle}>Noch keine Songs</p>
                                <p className={styles.lbMuted}>Scanne den QR-Code und reich den ersten Song ein.</p>
                            </div>
                        ) : (
                            <ol className={styles.lbRank}>
                                {list.map((item, i) => {
                                    const { up, down } = countsOf(item)
                                    const score = scoreOf(item)
                                    const inTop = isVoting && i < batchSize
                                    return (
                                        <li key={item.id} className={`${styles.lbRankItem} ${inTop ? styles.lbRankTop : ''} ${isVoting && i === batchSize ? styles.lbRankCut : ''}`}>
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
                                            {isVoting && (
                                                <span className={styles.lbScoreBox}>
                                                    <span className={styles.lbScore}>{score > 0 ? '+' : ''}{score}</span>
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
    )
}
