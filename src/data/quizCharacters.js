export const characters = [
    {
        id: 'kevin',
        name: 'Kevin',
        title: 'Der Lehrer',
        emoji: '📚',
        color: '#4a90d9',
        gradient: 'linear-gradient(135deg, #4a90d9 0%, #2b6cb0 100%)',
        image: 'characters/kevin_square.png',
        passives: [
            {
                id: 'kevin_bildung',
                name: 'Bildung zahlt sich aus',
                description: '+6 Punkte auf jede richtige Antwort',
                icon: '🎓',
                unlockAt: 0
            },
            {
                id: 'kevin_nachhilfe',
                name: 'Nachhilfestunde',
                description: 'Nach einer falschen Antwort gibt die nächste richtige +20 extra Punkte',
                icon: '📖',
                unlockAt: 0
            },
            {
                id: 'kevin_klassenarbeit',
                name: 'Klassenarbeit',
                description: 'Jede 3. richtige Antwort in Folge gibt +25 Bonuspunkte',
                icon: '✏️',
                unlockAt: 0
            }
        ],
        quips: {
            correct: [
                'Kevin der Lehrer zeigt, wie es gemacht wird! 🎓',
                'Bildung zahlt sich aus – Kevin weiß Bescheid! ✅',
                'Der Lehrer korrigiert alle anderen… und liegt richtig 😏',
                'Volle Punktzahl, Herr Lehrer! Endlich mal vorbildlich 👏'
            ],
            wrong: [
                'Kevin der Lehrer muss wohl selbst nochmal die Schule besuchen 📚',
                'Herr Lehrer sitzt heute lieber in der letzten Reihe 😅',
                'Kevin schreibt sich selbst eine Nachschreibarbeit auf ✏️',
                'Der Lehrplan war wohl etwas lückenhaft, Kevin 😬'
            ]
        }
    },
    {
        id: 'niklas',
        name: 'Niklas',
        title: 'Der Designer',
        emoji: '🎨',
        color: '#9b59b6',
        gradient: 'linear-gradient(135deg, #9b59b6 0%, #6c3483 100%)',
        image: 'characters/niklas_square.png',
        passives: [
            {
                id: 'niklas_kreativ',
                name: 'Kreativblitz',
                description: 'Antwortest du in den ersten 10 Sek. richtig: +10 Bonuspunkte',
                icon: '⚡',
                unlockAt: 0
            },
            {
                id: 'niklas_flow',
                name: 'Im Flow',
                description: 'Jede richtige Antwort in Folge (ab der 2.) gibt +5 extra Punkte',
                icon: '🌊',
                unlockAt: 0
            },
            {
                id: 'niklas_inspiration',
                name: 'Letzte Sekunde',
                description: 'Antwortest du nach Sek. 20 noch richtig: immer volle 30 Punkte',
                icon: '💡',
                unlockAt: 0
            }
        ],
        quips: {
            correct: [
                'Niklas beweist: Gutes Design UND gutes Wissen! ✨',
                'Der Designchef trifft ins Schwarze – mit Stil! 🎨',
                'Kreativität UND Intelligenz – Niklas hat beides 💅',
                'Schnell, präzise, stylisch – voll im Flow, Niklas! ⚡'
            ],
            wrong: [
                'Niklas hat wohl das falsche Antwort-Design gewählt 🎨',
                'Schöne Antwort, falsche Antwort – typisch Designer 🖌️',
                'Niklas denkt in Farben, leider nicht in Fakten 😂',
                'Das Redesign der Antwort hat leider nicht geholfen 🤦'
            ]
        }
    },
    {
        id: 'nils',
        name: 'Nils',
        title: 'Der Staatsanwalt',
        emoji: '⚖️',
        color: '#e74c3c',
        gradient: 'linear-gradient(135deg, #e74c3c 0%, #922b21 100%)',
        image: 'characters/nils_square.png',
        passives: [
            {
                id: 'nils_risiko',
                name: 'Volles Risiko',
                description: 'Richtige Antwort: +12 Bonus | Falsche Antwort: -8 Punkte',
                icon: '⚖️',
                unlockAt: 0
            },
            {
                id: 'nils_anklaeger',
                name: 'Der Ankläger',
                description: 'Wenn du als Erster aller Spieler richtig antwortest: +12 Bonus',
                icon: '⚡',
                unlockAt: 0
            },
            {
                id: 'nils_urteil',
                name: 'Das Urteil',
                description: 'Richtige Antworten geben immer mindestens 20 Punkte (Timing kann höher sein)',
                icon: '🔨',
                unlockAt: 0
            }
        ],
        quips: {
            correct: [
                'Der Staatsanwalt präsentiert die Beweise – eindeutig! ⚖️✅',
                'Nils kennt die Wahrheit. Die anderen? Schuldig! 👨‍⚖️',
                'Einspruch abgewiesen – Nils hat Recht! 🔨',
                'Das Plädoyer war kurz und überzeugend – Nils gewinnt! ⚖️'
            ],
            wrong: [
                'Der Staatsanwalt zieht den Fall zurück – mangels Beweisen 👨‍⚖️',
                'Nils legt Berufung ein… leider ohne Erfolgsaussichten ⚖️',
                'Das Gericht urteilt: Nils schuldig der falschen Antwort! 🔨',
                'Herr Staatsanwalt, die Beweislage war eindeutig – nur nicht für Sie 😬'
            ]
        }
    }
]

export const getCharacterById = (id) => characters.find(c => c.id === id)

export const getPassiveById = (passiveId) => {
    for (const char of characters) {
        const p = char.passives.find(p => p.id === passiveId)
        if (p) return p
    }
    return null
}

export const getCharacterQuip = (characterId, isCorrect) => {
    const char = characters.find(c => c.id === characterId)
    if (!char?.quips) return null
    const arr = isCorrect ? char.quips.correct : char.quips.wrong
    if (!arr || arr.length === 0) return null
    return arr[Math.floor(Math.random() * arr.length)]
}
