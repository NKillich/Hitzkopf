// Farbige Pixel-Figuren für Phase 1–2 (Paket 1) nach der Vorlage „8-Bit Mikrobe“.
// Raster 16 × 16, Zeichen: O = Umriss, B = Grundfarbe, L = hell, D = Schatten, S = Fleck,
// W = weiß, K = schwarz, Y = gelb, A = Akzent, M = Mund, . = leer.
// Die Hauptfigur hat feste Farben, Gegner leiten ihre Töne aus der Datenfarbe ab.
import type Phaser from 'phaser'

type Grid = string[]

const OUTLINE = 0x14202e

/** Hauptfigur: zwei Bilder (kompakt / Tentakel ausgestreckt), Fühler mit gelben Spitzen. */
const HERO: [Grid, Grid] = [
    [
        '..YY.......YY...',
        '..YY.......YY...',
        '...D.......D....',
        '....D.....D.....',
        '.....OOOOOO.....',
        '...OOLLBBBBOO...',
        '..OLBWWBBWWBBO..',
        '..OBBWKBBWKBBO..',
        '.OBSBBBBBBBBSBO.',
        '.OBBBMWMMWMBBBO.',
        '.OBBSBBMMBBBBSO.',
        '.ODBBBBBSBBBBDO.',
        '.ODDBSBBBBBBDDO.',
        '..ODDDDDDDDDDO..',
        '..ODO.ODDO.ODO..',
        '...O...OO...O...',
    ],
    [
        '.YY.........YY..',
        '.YY.........YY..',
        '..D.........D...',
        '...DD.....DD....',
        '.....OOOOOO.....',
        '...OOLLBBBBOO...',
        '..OLBWWBBWWBBO..',
        '..OBBWKBBWKBBO..',
        '.OBSBBBBBBBBSBO.',
        '.OBBBMWMMWMBBBO.',
        '.OBBSBBMMBBBBSO.',
        'OODBBBBBSBBBBDOO',
        'DODDBSBBBBBBDDOD',
        'D.ODDDDDDDDDDO.D',
        'DD.O.ODDDDO.O.DD',
        '.....O....O.....',
    ],
]

const HERO_COLORS: Record<string, number> = {
    O: OUTLINE, B: 0x2fa89a, L: 0x6fdcc4, D: 0x1f6f86, S: 0x1c5e6b, W: 0xf4f4f4, K: 0x0d0a12, Y: 0xf2c94c, M: 0x3a1622,
}

/** Gegner-Figuren (ein Bild; das zweite entsteht durch Wippen). */
const ART: Record<string, Grid> = {
    molecule: [
        '................', '.OOO............', 'OLBBO...........', 'OBBDO...........', '.OOO.O..........', '......O.........',
        '......OOOO......', '.....OLBBBO.....', '.....OBBBDO.....', '.....OBBDDO.....', '......OOOO.O....', '............O...',
        '............OOO.', '...........OAAAO', '...........OAADO', '............OOO.',
    ],
    helix: [
        'OO..........OO..', '.OBO......OBO...', '..OBO....OBO....', '...OBAAAABO.....', '....OBO.OBO.....', '.....OBOBO......',
        '......OBO.......', '.....OBOBO......', '....OBO.OBO.....', '...OBAAAABO.....', '..OBO....OBO....', '.OBO......OBO...',
        'OBO........OBO..', 'OO..........OO..',
    ],
    vesicle: [
        '.....OOOOOO.....', '...OOLLBBBBOO...', '..OLLBBBBBBBBO..', '.OLBBBBSSBBBBBO.', '.OLBBBSDDSBBBBO.', 'OBBBBBSDDSBBBBBO',
        'OBBSSBBSSBBBBBBO', 'OBBSDSBBBBBSSBBO', 'OBBBSBBBBBSDDSBO', 'OBBBBBBBBBBSSBBO', '.OBBBBBBBBBBBBO.', '.OBBBBBSSBBBBDO.',
        '..OBBBSDDSBBDO..', '...OODBSSBDDO...', '.....OOOOOO.....',
    ],
    rod: [
        '................', '................', '................', '................', '...OOOOOOOO.....', '..OLLBBBBBBO....',
        '.OLBBBSBBBBBO...', '.OBBBBBBBSBBO.OD', '.OBBSBBBBBBBOOD.', '.OBBBBBBSBBDO..D', '..ODBBBBBBDO....', '...OOOOOOOO.....',
    ],
    archaea: [
        '................', '....O.....O.....', '....OO...OO.....', '.....OOOOO......', '...OOLLBBBOO....', '..OLBBBBBBBBO...',
        'OOOBBSBBBBBBOOO.', '..OBBBBBBSBBO...', '..OBSBBBBBBDO...', 'OOOBBBBBBBDDOOO.', '..ODBBBSBBDO....', '...OODDDDDOO....',
        '.....OOOOO......', '....OO...OO.....', '....O.....O.....',
    ],
    mat: [
        '................', '................', '................', '................', '................', '................',
        '..OOOOOOOOOOOO..', '.OLBBLBBLBBLBBO.', '.OBBBBBBBBBBBBO.', '.ODDSDDSDDSDDDO.', '.OBBBBBBBBBBBBO.', '.OLBBLBBLBBLBBO.',
        '.ODDDDDDDDDDDDO.', '..OOOOOOOOOOOO..',
    ],
    radical: [
        '................', '................', '.......Y........', '......YAY.......', '...OOO..OOO.....', '..OLBBOOLBBO....',
        '..OBBBBBBBBO....', '..OBBDOOBBDO....', '...OOO..OOO.....', '.........Y......', '........YAY.....', '.........Y......',
    ],
    stromatolite: [
        '................', '................', '................', '.....OOOOOO.....', '...OOLLBBBBOO...', '..OLBBBBBBBBBO..',
        '..ODDDDDDDDDDO..', '.OBBBBBBBBBBBBO.', '.ODDDDDDDDDDDDO.', '.OBBBBBBBBBBBBO.', 'ODDDDDDDDDDDDDDO', 'OBBBBBBBBBBBBBBO',
        'ODDDDDDDDDDDDDDO', 'OSSSSSSSSSSSSSSO', 'OOOOOOOOOOOOOOOO',
    ],
    coil: [
        '................', '................', '....OOOOOO......', '...OLBBBBBO.....', '..OBOOOOOOBO....', '..OBO....OBO....',
        '..OBO.OOOBO.....', '..OBO.OBBO......', '..OBO..OO.......', '..OBO...........', '..OBBO......OO..', '...OBBOOOOOOBO..',
        '....OBBBBBBBO...', '.....OOOOOOO....',
    ],
    choano: [
        '.......D........', '......D.........', '.......D........', '......D.........', '....OLLLLO......', '....OL..LO......',
        '...OOBBBBOO.....', '..OLBBBBBBBO....', '..OBBBSBBBBO....', '..OBBBBBBSBO....', '..OBSBBBBBDO....', '...ODBBBBDO.....',
        '....OODDOO......', '......OO........',
    ],
    filament: [
        '......OOOO......', '.....OLBBBO.....', '.....OBBBDO.....', '......OOOO......', '.....OLBBBO.....', '.....OBBSDO.....',
        '......OOOO......', '.....OLBBBO.....', '.....OBBBDO.....', '......OOOO......', '.....OLBBBO.....', '.....OBSBDO.....',
        '......OOOO......', '.......OO.......', '.......OO.......',
    ],
    tappania: [
        '..O.........O...', '...O.......O....', '....O..O..O.....', '.....OOOOO......', '...OOLLBBBOO....', '..OLBBBBBBBBO...',
        'OOOBBSBBBBBBOOOO', '..OBBBBBBSBBO...', '..OBSBBBBBBDO...', '..OBBBBBBBDDO...', '...OODBBBDDO....', '.....OOOOO......',
        '....O..O..O.....', '...O...O...O....',
    ],
    tube: [
        '................', '......OOOO......', '.....OLBBDO.....', '....OOOOOOOO....', '.....OLBBDO.....', '....OOOOOOOO....',
        '.....OLBBDO.....', '....OOOOOOOO....', '.....OLBBDO.....', '....OOOOOOOO....', '.....OLBBDO.....', '.....OOOOOO.....',
        '......OBDO......', '.......OO.......',
    ],
    kimberella: [
        '................', '................', '................', '................', '....OOOOOOOO....', '..OOLLBBBBBBOO..',
        '.OLBBSBBBSBBBDO.', '.OBBBBBSBBBBBDO.', '.OBBSBBBBBSBBDO.', '.OABABABABABABO.', '..OOOOOOOOOOOO..',
    ],
    frond: [
        '.......OO.......', '......OBBO......', '.....OBDBBO.....', '....OBBDBBBO....', '....OBDBDBBO....', '...OBBBDBBBBO...',
        '...OBDBDBDBBO...', '...OBBBDBBBBO...', '...OBDBDBDBBO...', '....OBBDBBBO....', '....OBDBDBBO....', '.....OBDBBO.....',
        '......OBBO......', '.......OO.......', '.......OO.......', '......OSSO......',
    ],
    dickinsonia: [
        '................', '................', '.....OOOOOO.....', '...OOBDBDBDOO...', '..OBDBDBDBDBDO..', '.OBDBDBDBDBDBDO.',
        '.OBDBDBLDBDBDBO.', 'OBDBDBDLBDBDBDBO', 'OBDBDBDLBDBDBDBO', '.OBDBDBLDBDBDBO.', '.OBDBDBDBDBDBDO.', '..OBDBDBDBDBDO..',
        '...OOBDBDBDOO...', '.....OOOOOO.....',
    ],
}

/** Diese Figuren sitzen fest und wippen nicht. */
const STATIC = new Set(['mat', 'stromatolite', 'tube'])

function mix(c: number, t: number, f: number): number {
    const r = ((c >> 16) & 255) + (((t >> 16) & 255) - ((c >> 16) & 255)) * f
    const g = ((c >> 8) & 255) + (((t >> 8) & 255) - ((c >> 8) & 255)) * f
    const b = (c & 255) + ((t & 255) - (c & 255)) * f
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

/** Töne aus einer Grundfarbe: hell, Schatten (Richtung Blau wie in der Vorlage), Fleck. */
export function paletteFrom(base: number): Record<string, number> {
    return {
        O: OUTLINE, B: base, L: mix(base, 0xffffff, 0.35), D: mix(base, 0x1a2a5a, 0.45), S: mix(base, 0x0d0a12, 0.45),
        W: 0xf4f4f4, K: 0x0d0a12, Y: 0xf2c94c, A: mix(base, 0xf2c94c, 0.6), M: 0x3a1622,
    }
}

function drawGrid(g: Phaser.GameObjects.Graphics, grid: Grid, colors: Record<string, number>, dy = 0) {
    for (let y = 0; y < 16; y++) {
        const src = y - dy   // dy = -1 → Inhalt 1 px nach oben
        if (src < 0 || src > 15) continue
        const row = grid[src] ?? ''
        for (let x = 0; x < 16; x++) {
            const c = colors[row[x] ?? '.']
            if (c !== undefined) g.fillStyle(c, 1).fillRect(x, y, 1, 1)
        }
    }
}

export const heroKey = (frame: number) => `hero_${frame}`
export const mobKey = (id: string, frame: number) => `mob_${id}_${frame}`
export const ART_KEYS = Object.keys(ART)

/** Hauptfigur + alle Gegner mit `art` als Texturen (je 2 Bilder). */
export function generateMicrobeArt(scene: Phaser.Scene, mobs: { id: string; art: string; color: string }[]) {
    const g = scene.add.graphics()
    HERO.forEach((grid, f) => {
        g.clear(); drawGrid(g, grid, HERO_COLORS); g.generateTexture(heroKey(f), 16, 16)
    })
    for (const m of mobs) {
        const grid = ART[m.art]
        if (!grid) continue
        const colors = paletteFrom(parseInt(m.color.slice(1), 16))
        g.clear(); drawGrid(g, grid, colors); g.generateTexture(mobKey(m.id, 0), 16, 16)
        // zweites Bild: 1 px nach oben gewippt (Schwimmen) – festsitzende bleiben gleich
        g.clear(); drawGrid(g, grid, colors, STATIC.has(m.art) ? 0 : -1); g.generateTexture(mobKey(m.id, 1), 16, 16)
    }
    g.destroy()
}
