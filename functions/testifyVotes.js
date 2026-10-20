const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Testify: 👍/👎 zu Pool-Fragen. Jedes Gerät hat eine Stimme pro Frage (testifyPool/{id}/votes/{uid}, v = 1 oder -1).
// Hier werden up/down der Frage nachgezogen; ab HIDE_AT 👎 und mehr 👎 als 👍 wird die Frage nicht mehr ausgespielt.
const HIDE_AT = 3;

exports.testifyVote = functions.firestore
    .document('testifyPool/{questionId}/votes/{uid}')
    .onWrite(async (change, context) => {
        const before = change.before.exists ? change.before.data().v : 0;
        const after = change.after.exists ? change.after.data().v : 0;
        if (before === after) return null;
        const ref = admin.firestore().collection('testifyPool').doc(context.params.questionId);
        return admin.firestore().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const q = snap.data();
            const up = Math.max(0, (q.up || 0) + (after === 1) - (before === 1));
            const down = Math.max(0, (q.down || 0) + (after === -1) - (before === -1));
            tx.update(ref, { up, down, hidden: down >= HIDE_AT && down > up });
        });
    });
