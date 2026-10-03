/**
 * Steuert das Abspielen der kurzen Ausschnitte (1/5/10/30 s) ereignisgesteuert.
 *
 * Warum nicht einfach "Befehl senden, Timer starten, Player abfragen"?
 *  - Spotify bestätigt den Play-Befehl sofort, der Ton beginnt aber erst später. Fragt man den Player in
 *    dieser Lücke ab, meldet er noch den VORHERIGEN Titel (veralteter Zustand).
 *  - Ein Timer ab Befehlsbestätigung beendet den Ausschnitt zu früh (Ton startet erst danach).
 *
 * Deshalb: Nur Player-Ereignisse (player_state_changed) NACH dem Senden des Befehls zählen. Ein Titel gilt erst
 * als gestartet, wenn der Player "spielt" meldet. Die Dauer wird ab der echten Abspielposition gemessen.
 *
 * Alles Abhängige (Spotify-Service, Logger) wird injiziert, damit die Logik ohne Browser testbar ist.
 */

const MAX_TRACE = 600

const summarize = (s) => {
    if (!s) return null
    const t = s.track_window?.current_track
    return {
        uri: (t?.uri || '').slice(-8),
        name: (t?.name || '').slice(0, 22),
        paused: s.paused,
        pos: Math.round(s.position || 0),
        loading: !!s.loading,
        shuffle: s.shuffle,
        repeat: s.repeat_mode,
        ctx: (s.context?.uri || '').slice(-8)
    }
}

export const trackInfoFrom = (state) => {
    const t = state?.track_window?.current_track
    if (!t?.uri) return null
    return {
        uri: t.uri,
        trackId: t.id,
        trackName: t.name,
        artist: (t.artists || []).map(a => a.name).join(', '),
        imageUrl: t.album?.images?.[0]?.url || null
    }
}

const contextMatches = (state, contextUri) => {
    if (!contextUri) return true
    const got = state.context?.uri || ''
    if (!got) return true
    const want = contextUri.split(':').pop()
    return got.endsWith(want)
}

export class ClipPlayer {
    constructor(svc, { log = () => {} } = {}) {
        this.svc = svc
        this.log = log
        this.op = 0                 // laufende Operation; neuere Operationen machen ältere ungültig
        this.baseVolume = null      // normale Lautstärke (damit sich überlappende Starts nie auf 0 festlegen)
        this.timer = null
        this.active = null          // { uri, deadline, lastPos, lastAt, duration, since }
        this.handlers = {}
        this.unsub = null
        this.unsubErr = null
        this.t0 = Date.now()
        this.buf = []
    }

    // ── Ablaufprotokoll (immer im Speicher, in der Konsole nur im Debug-Modus) ──
    trace(tag, data) {
        const entry = { t: Date.now() - this.t0, tag, ...(data || {}) }
        this.buf.push(entry)
        if (this.buf.length > MAX_TRACE) this.buf.shift()
        this.log(`[clip +${(entry.t / 1000).toFixed(2)}s] ${tag}`, data ?? '')
    }

    dump() { return JSON.stringify(this.buf) }

    setHandlers(h) { this.handlers = h || {} }

    attach() {
        if (this.unsub) return
        this.unsub = this.svc.subscribeState((state, at) => this._onState(state, at))
        this.unsubErr = this.svc.subscribeErrors((err) => this._onError(err))
    }

    detach() {
        this.unsub?.(); this.unsub = null
        this.unsubErr?.(); this.unsubErr = null
        this._clearTimer()
        this.active = null
        this.op++
    }

    /** Neues Spiel: laufende Ausschnitte und offene Operationen verwerfen. */
    reset() {
        this._clearTimer()
        this.active = null
        this.op++
    }

    _clearTimer() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null }
    }

    _alive(myOp, isStale) {
        return this.op === myOp && !(isStale && isStale())
    }

    // ── Player-Ereignisse während eines laufenden Ausschnitts ──
    _onState(state, at) {
        this.trace('state', summarize(state))
        const a = this.active
        if (!a || at < a.since) return
        if (!state) { this._finish('external'); return }
        const t = state.track_window?.current_track
        if (t?.uri !== a.uri) {
            // Titel hat gewechselt: natürliches Ende (Titel kürzer als Ausschnitt) oder ungewollter Sprung
            const estPos = a.lastPos + (at - a.lastAt)
            const natural = a.duration && (a.duration - estPos) < 2500
            this.trace('track-changed', { natural, expected: a.uri.slice(-8), got: (t?.uri || '').slice(-8) })
            this._finish(natural ? 'done' : 'drift', { got: trackInfoFrom(state) })
            return
        }
        if (state.paused) { this._finish('external'); return }
        a.lastPos = state.position
        a.lastAt = at
        a.duration = state.duration || a.duration
    }

    _onError(err) {
        const msg = String(err?.message || err || '')
        this.trace('error-event', { msg })
        if (msg === 'autoplay_failed') { this.handlers.onAutoplayFailed?.(); return }
        if (this.active) this._finish('error', { message: msg })
    }

    async _finish(reason, info) {
        const a = this.active
        if (!a) return
        this.active = null
        this._clearTimer()
        this.trace('finish', { reason })
        await this.svc.pauseLocalPlayer()
        this.handlers.onEnd?.(reason, info || {}, a)
    }

    _scheduleTick() {
        this._clearTimer()
        const step = () => {
            const a = this.active
            if (!a) return
            const last = this.svc.getLastState()
            const same = last && !last.state.paused && last.state.track_window?.current_track?.uri === a.uri
            const est = same ? last.state.position + (Date.now() - last.at) : a.lastPos + (Date.now() - a.lastAt)
            const rem = a.deadline - est
            if (rem <= 25) { this._finish('done'); return }
            this.timer = setTimeout(step, Math.max(15, Math.min(rem - 10, 250)))
        }
        step()
    }

    /** Wartet auf ein Player-Ereignis, das NACH `since` eintrifft und `pred` erfüllt. */
    _waitFor(pred, since, timeoutMs) {
        return new Promise((resolve) => {
            let done = false
            let unsub = null
            let unsubErr = null
            let to = null
            const finish = (v) => {
                if (done) return
                done = true
                clearTimeout(to)
                unsub?.(); unsubErr?.()
                resolve(v)
            }
            const check = (state, at) => { if (state && at >= since && pred(state)) finish({ state, at }) }
            unsub = this.svc.subscribeState(check)
            unsubErr = this.svc.subscribeErrors((err) => {
                if (String(err) === 'autoplay_failed') return
                finish({ error: String(err?.message || err) })
            })
            to = setTimeout(() => finish(null), timeoutMs)
            const cur = this.svc.getLastState()
            if (cur) check(cur.state, cur.at)
        })
    }

    async _silence() {
        this.active = null
        this._clearTimer()
        await this.svc.pauseLocalPlayer()
    }

    _failMessage(res) {
        if (res?.error) return `Spotify konnte den Titel nicht abspielen (${res.error}).`
        const last = this.svc.getLastState()
        if (last && !last.state.paused) return 'Spotify spielt gerade etwas anderes als die gewählte Playlist. Tippe nochmal auf Play.'
        return 'Spotify hat den Titel nicht rechtzeitig gestartet. Tippe nochmal auf Play.'
    }

    /**
     * Startet einen NEUEN Titel einer Playlist (Position `offset`).
     * accept(track) → false: Titel verwerfen (z. B. schon gespielt); dann { rejected: true, track }.
     * Gibt { track, startedAt, startPos } zurück, { rejected } oder { aborted }.
     */
    async startNew({ contextUri, offset, seconds, accept, isStale }) {
        return this._start({ kind: 'context', contextUri, offset, seconds, accept, isStale })
    }

    /** Startet einen bekannten Titel per URI (lädt ihn neu). */
    async startUri({ uri, seconds, isStale }) {
        return this._start({ kind: 'uri', uri, seconds, isStale })
    }

    async _start({ kind, contextUri, offset, uri, seconds, accept, isStale }) {
        const myOp = ++this.op
        await this._silence()
        if (!this._alive(myOp, isStale)) return { aborted: true }
        await this.svc.ensureLinearPlayback()
        if (!this._alive(myOp, isStale)) return { aborted: true }

        // Stumm starten: so ist ein verworfener Titel (Duplikat) nie zu hören
        const vol = await this.svc.getVolumeLocal()
        if (vol != null && vol > 0.05) this.baseVolume = vol
        await this.svc.setVolumeLocal(0)
        const restore = async () => { await this.svc.setVolumeLocal(this.baseVolume ?? 0.8) }
        try {
            const pred = (s) => {
                const t = s.track_window?.current_track
                if (!t?.uri || s.paused || s.loading) return false
                if (uri && t.uri !== uri) return false
                return contextMatches(s, contextUri)
            }
            const send = async () => {
                const sentAt = Date.now()
                this.trace('start', { kind, contextUri: (contextUri || '').slice(-8), offset, uri: (uri || '').slice(-8), seconds })
                if (kind === 'context') await this.svc.playContextAtOffset(contextUri, offset)
                else await this.svc.playUriOnPlayer(uri)
                return this._waitFor(pred, sentAt, 7000)
            }
            let hit = await send()
            // Vor dem ersten Abspielen gibt es keinen Zustand zum Prüfen: Läuft Shuffle/Wiederholen,
            // ignoriert Spotify die Position → Einstellungen korrigieren und einmal neu starten.
            if (hit?.state && kind === 'context' && this._alive(myOp, isStale)
                && (hit.state.shuffle || hit.state.repeat_mode === 2)) {
                this.trace('shuffle-or-repeat-on', { shuffle: hit.state.shuffle, repeat: hit.state.repeat_mode })
                await this._silence()
                await this.svc.ensureLinearPlayback()
                hit = await send()
            }
            if (!this._alive(myOp, isStale)) {
                if (this.op === myOp) await this._silence()
                await restore()
                return { aborted: true }
            }
            if (!hit || hit.error) {
                this.trace('start-failed', { error: hit?.error || 'timeout' })
                await this._silence()
                throw new Error(this._failMessage(hit))
            }

            const track = trackInfoFrom(hit.state)
            if (accept && !accept(track)) {
                this.trace('rejected', { uri: track.uri.slice(-8), name: track.trackName })
                await this._silence()
                return { rejected: true, track }
            }

            // Läuft stumm schon ein Stück: zurück auf 0, dann Ton an
            let pos = hit.state.position
            let at = hit.at
            if (pos > 700) {
                try {
                    await this.svc.seekLocal(0)
                    const st = await this.svc.getPlayerState()
                    if (st) { pos = st.position; at = Date.now() }
                } catch (e) { this.trace('seek-failed', { msg: String(e?.message || e) }) }
            }
            return await this._begin({ track, seconds, pos, at, duration: hit.state.duration, myOp, isStale, restore })
        } finally {
            await restore()
        }
    }

    async _begin({ track, seconds, pos, at, duration, myOp, isStale, restore }) {
        if (restore) await restore()
        if (!this._alive(myOp, isStale)) {
            if (this.op === myOp) await this._silence()
            return { aborted: true }
        }
        this.active = {
            uri: track.uri,
            deadline: pos + seconds * 1000,
            lastPos: pos,
            lastAt: at,
            duration,
            since: Date.now() - 1
        }
        this.trace('begin', { uri: track.uri.slice(-8), pos: Math.round(pos), seconds })
        this._scheduleTick()
        return { track, startedAt: at, startPos: pos }
    }

    /**
     * Denselben, schon geladenen Titel von vorn abspielen (seek + resume, ohne neuen Track-Load).
     * Klappt das nicht verlässlich, wird der Titel per URI neu geladen.
     */
    async replay({ uri, seconds, isStale }) {
        const myOp = ++this.op
        await this._silence()
        if (!this._alive(myOp, isStale)) return { aborted: true }
        const cur = await this.svc.getPlayerState()
        if (cur?.track_window?.current_track?.uri === uri) {
            try {
                const sentAt = Date.now()
                await this.svc.seekLocal(0)
                let st = await this.svc.getPlayerState()
                if (!st || st.position > 1500) {
                    await this.svc.seekLocal(0)
                    st = await this.svc.getPlayerState()
                }
                if (st && st.position <= 1500) {
                    await this.svc.resumeLocal()
                    const hit = await this._waitFor(
                        (s) => !s.paused && !s.loading && s.track_window?.current_track?.uri === uri,
                        sentAt, 3000)
                    if (!this._alive(myOp, isStale)) {
                        if (this.op === myOp) await this._silence()
                        return { aborted: true }
                    }
                    if (hit && !hit.error && hit.state.position <= 3000) {
                        return await this._begin({
                            track: trackInfoFrom(hit.state), seconds, pos: hit.state.position, at: hit.at,
                            duration: hit.state.duration, myOp, isStale
                        })
                    }
                    this.trace('replay-no-start', { hit: !!hit })
                } else {
                    this.trace('replay-seek-unreliable', { pos: st?.position })
                }
            } catch (e) {
                this.trace('replay-failed', { msg: String(e?.message || e) })
            }
        } else {
            this.trace('replay-other-track', { loaded: (cur?.track_window?.current_track?.uri || '').slice(-8) })
        }
        if (!this._alive(myOp, isStale)) return { aborted: true }
        return this.startUri({ uri, seconds, isStale })
    }

    /** Pausiert den laufenden Ausschnitt (ohne Ende-Meldung). */
    async pause() {
        const was = !!this.active
        this.active = null
        this._clearTimer()
        await this.svc.pauseLocalPlayer()
        this.trace('pause', { was })
    }
}
