import { useState, useEffect } from 'react'
import ProjectHub from './components/ProjectHub'
import HitzkopfGame from './projects/Hitzkopf/HitzkopfGame'
import MusicVoter from './projects/MusicVoter/MusicVoter'
import spotifyService from './services/spotifyService'
import './App.css'

function App() {
    const [currentProject, setCurrentProject] = useState(() => {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        return params.get('code') ? 'musicvoter' : null
    })
    const [spotifyCallbackDone, setSpotifyCallbackDone] = useState(false)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (!code || spotifyCallbackDone) return

        let cancelled = false
        ;(async () => {
            try {
                await spotifyService.exchangeCodeForToken(code)
                if (cancelled) return
                window.history.replaceState({}, '', window.location.pathname || '/')
                setCurrentProject('musicvoter')
            } catch (e) {
                console.error('Spotify Callback Fehler:', e)
                if (!cancelled) alert('Spotify-Verbindung fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler'))
            } finally {
                if (!cancelled) setSpotifyCallbackDone(true)
            }
        })()
        return () => { cancelled = true }
    }, [spotifyCallbackDone])

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
                <MusicVoter onBack={handleBackToHub} spotifyCallbackDone={spotifyCallbackDone} />
            )}
        </div>
    )
}

export default App
