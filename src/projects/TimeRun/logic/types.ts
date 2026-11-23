// Datentypen für TimeRun – entsprechen den JSON-Dateien in ../data/

export type Phase = 'biologisch' | 'kulturell'
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
}

/** Ab Sekunde `from` bis vor `to` erscheinen alle `every` Sekunden `count` Gegner vom Typ `enemy`. */
export interface Wave {
    enemy: string
    from: number
    to: number
    every: number
    count: number
}

export interface Epoch {
    id: string
    order: number
    name: string
    phase: Phase
    background: string
    gridColor: string
    enemies: EnemyType[]
    waves: Wave[]
}

export interface WeaponStats {
    damage: number
    cooldownMs: number
    range: number
    projectileSpeed: number
    projectiles: number
    pierce: number
}

/** Fähigkeit, die über die Epochen mitwandert und je Epoche eine andere Form hat. */
export interface Gene {
    id: string
    name: string
    description: string
    kind: 'projectile'
    base: WeaponStats
    forms: Record<string, { name: string; color: string }>
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
