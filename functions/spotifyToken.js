const functions = require('firebase-functions');

// Token-Proxy fuer Spotify (Client-Credentials-Flow).
// Das Client Secret liegt nur hier (Secret Manager) und nie im Browser-Bundle.
// Aufruf nur fuer angemeldete Firebase-Nutzer (auch anonym).

const SECRETS = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];

// Warm-Instanz-Cache: pro Instanz hoechstens ein Token-Abruf pro Stunde
let cached = null; // { token, expiresAt }
let pending = null;

async function fetchAppToken() {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id || !secret) {
        throw new functions.https.HttpsError('failed-precondition', 'Spotify-Credentials fehlen auf dem Server.');
    }
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
        functions.logger.error('Spotify Token-Abruf fehlgeschlagen', res.status);
        throw new functions.https.HttpsError('unavailable', `Spotify-Token konnte nicht geholt werden (${res.status}).`);
    }
    const data = await res.json();
    return { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

exports.spotifyToken = functions
    .runWith({ secrets: SECRETS, maxInstances: 5 })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Anmeldung erforderlich.');
        }
        // 60s Puffer, damit der Client keinen fast abgelaufenen Token bekommt
        if (!cached || Date.now() >= cached.expiresAt - 60000) {
            pending = pending || fetchAppToken().finally(() => { pending = null; });
            cached = await pending;
        }
        return {
            access_token: cached.token,
            expires_in: Math.floor((cached.expiresAt - Date.now()) / 1000),
        };
    });
