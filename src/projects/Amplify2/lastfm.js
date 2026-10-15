// Last.fm-Hitlisten über die Firebase-Funktion lastfmTop (Schlüssel bleibt auf dem Server, 24 h Zwischenspeicher dort)
import { getApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'

const cache = new Map()   // pro Sitzung: `${kind}:${tag}` → Promise<items>

/** kind = 'tracks' → [{ name, artist }] | 'artists' → [{ name }] (Reihenfolge = Beliebtheit bei Last.fm) */
export const lastfmTop = (kind, tag) => {
    const id = `${kind}:${tag}`
    if (!cache.has(id)) {
        const p = (async () => {
            const auth = getAuth(getApp())
            await auth.authStateReady()
            if (!auth.currentUser) await signInAnonymously(auth)
            const { data } = await httpsCallable(getFunctions(getApp()), 'lastfmTop')({ kind, tag })
            return data?.items || []
        })()
        p.catch(() => cache.delete(id))   // Fehler nicht merken – beim nächsten Mal neu versuchen
        cache.set(id, p)
    }
    return cache.get(id)
}

/** Jahrzehnt → Last.fm-Tag */
export const lastfmDecadeTag = (from) => ({ 1960: '60s', 1970: '70s', 1980: '80s', 1990: '90s', 2000: '00s', 2010: '2010s', 2020: '2020s' }[from] || null)
