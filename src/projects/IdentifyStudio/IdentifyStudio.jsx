import { useCallback, useEffect, useRef, useState } from 'react'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseConfig } from '../../firebase.js'
import useTheme from '../../shared/ui/useTheme'
import theme from '../../shared/ui/theme.module.css'
import { ConfirmSheet } from '../../shared/ui/BottomSheet'
import { IconBack, IconPlus, IconTrash, IconSearch, IconPlay, IconPause, IconX, IconCheck, IconAlert } from '../../shared/ui/icons'
import { fetchIndex, fetchList, saveList, deleteList, slugFor, MAX_SONGS } from '../SecondSound/listStore.js'
import { matchToApple, spotifyIdsFromText, spotifyTrack, appleSearch, toListSong } from '../SecondSound/appleMatch.js'
import { loadFileLists } from '../SecondSound/guestMusic.js'
import styles from './IdentifyStudio.module.css'

// Eigene Firebase-Instanz fürs Studio: Der Google-Login hier ersetzt nicht den anonymen Login der Spiele
// (sonst verlöre ein Amplify-Host auf diesem Gerät seine Host-Rechte).
const studioApp = getApps().find(a => a.name === 'studio') ?? initializeApp(firebaseConfig, 'studio')
const auth = getAuth(studioApp)
const db = getFirestore(studioApp)

const SAVE_EVERY = 10                 // beim Hinzufügen alle 10 Songs zwischenspeichern
const TOKEN_MAX_AGE = 45 * 60 * 1000  // Spotify-App-Token rechtzeitig erneuern

// Spotify-App-Token über die Funktion „spotifyToken“ (anonymer Login der normalen App)
async function getSpotifyToken() {
    const mainAuth = getAuth(getApp())
    await mainAuth.authStateReady()
    if (!mainAuth.currentUser) await signInAnonymously(mainAuth)
    const { data } = await httpsCallable(getFunctions(getApp()), 'spotifyToken')()
    return data.access_token
}

const errText = (e) => e?.code === 'permission-denied'
    ? 'Keine Schreibrechte – deine UID steht noch nicht in den Firestore-Regeln.'
    : (e?.message || 'Unbekannter Fehler')

export default function IdentifyStudio({ onBack }) {
    const { isDark } = useTheme()
    const [user, setUser] = useState(undefined)          // undefined = wird geprüft
    const [loginError, setLoginError] = useState(null)
    const [lists, setLists] = useState(null)
    const [listsError, setListsError] = useState(null)
    const [current, setCurrent] = useState(null)         // geöffnete Liste
    const currentRef = useRef(null)
    const [toast, setToast] = useState(null)
    const [noRights, setNoRights] = useState(false)

    const show = useCallback((text, bad = false) => {
        setToast({ text, bad })
        setTimeout(() => setToast(t => (t?.text === text ? null : t)), 3500)
    }, [])

    const reloadIndex = useCallback(async () => {
        setListsError(null)
        try { setLists(await fetchIndex(db)) } catch (e) {
            // Regeln noch nicht veröffentlicht / UID nicht eingetragen → Hinweis mit UID statt Fehler
            if (e?.code === 'permission-denied') { setNoRights(true); setLists([]) } else setListsError(errText(e))
        }
    }, [])
    // Anmeldestatus verfolgen; angemeldet → Übersicht laden
    useEffect(() => onAuthStateChanged(auth, u => {
        setUser(u || null)
        if (u) reloadIndex()
    }), [reloadIndex])

    const login = async () => {
        setLoginError(null)
        try { await signInWithPopup(auth, new GoogleAuthProvider()) } catch (e) {
            setLoginError(e?.code === 'auth/operation-not-allowed'
                ? 'Die Google-Anmeldung ist in Firebase noch nicht eingeschaltet (Authentication → Anmeldemethoden → Google).'
                : (e?.code === 'auth/popup-closed-by-user' ? null : `Anmeldung fehlgeschlagen: ${e?.message || e}`))
        }
    }

    // Speichern mit Fehleranzeige; aktualisiert Liste und Übersicht
    const persist = useCallback(async (list) => {
        try {
            const saved = await saveList(db, list)
            currentRef.current = saved
            setCurrent(saved)
            setNoRights(false)
            setLists(prev => {
                const entry = { id: saved.id, name: saved.name, emoji: saved.emoji, count: saved.songs.length, cover: saved.songs[0]?.cover || null }
                const next = (prev || []).filter(l => l.id !== saved.id)
                const at = (prev || []).findIndex(l => l.id === saved.id)
                if (at >= 0) next.splice(at, 0, entry); else next.push(entry)
                return next
            })
            return true
        } catch (e) {
            if (e?.code === 'permission-denied') setNoRights(true)
            show(`Speichern fehlgeschlagen: ${errText(e)}`, true)
            return false
        }
    }, [show])

    const openList = async (id) => {
        try {
            const list = await fetchList(db, id)
            if (!list) { show('Liste nicht gefunden.', true); return }
            currentRef.current = list
            setCurrent(list)
        } catch (e) { show(errText(e), true) }
    }

    const root = `${styles.root} ${isDark ? theme.dark : theme.light}`

    if (user === undefined) return <div className={root}><div className={styles.app}><p className={styles.muted}>Lädt …</p></div></div>

    if (!user) {
        return (
            <div className={root}>
                <div className={styles.app}>
                    <header className={styles.header}>
                        <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={onBack} aria-label="Zurück"><IconBack /></button>
                        <h1 className={styles.title}>Identify Studio</h1>
                    </header>
                    <div className={styles.center}>
                        <span className={styles.bigEmoji} aria-hidden="true">🎛️</span>
                        <p className={styles.lead}>Hier pflegst du die Listen für den Gastmodus von Identify. Nur für dein Konto.</p>
                        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={login}>Mit Google anmelden</button>
                        {loginError && <p className={styles.error} role="alert">{loginError}</p>}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={root}>
            <div className={styles.app}>
                {current
                    ? <ListEditor list={current} listRef={currentRef} persist={persist} show={show}
                        onClose={() => { setCurrent(null); currentRef.current = null }}
                        onDeleted={(id) => { setCurrent(null); currentRef.current = null; setLists(prev => (prev || []).filter(l => l.id !== id)) }} />
                    : <Overview user={user} lists={lists} listsError={listsError} noRights={noRights} onBack={onBack}
                        onOpen={openList} persist={persist} show={show} onReload={reloadIndex} />}
                {toast && <p className={`${styles.toast} ${toast.bad ? styles.toastBad : ''}`} role="status">{toast.text}</p>}
            </div>
        </div>
    )
}

function Overview({ user, lists, listsError, noRights, onBack, onOpen, persist, show, onReload }) {
    const [name, setName] = useState('')
    const [emoji, setEmoji] = useState('🎵')
    const [busy, setBusy] = useState(false)

    const create = async (e) => {
        e.preventDefault()
        if (!name.trim() || busy) return
        setBusy(true)
        const id = slugFor(name, (lists || []).map(l => l.id))
        const ok = await persist({ id, name: name.trim(), emoji: emoji || '🎵', songs: [], missing: [], spotifyIds: [] })
        setBusy(false)
        if (ok) { setName(''); onOpen(id) }
    }

    // Einmalig: die Listen aus den Dateien (public/identify/lists) übernehmen
    const importFiles = async () => {
        setBusy(true)
        try {
            const fileLists = await loadFileLists()
            for (const l of fileLists) {
                if (!(await persist({ id: l.id, name: l.name, emoji: l.emoji, songs: l.songs || [], missing: [], spotifyIds: [] }))) break
            }
            show(`${fileLists.length} Listen übernommen.`)
            onReload()
        } catch (e) { show(`Übernahme fehlgeschlagen: ${errText(e)}`, true) }
        setBusy(false)
    }

    return (
        <>
            <header className={styles.header}>
                <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={onBack} aria-label="Zurück"><IconBack /></button>
                <h1 className={styles.title}>Identify Studio</h1>
                <button type="button" className={`${styles.btn} ${styles.link}`} onClick={() => signOut(auth)}>Abmelden</button>
            </header>
            <main className={styles.main}>
                <p className={styles.muted}>Angemeldet als {user.email || 'Google-Konto'}</p>

                {noRights && <RightsHint uid={user.uid} />}

                <section className={styles.card}>
                    <h2 className={styles.h2}>Neue Liste</h2>
                    <form className={styles.row} onSubmit={create}>
                        <input className={`${styles.input} ${styles.emojiInput}`} value={emoji} onChange={e => setEmoji(e.target.value)} aria-label="Emoji" maxLength={8} />
                        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Name, z. B. 80er Party" aria-label="Name der Liste" maxLength={60} />
                        <button type="submit" className={`${styles.btn} ${styles.primarySm}`} disabled={!name.trim() || busy}><IconPlus size={18} />Anlegen</button>
                    </form>
                </section>

                <section className={styles.card}>
                    <h2 className={styles.h2}>Listen {lists ? `(${lists.length})` : ''}</h2>
                    {listsError && <p className={styles.error}>{listsError}</p>}
                    {!lists && !listsError && <p className={styles.muted}>Lädt …</p>}
                    {lists && lists.length === 0 && (
                        <div className={styles.empty}>
                            <p className={styles.muted}>Noch keine Listen in der Datenbank. Identify zeigt so lange die Listen aus den Dateien.</p>
                            <button type="button" className={`${styles.btn} ${styles.secondary}`} onClick={importFiles} disabled={busy}>
                                {busy ? 'Übernehme …' : 'Listen aus den Dateien übernehmen'}
                            </button>
                        </div>
                    )}
                    <ul className={styles.list}>
                        {(lists || []).map(l => (
                            <li key={l.id}>
                                <button type="button" className={`${styles.btn} ${styles.listRow}`} onClick={() => onOpen(l.id)}>
                                    {l.cover ? <img src={l.cover} alt="" className={styles.cover} /> : <span className={styles.cover} />}
                                    <span className={styles.rowText}>
                                        <span className={styles.rowName}>{l.emoji} {l.name}</span>
                                        <span className={styles.rowMeta}>{l.count} Songs · {l.id}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            </main>
        </>
    )
}

function RightsHint({ uid }) {
    return (
        <div className={styles.warn} role="alert">
            <IconAlert />
            <div>
                <p><b>Noch keine Schreibrechte.</b> Deine UID muss in <code>firestore.rules</code> stehen (statt <code>STUDIO_UID_HIER_EINTRAGEN</code>), danach am PC <code>npm run deploy:rules</code>.</p>
                <p className={styles.uid}>Deine UID: <code>{uid}</code>
                    <button type="button" className={`${styles.btn} ${styles.link}`} onClick={() => navigator.clipboard?.writeText(uid)}>Kopieren</button>
                </p>
            </div>
        </div>
    )
}

function ListEditor({ list, listRef, persist, show, onClose, onDeleted }) {
    const [name, setName] = useState(list.name)
    const [emoji, setEmoji] = useState(list.emoji)
    const [links, setLinks] = useState('')
    const [job, setJob] = useState(null)        // { total, done, label, added, skipped, missing, waiting }
    const cancelRef = useRef(false)
    const [filter, setFilter] = useState('')
    const [search, setSearch] = useState(null)  // { q, results, busy, forMissing }
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const audioRef = useRef(null)
    const [playingId, setPlayingId] = useState(null)
    const deleteBtnRef = useRef(null)

    useEffect(() => () => { audioRef.current?.pause(); cancelRef.current = true }, [])

    const changed = name.trim() !== list.name || emoji !== list.emoji

    const saveMeta = () => persist({ ...listRef.current, name: name.trim() || list.name, emoji: emoji || '🎵' })

    const removeSong = (id) => persist({ ...listRef.current, songs: listRef.current.songs.filter(s => s.id !== id) })
    const dropMissing = (spotifyId) => persist({ ...listRef.current, missing: (listRef.current.missing || []).filter(m => m.spotifyId !== spotifyId) })

    // Spotify-Links → Apple-Songs (dauert: Apple erlaubt ca. 20 Suchen pro Minute)
    const addLinks = async () => {
        const all = spotifyIdsFromText(links)
        const known = new Set(listRef.current.spotifyIds || [])
        const ids = all.filter(id => !known.has(id))
        if (!all.length) { show('Keine Spotify-Song-Links gefunden.', true); return }
        cancelRef.current = false
        let wake = null
        try { wake = await navigator.wakeLock?.request('screen') } catch { /* optional */ }
        const state = { total: ids.length, done: 0, label: '', added: 0, skipped: all.length - ids.length, missing: 0, waiting: false }
        setJob({ ...state })
        let token = null, tokenAt = 0
        let pending = 0
        try {
            for (const id of ids) {
                if (cancelRef.current) break
                if (!token || Date.now() - tokenAt > TOKEN_MAX_AGE) { token = await getSpotifyToken(); tokenAt = Date.now() }
                const sp = await spotifyTrack(id, token)
                const cur = listRef.current
                let next = { ...cur, spotifyIds: [...(cur.spotifyIds || []), id] }
                if (sp.error) {
                    next.missing = [...(cur.missing || []), { spotifyId: id, artist: '', title: `Spotify-Fehler ${sp.error}` }]
                    state.missing++
                } else {
                    state.label = `${sp.artists[0]} – ${sp.title}`
                    setJob({ ...state })
                    const hit = await matchToApple(sp, { onWait: () => setJob({ ...state, waiting: true }) })
                    if (cancelRef.current) break
                    const now = listRef.current
                    next = { ...now, spotifyIds: [...(now.spotifyIds || []), id] }
                    if (hit && !now.songs.some(s => s.id === hit.song.id)) { next.songs = [...now.songs, hit.song]; state.added++ }
                    else if (hit) state.skipped++
                    else { next.missing = [...(now.missing || []), { spotifyId: id, artist: sp.artists[0], title: sp.title }]; state.missing++ }
                }
                listRef.current = next
                state.done++
                setJob({ ...state, waiting: false })
                if (++pending >= SAVE_EVERY) { pending = 0; if (!(await persist(listRef.current))) break }
            }
        } catch (e) { show(`Fehler beim Hinzufügen: ${errText(e)}`, true) }
        await persist(listRef.current)
        try { await wake?.release() } catch { /* optional */ }
        setJob({ ...state, finished: true, cancelled: cancelRef.current })
        if (!cancelRef.current) setLinks('')
    }

    // Von Hand bei Apple suchen (für nicht gefundene Songs oder einfach so)
    const runSearch = async (q, forMissing = null) => {
        setSearch({ q, results: [], busy: true, forMissing })
        try {
            const results = (await appleSearch({ term: q, limit: '20' })).filter(a => a.previewUrl)
            setSearch({ q, results, busy: false, forMissing })
        } catch { setSearch({ q, results: [], busy: false, forMissing }) }
    }
    const addFromSearch = async (a) => {
        const cur = listRef.current
        if (cur.songs.some(s => s.id === a.trackId)) { show('Song ist schon in der Liste.'); return }
        const next = { ...cur, songs: [...cur.songs, toListSong(a)] }
        if (search?.forMissing) next.missing = (cur.missing || []).filter(m => m.spotifyId !== search.forMissing)
        if (await persist(next)) { show(`„${a.trackName}“ hinzugefügt.`); if (search?.forMissing) setSearch(null) }
    }

    const togglePreview = (id, url) => {
        if (!audioRef.current) audioRef.current = new Audio()
        const a = audioRef.current
        if (playingId === id) { a.pause(); setPlayingId(null); return }
        a.src = url
        a.play().catch(() => {})
        a.onended = () => setPlayingId(null)
        setPlayingId(id)
    }

    const doDelete = async () => {
        setDeleting(true)
        try { await deleteList(db, list.id); onDeleted(list.id) } catch (e) { show(`Löschen fehlgeschlagen: ${errText(e)}`, true) }
        setDeleting(false)
        setConfirmDelete(false)
    }

    const f = filter.trim().toLowerCase()
    const shown = f ? list.songs.filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(f)) : list.songs
    const missing = list.missing || []
    const running = job && !job.finished
    const pct = job?.total ? Math.round((job.done / job.total) * 100) : 100

    return (
        <>
            <header className={styles.header}>
                <button type="button" className={`${styles.btn} ${styles.iconBtn}`} onClick={onClose} disabled={running} aria-label="Zurück zur Übersicht"><IconBack /></button>
                <h1 className={styles.title}>{list.emoji} {list.name}</h1>
            </header>
            <main className={styles.main}>
                <p className={styles.muted}>{list.songs.length} Songs · ID {list.id}{list.songs.length >= MAX_SONGS ? ` · Höchstgrenze ${MAX_SONGS} erreicht` : ''}</p>

                <section className={styles.card}>
                    <h2 className={styles.h2}>Name</h2>
                    <div className={styles.row}>
                        <input className={`${styles.input} ${styles.emojiInput}`} value={emoji} onChange={e => setEmoji(e.target.value)} aria-label="Emoji" maxLength={8} />
                        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} aria-label="Name der Liste" maxLength={60} />
                        <button type="button" className={`${styles.btn} ${styles.primarySm}`} onClick={saveMeta} disabled={!changed}><IconCheck size={18} />Speichern</button>
                    </div>
                </section>

                <section className={styles.card}>
                    <h2 className={styles.h2}>Songs hinzufügen</h2>
                    <p className={styles.muted}>Spotify-Song-Links einfügen, z. B. in der Spotify-Desktop-App Playlist öffnen, Strg+A, Strg+C. Schon enthaltene Songs werden übersprungen. Dauer: etwa 3–6 Sekunden pro Song – Tab offen lassen.</p>
                    <textarea className={styles.textarea} value={links} onChange={e => setLinks(e.target.value)} rows={5} disabled={running}
                        placeholder="https://open.spotify.com/track/…" aria-label="Spotify-Links" />
                    <div className={styles.row}>
                        <span className={styles.muted}>{spotifyIdsFromText(links).length} Links erkannt</span>
                        {running
                            ? <button type="button" className={`${styles.btn} ${styles.secondary}`} onClick={() => { cancelRef.current = true }}>Abbrechen</button>
                            : <button type="button" className={`${styles.btn} ${styles.primarySm}`} onClick={addLinks} disabled={!links.trim()}><IconPlus size={18} />Hinzufügen</button>}
                    </div>
                    {job && (
                        <div className={styles.job} role="status">
                            {job.total > 0 && <div className={styles.bar}><span style={{ width: `${pct}%` }} /></div>}
                            <p>{job.finished ? (job.cancelled ? 'Abgebrochen.' : 'Fertig.') : `${job.done}/${job.total} · ${job.waiting ? 'Apple bremst – kurze Pause …' : job.label}`}</p>
                            <p className={styles.muted}>Neu: {job.added} · übersprungen: {job.skipped} · nicht gefunden: {job.missing}</p>
                        </div>
                    )}
                </section>

                {missing.length > 0 && (
                    <section className={styles.card}>
                        <h2 className={styles.h2}>Nicht gefunden ({missing.length})</h2>
                        <p className={styles.muted}>Apples freie Suche kennt nicht jeden Song. Such von Hand nach einer passenden Version oder verwirf den Eintrag.</p>
                        <ul className={styles.list}>
                            {missing.map(m => (
                                <li key={m.spotifyId} className={styles.missRow}>
                                    <span className={styles.rowText}><span className={styles.rowName}>{m.title}</span><span className={styles.rowMeta}>{m.artist}</span></span>
                                    <button type="button" className={`${styles.btn} ${styles.secondarySm}`} onClick={() => runSearch(`${m.artist} ${m.title}`.trim(), m.spotifyId)}><IconSearch size={16} />Suchen</button>
                                    <button type="button" className={`${styles.btn} ${styles.iconBtnSm}`} onClick={() => dropMissing(m.spotifyId)} aria-label="Verwerfen"><IconX size={16} /></button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <section className={styles.card}>
                    <h2 className={styles.h2}>{search?.forMissing ? 'Passende Version suchen' : 'Song bei Apple suchen'}</h2>
                    <form className={styles.row} onSubmit={e => { e.preventDefault(); const q = e.currentTarget.q.value.trim(); if (q) runSearch(q, search?.forMissing || null) }}>
                        <input name="q" key={search?.q || 'leer'} defaultValue={search?.q || ''} className={styles.input} placeholder="Interpret und Titel" aria-label="Apple-Suche" />
                        <button type="submit" className={`${styles.btn} ${styles.secondarySm}`}><IconSearch size={16} />Suchen</button>
                    </form>
                    {search?.busy && <p className={styles.muted}>Sucht …</p>}
                    {search && !search.busy && search.results.length === 0 && <p className={styles.muted}>Keine Treffer.</p>}
                    <ul className={styles.list}>
                        {(search?.results || []).map(a => (
                            <li key={a.trackId} className={styles.songRow}>
                                <img src={a.artworkUrl60} alt="" className={styles.coverSm} />
                                <span className={styles.rowText}>
                                    <span className={styles.rowName}>{a.trackName}</span>
                                    <span className={styles.rowMeta}>{a.artistName} · {a.collectionName} · {String(a.releaseDate || '').slice(0, 4)}</span>
                                </span>
                                <button type="button" className={`${styles.btn} ${styles.iconBtnSm}`} onClick={() => togglePreview(a.trackId, a.previewUrl)} aria-label="Hörprobe">
                                    {playingId === a.trackId ? <IconPause size={16} /> : <IconPlay size={16} />}
                                </button>
                                <button type="button" className={`${styles.btn} ${styles.primarySm}`} onClick={() => addFromSearch(a)}><IconPlus size={16} />Nehmen</button>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.card}>
                    <div className={styles.row}>
                        <h2 className={styles.h2}>Songs ({list.songs.length})</h2>
                        <input className={`${styles.input} ${styles.filter}`} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtern" aria-label="Songs filtern" />
                    </div>
                    <ul className={styles.list}>
                        {shown.map(s => (
                            <li key={s.id} className={styles.songRow}>
                                {s.cover ? <img src={s.cover} alt="" className={styles.coverSm} loading="lazy" /> : <span className={styles.coverSm} />}
                                <span className={styles.rowText}>
                                    <span className={styles.rowName}>{s.title}</span>
                                    <span className={styles.rowMeta}>{s.artist}{s.year ? ` · ${s.year}` : ''}</span>
                                </span>
                                <button type="button" className={`${styles.btn} ${styles.iconBtnSm}`} onClick={() => togglePreview(s.id, s.preview)} aria-label="Hörprobe">
                                    {playingId === s.id ? <IconPause size={16} /> : <IconPlay size={16} />}
                                </button>
                                <button type="button" className={`${styles.btn} ${styles.iconBtnSm}`} onClick={() => removeSong(s.id)} disabled={running} aria-label={`„${s.title}“ entfernen`}><IconTrash size={16} /></button>
                            </li>
                        ))}
                    </ul>
                </section>

                <button ref={deleteBtnRef} type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => setConfirmDelete(true)} disabled={running}>
                    <IconTrash size={18} />Liste löschen
                </button>
            </main>
            <ConfirmSheet
                open={confirmDelete}
                title={`„${list.name}“ löschen?`}
                text={`Die Liste mit ${list.songs.length} Songs verschwindet aus Identify. Das kann nicht rückgängig gemacht werden.`}
                cancelLabel="Behalten"
                confirmLabel="Liste löschen"
                onCancel={() => setConfirmDelete(false)}
                onConfirm={doDelete}
                returnFocusRef={deleteBtnRef}
                busy={deleting}
            />
        </>
    )
}
