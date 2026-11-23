// Aussehen des Spielers: Körper (nach Phase, Stufe und Evolutions-Tags) + Ausrüstung der Epoche.
// Ohne Phaser, damit testbar. Die Pixel-Raster selbst liegen in game/sprites.ts.

export const SHAPES = [
    'cell', 'blob', 'rod', 'worm', 'colony', 'frond', 'arthropod', 'fish', 'tetrapod',
    'reptile', 'mammal', 'bird', 'human', 'swarm', 'rock', 'debris',
] as const
export type Shape = typeof SHAPES[number]

export type Outfit = 'none' | 'cloak' | 'tunic' | 'suit'

/** Farbe (Tint) des Spielers je Körper – Gegner werden mit ihrer Datenfarbe eingefärbt. */
export const PLAYER_TINT: Partial<Record<Shape, number>> = {
    cell: 0x3dcf9e, colony: 0x3dcf9e, fish: 0x5fb8ff, arthropod: 0xe0a85a, tetrapod: 0x7fd86b,
    reptile: 0x7fd86b, mammal: 0xc98a4b, bird: 0xd9cfea, human: 0xe8b27a,
}

/** Körper je nach Hauptphase, Stufe und den Tags aus der Evolution. */
export function bodyFor(phase: number, code: string, tags: ReadonlySet<string>): Shape {
    if (phase <= 1) return 'cell'
    if (phase === 2) return 'colony'
    if (phase === 3) {
        if (tags.has('gliederfüsser')) return 'arthropod'
        if (code === '3.3' && tags.has('vierbeiner')) return 'tetrapod'
        return 'fish'
    }
    // ab Phase 4: Linie aus der Evolution (Reptil/Vogel/Säuger …)
    const animal: Shape =
        tags.has('vogel') ? 'bird'
            : tags.has('reptil') || tags.has('krokodil') || tags.has('dinosaurier') ? 'reptile'
                : tags.has('gliederfüsser') ? 'arthropod'
                    : tags.has('fisch') && !tags.has('vierbeiner') ? 'fish'
                        : 'mammal'
    if (phase >= 5 && tags.has('primat') && animal === 'mammal') return 'human'
    return animal
}

/** Ausrüstung der Epoche: Fell-Umhang, Kleidung, Raumanzug. */
export function outfitFor(code: string): Outfit {
    if (code === '5.2') return 'cloak'
    if (code === '5.3') return 'tunic'
    if (code.startsWith('6.')) return 'suit'
    return 'none'
}

/** Bodenmuster je Stufe: Urmeer, Tiefsee, Meeresboden/Ufer, Gras, Wege (erst ab Sesshaftigkeit), All. */
export function groundFor(phase: number, code: string): string {
    if (phase === 5) return code === '5.3' ? 'ground5' : 'ground4'
    return `ground${Math.min(6, Math.max(1, phase))}`
}
