import { useState } from 'react'
import styles from './LobbySystem.module.css'

const adjectives = [
    'Crazy', 'Wild', 'Happy', 'Sleepy', 'Sneaky', 'Fluffy', 'Grumpy', 'Lazy',
    'Brave', 'Clumsy', 'Fancy', 'Jolly', 'Mighty', 'Spicy', 'Turbo', 'Funky',
    'Dizzy', 'Cheeky', 'Bouncy', 'Silly', 'Stormy', 'Snappy', 'Zesty', 'Peppy',
    'Jumpy', 'Fuzzy', 'Nutty', 'Sassy', 'Feisty', 'Crunchy'
]
const animals = [
    'Unicorn', 'Dragon', 'Panda', 'Tiger', 'Wolf', 'Bear', 'Fox', 'Penguin',
    'Koala', 'Dolphin', 'Eagle', 'Gecko', 'Hamster', 'Llama', 'Meerkat',
    'Narwhal', 'Platypus', 'Quokka', 'Raccoon', 'Sloth', 'Capybara', 'Axolotl',
    'Wombat', 'Flamingo', 'Otter', 'Hedgehog', 'Chameleon', 'Manatee', 'Tapir', 'Binturong'
]
const emojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']

export const generateRandomName = () => {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const animal = animals[Math.floor(Math.random() * animals.length)]
    return `${adj}${animal}`
}

const generateRandomEmoji = () => emojis[Math.floor(Math.random() * emojis.length)]

const LobbySystem = ({
    onCreateLobby,
    storagePrefix = 'lobby',
    title = 'Lobby System',
    buttonText = 'Lobby erstellen',
    accentColor = '#4ecdc4',
    onBack = null,
    onSpotifyConnect = null,
    spotifyConnected = false
}) => {
    const [myName] = useState(() => {
        const stored = sessionStorage.getItem(`${storagePrefix}_name`)
        if (stored) return stored
        const name = generateRandomName()
        sessionStorage.setItem(`${storagePrefix}_name`, name)
        return name
    })
    const [myEmoji] = useState(() => {
        const stored = sessionStorage.getItem(`${storagePrefix}_emoji`)
        if (stored) return stored
        const emoji = generateRandomEmoji()
        sessionStorage.setItem(`${storagePrefix}_emoji`, emoji)
        return emoji
    })

    const handleCreateLobby = () => {
        onCreateLobby({ name: myName, emoji: myEmoji })
    }

    return (
        <div className={styles.lobbySystem} style={{ '--accent-color': accentColor }}>
            <div className={styles.screen}>
                <h1 className={styles.title}>{title}</h1>

                <div className={styles.randomNameDisplay}>
                    <span className={styles.randomNameLabel}>Dein Name</span>
                    <span className={styles.randomNameValue}>{myName}</span>
                </div>

                {onSpotifyConnect && (
                    <button
                        type="button"
                        className={spotifyConnected ? styles.spotifyConnectedBadge : styles.spotifyConnectBtn}
                        onClick={spotifyConnected ? undefined : onSpotifyConnect}
                        disabled={spotifyConnected}
                    >
                        {spotifyConnected ? '✓ Spotify verbunden' : '🎧 Mit Spotify verbinden'}
                    </button>
                )}

                <div className={styles.buttonGroup}>
                    <button
                        className={styles.btnPrimary}
                        onClick={handleCreateLobby}
                    >
                        {buttonText}
                    </button>
                </div>
            </div>

            {onBack && (
                <button
                    onClick={onBack}
                    className={styles.backButtonBottom}
                >
                    ← Zurück
                </button>
            )}
        </div>
    )
}

export default LobbySystem
