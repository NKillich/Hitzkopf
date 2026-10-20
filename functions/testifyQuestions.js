const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk').Anthropic;
const core = require('./testifyCore');

// Testify: Fragen für das nächste Spiel einer Lobby – erst aus dem gemeinsamen Pool (testifyPool), nur Fehlendes
// erzeugt Claude neu. Neue Fragen zu Vorgabe-Themen und allgemein bekannten eigenen Themen landen im Pool,
// persönliche eigene Themen nur in der Lobby. Ergebnis steht in der Lobby (gen + genQuestions); das Spiel nimmt es beim Start.
// Nur der Host einer Lobby darf aufrufen; höchstens DAILY_LIMIT Erzeugungen pro Gerät (UID) und Tag.
// Schlüssel nur als Secret ANTHROPIC_API_KEY (setzen: firebase functions:secrets:set ANTHROPIC_API_KEY).

const SECRETS = ['ANTHROPIC_API_KEY'];
const MODEL = 'claude-opus-5-5';
const DAILY_LIMIT = 20;
const LOBBIES = 'testifyLobbies';
const POOL = 'testifyPool';
const USAGE = 'testifyUsage';

const db = () => admin.firestore();
const fail = (code, msg) => new functions.https.HttpsError(code, msg);

/** Schlüssel der Einstellungen, für die die Fragen gelten (das Spiel vergleicht ihn beim Start) */
const genKey = (d) => [
    (d.gameNo || 0) + 1, d.rounds || 15, (d.themes || []).join(','), (d.customThemes || []).map(core.cleanTheme).join(','),
].join('|');

async function loadPool(keys) {
    const docs = [];
    for (let i = 0; i < keys.length; i += 30) {
        const snap = await db().collection(POOL).where('cat', 'in', keys.slice(i, i + 30)).where('hidden', '==', false).limit(1500).get();
        snap.forEach((doc) => docs.push({ id: doc.id, ...doc.data() }));
    }
    return docs;
}

/** Zählt eine KI-Erzeugung für diese UID; false, wenn das Tageslimit erreicht ist */
async function takeQuota(uid) {
    const ref = db().collection(USAGE).doc(uid);
    const day = new Date().toISOString().slice(0, 10);
    return db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const cur = snap.exists && snap.data().day === day ? snap.data().count || 0 : 0;
        if (cur >= DAILY_LIMIT) return false;
        tx.set(ref, { day, count: cur + 1, at: Date.now() });
        return true;
    });
}

/** Claude fragen (strukturierte Ausgabe nach OUTPUT_SCHEMA); mit Rückfall auf ein anderes Modell bei Ablehnung */
async function askClaude(slots, customThemes, avoid) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 100000, maxRetries: 1 });
    const params = {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: core.OUTPUT_SCHEMA } },
        system: [{ type: 'text', text: core.SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: core.buildUserMessage(slots, customThemes, avoid) }],
    };
    let res;
    try {
        res = await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (e) {
        if (!(e instanceof Anthropic.BadRequestError)) throw e;
        functions.logger.warn('Testify: Anfrage mit Rückfall abgelehnt, ohne Rückfall erneut', e.message);
        res = await client.messages.create(params);
    }
    if (res.stop_reason === 'refusal') throw fail('unavailable', 'Die KI hat die Anfrage abgelehnt.');
    const out = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    functions.logger.info('Testify: KI-Fragen', { slots: slots.length, model: res.model, usage: res.usage });
    try {
        return JSON.parse(out);
    } catch (e) {
        functions.logger.error('Testify: KI-Antwort kein JSON', res.stop_reason, out.slice(0, 300));
        throw fail('internal', 'Die KI-Antwort war unvollständig.');
    }
}

exports.testifyQuestions = functions
    .runWith({ secrets: SECRETS, maxInstances: 10, timeoutSeconds: 120, memory: '512MB' })
    .https.onCall(async (data, context) => {
        if (!context.auth) throw fail('unauthenticated', 'Anmeldung erforderlich.');
        const lobbyId = String(data?.lobbyId || '');
        if (!/^[A-Z0-9]{6}$/.test(lobbyId)) throw fail('invalid-argument', 'Unbekannte Lobby.');
        const ref = db().collection(LOBBIES).doc(lobbyId);
        const snap = await ref.get();
        if (!snap.exists) throw fail('not-found', 'Diese Lobby gibt es nicht.');
        const lobby = snap.data();
        if (lobby.hostUid !== context.auth.uid) throw fail('permission-denied', 'Nur der Host kann Fragen erstellen.');
        const key = genKey(lobby);
        await ref.update({ gen: { status: 'running', key, at: Date.now() } });

        try {
            const themes = core.resolveThemes(lobby.themes || [], lobby.customThemes || []);
            const plan = core.makePlan(lobby.rounds || 15, themes);
            const played = [...Object.values(lobby.players || {}).flatMap((p) => p.played || []), ...(lobby.used || [])];
            const pool = await loadPool(themes.map((t) => t.key));
            const fromPool = core.fillFromPool(plan, pool, played);
            const missing = plan.filter((_, i) => !fromPool[i]);

            let generated = new Map();
            let limited = false;
            if (missing.length) {
                if (!(await takeQuota(context.auth.uid))) {
                    limited = true;
                } else {
                    const customs = themes.filter((t) => t.custom);
                    // Schon vorhandene Fragen der Themen nicht noch einmal erzeugen
                    const avoid = pool.filter((d) => missing.some((s) => s.theme.key === d.cat)).map((d) => d.own).slice(-80);
                    const output = await askClaude(missing, customs, avoid);
                    generated = core.pickBest(output, missing, avoid);
                    const shareable = core.shareableKeys(output, customs);
                    // In den Pool: Vorgabe-Themen und allgemein bekannte eigene Themen; sonst nur in der Lobby
                    const batch = db().batch();
                    for (const [slotNo, q] of generated) {
                        const slot = missing.find((s) => s.slot === slotNo);
                        const share = !slot.theme.custom || shareable.has(slot.theme.key);
                        if (share) {
                            const docRef = db().collection(POOL).doc();
                            q.id = docRef.id;
                            batch.set(docRef, { ...q, up: 0, down: 0, hidden: false, createdAt: Date.now(), model: MODEL });
                        } else {
                            q.id = `p-${Math.random().toString(36).slice(2, 12)}`;
                        }
                    }
                    await batch.commit();
                }
            }

            const questions = plan.map((slot, i) => {
                const hit = fromPool[i];
                if (hit) {
                    const { id, type, cat, catLabel, own, other, options, labels } = hit;
                    return Object.fromEntries(Object.entries({ id, type, cat, catLabel, own, other, options, labels }).filter(([, v]) => v != null));
                }
                return generated.get(slot.slot) || null;
            });
            const stats = { fromPool: fromPool.filter(Boolean).length, generated: generated.size, missing: questions.filter((q) => !q).length, limited };
            await ref.update({ gen: { status: 'done', key, at: Date.now(), ...stats }, genQuestions: questions });
            return stats;
        } catch (e) {
            functions.logger.error('Testify: Fragen erstellen fehlgeschlagen', e);
            await ref.update({ gen: { status: 'error', key, at: Date.now() } }).catch(() => {});
            if (e instanceof functions.https.HttpsError) throw e;
            throw fail('unavailable', 'Die Fragen konnten gerade nicht erstellt werden.');
        }
    });
