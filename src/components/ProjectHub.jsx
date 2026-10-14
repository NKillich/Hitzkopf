import useTheme from '../shared/ui/useTheme'
import theme from '../shared/ui/theme.module.css'
import { IconMoon, IconSun, IconNext, IconTv } from '../shared/ui/icons'
import styles from './ProjectHub.module.css'

// Startseite im gemeinsamen App-Design (wie Amplify und Song raten)
const GROUPS = [
    {
        label: 'Musik',
        games: [
            { id: 'amplify2', name: 'Amplify 2.0', emoji: '🎵', description: 'Sammelt gemeinsam Songs und stimmt ab. Die beliebtesten laufen zuerst.', tag: 'Neu' },
            { id: 'musicvoter', name: 'Amplify 1.0', emoji: '🎵', description: 'Die bewährte Version zum Vergleichen.', tag: 'Klassisch' },
            { id: 'secondsound', name: 'Song raten', emoji: '🎧', description: 'Erkennst du den Song nach 1, 5, 10 oder 30 Sekunden?', tag: 'Spotify' }
        ]
    },
    {
        label: 'Party & Quiz',
        games: [
            { id: 'hitzkopf', name: 'Hitzkopf', emoji: '🔥', description: 'Das explosive Partyspiel' },
            { id: 'quizroyale', name: 'Quiz Royale', emoji: '🧠', description: 'Rundenbasiertes Quiz mit Upgrades & Charakteren' }
        ]
    }
]

// Offene Amplify-Playlists in diesem Tab (1.0 und 2.0 haben getrennte Sitzungen)
const readAmplifyRooms = () => {
    const read = (key) => { try { return sessionStorage.getItem(key) || null } catch { return null } }
    return [
        { id: 'amplify2', label: 'Amplify 2.0', code: read('a2_roomId') },
        { id: 'musicvoter', label: 'Amplify 1.0', code: read('mv_roomId') }
    ].filter(r => r.code)
}

const ProjectHub = ({ onSelectProject }) => {
    const { isDark, toggleTheme } = useTheme()
    const amplifyRooms = readAmplifyRooms()
    const themeLabel = isDark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'

    return (
        <div className={`${styles.hubRoot} ${isDark ? theme.dark : theme.light}`}>
            <div className={styles.hubApp}>
                <header className={styles.hubHeader}>
                    <span className={styles.hubBrand}>Party Games</span>
                    <button type="button" className={`${styles.hubBtn} ${styles.hubIconBtn}`} onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
                        {isDark ? <IconSun /> : <IconMoon />}
                    </button>
                </header>

                <main className={styles.hubMain}>
                    <div className={styles.hubHero}>
                        <h1 className={styles.hubTitle}>Was spielen wir?</h1>
                        <p className={styles.hubLead}>Spiele für den Abend mit Freunden – alle machen mit dem eigenen Handy mit.</p>
                    </div>

                    {amplifyRooms.map(r => (
                        <button key={r.id} type="button" className={`${styles.hubBtn} ${styles.hubRejoin}`} onClick={() => onSelectProject(r.id)}>
                            <span className={styles.hubLiveDot} aria-hidden="true" />
                            <span className={styles.hubRowText}>
                                <span className={styles.hubRowName}>Zurück zu deiner Playlist</span>
                                <span className={styles.hubRowMeta}>{r.label} · Code {r.code}</span>
                            </span>
                            <IconNext />
                        </button>
                    ))}

                    {GROUPS.map(group => (
                        <section key={group.label} className={styles.hubGroup} aria-label={group.label}>
                            <h2 className={styles.hubGroupLabel}>{group.label}</h2>
                            <div className={styles.hubGrid}>
                                {group.games.map(game => (
                                    <button key={game.id} type="button" className={`${styles.hubBtn} ${styles.hubCard}`} onClick={() => onSelectProject(game.id)}>
                                        <span className={styles.hubEmoji} aria-hidden="true">{game.emoji}</span>
                                        <span className={styles.hubCardText}>
                                            <span className={styles.hubCardName}>
                                                {game.name}
                                                {game.tag && <span className={styles.hubTag}>{game.tag}</span>}
                                            </span>
                                            <span className={styles.hubCardDesc}>{game.description}</span>
                                        </span>
                                        <span className={styles.hubChevron}><IconNext /></span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}

                    {[['live2', 'Live-Board 2.0', 'Eine Amplify-2.0-Playlist groß auf Fernseher oder Beamer zeigen'],
                        ['live', 'Live-Board 1.0', 'Für Playlists aus Amplify 1.0']].map(([id, name, meta]) => (
                        <button key={id} type="button" className={`${styles.hubBtn} ${styles.hubBoard}`} onClick={() => onSelectProject(id)}>
                            <span className={styles.hubBoardIcon}><IconTv size={22} /></span>
                            <span className={styles.hubRowText}>
                                <span className={styles.hubRowName}>{name}</span>
                                <span className={styles.hubRowMeta}>{meta}</span>
                            </span>
                            <IconNext />
                        </button>
                    ))}

                    <p className={styles.hubFooter}>Made with <span aria-label="Liebe">♥</span> by Niklas</p>
                </main>
            </div>
        </div>
    )
}

export default ProjectHub
