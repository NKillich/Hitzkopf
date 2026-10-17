import { useState } from 'react'
import { IconPlus, IconX, IconRetry } from '../../shared/ui/icons'
import styles from './IdentifyStudio.module.css'

const STATUS = {
    waiting: 'wartet',
    running: 'läuft',
    done: 'fertig',
    cancelled: 'abgebrochen',
    error: 'Fehler'
}

/** Warteschlange der CSV-Importe: Dateien hinzufügen (auch per Ziehen), Stand je Datei, Abbrechen/Entfernen */
export default function QueuePanel({ q }) {
    const [over, setOver] = useState(false)
    const { queue, live } = q
    const open = queue.filter(e => e.status === 'waiting' || e.status === 'running').length
    const finished = queue.length - open

    const onDrop = (e) => {
        e.preventDefault()
        setOver(false)
        const files = [...(e.dataTransfer?.files || [])].filter(f => /\.csv$/i.test(f.name))
        if (files.length) q.enqueueFiles(files)
    }

    return (
        <section className={`${styles.card} ${over ? styles.dropOver : ''}`}
            onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <div className={styles.row}>
                <h2 className={styles.h2}>Warteschlange{open ? ` (${open} offen)` : ''}</h2>
                {finished > 0 && <button type="button" className={`${styles.btn} ${styles.link}`} onClick={q.clearFinished}>Fertige ausblenden</button>}
            </div>
            <p className={styles.muted}>
                CSV-Dateien von <a href="https://exportify.net" target="_blank" rel="noreferrer">exportify.net</a> auswählen oder hierher ziehen – auch mehrere und jederzeit weitere.
                Jede Datei wird zu einer Liste (Name = Dateiname; gibt es den Namen schon, wird diese Liste ergänzt). Die Dateien werden nacheinander abgearbeitet,
                du kannst währenddessen andere Listen bearbeiten. Kein Spotify-Kontingent nötig.
            </p>
            <label className={`${styles.btn} ${styles.primarySm} ${styles.fileBtn}`}>
                <IconPlus size={18} />CSV-Dateien hinzufügen
                <input type="file" accept=".csv,text/csv" multiple onChange={e => { q.enqueueFiles(e.target.files); e.target.value = '' }} />
            </label>

            {queue.length > 0 && (
                <ul className={styles.list}>
                    {queue.map(e => {
                        const p = e.progress || {}
                        const pct = p.total ? Math.round((p.done / p.total) * 100) : (e.status === 'done' ? 100 : 0)
                        const isLive = live?.qid === e.qid
                        return (
                            <li key={e.qid} className={styles.queueRow}>
                                <div className={styles.queueTop}>
                                    {e.status === 'waiting'
                                        ? <input className={`${styles.input} ${styles.queueName}`} value={e.name} maxLength={60}
                                            onChange={ev => q.rename(e.qid, ev.target.value)} aria-label={`Listenname für ${e.fileName}`} />
                                        : <span className={styles.rowName}>{e.listName || e.name}</span>}
                                    <span className={`${styles.badge} ${styles[`badge_${e.status}`] || ''}`}>{STATUS[e.status] || e.status}</span>
                                    {(e.status === 'error' || e.status === 'cancelled') && (
                                        <button type="button" className={`${styles.btn} ${styles.iconBtnSm}`} onClick={() => q.retry(e.qid)} aria-label="Nochmal versuchen" title="Nochmal versuchen"><IconRetry size={16} /></button>
                                    )}
                                    <button type="button" className={`${styles.btn} ${styles.iconBtnSm}`} onClick={() => q.remove(e.qid)}
                                        aria-label={e.status === 'running' ? 'Abbrechen' : 'Entfernen'} title={e.status === 'running' ? 'Abbrechen' : 'Entfernen'}><IconX size={16} /></button>
                                </div>
                                {(e.status === 'running' || e.status === 'done' || e.status === 'cancelled') && p.total > 0 && (
                                    <div className={styles.bar}><span style={{ width: `${pct}%` }} /></div>
                                )}
                                <p className={styles.rowMeta}>
                                    {e.status === 'waiting' && `${(e.items || []).length} Songs · ${e.fileName}`}
                                    {e.status === 'running' && `${p.done}/${p.total} · ${isLive ? (live.waiting ? 'Apple bremst – kurze Pause …' : live.label) : 'startet …'}`}
                                    {(e.status === 'done' || e.status === 'cancelled') && `Neu: ${p.added} · übersprungen: ${p.skipped} · nicht gefunden: ${p.missing}`}
                                    {e.status === 'error' && (e.error || 'Unbekannter Fehler')}
                                </p>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}
