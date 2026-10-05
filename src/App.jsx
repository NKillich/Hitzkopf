import { useState, useEffect } from 'react'
import { logEvent } from './firebase.js'
import ProjectHub from './components/ProjectHub'
import HitzkopfGame from './projects/Hitzkopf/HitzkopfGame'
import MusicVoter from './projects/MusicVoter/MusicVoter'
import QuizGame from './projects/QuizGame/QuizGame'
import SecondSound from './projects/SecondSound/SecondSound'
import LiveBoard from './projects/MusicVoter/LiveBoard'
import './App.css'

const PROJECT_META = {
    hitzkopf:    { title: 'Hitzkopf',    emoji: '🔥' },
    musicvoter:  { title: 'Amplify',     emoji: '🎵' },
    quizroyale:  { title: 'Quiz Royale', emoji: '🧠' },
    secondsound: { title: 'Song raten',  emoji: '🎧' },
    live:        { title: 'Amplify Live', emoji: '📺' },
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
    live:      'live',         // #live/RAUMCODE – Live-Board einer Amplify-Playlist
}
const ID_TO_HASH = Object.fromEntries(Object.entries(HASH_MAP).map(([h, id]) => [id, h]))

// Hash "#amplify/ABC123" → Projekt + Zusatz (Raumcode)
function parseHash() {
    const [name, param] = window.location.hash.replace('#', '').split('/')
    return { project: HASH_MAP[name.toLowerCase()] ?? null, param: param ? param.toUpperCase() : null }
}

function getInitialProject() {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code')) {
        const returnTo = sessionStorage.getItem('spotify_return_to')
        return returnTo || 'musicvoter'
    }
    return parseHash().project
}

function App() {
    const [currentProject, setCurrentProject] = useState(getInitialProject)
    const [hashParam, setHashParam] = useState(() => parseHash().param)   // nur beim ersten Laden (Beitritts-/Board-Link)

    // URL-Hash und Tab-Meta synchron halten
    useEffect(() => {
        const hash = currentProject ? ID_TO_HASH[currentProject] : null
        const current = parseHash()
        // Raumcode im Hash behalten, solange das Projekt gleich bleibt (#live/ABC123)
        if (!(hash && current.project === currentProject && current.param)) {
            window.location.hash = hash ? `#${hash}` : ''
        }
        setPageMeta(currentProject)
    }, [currentProject])

    const handleSelectProject = (projectId) => {
        logEvent('open_project', { project: projectId })
        setCurrentProject(projectId)
    }
    const handleBackToHub = () => {
        setHashParam(null)
        setCurrentProject(null)
    }

    return (
        <div className="App">
            {!currentProject && (
                <ProjectHub onSelectProject={handleSelectProject} />
            )}
            
            {currentProject === 'hitzkopf' && (
                <HitzkopfGame onBack={handleBackToHub} />
            )}
            
            {currentProject === 'musicvoter' && (
                <MusicVoter onBack={handleBackToHub} joinCode={hashParam} />
            )}

            {currentProject === 'quizroyale' && (
                <QuizGame onBack={handleBackToHub} />
            )}

            {currentProject === 'live' && (
                <LiveBoard roomCode={hashParam} onBack={handleBackToHub} />
            )}

            {currentProject === 'secondsound' && (
                <SecondSound onBack={handleBackToHub} />
            )}
        </div>
    )
}

export default App
