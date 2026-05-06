import { useState } from 'react'
import ProjectHub from './components/ProjectHub'
import HitzkopfGame from './projects/Hitzkopf/HitzkopfGame'
import MusicVoter from './projects/MusicVoter/MusicVoter'
import QuizGame from './projects/QuizGame/QuizGame'
import SecondSound from './projects/SecondSound/SecondSound'
import './App.css'

function App() {
    const [currentProject, setCurrentProject] = useState(() => {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        if (params.get('code')) {
            const returnTo = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('spotify_return_to') : null
            return returnTo || 'musicvoter'
        }
        return null
    })

    const handleSelectProject = (projectId) => {
        setCurrentProject(projectId)
    }

    const handleBackToHub = () => {
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
