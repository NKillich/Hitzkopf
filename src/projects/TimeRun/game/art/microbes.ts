// Farbige Pixel-Figuren für Phase 1–2 (Paket 1) nach der Vorlage „8-Bit Mikrobe“.
// Raster 16 × 16, Zeichen: O = Umriss, B = Grundfarbe, L = hell, D = Schatten, S = Fleck,
// W = weiß, K = schwarz, Y = gelb, A = Akzent, M = Mund, . = leer.
// Die Hauptfigur hat feste Farben, Gegner leiten ihre Töne aus der Datenfarbe ab.
import type Phaser from 'phaser'
import { ANIMAL_ART, HERO_BODIES as ANIMAL_BODIES, type Grid, type Motion } from './animals'
import { HERO_ANCHORS, HERO_HUMAN, MODERN_ART } from './modern'

const HERO_BODIES: Record<string, { grid: Grid; motion: Motion }> = { ...ANIMAL_BODIES, human: HERO_HUMAN }
const MOB_ART: Record<string, { grid: Grid; motion: Motion }> = { ...ANIMAL_ART, ...MODERN_ART }
/** Ausrüstung der Epoche (5.2 Fell, 5.3 Kleidung, 6.x Raumanzug) */
export const OUTFITS = ['cloak', 'tunic', 'suit'] as const

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
    O: OUTLINE, B: 0x2fa89a, L: 0x6fdcc4, D: 0x1f6f86, S: 0x1c5e6b, W: 0xf4f4f4, K: 0x0d0a12, Y: 0xf2c94c, M: 0x3a1622, A: 0xa6f7da,
}

/**
 * Hauptfigur je Stufe in Phase 1–2 – jede Stufe sieht anders aus (gleiche Farben, Gesicht + gelbe Fühler).
 * 1.1 Protozelle (Bläschen) → 1.2 Urzelle/Archaee mit Geißel → 1.3 Sauerstoff-Überlebender mit Schutzhülle
 * → 2.1 Zelle mit Scheinfüßchen (Vorlage; frisst wie eine Amöbe – so wurden Mitochondrien aufgenommen)
 * → 2.2 Zellkolonie (Kragengeißeltiere) → 2.3 frühes Tier mit Gewebe (wurmförmig).
 */
const MICROBE_FORMS: Record<string, { frames: [Grid] | [Grid, Grid]; motion: Motion }> = {
    urzellen: {
        motion: 'bob',
        frames: [[
            '................', '....Y......Y....', '....D......D....', '.....D....D.....', '.....OOOOOO.....', '....OLLBBBBO....',
            '...OLBBBBBBBO...', '...OBWWBBWWBO...', '...OBWKBBWKBO...', '...OBBBMMBBBO...', '...OBSBBBBSBO...', '...ODBBBBBBDO...',
            '....ODDDDDDO....', '.....OOOOOO.....',
        ]],
    },
    stoffwechsel: {
        motion: 'static',
        frames: [
            [
                '................', '................', '..........Y.Y...', '..........D.D...', '..........D.D...', '....OOOOOOOOO...',
                '...OLLBBBBWWBO..', 'D.OLBBSBBBWKBBO.', '.DOBBBBBSBBBBMO.', 'D.ODBBBBBBBBMWO.', '...ODDBSBBBDDO..', '....OOOOOOOOO...',
            ],
            [
                '................', '................', '..........Y.Y...', '..........D.D...', '..........D.D...', '....OOOOOOOOO...',
                '...OLLBBBBWWBO..', '.DOLBBSBBBWKBBO.', 'D.OBBBBBSBBBBMO.', '.DODBBBBBBBBMWO.', '...ODDBSBBBDDO..', '....OOOOOOOOO...',
            ],
        ],
    },
    photosynthese: {
        motion: 'bob',
        frames: [[
            '................', '..........Y.Y...', '..........D.D...', '..........D.D...', '....AAAAAAAAA...', '...AOOOOOOOOOA..',
            '..AOLLBBBBWWBOA.', '.AOLBBSBBBWKBBOA', '.AOBBBBBSBBBBMOA', '.AODBBBBBBBBMWOA', '..AODDBSBBBDDOA.', '...AOOOOOOOOOA..',
            '....AAAAAAAAA...',
        ]],
    },
    kolonien: {
        motion: 'bob',
        frames: [[
            '....Y......Y....', '....D......D....', '.....D....D.....', '.....OOOOOO.....', '....OLLBBBBO....', '...OLBWWBWWBO...',
            '...OBBWKBWKBO...', '.OOOBBBMMBBBOOO.', 'OLBOBSBBBBSBOLBO', 'OBBOBBBBBBBBOBBO', 'ODDOODDDDDDOODDO', '.OOOOOOOOOOOOOO.',
            '..OLBO....OLBO..', '..OBDO....OBDO..', '...OO......OO...',
        ]],
    },
    mehrzeller: {
        motion: 'walk',
        frames: [[
            '................', '................', '................', '...........Y.Y..', '...........D.D..', '..........OOOOO.',
            '..OOOOOOOOLBWWBO', '.OLBDLBDLBBBWKBO', 'OBBDBBDBBDBBBBMO', 'OBSDBSDBSDBBBMWO', '.ODDDDDDDDDDDDO.', '..OOOOOOOOOOOO..',
        ]],
    },
}

/** Textur-Name der Hauptfigur in Phase 1–2 (je Stufe eigene Form; 2.1 = Vorlage „microbe“). */
export function microbeBody(stageId: string): string {
    return MICROBE_FORMS[stageId] ? `microbe-${stageId}` : 'microbe'
}
export const MICROBE_STAGES = Object.keys(MICROBE_FORMS)

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

/**
 * Raster zeichnen. dy = -1 → Inhalt 1 px nach oben (Wippen);
 * legs = true → die untersten zwei Zeilen 1 px versetzt (Laufen).
 */
function drawGrid(g: Phaser.GameObjects.Graphics, grid: Grid, colors: Record<string, number>, dy = 0, legs = false) {
    let last = 0
    grid.forEach((row, y) => { if (/[^.]/.test(row)) last = y })
    for (let y = 0; y < 16; y++) {
        const src = y - dy
        if (src < 0 || src > 15) continue
        const row = grid[src] ?? ''
        const dx = legs && src >= last - 1 ? 1 : 0
        for (let x = 0; x < 16; x++) {
            const c = colors[row[x] ?? '.']
            if (c !== undefined && x + dx < 16) g.fillStyle(c, 1).fillRect(x + dx, y, 1, 1)
        }
    }
}

function drawFrame(g: Phaser.GameObjects.Graphics, grid: Grid, colors: Record<string, number>, motion: Motion, frame: number) {
    if (frame === 0 || motion === 'static') drawGrid(g, grid, colors)
    else if (motion === 'walk') drawGrid(g, grid, colors, 0, true)
    else drawGrid(g, grid, colors, -1)
}

/** Umhang (Fell), Kleidung (mit Gürtel) oder Raumanzug (weiß + Helm) über den Körper legen. */
function drawOutfit(
    g: Phaser.GameObjects.Graphics, a: { torso: [number, number, number, number]; head: [number, number, number] },
    outfit: typeof OUTFITS[number], dy: number,
) {
    const [tx, ty, tw, th] = a.torso
    const y = ty + dy
    if (outfit === 'cloak') { g.fillStyle(0x8a5a33, 1).fillRect(tx, y, tw, th); g.fillStyle(0x5e3c22, 1).fillRect(tx, y + th - 1, tw, 1) }
    if (outfit === 'tunic') { g.fillStyle(0x4e6fa8, 1).fillRect(tx, y, tw, th); g.fillStyle(0xffd27a, 1).fillRect(tx, y + 1, tw, 1) }
    if (outfit === 'suit') {
        g.fillStyle(0xedf2f7, 1).fillRect(tx, y, tw, th)
        g.fillStyle(0xe8603b, 1).fillRect(tx + 1, y + 1, 2, 1)
        const [hx, hy, hr] = a.head
        g.fillStyle(0x4ea8ff, 0.3).fillCircle(hx, hy + dy, hr)
        g.lineStyle(1, 0xffffff, 0.95).strokeCircle(hx, hy + dy, hr)
    }
}

/** Hauptfigur: „microbe“ (Phase 1–2) oder ein Körper (fish … human), mit Ausrüstung als „human-suit“ usw. */
export const heroKey = (body: string, frame: number) => `hero_${body}_${frame}`
export const HERO_BODY_KEYS = ['microbe', ...Object.keys(HERO_BODIES)]
export const mobKey = (id: string, frame: number) => `mob_${id}_${frame}`
export const ART_KEYS = [...Object.keys(ART), ...Object.keys(MOB_ART)]

/** Hauptfigur(en) + alle Gegner mit `art` als Texturen (je 2 Bilder). */
export function generateMicrobeArt(scene: Phaser.Scene, mobs: { id: string; art: string; color: string }[]) {
    const g = scene.add.graphics()
    HERO.forEach((grid, f) => {
        g.clear(); drawGrid(g, grid, HERO_COLORS); g.generateTexture(heroKey('microbe', f), 16, 16)
    })
    for (const [id, { frames, motion }] of Object.entries(MICROBE_FORMS)) {
        for (const f of [0, 1]) {
            g.clear()
            if (frames.length === 2) drawGrid(g, frames[f], HERO_COLORS)
            else drawFrame(g, frames[0], HERO_COLORS, motion, f)
            g.generateTexture(heroKey(`microbe-${id}`, f), 16, 16)
        }
    }
    for (const [body, { grid, motion }] of Object.entries(HERO_BODIES)) {
        for (const f of [0, 1]) { g.clear(); drawFrame(g, grid, HERO_COLORS, motion, f); g.generateTexture(heroKey(body, f), 16, 16) }
        const a = HERO_ANCHORS[body]
        if (!a) continue
        for (const outfit of OUTFITS) {
            for (const f of [0, 1]) {
                g.clear(); drawFrame(g, grid, HERO_COLORS, motion, f); drawOutfit(g, a, outfit, f && motion === 'bob' ? -1 : 0)
                g.generateTexture(heroKey(`${body}-${outfit}`, f), 16, 16)
            }
        }
    }
    for (const m of mobs) {
        const animal = MOB_ART[m.art]
        const grid = animal?.grid ?? ART[m.art]
        if (!grid) continue
        const motion: Motion = animal?.motion ?? (STATIC.has(m.art) ? 'static' : 'bob')
        const colors = paletteFrom(parseInt(m.color.slice(1), 16))
        for (const f of [0, 1]) { g.clear(); drawFrame(g, grid, colors, motion, f); g.generateTexture(mobKey(m.id, f), 16, 16) }
    }
    g.destroy()
}
