import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import {
    getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp, deleteField,
} from 'firebase/firestore'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import sheetStyles from '../../shared/ui/BottomSheet.module.css'
import QrCode from '../../shared/ui/QrCode'
import QrScanner from '../../shared/ui/QrScanner'
import { IconBack, IconX, IconShare, IconQr, IconPlay, IconPlus, IconMoon, IconSun, IconCheck, IconInfo } from '../../shared/ui/icons'
import AvatarPicker from '../Amplify2/AvatarPicker'
import { ANIMALS, randomAnimal } from '../Amplify2/avatars'
import { IconHeart, IconFriends, IconGrid, IconSwap, IconScale, IconArrow, IconCards } from './icons'
import { SETS } from './questions'
import { ROUND_OPTIONS, DEFAULT_ROUNDS, MAX_PLAYERS, cleanName, pairOf, startGame, answerUpdate, nextUpdate } from './testifyLogic'
import { lobbyCollection, CODE_RE, generateCode, inviteLink, codeFromQr } from './store'
import Round from './Round'
import Result from './Result'
import styles from './Testify.module.css'

// Sitzung: Raum in diesem Tab (Neuladen → zurück ins Spiel), Name und Tier bleiben auf dem Gerät
const ss = {
    get: (k) => { try { return sessionStorage.getItem(k) } catch { return null } },
    set: (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v) } catch { /* egal */ } },
}
const ls = {
    get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* egal */ } },
}
const ROOM_KEY = 'tf_roomId'
const INVITE_KEY = 'tf_invite'
const storedEmoji = () => {
    const e = ls.get('tf_emoji')
    if (e && ANIMALS.includes(e)) return e
    const n = randomAnimal()
    ls.set('tf_emoji', n)
    return n
}
const NAME_RE = /^[\p{L}\p{N} ._-]+$/u
const nameProblem = (s) => {
    const n = cleanName(s)
    if (!n) return 'Bitte gib deinen Namen ein.'
    if (n.length > 20) return 'Höchstens 20 Zeichen.'
    if (!NAME_RE.test(n)) return 'Nur Buchstaben, Ziffern, Leerzeichen, Punkt und Bindestrich.'
    return null
}

const TYPES = [
    { icon: <IconGrid size={20} />, name: 'Eins aus 4', ex: 'Band, Essen, Reiseziel …' },
    { icon: <IconSwap size={20} />, name: 'Dies oder das', ex: 'Strand oder Berge' },
    { icon: <IconScale size={20} />, name: 'Skala 1–5', ex: 'mit „knapp daneben“' },
]

export default function Testify({ onBack, joinCode }) {
    const { isDark, toggleTheme } = useTheme()
    const [db] = useState(() => getFirestore(getApp()))
    const [uid, setUid] = useState(null)
    const uidRef = useRef(null)

    const [screen, setScreen] = useState('home')     // home | create | setup | join | room
    const [nameDraft, setNameDraft] = useState(() => ls.get('tf_name') || '')
    const [emoji, setEmoji] = useState(storedEmoji)
    const [setId, setSetId] = useState('freunde')
    const [rounds, setRounds] = useState(DEFAULT_ROUNDS)
    const [codeDraft, setCodeDraft] = useState('')
    const [codeCheck, setCodeCheck] = useState(null) // { code, state: checking|ok|missing|full|error, host }
    const [scanning, setScanning] = useState(false)

    const [roomId, setRoomId] = useState(() => ss.get(ROOM_KEY) || '')
    const [data, setData] = useState(null)
    const [doneLocal, setDoneLocal] = useState(null) // doneAt der laufenden Runde in Gerätezeit
    const [busy, setBusy] = useState(null)
    const [notice, setNotice] = useState(null)
    const [toast, setToast] = useState(null)
    const [sheet, setSheet] = useState(null)         // 'leave'

    const unsubRef = useRef(null)
    const leavingRef = useRef(false)
    const lastOtherRef = useRef(null)                // Name des anderen (für „… hat das Spiel beendet“)
    const offsetRef = useRef(0)                      // Serverzeit − Gerätezeit
    const pingRef = useRef(null)                     // { sent } – Abgleich der Uhr läuft
    const toastTimer = useRef(null)

    const showToast = useCallback((text) => {
        clearTimeout(toastTimer.current)
        setToast(text)
        toastTimer.current = setTimeout(() => setToast(null), 4500)
    }, [])
    useEffect(() => () => clearTimeout(toastTimer.current), [])

    // ── Anonymer Login (wie Amplify) ────────────────────────────────────────
    useEffect(() => {
        const auth = getAuth(getApp())
        const off = onAuthStateChanged(auth, (u) => { uidRef.current = u?.uid || null; setUid(u?.uid || null) })
        auth.authStateReady().then(() => { if (!auth.currentUser) signInAnonymously(auth).catch(console.error) })
        return off
    }, [])
    const signedIn = async () => {
        const auth = getAuth(getApp())
        await auth.authStateReady()
        if (!auth.currentUser) await signInAnonymously(auth)
        uidRef.current = auth.currentUser.uid
        return auth.currentUser.uid
    }

    const lobbyRef = useCallback((code) => doc(db, lobbyCollection(), code), [db])

    // Lesen + Ändern + Schreiben als Transaktion (gleichzeitige Antworten beider Handys gehen nicht verloren).
    // change(data) ohne Nebenwirkungen; liefert { update, ... }
    const mutate = useCallback(async (code, change) => {
        const ref = lobbyRef(code)
        return runTransaction(db, async (tx) => {
            const snap = await tx.get(ref)
            if (!snap.exists()) return { missing: true }
            const res = change(snap.data()) || {}
            if (res.update) tx.update(ref, { ...res.update, lastActiveAt: Date.now() })
            return res
        })
    }, [db, lobbyRef])

    // ── Sitzung beenden / Abo ───────────────────────────────────────────────
    const endSession = useCallback((text) => {
        unsubRef.current?.()
        unsubRef.current = null
        ss.set(ROOM_KEY, null)
        setRoomId('')
        setData(null)
        setDoneLocal(null)
        setSheet(null)
        setScreen('home')
        if (text) setNotice(text)
    }, [])

    const subscribe = useCallback((code) => {
        unsubRef.current?.()
        leavingRef.current = false
        const ref = lobbyRef(code)
        let pinged = false
        const off = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
            const me = uidRef.current
            // Erst Cache, dann Server: „beendet/entfernt“ nur aus Serverdaten ableiten
            const fromCache = snap.metadata.fromCache
            if (!snap.exists()) {
                if (fromCache) return
                endSession(leavingRef.current ? null : `${lastOtherRef.current || 'Dein Gegenüber'} hat das Spiel beendet.`)
                return
            }
            const d = snap.data({ serverTimestamps: 'estimate' })
            if (d.status === 'closed') {
                if (fromCache) return
                if (d.hostUid === me) deleteDoc(ref).catch(() => { /* Rest stört nicht */ })
                endSession(leavingRef.current || d.closedBy === me ? null : `${d.closedByName || 'Dein Gegenüber'} hat das Spiel verlassen.`)
                return
            }
            if (!d.players?.[me]) {
                if (fromCache) return
                endSession(leavingRef.current ? null : 'Du bist nicht mehr in diesem Spiel.')
                return
            }
            const other = Object.entries(d.players).find(([u]) => u !== me)
            if (other) lastOtherRef.current = other[1].name

            // Uhr abgleichen: eigener Zeitstempel vom Server gegen die Gerätezeit (Mitte von Senden/Empfangen)
            if (!pinged && !fromCache) {
                pinged = true
                pingRef.current = { sent: Date.now() }
                updateDoc(ref, { [`players.${me}.ping`]: serverTimestamp() }).catch(() => { pingRef.current = null })
            }
            const ping = d.players[me].ping
            if (pingRef.current && ping?.toMillis && !snap.metadata.hasPendingWrites) {
                const recv = Date.now()
                offsetRef.current = ping.toMillis() - (pingRef.current.sent + recv) / 2
                pingRef.current = null
            }
            const doneAt = d.round?.doneAt
            setDoneLocal(doneAt?.toMillis
                ? doneAt.toMillis() - (snap.metadata.hasPendingWrites ? 0 : offsetRef.current)
                : null)
            setData(d)
        }, (err) => {
            console.error('Testify-Abo fehlgeschlagen:', err)
            showToast('Die Verbindung zum Spiel ist abgerissen. Bitte lade die Seite neu.')
        })
        unsubRef.current = off
    }, [lobbyRef, endSession, showToast])
    useEffect(() => () => unsubRef.current?.(), [])

    // Nach dem Neuladen zurück ins Spiel
    useEffect(() => {
        const code = ss.get(ROOM_KEY)
        if (!code) return
        let cancelled = false
        signedIn().then((me) => getDoc(lobbyRef(code)).then((snap) => {
            if (cancelled) return
            const d = snap.exists() ? snap.data() : null
            if (!d || d.status === 'closed' || !d.players?.[me]) { ss.set(ROOM_KEY, null); setRoomId(''); return }
            setScreen('room')
            subscribe(code)
        })).catch(() => { if (!cancelled) { ss.set(ROOM_KEY, null); setRoomId('') } })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Einladungslink (#testify/CODE) → Beitreten mit vorausgefülltem Code
    useEffect(() => {
        if (!joinCode) return
        window.history.replaceState(window.history.state, '', '#testify')
        if (ss.get(ROOM_KEY) === joinCode) return
        ss.set(INVITE_KEY, joinCode)
    }, [joinCode])
    const [invite] = useState(() => (joinCode && ss.get(ROOM_KEY) !== joinCode ? joinCode : ss.get(INVITE_KEY)))
    useEffect(() => {
        if (!invite || !CODE_RE.test(invite)) return
        const id = setTimeout(() => { setCodeDraft(invite); setScreen('join') }, 0)
        return () => clearTimeout(id)
    }, [invite])

    // Beitreten: Code live prüfen
    useEffect(() => {
        const code = codeDraft.trim().toUpperCase()
        if (screen !== 'join' || !CODE_RE.test(code)) return
        let cancelled = false
        const id = setTimeout(() => {
            setCodeCheck({ code, state: 'checking' })
            signedIn().then((me) => getDoc(lobbyRef(code)).then((snap) => {
                if (cancelled) return
                const d = snap.exists() ? snap.data() : null
                if (!d || d.status === 'closed') { setCodeCheck({ code, state: 'missing' }); return }
                const host = d.players?.[d.hostUid]?.name || 'Host'
                const full = Object.keys(d.players || {}).length >= MAX_PLAYERS && !d.players?.[me]
                setCodeCheck({ code, state: full ? 'full' : 'ok', host })
            })).catch(() => { if (!cancelled) setCodeCheck({ code, state: 'error' }) })
        }, 300)
        return () => { cancelled = true; clearTimeout(id) }
    }, [codeDraft, screen, lobbyRef])

    // ── Aktionen ────────────────────────────────────────────────────────────
    const pickEmoji = (e) => { setEmoji(e); ls.set('tf_emoji', e) }
    const commitName = () => {
        const n = cleanName(nameDraft)
        if (nameProblem(n)) return null
        ls.set('tf_name', n)
        setNameDraft(n)
        return n
    }

    const createGame = async () => {
        const name = commitName()
        if (!name || busy) return
        setBusy('create')
        try {
            const me = await signedIn()
            let code = generateCode()
            for (let i = 0; i < 4 && (await getDoc(lobbyRef(code))).exists(); i++) code = generateCode()
            await setDoc(lobbyRef(code), {
                hostUid: me, createdAt: serverTimestamp(), lastActiveAt: Date.now(), status: 'open',
                set: setId, rounds, phase: 'lobby', gameNo: 0, used: [], questions: [], idx: 0, log: [],
                round: { answers: {}, doneAt: null, next: {} }, again: {},
                players: { [me]: { name, emoji, joinedAt: Date.now() } },
            })
            ss.set(ROOM_KEY, code)
            setRoomId(code)
            setNotice(null)
            setScreen('room')
            subscribe(code)
        } catch (e) {
            console.error('Testify: Erstellen fehlgeschlagen', e)
            showToast('Das Spiel konnte nicht erstellt werden. Bitte versuch es nochmal.')
        } finally {
            setBusy(null)
        }
    }

    const joinGame = async (raw) => {
        const code = String(raw || '').trim().toUpperCase()
        const name = commitName()
        if (!name || busy || !CODE_RE.test(code)) return
        setBusy('join')
        try {
            const me = await signedIn()
            const res = await mutate(code, (d) => {
                if (d.status === 'closed') return { missing: true }
                if (d.players?.[me]) return { rejoin: true }
                if (Object.keys(d.players || {}).length >= MAX_PLAYERS) return { full: true }
                return { update: { [`players.${me}`]: { name, emoji, joinedAt: Date.now() } } }
            })
            if (res.missing) { showToast(`Ein Spiel mit dem Code ${code} gibt es nicht (mehr).`); return }
            if (res.full) { showToast('Dieses Spiel ist schon voll (2 Spieler).'); return }
            ss.set(ROOM_KEY, code)
            ss.set(INVITE_KEY, null)
            setRoomId(code)
            setCodeDraft('')
            setNotice(null)
            setScreen('room')
            subscribe(code)
        } catch (e) {
            console.error('Testify: Beitreten fehlgeschlagen', e)
            showToast('Beitreten hat nicht geklappt. Bitte versuch es nochmal.')
        } finally {
            setBusy(null)
        }
    }

    const run = async (change, errText = 'Das hat nicht geklappt. Bitte versuch es nochmal.') => {
        try {
            const res = await mutate(roomId, change)
            if (res.missing) endSession('Das Spiel gibt es nicht mehr.')
            return res
        } catch (e) {
            console.error('Testify:', e)
            showToast(errText)
            throw e
        }
    }

    const startNow = () => run((d) => {
        if (Object.keys(d.players || {}).length < MAX_PLAYERS) return {}
        return { update: startGame(d, d.phase === 'setup' ? setId : d.set, d.phase === 'setup' ? rounds : d.rounds) }
    }, 'Das Spiel konnte nicht gestartet werden.')

    const answer = (patch) => run((d) => {
        const res = answerUpdate(d, uid, d.idx, patch)
        if (res.done) res.update['round.doneAt'] = serverTimestamp()
        return res
    })
    const next = () => run((d) => nextUpdate(d, uid, d.idx))

    const again = () => {
        if (data?.hostUid === uid) {
            setSetId(data.set || 'freunde')
            setRounds(data.rounds || DEFAULT_ROUNDS)
            return run((d) => (d.phase === 'result' ? { update: { phase: 'setup' } } : {}))
        }
        return run(() => ({ update: { [`again.${uid}`]: true } }))
    }
    const backToResult = () => run((d) => (d.phase === 'setup' ? { update: { phase: 'result' } } : {}))

    const leave = async () => {
        if (!roomId || busy) return
        setBusy('leave')
        leavingRef.current = true
        const ref = lobbyRef(roomId)
        const isHost = data?.hostUid === uid
        try {
            if (!isHost && data?.phase === 'lobby') {
                await updateDoc(ref, { [`players.${uid}`]: deleteField() })
            } else {
                await updateDoc(ref, { status: 'closed', closedBy: uid, closedByName: data?.players?.[uid]?.name || '', lastActiveAt: Date.now() })
                if (isHost) await deleteDoc(ref).catch(() => { /* Gast räumt nicht auf; Host löscht beim nächsten Mal */ })
            }
        } catch (e) {
            console.error('Testify: Verlassen fehlgeschlagen', e)
        } finally {
            setBusy(null)
            endSession(null)
        }
    }

    const share = async (text, url) => {
        try {
            if (navigator.share) { await navigator.share({ title: 'Testify', text, url }); return }
        } catch (e) { if (e?.name === 'AbortError') return }
        try { await navigator.clipboard.writeText(url ? `${text} ${url}` : text); showToast('In die Zwischenablage kopiert.') }
        catch { showToast(url || text) }
    }

    // ── Zurück-Taste des Browsers: eine Ebene zurück (im Spiel: „Verlassen?“) ─
    const goBack = () => {
        if (scanning) { setScanning(false); return true }
        if (sheet) { setSheet(null); return true }
        if (screen === 'room') { setSheet('leave'); return true }
        if (screen === 'setup') { setScreen('create'); return true }
        if (screen === 'create' || screen === 'join') { ss.set(INVITE_KEY, null); setScreen('home'); return false }
        return false
    }
    const goBackRef = useRef(goBack)
    useLayoutEffect(() => { goBackRef.current = goBack })
    const inSub = screen !== 'home'
    const subActiveRef = useRef(false)   // Hilfseintrag stammt aus dieser Sitzung (nicht von vor einem Neuladen)
    useEffect(() => {
        if (!inSub) {
            if (subActiveRef.current && window.history.state?.tfSub) window.history.back()
            subActiveRef.current = false
            return
        }
        subActiveRef.current = true
        if (!window.history.state?.tfSub) window.history.pushState({ tfSub: true }, '')
        const onPop = () => {
            if (window.history.state?.tfSub) return
            if (goBackRef.current()) window.history.pushState({ tfSub: true }, '')
        }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [inSub])

    // ── Darstellung ─────────────────────────────────────────────────────────
    const rootClass = `${styles.tf} ${isDark ? theme.dark : `${theme.light} ${styles.tfLight}`}`
    const shell = (content) => (
        <div className={rootClass}>
            <div className={styles.app}>
                {content}
                {toast && <div className={styles.toast} role="status">{toast}</div>}
                <BottomSheet open={sheet === 'leave'} onClose={() => setSheet(null)} labelledBy="tf-leave-title" busy={busy === 'leave'}>
                    <h2 id="tf-leave-title" className={sheetStyles.title}>Spiel verlassen?</h2>
                    <p className={sheetStyles.text}>
                        {data?.phase === 'lobby' && data?.hostUid !== uid
                            ? 'Du verlässt den Warteraum. Mit dem Code kannst du wieder beitreten.'
                            : 'Das Spiel endet dann auch für dein Gegenüber.'}
                    </p>
                    <div className={styles.sheetBtns}>
                        <button type="button" className={`${styles.btn} ${styles.sheetDanger}`} onClick={leave} disabled={busy === 'leave'}>
                            {busy === 'leave' ? 'Wird verlassen …' : 'Verlassen'}
                        </button>
                        <button type="button" className={`${styles.btn} ${styles.sheetPlain}`} onClick={() => setSheet(null)}>Weiterspielen</button>
                    </div>
                </BottomSheet>
            </div>
        </div>
    )
    const subHeader = (title, back, sub = null, right = null) => (
        <header className={styles.header}>
            <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={back} aria-label="Zurück"><IconBack /></button>
            <div className={styles.headTitle}>
                {typeof title === 'string' ? <h1>{title}</h1> : title}
                {sub && <span className={styles.headSub}>{sub}</span>}
            </div>
            {right}
        </header>
    )

    const nameErr = nameProblem(nameDraft)
    const nameEmpty = !cleanName(nameDraft)
    const nameField = (
        <div className={styles.field}>
            <label htmlFor="tf-name" className={styles.label}>Dein Name</label>
            <input id="tf-name" type="text" className={`${styles.input} ${nameErr && !nameEmpty ? styles.inputBad : ''}`}
                value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={24} autoComplete="nickname" spellCheck={false}
                placeholder="z. B. Niklas" aria-invalid={!!nameErr && !nameEmpty} aria-describedby="tf-name-hint" enterKeyHint="done" />
            {nameErr && !nameEmpty && <p id="tf-name-hint" className={`${styles.hint} ${styles.hintBad}`}>{nameErr}</p>}
        </div>
    )
    const avatar = (
        <div className={styles.avatarWrap}><AvatarPicker value={emoji} onChange={pickEmoji} /></div>
    )

    // ── Start ───────────────────────────────────────────────────────────────
    if (screen === 'home') {
        const themeLabel = isDark ? 'Helles Design' : 'Dunkles Design'
        return shell(
            <section className={styles.screen}>
                <header className={`${styles.header} ${styles.homeHeader}`}>
                    <button type="button" className={`${styles.btn} ${styles.textBtn}`} onClick={onBack}><IconBack />Zum Menü</button>
                    <button type="button" className={`${styles.btn} ${styles.iconBtn} ${styles.themeBtn}`} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
                        {isDark ? <IconSun /> : <IconMoon />}
                    </button>
                </header>
                <div className={styles.homeHero}>
                    <span className={styles.homeEmoji} aria-hidden="true">💞</span>
                    <h1 className={styles.homeTitle}>Testify</h1>
                    <p className={styles.homeLead}>Wie gut kennt ihr euch? Zwei Handys, eine Frage pro Runde – erst deine Antwort, dann dein Tipp für den anderen.</p>
                </div>
                <div className={styles.homeActions}>
                    {notice && (
                        <div className={styles.notice} role="status">
                            <IconInfo /><p>{notice}</p>
                            <button type="button" className={`${styles.btn}`} onClick={() => setNotice(null)} aria-label="Hinweis schließen"><IconX size={16} /></button>
                        </div>
                    )}
                    <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => setScreen('create')}><IconPlus />Spiel erstellen</button>
                    <button type="button" className={`${styles.btn} ${styles.secondary} ${styles.secondaryWide}`} onClick={() => setScreen('join')}>Mit Code beitreten</button>
                    <p className={styles.homeFine}><IconInfo />Für 2 Handys · kein Konto nötig</p>
                </div>
            </section>
        )
    }

    // ── Erstellen (Tier + Name) ─────────────────────────────────────────────
    if (screen === 'create') {
        const ok = !nameErr
        return shell(
            <section className={styles.screen}>
                {subHeader(<span className={styles.brand}>Testify</span>, () => setScreen('home'))}
                <div className={styles.scroll}>
                    <div className={styles.intro}>
                        <h1 className={styles.bigTitle}>Wie gut kennt ihr euch?</h1>
                        <p className={styles.lead}>Zwei Handys, eine Frage pro Runde. Erst deine Antwort, dann dein Tipp für den anderen.</p>
                    </div>
                    {avatar}
                    {nameField}
                </div>
                <div className={styles.footer}>
                    <button type="button" className={`${styles.btn} ${ok ? styles.primary : styles.primaryOff}`} disabled={!ok}
                        onClick={() => { if (commitName()) setScreen('setup') }}>
                        <IconPlus />Spiel erstellen
                    </button>
                </div>
            </section>
        )
    }

    // ── Spiel einrichten (vor dem Erstellen und bei „Nochmal“) ──────────────
    const setupBody = (
        <>
            <h2 className={styles.secTitle} style={{ marginTop: 18 }}>Fragenset</h2>
            <div className={styles.setGrid} role="radiogroup" aria-label="Fragenset">
                {Object.entries(SETS).map(([id, s]) => (
                    <button key={id} type="button" role="radio" aria-checked={setId === id}
                        className={`${styles.btn} ${styles.setCard} ${setId === id ? styles.setCardOn : ''}`} onClick={() => setSetId(id)}>
                        <span className={styles.setIcon}>{id === 'paar' ? <IconHeart /> : <IconFriends />}</span>
                        <span><span className={styles.setName}>{s.label}</span><span className={styles.setSub}>{s.sub}</span></span>
                    </button>
                ))}
            </div>
            <h2 className={styles.secTitle}>Runden</h2>
            <div className={styles.seg} role="radiogroup" aria-label="Runden">
                {ROUND_OPTIONS.map(n => (
                    <button key={n} type="button" role="radio" aria-checked={rounds === n}
                        className={`${styles.btn} ${styles.segBtn} ${rounds === n ? styles.segOn : ''}`} onClick={() => setRounds(n)}>{n}</button>
                ))}
            </div>
            <h2 className={styles.secTitle}>Fragetypen<span className={styles.secNote}>automatisch gemischt</span></h2>
            <div className={styles.typeList}>
                {TYPES.map(t => (
                    <div key={t.name} className={styles.typeRow}>
                        <span className={styles.typeIcon}>{t.icon}</span>
                        <span className={styles.typeName}>{t.name}</span>
                        <span className={styles.typeEx}>{t.ex}</span>
                    </div>
                ))}
            </div>
        </>
    )
    const summaryLine = <p className={styles.summaryLine}><IconCards />{rounds} Fragen · Set „{SETS[setId].label}“ · für 2 Handys</p>

    if (screen === 'setup') {
        const creating = busy === 'create'
        return shell(
            <section className={styles.screen}>
                {subHeader('Spiel einrichten', () => setScreen('create'))}
                <div className={styles.scroll}>{setupBody}</div>
                <div className={styles.footer}>
                    {summaryLine}
                    <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={createGame} disabled={creating}>
                        {creating ? 'Wird erstellt …' : 'Spiel erstellen'}
                    </button>
                </div>
            </section>
        )
    }

    // ── Beitreten ───────────────────────────────────────────────────────────
    if (screen === 'join') {
        const code = codeDraft.trim().toUpperCase()
        const check = codeCheck?.code === code && CODE_RE.test(code) ? codeCheck : null
        const canJoin = check?.state === 'ok' && !nameErr && !busy
        const status = !code ? { text: 'Den Code zeigt der Ersteller im Warteraum – oder scanne den QR-Code.' }
            : !CODE_RE.test(code) ? { text: 'Der Code hat 6 Zeichen.' }
            : !check || check.state === 'checking' ? { text: 'Code wird geprüft …' }
            : check.state === 'ok' ? { ok: true, text: `✓ Spiel von ${check.host}` }
            : check.state === 'full' ? { bad: true, text: 'Dieses Spiel ist schon voll (2 Spieler).' }
            : check.state === 'missing' ? { bad: true, text: 'Dieses Spiel gibt es nicht (mehr).' }
            : { bad: true, text: 'Der Code konnte gerade nicht geprüft werden.' }
        const submit = (e) => { e?.preventDefault(); if (canJoin) joinGame(code) }
        return shell(
            <section className={styles.screen}>
                {subHeader('Beitreten', () => { ss.set(INVITE_KEY, null); setScreen('home') })}
                <form className={styles.scroll} onSubmit={submit}>
                    <div className={styles.field} style={{ marginTop: 8 }}>
                        <label htmlFor="tf-code" className={styles.label}>Raumcode</label>
                        <div className={styles.codeRow}>
                            <div className={styles.codeWrap}>
                                <input id="tf-code" type="text" className={`${styles.input} ${styles.codeInput} ${status.bad ? styles.inputBad : ''}`}
                                    value={codeDraft} onChange={(e) => setCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                                    placeholder="RAUMCODE" autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go" aria-describedby="tf-code-status" />
                                {CODE_RE.test(code) && (
                                    <button type="submit" className={`${styles.btn} ${styles.codeGo}`} aria-label="Beitreten" disabled={!canJoin}><IconArrow /></button>
                                )}
                            </div>
                            <button type="button" className={`${styles.btn} ${styles.scanBtn}`} onClick={() => setScanning(true)} aria-label="QR-Code scannen"><IconQr size={26} /></button>
                        </div>
                        <p id="tf-code-status" role="status" className={`${styles.hint} ${status.ok ? styles.hintOk : ''} ${status.bad ? styles.hintBad : ''}`}>{status.text}</p>
                    </div>
                    {avatar}
                    {nameField}
                </form>
                <div className={styles.footer}>
                    <button type="button" className={`${styles.btn} ${canJoin ? styles.primary : styles.primaryOff}`} disabled={!canJoin} onClick={submit}>
                        {busy === 'join' ? 'Tritt bei …' : 'Beitreten'}
                    </button>
                </div>
                {scanning && <QrScanner parse={codeFromQr} invalidText="Das ist kein Testify-Code."
                    onCode={(c) => { setScanning(false); setCodeDraft(c) }} onClose={() => setScanning(false)} />}
            </section>
        )
    }

    // ── Im Spiel ────────────────────────────────────────────────────────────
    if (!data || !uid) {
        return shell(<div className={styles.loading} role="status">Spiel wird geladen …</div>)
    }
    const [me, other] = pairOf(data, uid)
    const isHost = data.hostUid === uid
    const hostName = data.players?.[data.hostUid]?.name || 'Host'
    const askLeave = () => setSheet('leave')

    if (data.phase === 'play' && data.questions?.[data.idx]) {
        return shell(
            <Round key={`${data.gameNo}-${data.idx}`} data={data} uid={uid} me={me} other={other} doneLocal={doneLocal}
                onAnswer={answer} onNext={next} onLeave={askLeave} />
        )
    }

    if (data.phase === 'result' || (data.phase === 'setup' && !isHost)) {
        return shell(
            <Result data={data} uid={uid} me={me} other={other} isHost={isHost} onAgain={again} onEnd={askLeave}
                onShare={(s) => share(`${me?.name} & ${other?.name}: ${s.together} % – ${s.title} (Testify)`)} />
        )
    }

    if (data.phase === 'setup' && isHost) {
        const guestReady = !!(other && data.again?.[other.uid])
        return shell(
            <section className={styles.screen}>
                {subHeader('Neues Spiel', backToResult)}
                <div className={styles.scroll}>
                    <div className={styles.againNote} role="status">
                        <span className={styles.avatar} aria-hidden="true">{other?.emoji}</span>
                        <p>{guestReady ? `${other?.name} spielt wieder mit.` : `Warte, bis ${other?.name || 'dein Gegenüber'} „Nochmal spielen“ drückt.`}</p>
                        {guestReady
                            ? <span className={styles.statusOk}><IconCheck size={18} w={3} /></span>
                            : <span className={`${styles.dots} ${styles.dotsSm}`} aria-hidden="true"><i /><i /><i /></span>}
                    </div>
                    {setupBody}
                </div>
                <div className={styles.footer}>
                    {summaryLine}
                    <button type="button" className={`${styles.btn} ${guestReady ? styles.primary : styles.primaryOff}`} disabled={!guestReady} onClick={startNow}>
                        {guestReady ? <><IconPlay />Neues Spiel starten</> : `Warte auf ${other?.name || 'dein Gegenüber'} …`}
                    </button>
                </div>
            </section>
        )
    }

    // Warteraum
    const players = Object.entries(data.players || {})
        .map(([u, p]) => ({ uid: u, ...p }))
        .sort((a, b) => (a.uid === data.hostUid ? -1 : b.uid === data.hostUid ? 1 : (a.joinedAt || 0) - (b.joinedAt || 0)))
    const full = players.length >= MAX_PLAYERS
    const link = inviteLink(roomId)
    return shell(
        <section className={styles.screen}>
            <header className={styles.header}>
                <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={askLeave} aria-label="Spiel verlassen"><IconX size={20} /></button>
                <div className={styles.headTitle}>
                    <h1>Warteraum</h1>
                    <span className={styles.headSub}>{SETS[data.set]?.label} · {data.rounds} Fragen</span>
                </div>
                <button type="button" className={`${styles.btn} ${styles.iconBtn}`} aria-label="Einladung teilen"
                    onClick={() => share(`Spiel mit mir Testify! Code: ${roomId}`, link)}><IconShare /></button>
            </header>
            <div className={styles.scroll}>
                <div className={styles.codeCard}>
                    <span className={styles.codeLabel}>Raumcode</span>
                    <span className={styles.bigCode} aria-label={`Raumcode ${roomId.split('').join(' ')}`}>{roomId}</span>
                    <div className={styles.qrBox}><QrCode text={link} size={176} label="QR-Code zum Beitreten" /></div>
                    <p className={styles.codeHelp}>Code eingeben oder QR-Code mit dem zweiten Handy scannen</p>
                </div>
                <h2 className={styles.secTitle}>Spieler<span className={styles.secNote}>{players.length} / {MAX_PLAYERS}</span></h2>
                <div className={styles.playerGrid}>
                    {players.map(p => (
                        <div key={p.uid} className={`${styles.playerCard} ${p.uid === uid ? styles.playerMe : ''} ${p.uid !== data.hostUid ? styles.playerPop : ''}`}>
                            <span className={styles.avatar} aria-hidden="true">{p.emoji}</span>
                            <span className={styles.playerName}>{p.name}</span>
                            <span className={`${styles.playerRole} ${p.uid === data.hostUid ? '' : styles.playerIn}`}>
                                {p.uid === uid ? (p.uid === data.hostUid ? 'Du · erstellt' : 'Du · dabei') : p.uid === data.hostUid ? 'hat erstellt' : 'ist dabei'}
                            </span>
                        </div>
                    ))}
                    {!full && (
                        <div className={`${styles.playerCard} ${styles.playerEmpty}`}>
                            <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
                            Wartet auf Mitspieler
                        </div>
                    )}
                </div>
            </div>
            <div className={styles.footer}>
                {isHost
                    ? <button type="button" className={`${styles.btn} ${full ? styles.primary : styles.primaryOff}`} disabled={!full} onClick={startNow}><IconPlay />Spiel starten</button>
                    : <button type="button" className={`${styles.btn} ${styles.primaryOff}`} disabled>Warte, bis {hostName} startet …</button>}
            </div>
        </section>
    )
}
