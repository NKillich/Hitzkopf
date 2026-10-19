// Testify: Firestore-Sammlung und Hilfen, die auch die Startseite braucht (Raumcode → welches Spiel?).

// Im Dev-Modus lässt sich zum Testen eine andere Sammlung wählen (localStorage „tf_dev_col“),
// solange die Regeln für testifyLobbies noch nicht veröffentlicht sind. In der veröffentlichten Seite wirkungslos.
export const lobbyCollection = () => {
    if (import.meta.env?.DEV) {
        try { const c = localStorage.getItem('tf_dev_col'); if (c) return c } catch { /* egal */ }
    }
    return 'testifyLobbies'
}

export const CODE_LEN = 6
export const CODE_RE = /^[A-Z0-9]{6}$/

export const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < CODE_LEN; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
    return code
}

export const inviteLink = (code) => `${window.location.origin}${window.location.pathname}#testify/${code}`

/** Raumcode aus einem QR-Inhalt: Einladungslink (…#testify/CODE) oder der Code selbst */
export const codeFromQr = (text) => {
    const t = String(text || '').trim()
    const m = t.match(/#testify\/([A-Za-z0-9]{6})/) || t.match(/^([A-Za-z0-9]{6})$/)
    return m ? m[1].toUpperCase() : null
}
