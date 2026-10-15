// „Deine Songs“: was jemand vorgeschlagen oder hochgevotet hat – nur auf diesem Gerät, über alle Partys hinweg

const KEY = 'a2_song_memory'
const MAX = 200
const SONG_FIELDS = ['id', 'spotifyId', 'title', 'artist', 'artistIds', 'album', 'releaseYear', 'imageUrl', 'duration', 'spotifyUrl', 'type', 'source']

export const loadSongMemory = () => {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]')
        return Array.isArray(list) ? list : []
    } catch { return [] }
}

/** Song merken: kind = 'added' (vorgeschlagen) | 'liked' (hochgevotet); neuester zuerst, ohne Dopplungen */
export const rememberSong = (item, kind) => {
    if (!item?.spotifyId || item.type !== 'song') return
    try {
        const list = loadSongMemory()
        const old = list.find(e => e.spotifyId === item.spotifyId)
        const entry = { ...Object.fromEntries(SONG_FIELDS.filter(k => item[k] != null).map(k => [k, item[k]])), added: !!old?.added, liked: !!old?.liked, at: Date.now() }
        entry[kind] = true
        localStorage.setItem(KEY, JSON.stringify([entry, ...list.filter(e => e.spotifyId !== item.spotifyId)].slice(0, MAX)))
    } catch { /* Speicher voll oder gesperrt – dann eben ohne Gedächtnis */ }
}

/** Gemerkter Eintrag → Song-Objekt zum Einreichen (ohne die Merk-Felder) */
export const memoryToSong = (entry) => ({
    ...Object.fromEntries(SONG_FIELDS.filter(k => entry[k] != null).map(k => [k, entry[k]])),
    votes: {}, addedAt: Date.now()
})
