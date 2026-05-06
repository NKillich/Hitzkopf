export const RARITY_CONFIG = {
    common:    { weight: 60, label: 'Gewöhnlich',    color: 'rgba(148,163,184,0.7)', bg: 'rgba(148,163,184,0.07)', border: 'rgba(148,163,184,0.18)', glow: 'rgba(148,163,184,0.12)' },
    uncommon:  { weight: 25, label: 'Ungewöhnlich',  color: '#10B981',               bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.22)',  glow: 'rgba(16,185,129,0.14)' },
    rare:      { weight: 12, label: 'Selten',        color: '#3B82F6',               bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)',  glow: 'rgba(59,130,246,0.16)' },
    legendary: { weight: 3,  label: 'Legendär',      color: '#F59E0B',               bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)',  glow: 'rgba(245,158,11,0.18)' }
}

export const upgrades = [
    // Common
    {
        id: 'quick_thinker',
        name: 'Schneller Denker',
        rarity: 'common',
        emoji: '⚡',
        description: '+3 Punkte auf jede richtige Antwort'
    },
    {
        id: 'head_start',
        name: 'Vorsprung',
        rarity: 'common',
        emoji: '🚀',
        description: 'Erhalte sofort 20 Bonuspunkte'
    },
    {
        id: 'early_bird',
        name: 'Frühaufsteher',
        rarity: 'common',
        emoji: '🌅',
        description: 'Antwort in den ersten 12 Sek.: +5 extra Punkte'
    },
    {
        id: 'consistent',
        name: 'Beständigkeit',
        rarity: 'common',
        emoji: '🎯',
        description: '+2 Punkte auf jede Antwort, auch bei falscher Antwort'
    },
    // Uncommon
    {
        id: 'knowledge_boost',
        name: 'Wissensschub',
        rarity: 'uncommon',
        emoji: '🧠',
        description: '+8 Punkte auf jede richtige Antwort'
    },
    {
        id: 'streak_bonus',
        name: 'Serie',
        rarity: 'uncommon',
        emoji: '🔥',
        description: 'Nach 3 richtigen Antworten in Folge: +20 Bonuspunkte'
    },
    {
        id: 'double_or_nothing',
        name: 'Alles oder Nichts',
        rarity: 'uncommon',
        emoji: '🎲',
        description: '50% Chance auf doppelte Punkte – oder 0'
    },
    // Rare
    {
        id: 'critical_hit',
        name: 'Kritischer Treffer',
        rarity: 'rare',
        emoji: '💥',
        description: '25% Chance auf doppelte Punkte bei richtiger Antwort'
    },
    {
        id: 'comeback',
        name: 'Comeback',
        rarity: 'rare',
        emoji: '👑',
        description: 'Wenn du auf dem letzten Platz bist: +25 extra Punkte'
    },
    {
        id: 'time_thief',
        name: 'Zeitdieb',
        rarity: 'rare',
        emoji: '⏱️',
        description: 'Wenn nur du richtig liegst: +30 Bonuspunkte'
    },
    // Legendary
    {
        id: 'time_warp',
        name: 'Zeitverzerrung',
        rarity: 'legendary',
        emoji: '🌀',
        description: 'Deine Punkte basieren auf deiner Antwortzeit × 2'
    },
    {
        id: 'master_student',
        name: 'Musterschüler',
        rarity: 'legendary',
        emoji: '🏆',
        description: 'Deine nächsten 5 richtigen Antworten geben doppelte Punkte'
    },
    {
        id: 'omniscient',
        name: 'Allwissend',
        rarity: 'legendary',
        emoji: '🔮',
        description: 'Nach 15 Sek. wird eine falsche Antwort für dich markiert'
    }
]

export const getUpgradeById = (id) => upgrades.find(u => u.id === id)

const getWeightedRandom = (pool) => {
    const totalWeight = pool.reduce((sum, u) => sum + RARITY_CONFIG[u.rarity].weight, 0)
    let rand = Math.random() * totalWeight
    for (const upg of pool) {
        rand -= RARITY_CONFIG[upg.rarity].weight
        if (rand <= 0) return upg
    }
    return pool[pool.length - 1]
}

export const generateSingleUpgrade = (excludeIds = []) => {
    const available = upgrades.filter(u => !excludeIds.includes(u.id))
    if (available.length === 0) return null
    return getWeightedRandom(available)
}

export const generateUpgradeOffers = (count = 3, existingUpgradeIds = []) => {
    const available = upgrades.filter(u => !existingUpgradeIds.includes(u.id))
    if (available.length === 0) return []

    const offers = []
    const used = new Set()

    for (let i = 0; i < count; i++) {
        const remaining = available.filter(u => !used.has(u.id))
        if (remaining.length === 0) break
        const picked = getWeightedRandom(remaining)
        offers.push(picked.id)
        used.add(picked.id)
    }

    return offers
}
