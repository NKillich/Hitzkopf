import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchIndex, fetchList, saveList, slugFor } from '../SecondSound/listStore.js'
import { matchToApple, parseExportifyCsv } from '../SecondSound/appleMatch.js'

// Warteschlange für CSV-Importe (Exportify): Dateien werden der Reihe nach abgearbeitet, auch während man andere Listen
// bearbeitet. Inhalt und Stand liegen im Browser (localStorage) → nach Neuladen geht es an der richtigen Stelle weiter
// (bereits verarbeitete Songs erkennt die Liste an ihren Spotify-IDs).
const KEY = 'identify_studio_queue_v1'
const SAVE_EVERY = 10

const loadQueue = () => {
    try {
        const q = JSON.parse(localStorage.getItem(KEY) || '[]')
        return Array.isArray(q) ? q.map(e => (e.status === 'running' ? { ...e, status: 'waiting' } : e)) : []
    } catch { return [] }
}
const storeQueue = (q) => { try { localStorage.setItem(KEY, JSON.stringify(q)); return true } catch { return false } }
export const nameFromFile = (n) => String(n || '').replace(/\.csv$/i, '').replace(/_+/g, ' ').trim().slice(0, 60) || 'Neue Liste'
const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * db: Firestore (Studio-Instanz). Callbacks: onListSaved(list) nach jedem Speichern, isBlocked(listId) → true, solange
 * der Editor selbst an dieser Liste arbeitet, onError(text).
 */
export default function useImportQueue({ db, onListSaved, isBlocked, onError }) {
    const [queue, setQueue] = useState(loadQueue)
    const qRef = useRef(queue)                      // aktueller Stand für die Abarbeitung (ohne veraltete Closures)
    const [live, setLive] = useState(null)          // { qid, label, waiting } – was gerade gesucht wird
    const runningRef = useRef(false)
    const enabledRef = useRef(false)                // erst nach dem Login abarbeiten
    const cancelRef = useRef(null)                  // qid, die abgebrochen werden soll
    const cbRef = useRef({})
    useEffect(() => { cbRef.current = { onListSaved, isBlocked, onError } })

    const update = useCallback((fn) => {
        qRef.current = fn(qRef.current)
        if (!storeQueue(qRef.current)) cbRef.current.onError?.('Die Warteschlange ist zu groß für den Browser-Speicher – sie geht beim Neuladen verloren.')
        setQueue(qRef.current)
    }, [])
    const patch = useCallback((qid, p) => update(q => q.map(e => (e.qid === qid ? { ...e, ...p } : e))), [update])

    const runEntry = useCallback(async (e) => {
        const cb = () => cbRef.current
        patch(e.qid, { status: 'running', error: null })
        // Ziel: angegebene Liste, sonst Liste mit gleichem Namen ergänzen, sonst neu anlegen
        let list = e.targetId ? await fetchList(db, e.targetId) : null
        if (!list) {
            const index = await fetchIndex(db)
            const same = index.find(l => l.name.trim().toLowerCase() === e.name.trim().toLowerCase())
            if (same) list = await fetchList(db, same.id)
            if (!list) list = await saveList(db, { id: slugFor(e.name, index.map(l => l.id)), name: e.name, songs: [], missing: [], spotifyIds: [] })
            cb().onListSaved?.(list)
        }
        patch(e.qid, { targetId: list.id, listName: list.name })

        const known = new Set(list.spotifyIds || [])
        const todo = (e.items || []).filter(it => !it.spotifyId || !known.has(it.spotifyId))
        const prog = { total: todo.length, done: 0, added: 0, skipped: (e.items || []).length - todo.length, missing: 0 }
        patch(e.qid, { progress: { ...prog } })
        let wake = null
        try { wake = await navigator.wakeLock?.request('screen') } catch { /* optional */ }
        const albumCache = new Map()
        let pending = 0
        try {
            for (const it of todo) {
                if (cancelRef.current === e.qid) break
                setLive({ qid: e.qid, label: `${it.sp.artists[0]} – ${it.sp.title}`, waiting: false })
                const hit = await matchToApple(it.sp, { albumCache, onWait: () => setLive(l => (l ? { ...l, waiting: true } : l)) })
                if (cancelRef.current === e.qid) break
                const spotifyIds = it.spotifyId ? [...(list.spotifyIds || []), it.spotifyId] : (list.spotifyIds || [])
                if (hit && !list.songs.some(s => s.id === hit.song.id)) { list = { ...list, spotifyIds, songs: [...list.songs, hit.song] }; prog.added++ }
                else if (hit) { list = { ...list, spotifyIds }; prog.skipped++ }
                else {
                    list = { ...list, spotifyIds, missing: [...(list.missing || []), { spotifyId: it.spotifyId || `csv-${Date.now()}-${prog.done}`, artist: it.sp.artists.join(', '), title: it.sp.title }] }
                    prog.missing++
                }
                prog.done++
                patch(e.qid, { progress: { ...prog } })
                if (++pending >= SAVE_EVERY) { pending = 0; list = await saveList(db, list); cb().onListSaved?.(list) }
            }
        } finally {
            try { list = await saveList(db, list); cb().onListSaved?.(list) } catch (err) { cb().onError?.(`Speichern fehlgeschlagen: ${err?.message || err}`) }
            try { await wake?.release() } catch { /* optional */ }
        }
        const cancelled = cancelRef.current === e.qid
        if (cancelled) cancelRef.current = null
        // Fertige Einträge brauchen ihre Songs nicht mehr (spart Browser-Speicher)
        patch(e.qid, { status: cancelled ? 'cancelled' : 'done', progress: { ...prog }, items: cancelled ? e.items : [] })
    }, [db, patch])

    const pumpRef = useRef(null)
    const pump = useCallback(async () => {
        if (runningRef.current || !enabledRef.current) return
        const next = qRef.current.find(e => e.status === 'waiting' && !cbRef.current.isBlocked?.(e.targetId))
        if (!next) return
        runningRef.current = true
        try { await runEntry(next) } catch (err) {
            patch(next.qid, { status: 'error', error: err?.code === 'permission-denied' ? 'Keine Schreibrechte' : (err?.message || 'Fehler') })
        } finally {
            runningRef.current = false
            setLive(null)
            setTimeout(() => pumpRef.current?.(), 0)
        }
    }, [runEntry, patch])
    useEffect(() => { pumpRef.current = pump })

    /** Nach dem Login: abarbeiten (auch was vor dem Neuladen noch offen war) */
    const start = useCallback(() => { enabledRef.current = true; pump() }, [pump])

    /** CSV-Dateien einreihen. targetId/targetName: in diese Liste (sonst Name aus dem Dateinamen) */
    const enqueueFiles = useCallback(async (files, targetId = null, targetName = null) => {
        const added = []
        for (const file of [...(files || [])]) {
            try {
                const items = parseExportifyCsv(await file.text())
                if (!items.length) { cbRef.current.onError?.(`„${file.name}“ enthält keine Songs.`); continue }
                added.push({ qid: newId(), name: targetName || nameFromFile(file.name), fileName: file.name, targetId, items, status: 'waiting', progress: { total: items.length, done: 0, added: 0, skipped: 0, missing: 0 }, error: null })
            } catch (err) { cbRef.current.onError?.(`„${file.name}“: ${err?.message || 'konnte nicht gelesen werden'}`) }
        }
        if (added.length) { update(q => [...q, ...added]); pump() }
        return added.length
    }, [update, pump])

    const cancel = useCallback((qid) => { cancelRef.current = qid }, [])
    const remove = useCallback((qid) => {
        const e = qRef.current.find(x => x.qid === qid)
        if (e?.status === 'running') { cancelRef.current = qid; return }
        update(q => q.filter(x => x.qid !== qid))
    }, [update])
    const rename = useCallback((qid, name) => update(q => q.map(e => (e.qid === qid && e.status === 'waiting' ? { ...e, name: name.slice(0, 60) } : e))), [update])
    const retry = useCallback((qid) => { patch(qid, { status: 'waiting', error: null }); pump() }, [patch, pump])
    const clearFinished = useCallback(() => update(q => q.filter(e => !['done', 'cancelled', 'error'].includes(e.status))), [update])
    /** Weiter abarbeiten, z. B. wenn der Editor eine Liste wieder freigibt */
    const kick = useCallback(() => pump(), [pump])

    const running = queue.find(e => e.status === 'running') || null
    return { queue, live, running, busyListId: running?.targetId || null, start, enqueueFiles, cancel, remove, rename, retry, clearFinished, kick }
}
