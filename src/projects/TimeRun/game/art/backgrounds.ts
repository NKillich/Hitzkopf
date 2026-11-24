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
    // 3.1 Kambrium: Riff im Meer mit Schwämmen und Archaeocyathiden
    kambrium: {
        tile: (g, r) => { fill(g, 0x0c2340); specks(g, r, 70, 0x16365e); specks(g, r, 10, 0x1f3f5e, 2); streaks(g, r, 8, 0x1a3a66) },
        props: [
            g => { px(g, 6, 4, 0xc9a86a, 1, 4, 10); px(g, 5, 3, 0xd8b878, 1, 6, 2); px(g, 7, 2, 0x8a6a3a, 1, 2, 1); px(g, 7, 6, 0x8a6a3a, 1, 2, 6) }, // Schwamm
            g => { px(g, 5, 7, 0xd8c090, 1, 6, 6); px(g, 4, 6, 0xe8d0a0, 1, 8, 1); for (const x of [6, 8, 10]) px(g, x, 9, 0x8a7a5a); px(g, 7, 12, 0x8a7a5a, 1, 2, 2) }, // Archaeocyathide
            g => { for (let y = 2; y < 15; y++) px(g, 7 + Math.round(Math.sin(y / 1.8) * 2), y, 0x3a8a5a, 1, 2, 1) },                       // Alge
            g => { px(g, 3, 9, 0x3a4a5a, 1, 10, 5); px(g, 5, 7, 0x4a5a6a, 1, 6, 2) },                                                       // Fels
        ],
    },
    // 3.2 Landgang: Ufer mit ersten Landpflanzen (Cooksonia) und Moos
    landgang: {
        tile: (g, r) => { fill(g, 0x1d2a17); specks(g, r, 60, 0x2c4022); specks(g, r, 10, 0x3a3020, 2); streaks(g, r, 8, 0x24361c) },
        props: [
            g => { px(g, 7, 6, 0x6a9a4a, 1, 1, 9); px(g, 5, 4, 0x6a9a4a, 1, 1, 3); px(g, 9, 3, 0x6a9a4a, 1, 1, 4); px(g, 6, 6, 0x6a9a4a, 1, 3, 1)
                px(g, 4, 3, 0xc9a84a, 1, 2, 2); px(g, 9, 2, 0xc9a84a, 1, 2, 2) },                                                          // Cooksonia
            g => { px(g, 4, 9, 0x4a7a3a, 1, 8, 4); px(g, 5, 8, 0x5a8a4a, 1, 6, 1); px(g, 6, 10, 0x6a9a5a, 1, 2, 1) },                         // Moospolster
            g => { px(g, 3, 9, 0x5a5a4a, 1, 9, 4); px(g, 5, 8, 0x6a6a58, 1, 5, 1) },                                                         // Stein
            g => { px(g, 3, 7, 0x2a4a5a, 1, 10, 4); px(g, 4, 6, 0x2a4a5a, 1, 8, 1); px(g, 5, 8, 0x4a6a7a, 1, 3, 1) },                         // Pfütze
        ],
    },
    // 3.3 Karbon: Sumpfwald mit Schuppenbäumen, Farnen und Schachtelhalmen
    landwirbeltiere: {
        tile: (g, r) => { fill(g, 0x1a2814); specks(g, r, 60, 0x2a3e1f); specks(g, r, 10, 0x14301f, 2) },
        props: [
            g => { px(g, 6, 5, 0x5a4a2a, 1, 4, 11); for (let y = 6; y < 15; y += 2) px(g, 7, y, 0x3a2f1a, 1, 2, 1); px(g, 3, 1, 0x3a6a2a, 1, 10, 4); px(g, 5, 0, 0x4a7a3a, 1, 6, 1) }, // Schuppenbaum
            g => { for (let i = 0; i < 5; i++) { px(g, 7, 3 + i * 2, 0x4a8a3a, 1, 1, 2); px(g, 3 + i, 4 + i * 2, 0x4a8a3a, 1, 4 - i, 1); px(g, 8, 4 + i * 2, 0x4a8a3a, 1, 4 - i, 1) } }, // Farn
            g => { px(g, 7, 1, 0x6a9a4a, 1, 2, 14); for (let y = 3; y < 15; y += 3) { px(g, 6, y, 0x3a5a2a, 1, 4, 1); px(g, 4, y - 1, 0x6a9a4a, 1, 2, 1); px(g, 10, y - 1, 0x6a9a4a, 1, 2, 1) } }, // Schachtelhalm
            g => { px(g, 1, 9, 0x4a3a22, 1, 14, 3); px(g, 2, 9, 0x6a5232, 1, 12, 1) },                                                       // umgestürzter Stamm
        ],
    },
    // 4.1 Dinosaurier: Farne, Palmfarne, Nadelbäume
    dinosaurier: {
        tile: (g, r) => { fill(g, 0x24261a); specks(g, r, 60, 0x383b26); specks(g, r, 10, 0x2e3a1e, 2) },
        props: [
            g => { for (let i = 0; i < 5; i++) { px(g, 7, 3 + i * 2, 0x5a8a3a, 1, 1, 2); px(g, 3 + i, 4 + i * 2, 0x5a8a3a, 1, 4 - i, 1); px(g, 8, 4 + i * 2, 0x5a8a3a, 1, 4 - i, 1) } }, // Farn
            g => { px(g, 6, 9, 0x6a5232, 1, 4, 6); px(g, 2, 6, 0x5a8a3a, 1, 5, 1); px(g, 9, 6, 0x5a8a3a, 1, 5, 1); px(g, 4, 4, 0x5a8a3a, 1, 2, 3); px(g, 10, 4, 0x5a8a3a, 1, 2, 3); px(g, 7, 3, 0x6a9a4a, 1, 2, 5) }, // Palmfarn
            g => { px(g, 7, 13, 0x5a4a2a, 1, 2, 3); for (let y = 1; y < 13; y++) { const w = Math.min(12, 2 + y); px(g, 8 - Math.floor(w / 2), y, y % 3 ? 0x2e5a3a : 0x24482e, 1, w, 1) } }, // Nadelbaum
            g => { px(g, 6, 8, 0x1a1c12, 1, 4, 3); px(g, 5, 5, 0x1a1c12, 1, 1, 3); px(g, 7, 4, 0x1a1c12, 1, 1, 4); px(g, 10, 5, 0x1a1c12, 1, 1, 3) }, // Fußspur
        ],
    },
    // 4.2 Säugetier-Aufstieg: warme Wälder nach dem Einschlag
    saeugetiere: {
        tile: (g, r) => { fill(g, 0x26221a); specks(g, r, 60, 0x3b3426); specks(g, r, 10, 0x2e3a22, 2) },
        props: [
            g => { px(g, 7, 6, 0x6a5232, 1, 2, 10); px(g, 2, 3, 0x4a7a3a, 1, 6, 1); px(g, 9, 3, 0x4a7a3a, 1, 6, 1); px(g, 3, 4, 0x4a7a3a, 1, 2, 2); px(g, 11, 4, 0x4a7a3a, 1, 2, 2); px(g, 6, 2, 0x5a8a4a, 1, 4, 2) }, // Palme
            g => { px(g, 3, 6, 0x3a6a3a, 1, 10, 7); px(g, 4, 5, 0x4a7a4a, 1, 7, 1); px(g, 5, 8, 0x2a5a2a, 1, 3, 2) },                        // Laubbusch
            g => { px(g, 1, 9, 0x5a4030, 1, 14, 3); px(g, 2, 9, 0x7a5a40, 1, 12, 1); px(g, 13, 8, 0x5a4030, 1, 2, 1) },                     // Stamm
            g => { px(g, 3, 9, 0x5a5448, 1, 9, 4); px(g, 5, 8, 0x6a6458, 1, 5, 1) },                                                         // Stein
        ],
    },
    // 4.3 Primaten: Bäume und Früchte
    primaten: {
        tile: (g, r) => { fill(g, 0x1c2a1a); specks(g, r, 60, 0x2c4128); specks(g, r, 12, 0x34502c, 2) },
        props: [
            g => { px(g, 7, 10, 0x5a4030, 1, 2, 6); px(g, 2, 2, 0x2e5a2a, 1, 12, 8); px(g, 3, 1, 0x3a6a32, 1, 10, 1); px(g, 4, 3, 0x447a3a, 1, 4, 2); px(g, 9, 7, 0x24482a, 1, 4, 2) }, // Baum
            g => { px(g, 3, 6, 0x3a6a3a, 1, 10, 7); px(g, 5, 8, 0xc94a3a); px(g, 9, 7, 0xc94a3a); px(g, 7, 10, 0xc94a3a) },                // Früchte-Busch
            g => { for (const x of [4, 7, 10]) px(g, x, 8, 0x6a9a4a, 1, 1, 6); px(g, 3, 10, 0x6a9a4a, 1, 1, 4); px(g, 11, 10, 0x6a9a4a, 1, 1, 4) }, // Gras
            g => { px(g, 3, 9, 0x5a5448, 1, 9, 4); px(g, 5, 8, 0x6a6458, 1, 5, 1) },                                                         // Stein
        ],
    },
    // 5.1 Savanne in Afrika: Akazien, Termitenhügel, Geröllgeräte
    hominiden: {
        tile: (g, r) => { fill(g, 0x4a3f22); specks(g, r, 70, 0x5e5230); streaks(g, r, 12, 0x6a5c34); specks(g, r, 8, 0x3a3018, 2) },
        props: [
            g => { px(g, 7, 7, 0x4a3420, 1, 2, 9); px(g, 5, 9, 0x4a3420, 1, 2, 1); px(g, 1, 3, 0x4a6a2a, 1, 14, 3); px(g, 3, 2, 0x5a7a32, 1, 10, 1); px(g, 2, 6, 0x3a5a22, 1, 12, 1) }, // Akazie
            g => { px(g, 6, 3, 0x8a6a3a, 1, 4, 12); px(g, 5, 8, 0x8a6a3a, 1, 6, 7); px(g, 7, 2, 0x9a7a4a, 1, 2, 1); px(g, 4, 14, 0x6a5028, 1, 8, 1) },          // Termitenhügel
            g => { for (const x of [3, 6, 9, 12]) px(g, x, 8, 0x8a8a4a, 1, 1, 7); px(g, 5, 6, 0x9a9a5a, 1, 1, 3); px(g, 10, 6, 0x9a9a5a, 1, 1, 3) },             // Grasbüschel
            g => { px(g, 5, 8, 0x7a7468, 1, 6, 4); px(g, 6, 7, 0x9a948a, 1, 3, 1); px(g, 9, 9, 0x5a554c, 1, 2, 2) },                                             // Geröllgerät
        ],
    },
    // 5.2 Eiszeit-Steppe: Schnee, Feuerstelle, Mammutknochen
    'jaeger-sammler': {
        tile: (g, r) => { fill(g, 0x8a959a); specks(g, r, 70, 0xa4aeb2); specks(g, r, 30, 0x6f7a7e); specks(g, r, 8, 0x5a6a5a, 2) },
        props: [
            g => { px(g, 4, 11, 0x5a4030, 1, 8, 2); px(g, 6, 7, 0xe8603b, 1, 4, 4); px(g, 7, 5, 0xf2c94c, 1, 2, 3); px(g, 5, 10, 0x3a2a20, 1, 6, 1) },             // Feuerstelle
            g => { px(g, 2, 9, 0xe8e0d0, 1, 12, 2); px(g, 1, 8, 0xe8e0d0, 1, 2, 4); px(g, 13, 8, 0xe8e0d0, 1, 2, 4); px(g, 4, 5, 0xd8d0c0, 1, 2, 4) },          // Mammutknochen
            g => { px(g, 7, 12, 0x5a4a2a, 1, 2, 4); for (let y = 2; y < 12; y++) { const w = Math.min(10, 2 + y); px(g, 8 - Math.floor(w / 2), y, y % 3 ? 0x2e4a3a : 0xe8eef0, 1, w, 1) } }, // verschneiter Nadelbaum
            g => { px(g, 3, 8, 0x5a6066, 1, 10, 5); px(g, 4, 7, 0xe8eef0, 1, 8, 2) },                                                                         // Fels mit Schnee
        ],
    },
    // 5.3 Sesshaftigkeit: Felder, Häuser, Wege, Fabrikschlot
    zivilisation: {
        tile: (g, r) => { fill(g, 0x3a3424); for (let y = 0; y < T; y += 6) px(g, 0, y, 0x4a4430, 1, T, 2); specks(g, r, 30, 0x2e2a1c) },
        props: [
            g => { for (let x = 2; x < 14; x += 2) px(g, x, 4, 0xd8b84a, 1, 1, 10); px(g, 1, 14, 0x6a5a2a, 1, 14, 1) },                                    // Getreidefeld
            g => { px(g, 3, 7, 0xd8c8a8, 1, 10, 7); px(g, 2, 5, 0x8a3a2a, 1, 12, 2); px(g, 4, 4, 0x8a3a2a, 1, 8, 1); px(g, 7, 10, 0x5a4030, 1, 2, 4); px(g, 4, 9, 0x6a8aa8, 1, 2, 2) }, // Haus
            g => { px(g, 6, 2, 0x7a4a3a, 1, 4, 12); px(g, 5, 14, 0x5a3a2a, 1, 6, 2); px(g, 6, 0, 0x8a8a90, 0.7, 3, 2); px(g, 8, 0, 0x6a6a70, 0.5, 3, 1) },     // Fabrikschlot
            g => { px(g, 0, 7, 0x6a6458, 1, 16, 3); px(g, 0, 8, 0x8a8478, 1, 16, 1) },                                                                         // Weg
        ],
    },
    // 6.1 Erdorbit: Sterne, die Erde, Satelliten
    erdorbit: {
        tile: (g, r) => { fill(g, 0x06070f); specks(g, r, 40, 0x2a2e4a); specks(g, r, 10, 0xc8cce0); specks(g, r, 3, 0xffffff, 2) },
        props: [
            g => { g.fillStyle(0x2a6ab8, 1).fillCircle(8, 8, 7); px(g, 4, 5, 0x3a8a4a, 1, 4, 3); px(g, 9, 9, 0x3a8a4a, 1, 3, 3); px(g, 6, 2, 0xf4f4f4, 0.8, 5, 1); px(g, 3, 11, 0xf4f4f4, 0.6, 4, 1) }, // Erde
            g => { px(g, 6, 6, 0xc8ccd8, 1, 4, 4); px(g, 0, 7, 0x3a5a9a, 1, 6, 2); px(g, 10, 7, 0x3a5a9a, 1, 6, 2); px(g, 7, 3, 0x9a9aa8, 1, 1, 3) },             // Satellit
            g => { px(g, 2, 7, 0xd8dce8, 1, 12, 3); px(g, 6, 3, 0x3a5a9a, 1, 1, 11); px(g, 9, 3, 0x3a5a9a, 1, 1, 11); px(g, 0, 8, 0x8a8a98, 1, 16, 1) },          // Raumstation
            g => { px(g, 7, 4, 0xffffff, 1, 1, 7); px(g, 4, 7, 0xffffff, 1, 7, 1); px(g, 7, 7, 0xfff0c0, 1, 1, 1) },                                           // funkelnder Stern
        ],
    },
    // 6.2 Mond & Mars: roter Boden, Krater, Kuppel-Station
    'mond-mars': {
        tile: (g, r) => { fill(g, 0x6a2e1e); specks(g, r, 70, 0x7e3a26); specks(g, r, 30, 0x55241a); specks(g, r, 8, 0x8e4a30, 2) },
        props: [
            g => { ring(g, 8, 8, 5, 0x4a1c12); ring(g, 8, 8, 4, 0x9a5a3a); px(g, 6, 6, 0x55241a, 1, 5, 5) },                                                // Krater
            g => { g.fillStyle(0xd8e0e8, 0.9).fillCircle(8, 11, 6); px(g, 2, 11, 0x8a5a4a, 1, 13, 4); px(g, 6, 8, 0x4ea8ff, 0.6, 3, 2); px(g, 13, 9, 0xd8e0e8, 1, 2, 3) }, // Kuppel-Station
            g => { px(g, 4, 9, 0x4a2014, 1, 8, 4); px(g, 5, 8, 0x8e4a30, 1, 5, 1) },                                                                         // Felsbrocken
            g => { for (let y = 0; y < 16; y += 3) { px(g, 4, y, 0x55241a, 1, 2, 2); px(g, 10, y + 1, 0x55241a, 1, 2, 2) } },                                  // Rover-Spuren
        ],
    },
    // 6.3 Tiefe Raumfahrt: Nebel, ferne Galaxien, Ringplanet
    tiefraum: {
        tile: (g, r) => { fill(g, 0x07071a); specks(g, r, 30, 0x1c1c48); specks(g, r, 14, 0x3a2a6a, 2); specks(g, r, 12, 0xd8d8ff) },
        props: [
            g => { g.fillStyle(0x6a3aa8, 0.35).fillCircle(8, 8, 7); g.fillStyle(0xc85a9a, 0.3).fillCircle(5, 6, 4); g.fillStyle(0x4a8ad8, 0.3).fillCircle(11, 10, 4) }, // Nebel
            g => { g.fillStyle(0xe8d8a8, 1).fillCircle(8, 8, 2); for (let i = 0; i < 12; i++) { const t = i * 0.6; px(g, Math.round(8 + Math.cos(t) * (1 + i * 0.5)), Math.round(8 + Math.sin(t) * (1 + i * 0.5)), 0xb8b0e0, 0.8) } }, // Galaxie
            g => { g.fillStyle(0xc8a86a, 1).fillCircle(8, 8, 4); px(g, 1, 8, 0xe8d8b0, 1, 14, 1); px(g, 3, 7, 0xe8d8b0, 0.6, 10, 1) },                       // Ringplanet
            g => { px(g, 7, 4, 0xd8d8ff, 1, 1, 7); px(g, 4, 7, 0xd8d8ff, 1, 7, 1) },                                                                         // Stern
        ],
    },
}

export const tileKey = (stageId: string) => `tile_${stageId}`
export const propKey = (stageId: string, i: number) => `prop_${stageId}_${i}`

/** Helle Böden (Schnee) – dort werden Bodentexte und Lineal dunkel gezeichnet. */
const LIGHT = new Set(['jaeger-sammler'])
export function isLightStage(stageId: string): boolean {
    return LIGHT.has(stageId)
}

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
