import type { EvolutionOption } from './types'
import { meetsTags, grantTags } from './tags'

/** Wählbare Optionen für die Stufe `stage` bei den aktuellen Tags. Allgemeine Optionen sind immer dabei. */
export function availableEvolutions(options: EvolutionOption[], stage: string, tags: ReadonlySet<string>): EvolutionOption[] {
    return options.filter(o => o.stage === stage && (o.general || meetsTags(o, tags)))
}

/** Tags nach der Wahl einer Option. */
export function applyEvolution(tags: ReadonlySet<string>, option: EvolutionOption): Set<string> {
    return grantTags(tags, option.grants)
}
