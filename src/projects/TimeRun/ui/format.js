const pad2 = n => String(n).padStart(2, '0')

export const formatTime = sec => `${pad2(Math.floor(sec / 60))}:${pad2(Math.floor(sec % 60))}`

export const cap = t => t.charAt(0).toUpperCase() + t.slice(1)

/** Kurze Sperre nach dem Öffnen einer Auswahl, damit der Finger vom Joystick nicht aus Versehen wählt. */
export const GUARD_MS = 400
