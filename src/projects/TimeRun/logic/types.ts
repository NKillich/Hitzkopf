// Datentypen für TimeRun – entsprechen den JSON-Dateien in ../data/

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface EnemyType {
    id: string
    name: string
    color: string      // "#rrggbb"
    size: number       // Kantenlänge in Spielpixeln
    hp: number
    speed: number      // Pixel pro Sekunde
    damage: number     // Schaden bei Berührung
    xp: number         // Wert des XP-Kristalls
    /** drift = treibt mit der Strömung und ist harmlos (frühe Einzeller), sonst jagt der Gegner */
    behavior?: 'chase' | 'drift'
}

/** Ab Sekunde `from` bis vor `to` erscheinen alle `every` Sekunden `count` Gegner vom Typ `enemy`. */
export interface Wave {
    enemy: string
    from: number
    to: number
    every: number
    count: number
}

/** Abwandlung einer Epoche je nach Tags (z. B. Steinzeit als Jäger- oder Sammlerstamm). */
export interface EpochVariant {
    id: string
    name: string
    requires?: string[]
    excludes?: string[]
    background?: string
    gridColor?: string
    extraWaves?: Wave[]
}

export interface Epoch {
    id: string
    /** Stufe wie „2.3“ */
    code: string
    order: number
    /** Hauptphase 1–6 */
    phase: number
    phaseName: string
    name: string
    /** kurzer Name für den HUD */
    shortName: string
    /** Zeitraum als Kalenderjahr (negativ = v. Chr. / vor heute) */
    fromYear: number
    toYear: number
    /** kurze, belegbare Infos – stehen als Text auf dem Boden, über die Stufe verteilt */
    facts: string[]
    background: string
    gridColor: string
    enemies: EnemyType[]
    /** nach HÖHE: from/to/every als Anteil der Stufenhöhe (0…1) */
    waves: Wave[]
    /** nach ZEIT (Sekunden): wenige Gegner, auch wenn man stehen bleibt */
    ambient?: Wave[]
    /** Strecke nach oben bis zum Ende der Epoche (nur spielbare Epochen) */
    height?: number
    /** wartet am oberen Ende; besiegt → Evolutionswahl */
    boss?: EnemyType
    variants?: EpochVariant[]
    /** gesetzt, wenn eine Variante angewendet wurde */
    variantId?: string
}

export interface WeaponStats {
    damage: number
    cooldownMs: number
    range: number
    projectileSpeed: number
    projectiles: number
    pierce: number
}

export type WeaponKind = 'projectile' | 'melee' | 'beam'

/** Faktoren einer Waffenform: damage/cooldown/range/speed multiplizieren, pierce/projectiles addieren. */
export interface FormMod {
    damage?: number
    cooldown?: number
    range?: number
    speed?: number
    pierce?: number
    projectiles?: number
}

export interface GeneForm {
    name: string
    color: string
    kind?: WeaponKind
    mod?: FormMod
}

/** Waffe, die über die Stufen mitwandert und ab bestimmten Stufen eine andere Form hat. */
export interface Gene {
    id: string
    name: string
    description: string
    kind: WeaponKind
    /** bis zu dieser Hauptphase frisst man kleinere Gegner durch Berührung */
    eatUntilPhase?: number
    /** in den Fress-Phasen gibt es die Fernwaffe erst mit diesem Tag */
    unlockTag?: string
    base: WeaponStats
    forms: Record<string, GeneForm>
}

export type Stat =
    | 'maxHp' | 'moveSpeed' | 'pickupRadius' | 'xpGain' | 'regen'
    | 'damage' | 'cooldown' | 'range' | 'projectileSpeed' | 'projectiles' | 'pierce'

export interface Effect {
    stat: Stat
    op: 'add' | 'mul'
    value: number
}

export interface Upgrade {
    id: string
    name: string
    description: string
    rarity: Rarity
    maxLevel: number
    effects: Effect[]
    requires?: string[]
    excludes?: string[]
    grants?: string[]
    /** nur in diesen Hauptphasen anbieten (fehlt = immer) */
    phases?: number[]
}

export interface EvolutionOption {
    id: string
    stage: string          // Epoche, die man mit dieser Wahl betritt
    name: string
    description: string
    requires: string[]
    excludes: string[]
    grants: string[]
    general?: boolean      // immer wählbar, damit keine Sackgasse entsteht
    real?: boolean         // so ist es in unserer Zeitlinie passiert
}

export interface GameData {
    epochs: Epoch[]
    genes: Gene[]
    startGene: string
    upgrades: Upgrade[]
    evolutionOptions: EvolutionOption[]
}

/** Werte des Spielers inkl. Waffe, nach allen Upgrades. */
export interface PlayerStats extends WeaponStats {
    maxHp: number
    moveSpeed: number
    pickupRadius: number
    xpGain: number
    regen: number
}
