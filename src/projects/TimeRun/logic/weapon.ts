// Waffe je Stufe und Fressen in den frühen Phasen – ohne Phaser, damit testbar.
import type { Epoch, Gene, GeneForm, PlayerStats, WeaponKind } from './types'
import { sortedEpochs } from './epochs'

/** Gültige Form: die der letzten Stufe bis einschließlich `epochId`, die eine Form festlegt. */
export function activeForm(gene: Gene, epochs: Epoch[], epochId: string): GeneForm | undefined {
    let form: GeneForm | undefined
    for (const e of sortedEpochs(epochs)) {
        if (gene.forms[e.id]) form = gene.forms[e.id]
        if (e.id === epochId) break
    }
    return form
}

/** In dieser Hauptphase wird durch Berührung gefressen. */
export function canEat(gene: Gene, phase: number): boolean {
    return gene.eatUntilPhase !== undefined && phase <= gene.eatUntilPhase
}

/** Fernwaffe aktiv? In den Fress-Phasen erst mit dem Freischalt-Tag. */
export function rangedActive(gene: Gene, phase: number, tags: ReadonlySet<string>): boolean {
    if (!canEat(gene, phase)) return true
    return !!gene.unlockTag && tags.has(gene.unlockTag)
}

/** Werte nach den Faktoren der Form. */
export function applyForm(stats: PlayerStats, form: GeneForm | undefined): PlayerStats {
    const m = form?.mod
    if (!m) return stats
    return {
        ...stats,
        damage: stats.damage * (m.damage ?? 1),
        cooldownMs: Math.max(80, stats.cooldownMs * (m.cooldown ?? 1)),
        range: stats.range * (m.range ?? 1),
        projectileSpeed: stats.projectileSpeed * (m.speed ?? 1),
        pierce: stats.pierce + (m.pierce ?? 0),
        projectiles: stats.projectiles + (m.projectiles ?? 0),
    }
}

export function weaponKind(gene: Gene, form: GeneForm | undefined): WeaponKind {
    return form?.kind ?? gene.kind
}

/** Größe des Spielers: in den Fress-Phasen wächst er mit dem Level, sonst fest. */
export function playerSize(level: number, eating: boolean): number {
    return eating ? Math.min(26, 9 + level) : 14
}

/** Kleinere Gegner kann man fressen (Bosse nie). */
export function canEatEnemy(playerSz: number, enemySize: number, isBoss: boolean): boolean {
    return !isBoss && enemySize < playerSz
}

/** Anzeige der Waffe, z. B. „Fressen + Toxin“ oder „Speer“. */
export function weaponLabel(gene: Gene, form: GeneForm | undefined, phase: number, tags: ReadonlySet<string>): string {
    if (!canEat(gene, phase)) return form?.name ?? gene.name
    return rangedActive(gene, phase, tags) ? `${gene.name} + ${form?.name ?? ''}`.trim() : gene.name
}
