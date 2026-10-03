const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Spotify Token-Proxy (Amplify / Song raten)
exports.spotifyToken = require('./spotifyToken').spotifyToken;

// Fragekategorien - vollständig aus src/data/questionCategories.js kopiert
const { questionCategories, getAllQuestions } = require('./questionCategories');

// Hilfsfunktion: Wähle zufällige Frage
function getRandomQuestion(usedQuestions, activeCategories) {
    const allQuestions = getAllQuestions(activeCategories);
    const unusedQuestions = allQuestions.filter((q, idx) => !usedQuestions.includes(idx));
    const randomQ = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)] || allQuestions[0];
    return randomQ;
}

// Hilfsfunktion: Eiswürfel-Automatik
async function applyIceCooling(roomId, players) {
    const coolValue = 10; // Standard-Schaden
    const updates = {};
    let hasUpdates = false;

    for (const [name, playerData] of Object.entries(players)) {
        if (playerData.inventory?.includes('card_ice')) {
            const currentTemp = playerData.temp || 0;
            const reduction = Math.min(coolValue, currentTemp);
            if (reduction > 0) {
                updates[`players.${name}.temp`] = admin.firestore.FieldValue.increment(-reduction);
                updates[`players.${name}.inventory`] = admin.firestore.FieldValue.arrayRemove('card_ice');
                hasUpdates = true;
            }
        }
    }

    if (hasUpdates) {
        await db.collection('lobbies').doc(roomId).update(updates);
    }
}

// Firestore Trigger: Auto-Advance (Game -> Result)
// Wird ausgelöst, wenn alle Spieler geantwortet haben
exports.onAllVotesReceived = functions.firestore
    .document('lobbies/{lobbyId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const lobbyId = context.params.lobbyId;

        // Nur wenn Status 'game' ist
        if (after.status !== 'game') return null;

        // Prüfe ob sich Votes geändert haben
        const beforeVotes = before.votes || {};
        const afterVotes = after.votes || {};
        const votesChanged = JSON.stringify(beforeVotes) !== JSON.stringify(afterVotes);

        if (!votesChanged) return null;

        const maxTemp = after.config?.maxTemp || 100;
        const players = after.players || {};
        const activePlayers = Object.keys(players).filter(p => {
            const temp = players[p]?.temp || 0;
            return temp < maxTemp;
        });

        const playerCount = activePlayers.length;
        const voteCount = activePlayers.filter(p => {
            return afterVotes[p]?.choice !== undefined;
        }).length;

        const hotseat = typeof after.hotseat === 'string' 
            ? after.hotseat 
            : (after.hotseat?.name || String(after.hotseat || ''));
        const hotseatHasVoted = hotseat && activePlayers.includes(hotseat) && afterVotes[hotseat]?.choice !== undefined;

        // Alle aktiven Spieler (inklusive Hotseat) müssen geantwortet haben
        if (voteCount >= playerCount && playerCount > 0 && hotseatHasVoted) {
            console.log(`[AUTO-ADVANCE] Alle haben geantwortet, wechsle zu Result für Lobby ${lobbyId}`);
            
            // Warte 1 Sekunde, dann wechsle zu Result
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await db.collection('lobbies').doc(lobbyId).update({
                status: 'result'
            });
        }

        return null;
    });

// Firestore Trigger: Auto-Next (Result -> nächste Runde)
// Wird ausgelöst, wenn alle Spieler bereit sind
exports.onAllReady = functions.firestore
    .document('lobbies/{lobbyId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const lobbyId = context.params.lobbyId;

        // Nur wenn Status 'result' ist und roundRecapShown true ist
        if (after.status !== 'result' || !after.roundRecapShown) return null;

        // Prüfe ob sich ready-Liste geändert hat
        const beforeReady = before.ready || [];
        const afterReady = after.ready || [];
        const readyChanged = JSON.stringify(beforeReady) !== JSON.stringify(afterReady);

        if (!readyChanged) return null;

        const maxTemp = after.config?.maxTemp || 100;
        const players = after.players || {};
        const activePlayers = Object.keys(players).filter(p => {
            const temp = players[p]?.temp || 0;
            return temp < maxTemp;
        });

        const playerCount = activePlayers.length;
        const readyCount = activePlayers.filter(p => afterReady.includes(p)).length;

        // Prüfe ob alle Popups bestätigt wurden
        const popupConfirmed = after.popupConfirmed || {};
        const hasAttackResults = after.attackResults && Object.keys(after.attackResults).length > 0;
        const allPopupConfirmed = !hasAttackResults || activePlayers.every(p => {
            if (!after.attackResults?.[p]) return true;
            return popupConfirmed[p] === true;
        });

        // Alle müssen bereit sein UND alle Popups bestätigt haben
        if (readyCount >= playerCount && playerCount > 0 && allPopupConfirmed) {
            console.log(`[AUTO-NEXT] Alle bereit, starte nächste Runde für Lobby ${lobbyId}`);
            
            // Warte 1 Sekunde, dann starte nächste Runde
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Nächste Runde starten
            await startNextRound(lobbyId, after);
        }

        return null;
    });

// Hilfsfunktion: Starte nächste Runde
async function startNextRound(lobbyId, currentData) {
    const players = currentData.players || {};
    const maxTemp = currentData.config?.maxTemp || 100;
    const activePlayers = Object.keys(players).filter(p => {
        const temp = players[p]?.temp || 0;
        return temp < maxTemp;
    });

    // Prüfe auf Spielende
    if (activePlayers.length <= 1) {
        await db.collection('lobbies').doc(lobbyId).update({
            status: 'winner'
        });
        return;
    }

    // Eiswürfel-Automatik
    await applyIceCooling(lobbyId, players);

    // Rotiere Hotseat
    const currentHotseat = typeof currentData.hotseat === 'string' 
        ? currentData.hotseat 
        : (currentData.hotseat?.name || String(currentData.hotseat || ''));
    let nextHotseatIndex = activePlayers.indexOf(currentHotseat);
    if (nextHotseatIndex === -1) nextHotseatIndex = 0;
    nextHotseatIndex = (nextHotseatIndex + 1) % activePlayers.length;
    const nextHotseat = activePlayers[nextHotseatIndex];

    // Wähle zufällige Frage
    const usedQuestions = currentData.usedQuestions || [];
    const activeCategories = currentData.config?.categories || Object.keys(questionCategories);
    const allQuestions = getAllQuestions(activeCategories);
    const randomQ = getRandomQuestion(usedQuestions, activeCategories);
    const qIndex = allQuestions.findIndex(q => q.q === randomQ.q);

    const nextRoundId = (currentData.roundId ?? 0) + 1;

    // Update Lobby
    await db.collection('lobbies').doc(lobbyId).update({
        status: 'game',
        hotseat: nextHotseat,
        currentQ: randomQ,
        roundId: nextRoundId,
        lastQuestionCategory: randomQ.category,
        roundRecapShown: false,
        votes: admin.firestore.FieldValue.delete(),
        ready: [],
        lobbyReady: {},
        pendingAttacks: {},
        attackDecisions: {},
        attackResults: admin.firestore.FieldValue.delete(),
        popupConfirmed: {},
        countdownEnds: admin.firestore.FieldValue.delete(),
        usedQuestions: qIndex !== -1 ? [...usedQuestions, qIndex] : usedQuestions
    });
}

// Firestore Trigger: Execute Pending Attacks
// Wird ausgelöst, wenn alle Angriffsentscheidungen getroffen wurden
exports.onAllAttackDecisionsMade = functions.firestore
    .document('lobbies/{lobbyId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const lobbyId = context.params.lobbyId;

        // Nur wenn Status 'result' ist und roundRecapShown noch false ist
        if (after.status !== 'result' || after.roundRecapShown) return null;

        // Prüfe ob sich attackDecisions geändert haben
        const beforeDecisions = before.attackDecisions || {};
        const afterDecisions = after.attackDecisions || {};
        const decisionsChanged = JSON.stringify(beforeDecisions) !== JSON.stringify(afterDecisions);

        if (!decisionsChanged) return null;

        // Prüfe ob Hotseat geantwortet hat
        const hotseat = typeof after.hotseat === 'string' 
            ? after.hotseat 
            : (after.hotseat?.name || String(after.hotseat || ''));
        const votes = after.votes || {};
        const hasTruth = votes[hotseat]?.choice !== undefined;

        if (!hasTruth) return null;

        const maxTemp = after.config?.maxTemp || 100;
        const players = after.players || {};
        const eliminatedPlayers = after.eliminatedPlayers || [];
        const playerNames = Object.keys(players).filter(p => {
            const temp = players[p]?.temp || 0;
            return temp < maxTemp && !eliminatedPlayers.includes(p);
        });

        // Prüfe ob alle Spieler entschieden haben
        const playersWhoCanAttack = playerNames.filter(p => {
            if (p === hotseat) return false;
            const hotseatVote = votes[hotseat];
            const playerVote = votes[p];
            if (hotseatVote && playerVote) {
                const truth = String(hotseatVote.choice || '');
                const playerChoice = String(playerVote.choice || '');
                if (playerChoice !== truth) return false;
            }
            return true;
        });

        const allPlayersDecided = playerNames.every(p => afterDecisions[p] === true);

        if (allPlayersDecided) {
            console.log(`[EXECUTE ATTACKS] Alle Entscheidungen getroffen, verarbeite Angriffe für Lobby ${lobbyId}`);
            
            // Warte 500ms, dann verarbeite Angriffe
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await executePendingAttacks(lobbyId, after);
        }

        return null;
    });

// Hilfsfunktion: Verarbeite Angriffe
async function executePendingAttacks(lobbyId, currentData) {
    const pendingAttacks = currentData.pendingAttacks || {};
    const players = currentData.players || {};
    const votes = currentData.votes || {};
    const hotseat = typeof currentData.hotseat === 'string' 
        ? currentData.hotseat 
        : (currentData.hotseat?.name || String(currentData.hotseat || ''));
    const gameMode = currentData.config?.gameMode || 'party';
    const isPartyMode = gameMode === 'party';

    const tempUpdates = {};
    const attackResults = {};
    const logEntries = [];

    // Verarbeite alle Angriffe
    for (const [target, attacks] of Object.entries(pendingAttacks)) {
        if (!players[target] || !Array.isArray(attacks) || attacks.length === 0) continue;

        const targetState = players[target];
        const targetHasMirror = targetState.inventory?.includes('card_mirror');
        let totalDmg = 0;
        const attackerNames = [];

        attacks.forEach(attack => {
            totalDmg += attack.dmg || 0;
            attackerNames.push(attack.attacker);
            if (attack.hasOil) {
                logEntries.push(`🔥 ${attack.attacker} greift ${target} mit dem Ölfass an (+${attack.dmg}°C)`);
            } else {
                logEntries.push(`🔥 ${attack.attacker} greift ${target} an (+${attack.dmg}°C)`);
            }
        });

        if (targetHasMirror) {
            // Spiegele Angriffe zurück
            attacks.forEach(attack => {
                if (!tempUpdates[`players.${attack.attacker}.temp`]) {
                    tempUpdates[`players.${attack.attacker}.temp`] = 0;
                }
                tempUpdates[`players.${attack.attacker}.temp`] += attack.dmg || 0;
            });

            const attackerList = attackerNames.join(' und ');
            logEntries.push(`🪞 ${target} spiegelt die Angriffe von ${attackerList} zurück! (+${totalDmg}°C)`);

            attackResults[target] = {
                attackers: attackerNames,
                totalDmg: 0,
                attackDetails: attacks.map(a => ({ attacker: a.attacker, dmg: a.dmg || 0, mirrored: true }))
            };
        } else {
            // Normaler Angriff
            if (!tempUpdates[`players.${target}.temp`]) {
                tempUpdates[`players.${target}.temp`] = 0;
            }
            tempUpdates[`players.${target}.temp`] += totalDmg;

            attackResults[target] = {
                attackers: [...attackerNames],
                totalDmg: totalDmg,
                attackDetails: attacks.map(a => ({ attacker: a.attacker, dmg: a.dmg || 0 }))
            };
        }
    }

    // Füge Strafhitze für falsche Antworten hinzu
    const truth = votes[hotseat]?.choice;
    const allPlayers = Object.keys(players);

    allPlayers.forEach(playerName => {
        if (playerName === hotseat) return;

        const playerVote = votes[playerName];
        const playerChoice = String(playerVote?.choice || '');
        const truthChoice = String(truth || '');

        if (playerVote && playerChoice !== truthChoice) {
            // Falsch geraten - Strafhitze
            let penaltyDmg = 10;
            if (isPartyMode) {
                penaltyDmg = 0; // Bereits angewendet
            }

            if (penaltyDmg > 0) {
                if (!tempUpdates[`players.${playerName}.temp`]) {
                    tempUpdates[`players.${playerName}.temp`] = 0;
                }
                tempUpdates[`players.${playerName}.temp`] += penaltyDmg;
            }

            if (!attackResults[playerName]) {
                attackResults[playerName] = {
                    attackers: [],
                    totalDmg: 0,
                    attackDetails: []
                };
            }

            const displayedPenaltyDmg = 10;
            attackResults[playerName].totalDmg += displayedPenaltyDmg;
            attackResults[playerName].attackDetails.push({
                attacker: 'Strafhitze',
                dmg: displayedPenaltyDmg,
                isPenalty: true
            });
        }
    });

    // Erstelle Attack-Ergebnisse für ALLE Spieler
    allPlayers.forEach(playerName => {
        if (!attackResults[playerName]) {
            attackResults[playerName] = {
                attackers: [],
                totalDmg: 0,
                attackDetails: []
            };
        }
    });

    // Update Firebase
    const updateData = {
        pendingAttacks: {},
        attackResults: attackResults,
        roundRecapShown: true
    };

    if (logEntries.length > 0) {
        updateData.log = admin.firestore.FieldValue.arrayUnion(...logEntries);
    }

    // Konvertiere tempUpdates zu Firebase-Format
    for (const [path, dmg] of Object.entries(tempUpdates)) {
        const parts = path.split('.');
        if (parts.length === 3 && parts[0] === 'players' && parts[2] === 'temp') {
            const playerName = parts[1];
            updateData[`players.${playerName}.temp`] = admin.firestore.FieldValue.increment(dmg);
        }
    }

    // Spiegele Angriffe zurück (Mirror-Karte entfernen)
    for (const [target] of Object.entries(pendingAttacks)) {
        if (players[target]?.inventory?.includes('card_mirror')) {
            updateData[`players.${target}.inventory`] = admin.firestore.FieldValue.arrayRemove('card_mirror');
        }
    }

    await db.collection('lobbies').doc(lobbyId).update(updateData);
}

