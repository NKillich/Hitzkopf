// Audio Manager - Cached Audio Objects für bessere Performance
// Verhindert, dass bei jedem playSound() ein neues Audio-Objekt erstellt wird

const audioCache = new Map()

/**
 * Lädt ein Audio-Objekt und cached es für spätere Verwendung
 * @param {string} soundName - Name der Sound-Datei (ohne .mp3)
 * @returns {HTMLAudioElement|null} - Das Audio-Objekt oder null bei Fehler
 */
export const getAudio = (soundName) => {
    // Prüfe ob bereits im Cache
    if (audioCache.has(soundName)) {
        return audioCache.get(soundName)
    }
    
    try {
        const baseUrl = import.meta.env.BASE_URL || '/'
        const audio = new Audio(`${baseUrl}sounds/${soundName}.mp3`)
        
        // Fehlerbehandlung
        audio.addEventListener('error', (e) => {
            console.warn(`🔇 Audio-Datei nicht gefunden: ${soundName}.mp3`, e)
        })
        
        // Cache das Audio-Objekt
        audioCache.set(soundName, audio)
        return audio
    } catch (err) {
        console.warn(`🔇 Fehler beim Erstellen des Audio-Objekts für ${soundName}:`, err)
        return null
    }
}

/**
 * Spielt einen Sound ab (verwendet gecachte Audio-Objekte)
 * @param {string} soundName - Name der Sound-Datei (ohne .mp3)
 * @param {number} volume - Lautstärke (0-1)
 */
export const playSound = (soundName, volume = 0.5) => {
    const audio = getAudio(soundName)
    if (!audio) return
    
    try {
        // Setze Lautstärke
        audio.volume = volume
        
        // Spiele Sound ab
        // WICHTIG: Setze currentTime auf 0, damit der Sound von vorne abgespielt wird
        // (auch wenn er bereits läuft)
        audio.currentTime = 0
        audio.play().catch(err => {
            // Ignoriere Fehler (z.B. wenn Browser Autoplay blockiert)
            // Log nur in Development
            if (import.meta.env.DEV) {
                console.log(`🔇 Sound konnte nicht abgespielt werden: ${soundName}`, err)
            }
        })
    } catch (err) {
        console.warn(`🔇 Fehler beim Abspielen von ${soundName}:`, err)
    }
}

/**
 * Erstellt oder gibt das Background-Music Audio-Objekt zurück
 * @returns {HTMLAudioElement|null}
 */
export const getBackgroundMusic = () => {
    return getAudio('background_music')
}

/**
 * Bereinigt den Audio-Cache (für Tests oder Cleanup)
 */
export const clearAudioCache = () => {
    // Stoppe alle laufenden Sounds
    audioCache.forEach(audio => {
        audio.pause()
        audio.currentTime = 0
    })
    audioCache.clear()
}

