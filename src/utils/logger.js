// Debug-Ausgaben: im Dev-Server (npm run dev) immer an, in Production nur bei
// localStorage.ss_debug = '1' (in der Browser-Konsole setzen, Seite neu laden).
// Fehler weiterhin direkt mit console.error ausgeben.
const debugEnabled = () => {
    if (import.meta.env.DEV) return true
    try { return localStorage.getItem('ss_debug') === '1' } catch { return false }
}

export const log = (...args) => { if (debugEnabled()) console.log(...args) }
export const warn = (...args) => { if (debugEnabled()) console.warn(...args) }
