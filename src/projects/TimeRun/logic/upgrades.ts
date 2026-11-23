import type { PlayerStats, Rarity, Stat, Upgrade, WeaponStats } from './types'
import { meetsTags } from './tags'

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 25, epic: 11, legendary: 4 }

/** Gewählte Upgrades: id → Stufe */
export type OwnedUpgrades = Record<string, number>

export interface BasePlayer {
    maxHp: number
    moveSpeed: number
    pickupRadius: number
    xpGain: number
    regen: number
}

/** Upgrades, die gerade angeboten werden dürfen (nicht ausgereizt, Tags passen). */
export function eligibleUpgrades(all: Upgrade[], owned: OwnedUpgrades, tags: ReadonlySet<string>): Upgrade[] {
    return all.filter(u => (owned[u.id] ?? 0) < u.maxLevel && meetsTags(u, tags))
}

/** Bis zu `n` verschiedene Upgrades, gewichtet nach Seltenheit (ohne Zurücklegen). */
export function pickUpgrades(
    all: Upgrade[], owned: OwnedUpgrades, tags: ReadonlySet<string>, rng: () => number = Math.random, n = 3,
): Upgrade[] {
    const pool = eligibleUpgrades(all, owned, tags)
    const picked: Upgrade[] = []
    while (picked.length < n && pool.length > 0) {
        const total = pool.reduce((s, u) => s + RARITY_WEIGHT[u.rarity], 0)
        let r = rng() * total
        let idx = pool.length - 1
        for (let i = 0; i < pool.length; i++) {
            r -= RARITY_WEIGHT[pool[i].rarity]
            if (r < 0) { idx = i; break }
        }
        picked.push(pool[idx])
        pool.splice(idx, 1)
    }
    return picked
}

const STAT_TO_KEY: Record<Stat, keyof PlayerStats> = {
    maxHp: 'maxHp', moveSpeed: 'moveSpeed', pickupRadius: 'pickupRadius', xpGain: 'xpGain', regen: 'regen',
    damage: 'damage', cooldown: 'cooldownMs', range: 'range', projectileSpeed: 'projectileSpeed',
    projectiles: 'projectiles', pierce: 'pierce',
}

/** Endwerte: erst alle Additionen, dann alle Multiplikationen (Reihenfolge der Wahl spielt keine Rolle). */
export function computeStats(base: BasePlayer, weapon: WeaponStats, all: Upgrade[], owned: OwnedUpgrades): PlayerStats {
    const stats: PlayerStats = { ...base, ...weapon }
    const mul: Partial<Record<keyof PlayerStats, number>> = {}
    for (const u of all) {
        const level = owned[u.id] ?? 0
        if (!level) continue
        for (const e of u.effects) {
            const key = STAT_TO_KEY[e.stat]
            if (e.op === 'add') stats[key] += e.value * level
            else mul[key] = (mul[key] ?? 1) * Math.pow(e.value, level)
        }
    }
    for (const [key, factor] of Object.entries(mul) as [keyof PlayerStats, number][]) stats[key] *= factor
    stats.projectiles = Math.max(1, Math.round(stats.projectiles))
    stats.pierce = Math.max(0, Math.round(stats.pierce))
    stats.cooldownMs = Math.max(80, stats.cooldownMs)
    return stats
}
