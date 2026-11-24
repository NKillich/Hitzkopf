// Eigene Pixel-Hintergründe je Stufe (Paket 1: Phase 1–2) + passende Deko-Objekte.
// Kacheln 64 × 64 (im Spiel doppelt so groß gezeigt), Deko 16 × 16 (ebenfalls doppelt).
import type Phaser from 'phaser'

type Draw = (g: Phaser.GameObjects.Graphics, rnd: () => number) => void

interface StageArt {
    tile: Draw
    props: Draw[]
}

/** kleiner Zufall mit Startwert, damit jede Kachel immer gleich aussieht */
function seeded(seed: number) {
    let s = seed
    return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

const px = (g: Phaser.GameObjects.Graphics, x: number, y: number, c: number, a = 1, w = 1, h = 1) =>
    g.fillStyle(c, a).fillRect(x, y, w, h)

const T = 64   // Kachelgröße (im Spiel doppelt so groß gezeigt → Muster wiederholt sich erst nach 128 px)

function fill(g: Phaser.GameObjects.Graphics, c: number) { px(g, 0, 0, c, 1, T, T) }

function specks(g: Phaser.GameObjects.Graphics, rnd: () => number, n: number, c: number, size = 1) {
    for (let i = 0; i < n; i++) px(g, Math.floor(rnd() * T), Math.floor(rnd() * T), c, 1, size, size)
}

function streaks(g: Phaser.GameObjects.Graphics, rnd: () => number, n: number, c: number) {
    for (let i = 0; i < n; i++) px(g, Math.floor(rnd() * (T - 10)), Math.floor(rnd() * T), c, 1, 4 + Math.floor(rnd() * 8), 1)
}

function ring(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, c: number, a = 1) {
    for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2
        px(g, Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), c, a)
    }
}

const STAGES: Record<string, StageArt> = {
    // 1.1 Urmeer: dunkles Wasser, Bläschen, organische Moleküle
    urzellen: {
        tile: (g, r) => { fill(g, 0x0b2427); specks(g, r, 70, 0x123a3d); specks(g, r, 10, 0x164a4a, 2); specks(g, r, 6, 0x2d6b6b) },
        props: [
            g => { ring(g, 7, 9, 4, 0x3d8f84); ring(g, 11, 4, 2, 0x3d8f84); ring(g, 4, 3, 1.5, 0x3d8f84) },        // Bläschen
            g => { ring(g, 8, 8, 6, 0x3d8f84); ring(g, 8, 8, 4.5, 0x2a6a62); px(g, 6, 6, 0x6fc3b4) },                // Fettsäure-Bläschen (Membran)
            g => { for (let i = 0; i < 5; i++) { px(g, 2 + i * 3, 8 + (i % 2) * 2, 0x8fb6a0, 1, 2, 2); px(g, 4 + i * 3, 9, 0x4a7a6a) } }, // Molekülkette
            g => { px(g, 5, 7, 0x4a4a3a, 1, 5, 3); px(g, 6, 6, 0x5e5e48, 1, 3, 1) },                                // Mineralkorn
        ],
    },
    // 1.2 Tiefsee mit Schwarzen Rauchern
    stoffwechsel: {
        tile: (g, r) => { fill(g, 0x0a1a22); specks(g, r, 80, 0x1f3540); specks(g, r, 10, 0x3a4a2a); specks(g, r, 8, 0x132a33, 3) },
        props: [
            g => {   // Schwarzer Raucher: Schlot + Rauch
                px(g, 6, 9, 0x2b2b30, 1, 5, 7); px(g, 7, 5, 0x2b2b30, 1, 3, 4); px(g, 7, 9, 0x4a3a30, 1, 1, 7)
                px(g, 7, 2, 0x5a5a60, 0.8, 3, 3); px(g, 6, 0, 0x5a5a60, 0.5, 4, 2); px(g, 9, 1, 0x7a7a80, 0.6)
            },
            g => { px(g, 3, 8, 0x3a3a2a, 1, 10, 6); px(g, 5, 6, 0x4a4a36, 1, 6, 2); px(g, 6, 9, 0xc9b23a); px(g, 10, 11, 0xc9b23a) }, // Gestein mit Schwefel
            g => { px(g, 4, 12, 0x2b2b30, 1, 8, 3); px(g, 6, 10, 0x2b2b30, 1, 3, 2); px(g, 7, 7, 0x5a5a60, 0.6, 2, 3) },          // kleiner Schlot
        ],
    },
    // 1.3 Flaches Meer im Licht, Stromatolithen
    photosynthese: {
        tile: (g, r) => { fill(g, 0x0e3a35); streaks(g, r, 12, 0x1f6e62); specks(g, r, 30, 0x175a50); specks(g, r, 6, 0x1a6458, 2) },
        props: [
            g => {   // Stromatolith (Schichten)
                px(g, 3, 12, 0x6a8a5a, 1, 10, 3); px(g, 4, 9, 0x8fae7a, 1, 8, 3); px(g, 5, 7, 0x6a8a5a, 1, 6, 2); px(g, 6, 5, 0x8fae7a, 1, 4, 2)
                px(g, 4, 11, 0x4e6a42, 1, 8, 1); px(g, 5, 8, 0x4e6a42, 1, 6, 1)
            },
            g => { for (let y = 0; y < 16; y++) px(g, Math.floor(10 - y * 0.5), y, 0xe8f5c8, 0.12, 4, 1) },        // Sonnenstrahl
            g => { ring(g, 8, 10, 2, 0xa6e8d0); ring(g, 11, 5, 1.5, 0xa6e8d0); px(g, 6, 2, 0xa6e8d0) },             // Sauerstoffbläschen
        ],
    },
    // 2.1 trübes Wasser, eukaryotische Zellen
    endosymbiose: {
        tile: (g, r) => { fill(g, 0x13304a); specks(g, r, 70, 0x22476a); specks(g, r, 12, 0x2f5a7a, 2) },
        props: [
            g => { ring(g, 8, 8, 6, 0x3f6f8a); px(g, 6, 7, 0x6a5a8a, 1, 3, 3); px(g, 10, 10, 0xc9864a, 1, 2, 1); px(g, 4, 10, 0xc9864a, 1, 2, 1) }, // Zelle mit Kern + Mitochondrien
            g => { px(g, 4, 7, 0x2f5a7a, 1, 7, 2); px(g, 6, 9, 0x2f5a7a, 1, 4, 1) },                                  // Flocke
        ],
    },
    // 2.2 Zellkolonien und Rotalgen
    kolonien: {
        tile: (g, r) => { fill(g, 0x10283c); specks(g, r, 60, 0x1b3a54); specks(g, r, 8, 0x5a2a3a); specks(g, r, 8, 0x24445e, 2) },
        props: [
            g => { for (let y = 0; y < 16; y++) px(g, 7 + Math.round(Math.sin(y / 2) * 2), y, 0xa8455e, 1, 2, 1) }, // Rotalgen-Faden
            g => { ring(g, 8, 8, 6, 0x4f8fae); for (const [x, y] of [[6, 6], [10, 6], [8, 9], [5, 10], [11, 10]]) px(g, x, y, 0x7ac0de) }, // Kolonie
        ],
    },
    // 2.3 Ediacara-Meeresgrund mit Mikrobenmatten
    mehrzeller: {
        tile: (g, r) => { fill(g, 0x1c2e2a); streaks(g, r, 14, 0x2a4a3c); specks(g, r, 45, 0x243a34); specks(g, r, 8, 0x30483e, 2) },
        props: [
            g => { px(g, 7, 2, 0x7aa86a, 1, 2, 12); for (let y = 3; y < 13; y += 2) { px(g, 4, y, 0x7aa86a, 1, 3, 1); px(g, 9, y, 0x7aa86a, 1, 3, 1) } px(g, 7, 14, 0x4e6a42, 1, 2, 2) }, // Charnia
            g => { for (let x = 3; x < 13; x++) px(g, x, 6 + (x % 2), 0x8a7a5a, 1, 1, 4 - (x % 2)); px(g, 3, 8, 0x6a5a3a, 1, 10, 1) },  // Dickinsonia-Abdruck
            g => { for (let x = 0; x < 16; x += 4) px(g, x, 8, 0x3a5a48, 1, 3, 1) },                                // Sandrippel
            g => { for (let y = 4; y < 14; y += 2) px(g, 6, y, 0xd8d0b0, 1, 3, 1); px(g, 7, 14, 0xb8b090) },       // Cloudina-Röhre
        ],
    },
}

export const tileKey = (stageId: string) => `tile_${stageId}`
export const propKey = (stageId: string, i: number) => `prop_${stageId}_${i}`

export function hasStageArt(stageId: string): boolean {
    return stageId in STAGES
}

export function propCount(stageId: string): number {
    return STAGES[stageId]?.props.length ?? 0
}

/** Kacheln und Deko aller Stufen mit eigener Grafik anlegen. */
export function generateBackgrounds(scene: Phaser.Scene) {
    const g = scene.add.graphics()
    Object.entries(STAGES).forEach(([id, art], si) => {
        g.clear(); art.tile(g, seeded(1000 + si)); g.generateTexture(tileKey(id), T, T)
        art.props.forEach((draw, i) => {
            g.clear(); draw(g, seeded(2000 + si * 10 + i)); g.generateTexture(propKey(id, i), 16, 16)
        })
    })
    g.destroy()
}
