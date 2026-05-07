import { useState, useEffect } from 'react'
import { logEvent } from './firebase.js'
import ProjectHub from './components/ProjectHub'
import HitzkopfGame from './projects/Hitzkopf/HitzkopfGame'
import MusicVoter from './projects/MusicVoter/MusicVoter'
import QuizGame from './projects/QuizGame/QuizGame'
import SecondSound from './projects/SecondSound/SecondSound'
import './App.css'

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

    // URL-Hash synchron halten
    useEffect(() => {
        const hash = currentProject ? ID_TO_HASH[currentProject] : null
        window.location.hash = hash ? `#${hash}` : ''
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
