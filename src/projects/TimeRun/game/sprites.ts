// Pixel-Art als Raster (16 × 16). Graustufen, damit Gegner per Tint ihre Datenfarbe bekommen:
// o = Umriss, x = Grundfarbe, s = Schatten, h = Glanzlicht, e = Auge, . = leer. Alle Formen schauen nach rechts.
import Phaser from 'phaser'
import { SHAPES, type Outfit, type Shape } from '../logic/appearance'

const PALETTE: Record<string, number> = { o: 0x1a1622, x: 0xd8d8d8, s: 0x9a9a9a, h: 0xffffff, e: 0x0d0a12 }

const GRIDS: Record<Shape, string[]> = {
    cell: [
        '................', '.....oooooo.....', '...ooxxxxxxoo...', '..oxhhxxxxxxxo..', '..oxhxxxxxxxxo..', '.oxxxxxxxxxxxxo.',
        '.oxxxxxsssxxxxo.', '.oxxxxsseesxxxo.', '.oxxxxsseesxxxo.', '.oxxxxxsssxxxxo.', '.oxxxxxxxxxxsxo.', '..oxxxxxxxxxso..',
        '..oxxxxxxxxsso..', '...ooxxxxssoo...', '.....oooooo.....', '................',
    ],
    blob: [
        '................', '................', '......oooo......', '....ooxxxxoo....', '...oxhxxxxxxo...', '..oxhxxxxxxxxo..',
        '..oxxxxxxxxxxo..', '.oxxxxxxxxxxxso.', '.oxxxxxxxxxxsso.', '..oxxxxxxxxsso..', '...oxxxxxssoo...', '....ooxxsoo.....',
        '......ooo.......',
    ],
    rod: [
        '................', '................', '................', '................', '....oooooooo....', '...oxhhxxxxxo...',
        '..oxhxxxxxxxxo..', '..oxxxxxxxxxxo.o', '..oxxxxxxxxxsooo', '...oxxxxxxsso..o', '....oooooooo....',
    ],
    worm: [
        '................', '................', '................', '................', '................', '..........ooo...',
        '.........oxxxo..', '...ooo..oxxxexo.', '..oxxxooxxxxxxo.', '.oxxsxxxxxsxxo..', '.oxssoxxxxssoo...', '..oo..oossoo....',
    ],
    colony: [
        '................', '...oooo..oooo...', '..oxhxxooxhxxo..', '..oxxxxooxxxxo..', '..oxxsxooxxsxo..', '...oooo..oooo...',
        '......oooo......', '.....oxhxxo.....', '.....oxxxxo.....', '.....oxxsxo.....', '......oooo......',
    ],
    frond: [
        '.......oo.......', '......oxxo......', '.....oxsxxo.....', '....oxxsxxxo....', '....oxsxsxxo....', '...oxxxsxxxxo...',
        '...oxsxsxsxxo...', '...oxxxsxxxxo...', '...oxsxsxsxxo...', '....oxxsxxxo....', '....oxsxsxxo....', '.....oxsxxo.....',
        '......oxxo......', '.......oo.......', '.......oo.......', '......oooo......',
    ],
    arthropod: [
        '................', '................', '....o.o.o.o.....', '...oooooooooo...', '..oxsxsxsxxhxo..', '.oxsxsxsxsxxxeo.',
        '.oxxxxxxxxxxxxo.', '.oxsxsxsxsxxxeo.', '..oxsxsxsxxxxo..', '...oooooooooo...', '....o.o.o.o.....',
    ],
    fish: [
        '................', '................', '................', '.......oooo.....', '.....ooxxxxoo...', '.o..oxxhxxxxxo..',
        '.oo.oxxxxxxxeo..', '.oxooxxxxxxxxxo.', '.oxxxxxxxxxxxxo.', '.oxooxsssssssxo.', '.oo..osssssso...', '.o....oooooo....',
    ],
    tetrapod: [
        '................', '................', '................', '................', '...........ooo..', '..........oxxxo.',
        'ooo......oxxxexo', 'oxxoooooooxxxxxo', '.oxxxxxxxxxxxxo.', '..osssxxxxxsso..', '..o.so.ooo.so...', '....oo......oo..',
    ],
    reptile: [
        '................', '................', '................', '..........oooo..', '.........oxxexo.', '.........oxxxxoo',
        'oo.......oxxxxxo', 'oxooooooooxxooo.', '.oxxxxxxxxxxo...', '..oxsxsxsxsxo...', '...osxo..osxo...', '...ooo....ooo...',
    ],
    mammal: [
        '................', '................', '................', '...........oo...', '..........oxxo..', '..o......oxxxxo.',
        '.oxoooooooxxexo.', '.oxxxxxxxxxxxxo.', '.oxhxxxxxxxxxxoo', '..oxxxxxxxxxxo..', '..osssssssssso..', '..os.so..os.so..',
        '..oo.oo..oo.oo..',
    ],
    bird: [
        '................', '................', '................', '..........ooo...', '.........oxxeo..', '.........oxxxooo',
        '..ooo...oxxxo...', '.oxxxooooxxxo...', '.oxxxxxxxxxxo...', '..ooxxxxxxxo....', '....osssssso....', '.....oo..oo.....',
        '.....o....o.....', '....oo...oo.....',
    ],
    human: [
        '......oooo......', '.....oxxxxo.....', '.....oxexeo.....', '.....oxxxxo.....', '......oxxo......', '....oooxxooo....',
        '...oxxxxxxxxo...', '...oxoxxxxoxo...', '...oxoxxxxoxo...', '...ox.oxxo.xo...', '......oxxo......', '.....oxooxo.....',
        '.....oxo.oxo....', '.....oxo.oxo....', '.....ooo.ooo....',
    ],
    swarm: [
        '................', '..o.......o.....', '.oxo..o..oxo....', '..o..oxo..o..o..', '.....o.o....oxo.', '..o.......o..o..',
        '.oxo..o..oxo....', '..o..oxo..o...o.', '......o......oxo', '...o.....o....o.', '..oxo...oxo.....', '...o..o..o......',
        '......oxo.......', '.......o........',
    ],
    rock: [
        '................', '................', '.....ooooo......', '...ooxxhxxoo....', '..oxxhxxxxxxo...', '.oxxxxxsxxxxxo..',
        '.oxxsxxxxxxxxo..', '.oxxxxxxxssxxxo.', '..oxxxsxxxxxxxo.', '..oxxxxxxxsxxo..', '...oxxsxxxxxo...', '....ooxxxsoo....',
        '......oooo......',
    ],
    debris: [
        '................', '................', '................', '.oooo......oooo.', '.oxsxo....oxsxo.', '.oxsxooooooxsxo.',
        '.oxsxoxxxxoxsxo.', '.oxsxoxhxxoxsxo.', '.oxsxoxxxxoxsxo.', '.oxsxooooooxsxo.', '.oxsxo....oxsxo.', '.oooo......oooo.',
    ],
}

/** Rumpf (x, y, b, h) und Kopf (x, y, r) je Körper – für Umhang, Kleidung und Raumanzug. */
const ANCHORS: Partial<Record<Shape, { torso: [number, number, number, number]; head: [number, number, number] }>> = {
    human: { torso: [4, 6, 8, 4], head: [8, 2, 4] },
    mammal: { torso: [2, 7, 10, 3], head: [12, 6, 3.5] },
    reptile: { torso: [2, 8, 10, 2], head: [12, 5, 3.5] },
    bird: { torso: [2, 7, 9, 3], head: [11, 4, 3.5] },
    tetrapod: { torso: [3, 8, 9, 2], head: [12, 6, 3.5] },
    fish: { torso: [5, 6, 8, 3], head: [11, 7, 4] },
    arthropod: { torso: [3, 4, 9, 5], head: [12, 6, 4] },
    cell: { torso: [4, 5, 8, 6], head: [8, 8, 7] },
    colony: { torso: [4, 5, 8, 5], head: [8, 6, 7.5] },
}

const OUTFIT_COLOR: Record<Exclude<Outfit, 'none'>, number> = { cloak: 0x8a5a33, tunic: 0x4e6fa8, suit: 0xedf2f7 }

export const shapeKey = (s: Shape) => `shape_${s}`
export const outfitKey = (s: Shape, o: Outfit) => `outfit_${s}_${o}`

/** Alle Formen, Ausrüstungen und Bodenmuster als Texturen anlegen (einmal beim Start). */
export function generateSprites(scene: Phaser.Scene) {
    const g = scene.add.graphics()
    for (const shape of SHAPES) {
        g.clear()
        GRIDS[shape].forEach((row, y) => {
            for (let x = 0; x < 16; x++) {
                const c = PALETTE[row[x] ?? '.']
                if (c !== undefined) g.fillStyle(c, 1).fillRect(x, y, 1, 1)
            }
        })
        g.generateTexture(shapeKey(shape), 16, 16)

        const a = ANCHORS[shape]
        if (!a) continue
        for (const outfit of ['cloak', 'tunic', 'suit'] as const) {
            g.clear()
            const [tx, ty, tw, th] = a.torso
            g.fillStyle(OUTFIT_COLOR[outfit], 1).fillRect(tx, ty, tw, th)
            if (outfit === 'cloak') g.fillStyle(0x5e3c22, 1).fillRect(tx, ty + th - 1, tw, 1)   // Saum
            if (outfit === 'tunic') g.fillStyle(0xffd27a, 1).fillRect(tx, ty + 1, tw, 1)         // Gürtel
            if (outfit === 'suit') {
                const [hx, hy, hr] = a.head
                g.fillStyle(0x4ea8ff, 0.35).fillCircle(hx, hy, hr)        // Helm-Glas
                g.lineStyle(1, 0xffffff, 0.95).strokeCircle(hx, hy, hr)   // Helmrand
                g.fillStyle(0xe8603b, 1).fillRect(tx, ty, 2, 2)           // Abzeichen
            }
            g.generateTexture(outfitKey(shape, outfit), 16, 16)
        }
    }

    // Bodenmuster je Hauptphase (weiß, per Tint in der Epochenfarbe)
    const ground = (key: string, draw: () => void) => { g.clear(); draw(); g.generateTexture(key, 32, 32) }
    const dot = (x: number, y: number, w = 1, h = 1, a = 1) => g.fillStyle(0xffffff, a).fillRect(x, y, w, h)
    ground('ground1', () => { dot(4, 6); dot(20, 14, 2, 2, 0.8); dot(11, 25); dot(27, 3); dot(0, 18, 3, 1, 0.5); dot(16, 29, 3, 1, 0.5) })   // Urmeer: Bläschen
    ground('ground2', () => { dot(6, 8, 2, 2, 0.7); dot(22, 20); dot(13, 27, 1, 1, 0.6); dot(28, 10); dot(2, 22, 1, 1, 0.5) })              // Tiefsee: Schwebeteilchen
    ground('ground3', () => { dot(3, 5, 3, 2); dot(18, 12, 4, 3, 0.8); dot(9, 24, 2, 2); dot(26, 26, 3, 2, 0.7); dot(14, 2, 1, 1) })     // Meeresboden/Ufer: Kiesel
    ground('ground4', () => { dot(4, 10, 1, 3); dot(5, 9, 1, 2); dot(20, 22, 1, 3); dot(21, 21, 1, 2); dot(12, 28, 1, 2); dot(27, 4, 1, 3) }) // Gras
    ground('ground5', () => { dot(0, 0, 32, 1, 0.6); dot(0, 16, 32, 1, 0.6); dot(10, 0, 1, 16, 0.6); dot(24, 16, 1, 16, 0.6); dot(5, 7, 2, 1) }) // Pflaster/Wege
    ground('ground6', () => { dot(5, 4); dot(23, 9, 1, 1, 0.7); dot(13, 19, 2, 2); dot(28, 26); dot(2, 28, 1, 1, 0.6); dot(18, 1, 1, 1, 0.5) }) // Sterne
    g.destroy()
}
