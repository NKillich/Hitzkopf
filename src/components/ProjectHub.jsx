import { useState } from 'react'
import styles from './ProjectHub.module.css'
import hkLogoHorizontal from '../assets/hk_logo_horizontal.png'

const ProjectHub = ({ onSelectProject }) => {
    const [hoveredProject, setHoveredProject] = useState(null)

    const projects = [
        {
            id: 'hitzkopf',
            name: 'Hitzkopf',
            description: 'Das explosive Partyspiel',
            color: '#ff6b35',
            emoji: '🔥',
            available: true
        },
        {
            id: 'musicvoter',
            name: 'Amplify',
            description: 'Gemeinsam den Ton angeben',
            color: '#4ecdc4',
            emoji: '🎵',
            available: true
        },
        {
            id: 'quizroyale',
            name: 'Quiz Royale',
            description: 'Rundenbasiertes Quiz mit Upgrades & Charakteren',
            color: '#9b59b6',
            emoji: '🧠',
            available: true
        }
    ]

    return (
        <div className={styles.projectHub}>
            <div className={styles.backgroundOverlay}></div>
            
            <div className={styles.content}>
                <div className={styles.header}>
                    <div className={styles.logoContainer}>
                        <h1 className={styles.title}>
                            <span className={styles.titleGradient}>Party Games</span>
                        </h1>
                        <p className={styles.subtitle}>Wähle dein Spiel</p>
                    </div>
                </div>

                <div className={styles.projectGrid}>
                    {projects.map(project => (
                        <button
                            key={project.id}
                            className={`${styles.projectCard} ${hoveredProject === project.id ? styles.hovered : ''}`}
                            onClick={() => project.available && onSelectProject(project.id)}
                            onMouseEnter={() => setHoveredProject(project.id)}
                            onMouseLeave={() => setHoveredProject(null)}
                            disabled={!project.available}
                            style={{
                                '--project-color': project.color,
                                '--project-glow': `${project.color}40`
                            }}
                        >
                            <div className={styles.cardGlow}></div>
                            <div className={styles.cardContent}>
                                <div className={styles.projectEmoji}>{project.emoji}</div>
                                <h2 className={styles.projectName}>{project.name}</h2>
                                <p className={styles.projectDescription}>{project.description}</p>
                                
                                {!project.available && (
                                    <div className={styles.comingSoon}>Bald verfügbar</div>
                                )}
                            </div>
                            
                            <div className={styles.cardBorder}></div>
                        </button>
                    ))}
                </div>

                <div className={styles.footer}>
                    <p className={styles.footerText}>Made with ❤️ by Niklas</p>
                </div>
            </div>
        </div>
    )
}

export default ProjectHub
