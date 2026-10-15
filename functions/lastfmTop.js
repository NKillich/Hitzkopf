const functions = require('firebase-functions/v1');

// Hitlisten von Last.fm (Top-Songs bzw. Top-Künstler eines Tags) für Amplify 2.0.
// Der API-Schlüssel liegt nur hier (Secret LASTFM_API_KEY). Nur feste Tags (Genres/Jahrzehnte),
// nur für angemeldete Firebase-Nutzer (auch anonym). Ergebnisse 24 h pro Instanz zwischengespeichert.

const SECRETS = ['LASTFM_API_KEY'];
const TAGS = new Set([
    'rock', 'pop', 'hip-hop', 'deutschrap', 'schlager', 'dance', 'electronic', 'metal', 'indie', 'punk',
    'rnb', 'soul', 'reggae', 'country', 'jazz',
    '60s', '70s', '80s', '90s', '00s', '2010s', '2020s',
]);
const KINDS = { tracks: 'tag.gettoptracks', artists: 'tag.gettopartists' };
const LIMIT = 200;
const MAX_AGE = 24 * 60 * 60 * 1000;
const cache = new Map(); // `${kind}:${tag}` → { at, items, pending }

async function fetchTop(kind, tag) {
    const key = process.env.LASTFM_API_KEY;
    if (!key) throw new functions.https.HttpsError('failed-precondition', 'Last.fm-Schlüssel fehlt auf dem Server.');
    const params = new URLSearchParams({ method: KINDS[kind], tag, api_key: key, format: 'json', limit: String(LIMIT) });
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { headers: { 'User-Agent': 'Amplify/1.0 (nkillich.github.io/Hitzkopf)' } });
    if (!res.ok) {
        functions.logger.error('Last.fm-Abruf fehlgeschlagen', res.status);
        throw new functions.https.HttpsError('unavailable', `Last.fm antwortet gerade nicht (${res.status}).`);
    }
    const data = await res.json();
    if (data.error) {
        functions.logger.error('Last.fm-Fehler', data.error, data.message);
        throw new functions.https.HttpsError('unavailable', 'Last.fm hat die Anfrage abgelehnt.');
    }
    if (kind === 'artists') {
        return (data.topartists?.artist || []).map((a) => ({ name: String(a.name || '') })).filter((a) => a.name);
    }
    return (data.tracks?.track || [])
        .map((t) => ({ name: String(t.name || ''), artist: String(t.artist?.name || '') }))
        .filter((t) => t.name && t.artist);
}

exports.lastfmTop = functions
    .runWith({ secrets: SECRETS, maxInstances: 5, timeoutSeconds: 20 })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Anmeldung erforderlich.');
        }
        const kind = String(data?.kind || '');
        const tag = String(data?.tag || '').toLowerCase();
        if (!KINDS[kind] || !TAGS.has(tag)) {
            throw new functions.https.HttpsError('invalid-argument', 'Unbekannte Hitliste.');
        }
        const id = `${kind}:${tag}`;
        const hit = cache.get(id);
        if (hit?.items && Date.now() - hit.at < MAX_AGE) return { items: hit.items };
        if (hit?.pending) return { items: await hit.pending };
        const pending = fetchTop(kind, tag);
        cache.set(id, { ...hit, pending });
        try {
            const items = await pending;
            cache.set(id, { at: Date.now(), items });
            return { items };
        } catch (e) {
            cache.delete(id);
            throw e;
        }
    });
