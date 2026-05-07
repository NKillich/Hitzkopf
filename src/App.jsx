import { useState, useEffect } from 'react'
import { logEvent } from './firebase.js'
import ProjectHub from './components/ProjectHub'
import HitzkopfGame from './projects/Hitzkopf/HitzkopfGame'
import MusicVoter from './projects/MusicVoter/MusicVoter'
import QuizGame from './projects/QuizGame/QuizGame'
import SecondSound from './projects/SecondSound/SecondSound'
import './App.css'

const PROJECT_META = {
    hitzkopf:    { title: 'Hitzkopf',    emoji: '🔥' },
    musicvoter:  { title: 'Amplify',     emoji: '🎵' },
    quizroyale:  { title: 'Quiz Royale', emoji: '🧠' },
    secondsound: { title: 'Song raten',  emoji: '🎧' },
}

const setPageMeta = (projectId) => {
    const meta = projectId ? PROJECT_META[projectId] : { title: 'Party Games', emoji: '🔥' }
    if (!meta) return
    document.title = meta.title
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.font = '52px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(meta.emoji, 32, 36)
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
    }
    link.href = canvas.toDataURL()
}

// Hash → projectId Mapping (shareable deep-links)
const HASH_MAP = {
    songraten: 'secondsound',
    amplify:   'musicvoter',
    hitzkopf:  'hitzkopf',
    quizroyale:'quizroyale',
}
const ID_TO_HASH = Object.fromEntries(Object.entries(HASH_MAP).map(([h, id]) => [id, h]))

function getInitialProject() {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code')) {
        const returnTo = sessionStorage.getItem('spotify_return_to')
        return returnTo || 'musicvoter'
    }
    const hash = window.location.hash.replace('#', '').toLowerCase()
    return HASH_MAP[hash] ?? null
}

function App() {
    const [currentProject, setCurrentProject] = useState(getInitialProject)

    // URL-Hash und Tab-Meta synchron halten
    useEffect(() => {
        const hash = currentProject ? ID_TO_HASH[currentProject] : null
        window.location.hash = hash ? `#${hash}` : ''
        setPageMeta(currentProject)
    }, [currentProject])

    const handleSelectProject = (projectId) => {
        logEvent('open_project', { project: projectId })
        setCurrentProject(projectId)
    }
    const handleBackToHub = () => setCurrentProject(null)

    return (
        <div className="App">
            {!currentProject && (
                <ProjectHub onSelectProject={handleSelectProject} />
            )}
            
            {currentProject === 'hitzkopf' && (
                <HitzkopfGame onBack={handleBackToHub} />
            )}
            
            {currentProject === 'musicvoter' && (
                <MusicVoter onBack={handleBackToHub} />
            )}

            {currentProject === 'quizroyale' && (
                <QuizGame onBack={handleBackToHub} />
            )}

            {currentProject === 'secondsound' && (
                <SecondSound onBack={handleBackToHub} />
            )}
        </div>
    )
}

export default App
