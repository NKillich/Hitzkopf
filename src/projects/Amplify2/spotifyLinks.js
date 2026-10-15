// Spotify-Links aus „Teilen → Link kopieren“ erkennen (auch mitten in einem Text, z. B. „Hör dir das an: https://…“)

const LONG = /(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|artist|playlist)\/([A-Za-z0-9]{22})/i
const URI = /spotify:(track|album|artist|playlist):([A-Za-z0-9]{22})/i
const SHORT = /https?:\/\/(?:spotify\.link|spotify\.app\.link)\/[A-Za-z0-9_-]+/i

/** null = kein Spotify-Link | { type, id } | { short: url } (Kurzlink, muss erst aufgelöst werden) */
export const parseSpotifyLink = (text) => {
    const t = String(text || '')
    const m = t.match(LONG) || t.match(URI)
    if (m) return { type: m[1].toLowerCase(), id: m[2] }
    const s = t.match(SHORT)
    return s ? { short: s[0] } : null
}

/** Sieht der Text nach einem Spotify-Link aus? (für das Suchfeld) */
export const looksLikeSpotifyLink = (text) => !!parseSpotifyLink(text)
