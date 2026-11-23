// Tag-Regeln für Evolution-Optionen und Upgrades (requires / excludes / grants)

export interface TagRule {
    requires?: string[]
    excludes?: string[]
}

/** Erfüllt: alle `requires`-Tags vorhanden und kein `excludes`-Tag. */
export function meetsTags(rule: TagRule, tags: ReadonlySet<string>): boolean {
    if (rule.requires?.some(t => !tags.has(t))) return false
    if (rule.excludes?.some(t => tags.has(t))) return false
    return true
}

/** Neue Tag-Menge mit den Tags aus `grants`. */
export function grantTags(tags: ReadonlySet<string>, grants: string[] | undefined): Set<string> {
    const next = new Set(tags)
    for (const t of grants ?? []) next.add(t)
    return next
}
