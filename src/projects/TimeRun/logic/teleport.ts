// Entwickler-Teleporter: Weg bis zu einer Stufe, als hätte man immer die echte Zeitlinie gewählt.
import type { Epoch, EvolutionOption } from './types'
import { availableEvolutions, applyEvolution } from './evolution'
import { firstPlayable, nextPlayable, transitionStage } from './epochs'

export interface TeleportPath {
    /** besuchte Stufen vor dem Ziel (in Reihenfolge) */
    visited: string[]
    /** gewählte Evolutionen bis einschließlich zur Wahl, mit der man das Ziel betritt */
    path: EvolutionOption[]
    tags: Set<string>
}

/** Weg vom Start bis zur Stufe `targetId` – je Wahl die echte Option, sonst die erste mögliche. */
export function realPathTo(epochs: Epoch[], options: EvolutionOption[], targetId: string): TeleportPath | null {
    let cur = firstPlayable(epochs)
    let tags = new Set<string>()
    const visited: string[] = []
    const path: EvolutionOption[] = []
    while (cur && cur.id !== targetId) {
        visited.push(cur.id)
        const stage = transitionStage(epochs, cur.id)
        const avail = stage ? availableEvolutions(options, stage.id, tags) : []
        const pick = avail.find(o => o.real) ?? avail[0]
        if (pick) {
            tags = applyEvolution(tags, pick)
            path.push(pick)
        }
        cur = nextPlayable(epochs, cur.id)
    }
    return cur ? { visited, path, tags } : null
}

/** Ungefähres Level beim Betreten einer Stufe (Index ab 0) – nur für den Teleporter. */
export function teleportLevel(stageIndex: number): number {
    return 1 + Math.round(stageIndex * 1.6)
}
