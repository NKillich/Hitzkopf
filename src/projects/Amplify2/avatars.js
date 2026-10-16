// Start-Bildschirme: Profilbilder (Tiere) und Raumcode aus einem QR-Code

// Alle Tier-Emojis (ohne ganz neue Zeichen, die ältere Handys noch nicht anzeigen)
export const ANIMALS = [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🐔', '🐧', '🐦', '🐤',
    '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎',
    '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🦭', '🐊', '🐅', '🐆', '🦓', '🦍',
    '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌',
    '🐕', '🐩', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐿️', '🦔',
    '🐉', '🐲'
]
export const randomAnimal = () => ANIMALS[Math.floor(Math.random() * ANIMALS.length)]

/** Raumcode aus dem QR-Inhalt: Einladungslink (…#amplify2/CODE) oder der Code selbst */
export const codeFromQr = (text) => {
    const t = String(text || '').trim()
    const m = t.match(/#amplify2\/([A-Za-z0-9]{4,10})/) || t.match(/^([A-Za-z0-9]{4,10})$/)
    return m ? m[1].toUpperCase() : null
}
