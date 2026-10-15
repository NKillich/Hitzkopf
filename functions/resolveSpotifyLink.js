const functions = require('firebase-functions');

// Spotify-Kurzlinks (spotify.link/…, spotify.app.link/…) auflösen.
// Im Browser geht das nicht (CORS blockiert die Weiterleitung), deshalb hier.
// Nur Spotify-Kurzlinks, nur für angemeldete Firebase-Nutzer (auch anonym), Ergebnis nur open.spotify.com.

const SHORT_HOSTS = ['spotify.link', 'spotify.app.link'];
const LONG = /https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:track|album|artist|playlist)\/[A-Za-z0-9]{22}/i;

exports.resolveSpotifyLink = functions
    .runWith({ maxInstances: 5, timeoutSeconds: 15 })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Anmeldung erforderlich.');
        }
        let url;
        try { url = new URL(String(data?.url || '')); } catch (e) { url = null; }
        if (!url || url.protocol !== 'https:' || !SHORT_HOSTS.includes(url.hostname)) {
            throw new functions.https.HttpsError('invalid-argument', 'Kein Spotify-Kurzlink.');
        }
        // Weiterleitungen Schritt für Schritt folgen, bis eine open.spotify.com-Adresse auftaucht
        let current = url.toString();
        for (let hop = 0; hop < 5; hop++) {
            const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HitzkopfLinkResolver/1.0)' } });
            const location = res.headers.get('location');
            if (location) {
                const next = new URL(location, current).toString();
                const hit = next.match(LONG);
                if (hit) return { url: hit[0] };
                current = next;
                continue;
            }
            // Manche Kurzlinks leiten per Seite (HTML/JS) weiter → Adresse aus dem Inhalt lesen
            const html = await res.text();
            const hit = html.match(LONG);
            if (hit) return { url: hit[0] };
            break;
        }
        throw new functions.https.HttpsError('not-found', 'Der Link führt zu keinem Spotify-Song.');
    });
