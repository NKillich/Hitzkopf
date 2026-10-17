/**
 * Identify-Gastmodus: spielt Apples 30-Sekunden-Hörproben über ein normales Audio-Element.
 * Gleiche Befehle wie der Spotify-Player in clipPlayerCore.js (startNew, replay, resumeTo, extendTo, pause …),
 * damit der Spielbildschirm nicht wissen muss, woher der Ton kommt. Positionen in ms ab Beginn der Hörprobe.
 *
 * iPhone/Safari: play() muss im Klick passieren – deshalb wird vor dem ersten await abgespielt.
 */

const STOP_LEAD_MS = 30            // HTML-Audio pausiert sofort, kaum Vorlauf nötig
const START_TIMEOUT_MS = 8000

export const appleUri = (song) => `apple:${song.id}`

export const trackInfoFromSong = (song) => ({
    uri: appleUri(song),
    trackId: appleUri(song),
    trackName: song.title,
    artist: song.artist,
    imageUrl: song.cover || null
})

export class AppleClipPlayer {
    constructor({ log = () => {} } = {}) {
        this.log = log
        this.audio = null
        this.op = 0
        this.active = null        // { uri, until }
        this.timer = null
        this.handlers = {}
        this.songs = new Map()    // uri → Song (für replay nach Songwechsel)
        this.loadedUri = null
    }

    _el() {
        if (this.audio) return this.audio
        const a = new Audio()
        a.preload = 'auto'
        a.addEventListener('ended', () => { if (this.active) this._finish('done') })
        this.audio = a
        return a
    }

    setHandlers(h) { this.handlers = h || {} }
    attach() {}
    detach() { this.reset() }

    reset() {
        this.op++
        this.active = null
        this._clearTimer()
        this.audio?.pause()
    }

    async pause() {
        this.active = null
        this._clearTimer()
        this.audio?.pause()
    }

    _clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null } }
    _alive(myOp, isStale) { return this.op === myOp && !(isStale && isStale()) }
    _posMs() { return (this.audio?.currentTime || 0) * 1000 }

    _finish(reason, info) {
        if (!this.active) return
        this.active = null
        this._clearTimer()
        this.audio?.pause()
        this.handlers.onEnd?.(reason, info || {})
    }

    _scheduleTick() {
        this._clearTimer()
        const step = () => {
            const a = this.active
            if (!a) return
            const rem = a.until - this._posMs()
            if (rem <= STOP_LEAD_MS) { this._finish('done'); return }
            this.timer = setTimeout(step, Math.max(10, Math.min(rem - STOP_LEAD_MS, 100)))
        }
        step()
    }

    // Spielt ab (synchron im Aufruf, wichtig fürs iPhone) und wartet, bis wirklich Ton kommt
    _startPlayback() {
        const a = this._el()
        return new Promise((resolve) => {
            let done = false
            const finish = (v) => {
                if (done) return
                done = true
                clearTimeout(to)
                a.removeEventListener('playing', onPlaying)
                a.removeEventListener('error', onError)
                resolve(v)
            }
            const onPlaying = () => finish({ ok: true, at: Date.now(), pos: this._posMs() })
            const onError = () => finish({ error: 'Die Hörprobe konnte nicht geladen werden.' })
            const to = setTimeout(() => finish({ error: 'Die Hörprobe startet nicht. Bitte nochmal tippen.' }), START_TIMEOUT_MS)
            a.addEventListener('playing', onPlaying)
            a.addEventListener('error', onError)
            const p = a.play()
            p?.catch?.((e) => {
                if (e?.name === 'NotAllowedError') this.handlers.onAutoplayFailed?.()
                finish({ error: e?.name === 'NotAllowedError' ? 'Der Browser hat die Wiedergabe blockiert. Tippe nochmal auf Play.' : 'Abspielen fehlgeschlagen.' })
            })
            if (!a.paused && a.readyState >= 3) finish({ ok: true, at: Date.now(), pos: this._posMs() })
        })
    }

    _load(song) {
        const a = this._el()
        const uri = appleUri(song)
        this.songs.set(uri, song)
        if (this.loadedUri !== uri) {
            a.src = song.preview
            this.loadedUri = uri
        }
    }

    // Hörproben-Adressen können veralten → frisch bei Apple holen
    async _refresh(song) {
        try {
            const r = await fetch(`https://itunes.apple.com/lookup?id=${song.id}&country=DE`)
            const url = (await r.json()).results?.[0]?.previewUrl
            if (url && url !== song.preview) { song.preview = url; this.loadedUri = null; return true }
        } catch { /* bleibt beim Fehler */ }
        return false
    }

    async _playFrom({ song, startMs, untilMs, seconds, isStale, myOp }) {
        const a = this._el()
        this._load(song)
        if (startMs != null) { try { a.currentTime = startMs / 1000 } catch { /* vor dem Laden: Start bei 0 */ } }
        let res = await this._startPlayback()
        if (res.error && this._alive(myOp, isStale) && await this._refresh(song)) {
            this._load(song)
            if (startMs) { try { a.currentTime = startMs / 1000 } catch { /* s. o. */ } }
            res = await this._startPlayback()
        }
        if (!this._alive(myOp, isStale)) {
            if (this.op === myOp) a.pause()
            return { aborted: true }
        }
        if (res.error) { a.pause(); throw new Error(res.error) }
        // Sprung vor dem Laden nicht übernommen → jetzt springen
        if (startMs && Math.abs(res.pos - startMs) > 400) {
            a.currentTime = startMs / 1000
            res = { ...res, at: Date.now(), pos: this._posMs() }
        }
        const until = untilMs ?? res.pos + seconds * 1000
        this.active = { uri: appleUri(song), until }
        this._scheduleTick()
        return { track: trackInfoFromSong(song), startedAt: res.at, startPos: res.pos }
    }

    /** Neuer Song (Gastmodus: das Song-Objekt aus der Liste steckt in `song`) */
    async startNew({ song, seconds, accept, isStale }) {
        const myOp = ++this.op
        this.active = null
        this._clearTimer()
        const track = trackInfoFromSong(song)
        if (accept && !accept(track)) return { rejected: true, track }
        return this._playFrom({ song, startMs: 0, seconds, isStale, myOp })
    }

    /** Denselben Song ab startMs bis untilMs */
    async replay({ uri, seconds, isStale, startMs = 0, untilMs }) {
        const myOp = ++this.op
        this.active = null
        this._clearTimer()
        const song = this.songs.get(uri)
        if (!song) throw new Error('Song nicht mehr geladen.')
        return this._playFrom({ song, startMs, untilMs, seconds, isStale, myOp })
    }

    /** An der aktuellen Stelle weiterspielen bis untilMs */
    async resumeTo({ uri, untilMs, isStale }) {
        const myOp = ++this.op
        this.active = null
        this._clearTimer()
        if (this.loadedUri !== uri || this._posMs() > untilMs - 300) return { lost: true }
        const res = await this._startPlayback()
        if (!this._alive(myOp, isStale)) {
            if (this.op === myOp) this.audio?.pause()
            return { aborted: true }
        }
        if (res.error) return { lost: true }
        this.active = { uri, until: untilMs }
        this._scheduleTick()
        return { track: trackInfoFromSong(this.songs.get(uri)), startedAt: res.at, startPos: res.pos }
    }

    /** Läuft der Song: Ende auf untilMs verschieben */
    extendTo({ uri, untilMs }) {
        if (!this.active || this.active.uri !== uri) return false
        this.active.until = Math.max(this.active.until, untilMs)
        this._scheduleTick()
        return true
    }
}
