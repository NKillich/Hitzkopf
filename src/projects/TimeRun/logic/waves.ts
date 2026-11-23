import type { Wave } from './types'

export interface SpawnRequest {
    enemy: string
    count: number
}

/**
 * Welche Gegner im Zeitraum (prevT, t] fällig werden (Sekunden Spielzeit).
 * Eine Welle feuert zu den Zeitpunkten from, from+every, from+2·every … solange < to.
 */
export function spawnsDue(waves: Wave[], prevT: number, t: number): SpawnRequest[] {
    const out: SpawnRequest[] = []
    if (t <= prevT) return out
    for (const w of waves) {
        if (t < w.from || prevT >= w.to || w.every <= 0) continue
        const end = Math.min(t, w.to - 1e-9)
        const kMax = Math.floor((end - w.from) / w.every)
        const kMin = prevT < w.from ? 0 : Math.floor((prevT - w.from) / w.every) + 1
        const ticks = kMax - kMin + 1
        if (ticks > 0) out.push({ enemy: w.enemy, count: ticks * w.count })
    }
    return out
}

/** XP, die für den Schritt von Level `level` auf `level + 1` nötig sind. */
export function xpForLevel(level: number): number {
    return Math.floor(5 + (level - 1) * 4 + Math.pow(level - 1, 2) * 0.6)
}
