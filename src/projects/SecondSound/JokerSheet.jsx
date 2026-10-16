import { BottomSheet } from '../../shared/ui/BottomSheet'
import { JOKERS } from './songGuess.js'
import styles from './SecondSound.module.css'

/** Joker-Auswahl: jeder Joker einmal pro Song, die Kosten werden sofort abgezogen */
export default function JokerSheet({ open, onClose, onUse, used, unavailable, returnFocusRef }) {
    return (
        <BottomSheet open={open} onClose={onClose} labelledBy="sr-joker-title" returnFocusRef={returnFocusRef}>
            <h2 id="sr-joker-title" className={styles.srBonusTitle}>Joker</h2>
            <p className={styles.srBonusText}>Hilft beim Raten – kostet aber Punkte, auch wenn du danebenliegst.</p>
            <ul className={styles.srJokerList}>
                {JOKERS.map(j => {
                    const isUsed = used.includes(j.id)
                    const off = isUsed || unavailable.includes(j.id)
                    return (
                        <li key={j.id}>
                            <button type="button" className={`${styles.srBtn} ${styles.srJoker} ${isUsed ? styles.srJokerUsed : ''}`}
                                disabled={off} onClick={() => onUse(j.id)}>
                                <span className={styles.srJokerText}>
                                    <span className={styles.srJokerName}>{j.name}</span>
                                    <span className={styles.srJokerDesc}>{isUsed ? 'Schon eingesetzt' : (unavailable.includes(j.id) ? 'Gerade nicht verfügbar' : j.desc)}</span>
                                </span>
                                <span className={styles.srJokerCost}>−{j.cost} P</span>
                            </button>
                        </li>
                    )
                })}
            </ul>
            <button type="button" className={`${styles.srBtn} ${styles.srBonusSkip}`} onClick={onClose}>Schließen</button>
        </BottomSheet>
    )
}
