import { useState } from 'react'

// Ein Schalter für alle Apps im neuen Design (früher nur 'ss_theme' von Song raten)
const KEY = 'app_theme'

const readIsDark = () => {
    try {
        return (localStorage.getItem(KEY) ?? localStorage.getItem('ss_theme')) !== 'light'
    } catch { return true }
}

export default function useTheme() {
    const [isDark, setIsDark] = useState(readIsDark)
    const toggleTheme = () => {
        setIsDark(prev => {
            const next = !prev
            try { localStorage.setItem(KEY, next ? 'dark' : 'light') } catch { /* Speichern ist optional */ }
            return next
        })
    }
    return { isDark, toggleTheme }
}
