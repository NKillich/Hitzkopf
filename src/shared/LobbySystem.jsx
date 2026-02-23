import { useState, useRef, useEffect } from 'react'
import styles from './LobbySystem.module.css'

// Emojis für Charakter-Auswahl
const baseEmojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']
const availableEmojis = (() => {
    const shuffled = [...baseEmojis]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
})()

const LobbySystem = ({ 
    onCreateLobby, 
    onJoinLobby, 
    storagePrefix = 'lobby',
    title = 'Lobby System',
    buttonText = 'Lobby erstellen',
    accentColor = '#4ecdc4',
    onBack = null
}) => {
    const [screen, setScreen] = useState('start')
    const [myName, setMyName] = useState(sessionStorage.getItem(`${storagePrefix}_name`) || '')
    const [myEmoji, setMyEmoji] = useState(() => {
        const middleIndex = Math.floor(availableEmojis.length / 2)
        return availableEmojis[middleIndex]
    })
    const [roomId, setRoomId] = useState('')
    const [emojiScrollIndex, setEmojiScrollIndex] = useState(Math.floor(availableEmojis.length / 2))
    
    const emojiGalleryRef = useRef(null)
    const isScrollingRef = useRef(false)
    const touchStartRef = useRef({ x: 0, y: 0, time: 0 })

    useEffect(() => {
        const gallery = emojiGalleryRef.current
        if (!gallery) return

        const handleScroll = () => {
            isScrollingRef.current = true
            const scrollLeft = gallery.scrollLeft
            const itemWidth = gallery.scrollWidth / (availableEmojis.length + 2)
            const index = Math.round(scrollLeft / itemWidth)
            setEmojiScrollIndex(Math.max(0, Math.min(index, availableEmojis.length - 1)))
            setMyEmoji(availableEmojis[Math.max(0, Math.min(index, availableEmojis.length - 1))])
            
            setTimeout(() => {
                isScrollingRef.current = false
            }, 100)
        }

        gallery.addEventListener('scroll', handleScroll)
        
        const centerEmoji = () => {
            const itemWidth = gallery.scrollWidth / (availableEmojis.length + 2)
            gallery.scrollLeft = emojiScrollIndex * itemWidth
        }
        setTimeout(centerEmoji, 100)

        return () => gallery.removeEventListener('scroll', handleScroll)
    }, [emojiScrollIndex])

    const handleNameChange = (e) => {
        const name = e.target.value.slice(0, 20)
        setMyName(name)
        sessionStorage.setItem(`${storagePrefix}_name`, name)
    }

    const selectEmoji = (emoji) => {
        const index = availableEmojis.indexOf(emoji)
        setEmojiScrollIndex(index)
        setMyEmoji(emoji)
        
        const gallery = emojiGalleryRef.current
        if (gallery) {
            const itemWidth = gallery.scrollWidth / (availableEmojis.length + 2)
            gallery.scrollTo({
                left: index * itemWidth,
                behavior: 'smooth'
            })
        }
    }

    const handleCreateLobby = () => {
        if (!myName.trim()) {
            alert('Bitte gib einen Namen ein!')
            return
        }
        sessionStorage.setItem(`${storagePrefix}_name`, myName)
        sessionStorage.setItem(`${storagePrefix}_emoji`, myEmoji)
        onCreateLobby({ name: myName, emoji: myEmoji })
    }

    const handleJoinLobby = () => {
        if (!myName.trim()) {
            alert('Bitte gib einen Namen ein!')
            return
        }
        if (!roomId.trim()) {
            alert('Bitte gib einen Lobby-Code ein!')
            return
        }
        sessionStorage.setItem(`${storagePrefix}_name`, myName)
        sessionStorage.setItem(`${storagePrefix}_emoji`, myEmoji)
        onJoinLobby({ name: myName, emoji: myEmoji, roomId: roomId.toUpperCase() })
    }

    return (
        <div className={styles.lobbySystem} style={{ '--accent-color': accentColor }}>
            {/* Start Screen */}
            {screen === 'start' && (
                <div className={styles.screen}>
                    <h1 className={styles.title}>{title}</h1>
                    
                    <input 
                        type="text" 
                        value={myName}
                        onChange={handleNameChange}
                        placeholder="Dein Name" 
                        maxLength={20} 
                        autoComplete="name"
                        className={styles.nameInput}
                    />
                    
                    <div className={styles.emojiGalleryWrapper}>
                        <div 
                            ref={emojiGalleryRef}
                            className={styles.emojiGallery}
                        >
                            <div className={styles.emojiSpacer}></div>
                            
                            {availableEmojis.map((emoji, index) => {
                                const isSelected = index === emojiScrollIndex
                                
                                return (
                                    <div
                                        key={`${emoji}-${index}`}
                                        className={`${styles.emojiCard} ${isSelected ? styles.selected : ''}`}
                                        onClick={() => {
                                            if (!isScrollingRef.current) {
                                                selectEmoji(emoji)
                                            }
                                        }}
                                        onTouchStart={(e) => {
                                            touchStartRef.current = {
                                                x: e.touches[0].clientX,
                                                y: e.touches[0].clientY,
                                                time: Date.now()
                                            }
                                        }}
                                        onTouchMove={(e) => {
                                            if (touchStartRef.current.x !== 0) {
                                                const deltaX = Math.abs(e.touches[0].clientX - touchStartRef.current.x)
                                                const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y)
                                                if (deltaX > 10 || deltaY > 10) {
                                                    isScrollingRef.current = true
                                                }
                                            }
                                        }}
                                        onTouchEnd={() => {
                                            setTimeout(() => {
                                                touchStartRef.current = { x: 0, y: 0, time: 0 }
                                            }, 50)
                                        }}
                                    >
                                        <div className={styles.emojiCharacter}>{emoji}</div>
                                    </div>
                                )
                            })}
                            
                            <div className={styles.emojiSpacer}></div>
                        </div>
                    </div>

                    <div className={styles.buttonGroup}>
                        <button 
                            className={styles.btnPrimary}
                            onClick={handleCreateLobby}
                        >
                            {buttonText}
                        </button>
                    </div>
                </div>
            )}

            {/* Join Screen */}
            {screen === 'join' && (
                <div className={styles.screen}>
                    <h1 className={styles.title}>Lobby beitreten</h1>
                    
                    <input 
                        type="text" 
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                        placeholder="Lobby-Code" 
                        maxLength={6}
                        className={styles.roomInput}
                    />

                    <div className={styles.buttonGroup}>
                        <button 
                            className={styles.btnPrimary}
                            onClick={handleJoinLobby}
                        >
                            Beitreten
                        </button>
                        <button 
                            className={styles.btnSecondary}
                            onClick={() => setScreen('start')}
                        >
                            Zurück
                        </button>
                    </div>
                </div>
            )}
            
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
