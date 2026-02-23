import { useState } from 'react'
import ProjectHub from './components/ProjectHub'
import HitzkopfGame from './projects/Hitzkopf/HitzkopfGame'
import MusicVoter from './projects/MusicVoter/MusicVoter'
import './App.css'

function App() {
    const [currentProject, setCurrentProject] = useState(null)

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
        </div>
    )
}

export default App
