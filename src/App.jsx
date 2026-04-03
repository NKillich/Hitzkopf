import { useState } from 'react'
import ProjectHub from './components/ProjectHub'
import HitzkopfGame from './projects/Hitzkopf/HitzkopfGame'
import MusicVoter from './projects/MusicVoter/MusicVoter'
import QuizGame from './projects/QuizGame/QuizGame'
import './App.css'

function App() {
    const [currentProject, setCurrentProject] = useState(() => {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        return params.get('code') ? 'musicvoter' : null
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
        </div>
    )
}

export default App
