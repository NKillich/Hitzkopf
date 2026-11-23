// Ablauf der Epochen: welche spielbar sind, welche Wahl am Ende kommt, Varianten, Zeitstrahl.
import type { Epoch, EvolutionOption } from './types'
import { meetsTags } from './tags'

export function sortedEpochs(epochs: Epoch[]): Epoch[] {
    return [...epochs].sort((a, b) => a.order - b.order)
}

/** Spielbar = hat Gegner (die übrigen Stufen sind im Prototyp noch leer). */
export function isPlayable(e: Epoch): boolean {
    return e.enemies.length > 0
}

export function firstPlayable(epochs: Epoch[]): Epoch | undefined {
    return sortedEpochs(epochs).find(isPlayable)
}

/** Nächste spielbare Epoche nach `currentId` (undefined = Ende des Inhalts). */
export function nextPlayable(epochs: Epoch[], currentId: string): Epoch | undefined {
    const list = sortedEpochs(epochs)
    const i = list.findIndex(e => e.id === currentId)
    return list.slice(i + 1).find(isPlayable)
}

/**
 * Stufe, deren Evolution-Optionen am Ende von `currentId` angeboten werden:
 * immer die direkt folgende Stufe des Zeitstrahls – auch wenn sie (noch) nicht spielbar ist.
 * So führen z. B. die Mehrzeller-Pfade der Mikrobenphase zu verschiedenen Steinzeit-Varianten.
 */
export function transitionStage(epochs: Epoch[], currentId: string): Epoch | undefined {
    const list = sortedEpochs(epochs)
    const i = list.findIndex(e => e.id === currentId)
    return i >= 0 ? list[i + 1] : undefined
}

/** Epoche mit der ersten passenden Variante (Name, Farben, zusätzliche Wellen). */
export function resolveEpoch(epoch: Epoch, tags: ReadonlySet<string>): Epoch {
    const v = epoch.variants?.find(x => meetsTags(x, tags))
    if (!v) return epoch
    return {
        ...epoch,
        name: v.name,
        background: v.background ?? epoch.background,
        gridColor: v.gridColor ?? epoch.gridColor,
        waves: [...epoch.waves, ...(v.extraWaves ?? [])],
        variantId: v.id,
    }
}

/** Anteil der geschafften Höhe (0…1). y wächst nach unten, nach oben heißt kleiner. */
export function heightProgress(startY: number, y: number, height: number): number {
    if (height <= 0) return 1
    return Math.min(1, Math.max(0, (startY - y) / height))
}

export type TimelineStatus = 'done' | 'current' | 'skipped' | 'future'

export interface TimelineEntry {
    id: string
    code: string
    name: string
    status: TimelineStatus
    /** Name der gewählten Evolution-Option für diese Stufe */
    choice?: string
}

/** Zeitstrahl: gespielte, aktuelle, übersprungene (noch nicht spielbare) und kommende Stufen. */
export function buildTimeline(
    epochs: Epoch[], currentId: string, visited: string[], choices: Record<string, EvolutionOption>,
): TimelineEntry[] {
    const list = sortedEpochs(epochs)
    const current = list.find(e => e.id === currentId)
    const currentOrder = current?.order ?? 0
    return list.map(e => {
        let status: TimelineStatus = 'future'
        if (e.id === currentId) status = 'current'
        else if (visited.includes(e.id)) status = 'done'
        else if (e.order < currentOrder) status = 'skipped'
        return { id: e.id, code: e.code, name: e.name, status, choice: choices[e.id]?.name }
    })
}
