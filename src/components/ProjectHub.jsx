import { useRef, useState } from 'react'
import useTheme from '../shared/ui/useTheme'
import theme from '../shared/ui/theme.module.css'
import { BottomSheet } from '../shared/ui/BottomSheet'
import QrScanner from '../shared/ui/QrScanner'
import { IconNext, IconGear, IconQr, IconMoon, IconSun } from '../shared/ui/icons'
import { codeFromQr as amplifyCode } from '../projects/Amplify2/avatars'
import { codeFromQr as testifyCode } from '../projects/Testify/store'
import styles from './ProjectHub.module.css'

// Startseite im gemeinsamen App-Design (wie Amplify und Identify).
// Amplify 1.0 und die Live-Boards stehen hier nicht mehr (1.0 bleibt über #amplify erreichbar, Live-Board aus der Lobby).
const GROUPS = [
    {
        label: 'Musik',
        games: [
            { id: 'amplify2', name: 'Amplify', emoji: '🎵', tint: '#1DB954', description: 'Alle schlagen Songs vor und voten – Platz 1 läuft als Nächstes.' },
            { id: 'secondsound', name: 'Identify', emoji: '🎧', tint: '#FF6B2C', description: 'Erkennst du den Song nach 1 Sekunde? Je früher, desto mehr Punkte.' }
        ]
    },
    {
        label: 'Party & Quiz',
        games: [
            { id: 'testify', name: 'Testify', emoji: '💞', tint: '#C791FF', description: 'Wie gut kennt ihr euch? Zwei Handys, eine Frage pro Runde.' },
            { id: 'hitzkopf', name: 'Hitzkopf', emoji: '🔥', tint: '#FF3B30', description: 'Das explosive Partyspiel' },
            { id: 'quizroyale', name: 'Quiz Royale', emoji: '🧠', tint: '#C04CFD', description: 'Quiz mit Upgrades & Charakteren' }
        ]
    }
]

const CODE_RE = /^[A-Z0-9]{4,10}$/

// QR-Code: Einladungslink von Testify (#testify/CODE) führt direkt dorthin, sonst Amplify-Link oder reiner Code
const parseQr = (text) => {
    if (/#testify\//.test(String(text))) {
        const code = testifyCode(text)
        return code ? { code, game: 'testify' } : null
    }
    const code = amplifyCode(text)
    return code ? { code, game: /#amplify2\//.test(String(text)) ? 'amplify2' : null } : null
}

// Offene Amplify-Playlist in diesem Tab
const readAmplifyRoom = () => {
    try { return sessionStorage.getItem('a2_roomId') || null } catch { return null }
}

const ProjectHub = ({ onSelectProject, onJoinCode }) => {
    const { isDark, toggleTheme } = useTheme()
    const amplifyRoom = readAmplifyRoom()
    const [code, setCode] = useState('')
    const [scanning, setScanning] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [joining, setJoining] = useState(false)   // Code wird gerade einem Spiel zugeordnet
    const gearRef = useRef(null)
    const codeOk = CODE_RE.test(code)

    const join = (e) => {
        e?.preventDefault()
        if (codeOk && !joining) { setJoining(true); onJoinCode(code) }
    }

    return (
        <div className={`${styles.hubRoot} ${isDark ? theme.dark : theme.light}`}>
            <div className={styles.hubApp}>
                <header className={styles.hubHeader}>
                    <span className={styles.hubBrand}>Party Games</span>
                    <button ref={gearRef} type="button" className={`${styles.hubBtn} ${styles.hubIconBtn}`} onClick={() => setSettingsOpen(true)} aria-label="Einstellungen" title="Einstellungen">
                        <IconGear />
                    </button>
                </header>

                <main className={styles.hubMain}>
                    <h1 className={styles.hubTitle}>Was spielen wir?</h1>

                    {amplifyRoom && (
                        <button type="button" className={`${styles.hubBtn} ${styles.hubRejoin}`} onClick={() => onSelectProject('amplify2')}>
                            <span className={styles.hubLiveDot} aria-hidden="true" />
                            <span className={styles.hubRowText}>
                                <span className={styles.hubRowName}>Zurück zu deiner Playlist</span>
                                <span className={styles.hubRowMeta}>Amplify · Code {amplifyRoom}</span>
                            </span>
                            <IconNext />
                        </button>
                    )}

                    <section className={styles.hubGroup} aria-labelledby="hub-join-label">
                        <h2 id="hub-join-label" className={styles.hubGroupLabel}>Mitspielen</h2>
                        <form className={styles.hubJoin} onSubmit={join}>
                            <div className={styles.hubCodeWrap}>
                                <input
                                    className={styles.hubCode}
                                    value={code}
                                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                                    placeholder="RAUMCODE"
                                    aria-label="Raumcode (Amplify oder Testify)"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck="false"
                                    enterKeyHint="go"
                                />
                                {codeOk && (
                                    <button type="submit" className={`${styles.hubBtn} ${styles.hubCodeGo}`} aria-label="Beitreten" title="Beitreten">
                                        <IconNext />
                                    </button>
                                )}
                            </div>
                            <button type="button" className={`${styles.hubBtn} ${styles.hubScanBtn}`} onClick={() => setScanning(true)} aria-label="QR-Code scannen" title="QR-Code scannen">
                                <IconQr size={26} />
                            </button>
                        </form>
                    </section>

                    {GROUPS.map(group => (
                        <section key={group.label} className={styles.hubGroup} aria-label={group.label}>
                            <h2 className={styles.hubGroupLabel}>{group.label}</h2>
                            <div className={styles.hubGrid}>
                                {group.games.map(game => (
                                    <button key={game.id} type="button" className={`${styles.hubBtn} ${styles.hubCard}`} onClick={() => onSelectProject(game.id)}>
                                        <span className={styles.hubEmoji} style={{ '--tint': game.tint }} aria-hidden="true">{game.emoji}</span>
                                        <span className={styles.hubCardText}>
                                            <span className={styles.hubCardName}>{game.name}</span>
                                            <span className={styles.hubCardDesc}>{game.description}</span>
                                        </span>
                                        <span className={styles.hubChevron}><IconNext /></span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </main>

                {scanning && (
                    <QrScanner parse={parseQr} invalidText="Das ist kein Raumcode."
                        onCode={(c) => { setScanning(false); onJoinCode(c.code, c.game) }} onClose={() => setScanning(false)} />
                )}

                <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} labelledBy="hub-settings-title" returnFocusRef={gearRef}>
                    <h2 id="hub-settings-title" className={styles.hubSheetTitle}>Einstellungen</h2>
                    <p className={styles.hubSheetLabel} id="hub-theme-label">Design</p>
                    <div className={styles.hubSeg} role="radiogroup" aria-labelledby="hub-theme-label">
                        {[[false, 'Hell', <IconSun key="s" />], [true, 'Dunkel', <IconMoon key="m" />]].map(([dark, label, icon]) => (
                            <button key={label} type="button" role="radio" aria-checked={isDark === dark}
                                className={`${styles.hubBtn} ${styles.hubSegBtn} ${isDark === dark ? styles.hubSegOn : ''}`}
                                onClick={() => { if (isDark !== dark) toggleTheme() }}>
                                {icon}{label}
                            </button>
                        ))}
                    </div>
                    <button type="button" className={`${styles.hubBtn} ${styles.hubSheetClose}`} onClick={() => setSettingsOpen(false)}>Fertig</button>
                </BottomSheet>
            </div>
        </div>
    )
}

export default ProjectHub
