// Paket 3 (Phase 5–6): Hauptfigur als Mensch (Gesicht + gelbe Fühler bleiben), Ausrüstung je Epoche,
// Tiere der Eiszeit, Plagen der Zivilisation und Gefahren im All. Zeichen wie in microbes.ts/animals.ts.
import type { Grid, Motion } from './animals'

export const HERO_HUMAN: { grid: Grid; motion: Motion } = {
    motion: 'walk',
    grid: [
        '....Y.....Y.....', '....D.....D.....', '.....D...D......', '.....OOOOOO.....', '....OLBBBBBO....', '....OBWWBWWO....',
        '....OBWKBWKO....', '....OBBMWMBO....', '.....OBBBBO.....', '...OOOBBBBOOO...', '..OBBBBBBBBBBO..', '..OBOBBBBBBOBO..',
        '..OBOBBBBBBOBO..', '...O.OBBBBO.O...', '.....OBOOBO.....', '.....OO..OO.....',
    ],
}

/** Rumpf (x, y, b, h) und Kopf (x, y, r) je Körper – dorthin kommen Umhang, Kleidung und Raumanzug. */
export const HERO_ANCHORS: Record<string, { torso: [number, number, number, number]; head: [number, number, number] }> = {
    human: { torso: [3, 9, 10, 4], head: [8, 5.5, 4.5] },
    mammal: { torso: [2, 7, 10, 3], head: [12, 4, 3.5] },
    reptile: { torso: [2, 8, 9, 2], head: [11, 4, 3.5] },
    bird: { torso: [2, 7, 9, 3], head: [10, 4, 3.5] },
    tetrapod: { torso: [2, 6, 9, 2], head: [12, 5, 3.5] },
    fish: { torso: [5, 6, 8, 3], head: [11, 7, 4] },
    arthropod: { torso: [3, 4, 9, 4], head: [12, 6, 4] },
}

export const MODERN_ART: Record<string, { grid: Grid; motion: Motion }> = {
    hyena: {
        motion: 'walk',
        grid: [
            '................', '................', '.........OO.....', '..O.....OBBO....', '.OBO...OBBKBOO..', '.OBOOOOBBBBBBWO.',
            '.OBBBSBBSBBBOO..', '..OBBBBBBBBBO...', '...OBSBBSBBO....', '...ODO..ODO.....', '...ODO...ODO....', '...OO....OO.....',
        ],
    },
    cat: {
        motion: 'walk',
        grid: [
            '................', '................', '...........O.O..', '..........OBOBO.', 'O.........OBKBO.', 'OO........OBBBBO',
            '.OOOOOOOOOBBBWO.', '..OBBBBBBBBBBO..', '..OBSBBSBBSBBO..', '...OBBBBBBBBO...', '...ODO.OO.ODO...', '...OO..OO..OO...',
        ],
    },
    sabertooth: {
        motion: 'walk',
        grid: [
            '................', '................', '...........O.O..', '..........OBOBO.', 'O.........OBKBO.', 'OO........OBBBBO',
            '.OOOOOOOOOBBBBO.', '..OBBBBBBBBBBWO.', '..OBSBBSBBSBOW..', '...OBBBBBBBBO...', '...ODO.OO.ODO...', '...OO..OO..OO...',
        ],
    },
    bear: {
        motion: 'walk',
        grid: [
            '................', '..........OO.OO.', '.........OBOOBO.', '..OOOOOOOBBBBBO.', '.OBBLBBBBBBBKBO.', 'OBBBBBBBBBBBBBOO',
            'OBBBBBBSBBBBBBWO', 'OBBSBBBBBBBBBOO.', '.OBBBBBBBBBBBO..', '.ODDDDDDDDDDDO..', '.ODDO.ODDO.ODO..', '.OOO..OOO..OOO..',
        ],
    },
    rhino: {
        motion: 'walk',
        grid: [
            '................', '.............A..', '............AA..', '..OOOOOOOOOOAOA.', '.OLBBBBBBBBOBAAO', 'OBBBBBBBBBBBBKBO',
            'OBBSBBBBBBSBBBBO', 'OBBBBBBBBBBBBOO.', '.ODDDDDDDDDDDO..', '.ODO.ODO.ODO.O..', '.OOO.OOO.OOO....',
        ],
    },
    rat: {
        motion: 'walk',
        grid: [
            '................', '................', '................', '................', '...........OO...', '..........OBBO..',
            '.....OOOOOBBKBO.', '....OBBBBBBBBBWO', 'OOOOBBBSBBBBBOO.', '....OBBBBBBBBO..', '.....ODO..ODO...', '.....OO...OO....',
        ],
    },
    locusts: {
        motion: 'bob',
        grid: [
            '................', '.OO....A........', 'OBBO..OBBO......', '.OO.....OO.OO...', '.........OBBBO..', '..OO......OO....',
            '.OBBO...........', '..OO......OO....', '.........OBBO...', '....OO....OO....', '...OBBBO........', '....OO.......OO.',
            '............OBBO', '.............OO.',
        ],
    },
    aurochs: {
        motion: 'walk',
        grid: [
            '................', '............A..A', '...........AOOA.', '..OOOOOOOOOOBBO.', '.OBBBBBBBBBBBKBO', 'OBBBBBBBBBBBBBBO',
            'OBBSBBBBBBBBBOO.', 'OBBBBBBBBBBBBO..', '.ODDDDDDDDDDDO..', '.ODO.ODO.ODO....', '.ODO.ODO.ODO....', '.OOO.OOO.OOO....',
        ],
    },
    plague: {
        motion: 'bob',
        grid: [
            '................', '..OOO....OOOO...', '.OBBBO..OBBBBO..', '..OOO.OOO.OOO...', '.....OBBBO......', '.OOOO.OOO..OOO..',
            'OBBBBO....OBBBO.', '.OOOO..OOO.OOO..', '......OBBBO.....', '..OOO..OOO..OOO.', '.OBBBO.....OBBBO', '..OOO..OOOO.OOO.',
            '......OBBBBO....', '.......OOOO.....',
        ],
    },
    meteoroid: {
        motion: 'bob',
        grid: [
            '................', '................', '................', '................', 'AA..............', '.AA...OOOO......',
            '..AAAOBBBBO.....', '...AOBLBSBO.....', '....OBBBBBO.....', '.....OBSBO......', '......OOO.......',
        ],
    },
    debris: {
        motion: 'bob',
        grid: [
            '................', '................', '..OOOOOO........', '..OBDBDO........', '..ODBDBOOOOO....', '..OBDBDOBBBBO...',
            '..ODBDBOBLBBO...', '..OOOOOOBBBBO...', '........OBSBO...', '........OOOOO...',
        ],
    },
    rocketstage: {
        motion: 'bob',
        grid: [
            '................', '......OOOO......', '.....OLBBBO.....', '.....OBBBBO.....', '.....OBAABO.....', '.....OBBBBO.....',
            '.....OBBBBO.....', '.....OBSBBO.....', '.....OBBBBO.....', '....OOBBBBOO....', '...OBBOOOOBBO...', '....OO.OO.OO....',
            '......ODDO......', '.......OO.......',
        ],
    },
    dust: {
        motion: 'bob',
        grid: [
            '................', '................', '.....OOOO.......', '...OOLBBBOO.....', '..OLBBBBBBBO....', '.OBBBBBBBBBBOO..',
            '.OBBBBBSBBBBBBO.', '..OBBBBBBBBBBO..', '...OOOBBBBOOO...', '......OOOO......',
        ],
    },
    dustdevil: {
        motion: 'bob',
        grid: [
            '..OOOOOOOOOOOO..', '.OLBBBBBBBBBBBO.', '..OBBSBBBBSBBO..', '...OBBBBBBBBO...', '....OBBSBBBO....', '....OBBBBBBO....',
            '.....OBBSBO.....', '.....OBBBBO.....', '......OBBO......', '......OBBO......', '.......OO.......',
        ],
    },
    solarparticle: {
        motion: 'bob',
        grid: [
            '................', '.......Y........', '...Y...Y...Y....', '....Y..Y..Y.....', '.....OOOOO......', '.YYYOBLLBOYYY...',
            '....OBLBBBO.....', '.....OOOOO......', '....Y..Y..Y.....', '...Y...Y...Y....', '.......Y........',
        ],
    },
    cosmicray: {
        motion: 'bob',
        grid: [
            '................', '................', '................', '................', '...........OOO..', '.AAAAAAAAAOLBBO.',
            'AAAAAAAAAAOBBBO.', '.AAAAAAAAAOBBO..', '...........OO...',
        ],
    },
    comet: {
        motion: 'bob',
        grid: [
            '................', '................', 'AA..............', '.AAA.....OOOO...', '..AAAAA.OLBBBO..', '...AAAAAOBLBBBO.',
            '..AAAAA.OBBSBBO.', '.AAA.....OBBBO..', 'AA........OOO...',
        ],
    },
    asteroid: {
        motion: 'static',
        grid: [
            '................', '.....OOOOOO.....', '...OOLLBBBBOO...', '..OLBBBBSSBBBO..', '.OLBBSSBBSDSBBO.', '.OBBSDDSBBSSBBO.',
            'OBBBBSSBBBBBBBBO', 'OBBBBBBBBBSSBBBO', 'OBBSSBBBBBSDSBBO', 'OBSDDSBBBBBSBBBO', '.OBSSBBBBBBBBBO.', '.OBBBBBBSSBBBDO.',
            '..OBBBBBSDSBDO..', '...OODBBBBDDO...', '.....OOOOOO.....',
        ],
    },
}
