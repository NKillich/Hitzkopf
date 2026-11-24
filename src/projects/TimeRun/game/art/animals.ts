// Paket 2 (Phase 3–4): Körper der Hauptfigur (mit Gesicht + gelben Fühlern) und Tiere von Kambrium bis Primaten.
// Gleiche Zeichen wie in microbes.ts: O Umriss, B Grund, L hell, D Schatten, S Fleck, W weiß, K Auge, Y gelb, A Akzent, M Mund.
// Alle Figuren schauen nach rechts.

export type Grid = string[]
/** bob = wippt (Schwimmer), walk = Beine versetzt (Läufer), static = bewegt sich nicht */
export type Motion = 'bob' | 'walk' | 'static'

/** Körper der Hauptfigur ab Phase 3 – Farben wie die Mikrobe, Fühler bleiben. */
export const HERO_BODIES: Record<string, { grid: Grid; motion: Motion }> = {
    fish: {
        motion: 'bob',
        grid: [
            '..........Y.Y...', '..........D.D...', '...........D....', '.......OOOOOO...', '.O....OLLBBBBO..', '.OO..OLBBBBWWBO.',
            '.ODO.OBBBBBWKBBO', '.ODDOBBSBBBBBBMO', '.ODDOBBBBBBSBMWO', '.ODO.OBBBBBBBBO.', '.OO...ODDDDDDO..', '.O.....OOOOOO...',
        ],
    },
    arthropod: {
        motion: 'walk',
        grid: [
            '...........Y.Y..', '...........D.D..', '............DD..', '...OOOOOOOOOOO..', '..OLLBSBSBSBBBO.', '.OLBSBSBSBSBWWBO',
            '.OBBBBBBBBBBWKBO', '.OBSBSBSBSBBBMWO', '..ODDDDDDDDDDDO.', '...OOOOOOOOOOO..', '....O.O.O.O.O...', '...O.O.O.O.O....',
        ],
    },
    tetrapod: {
        motion: 'walk',
        grid: [
            '............Y.Y.', '............D.D.', '.........OOOOOO.', '........OLBBWWBO', 'OO......OBBBWKBO', 'OBOOOOOOOBBBBMWO',
            'OBBBBBBBBBBBBMMO', '.OBSBBBBSBBBBBO.', '..ODDDDDDDDDDO..', '..ODO.OO..ODO...', '...OO......OO...',
        ],
    },
    reptile: {
        motion: 'walk',
        grid: [
            '..........Y.Y...', '..........D.D...', '.........OOOOO..', '........OLBWWBO.', '........OBBWKBBO', '........OBBBBMWO',
            'OO..O.O.OBBBBMMO', 'OBOOOOOOOBBBOOO.', '.OBBBBBBBBBBO...', '..OBSBSBSBSBO...', '...ODDO..ODDO...', '...ODO....ODO...',
            '...OOO....OOO...',
        ],
    },
    mammal: {
        motion: 'walk',
        grid: [
            '...........Y.Y..', '...........D.D..', '..........OOOOO.', '.........OLBWWBO', '..O......OBBWKBO', '.OBO.....OBBBMWO',
            '.OBOOOOOOOBBBBMO', '.OBLBBBBBBBBBBO.', '.OBBBBSBBBBSBBO.', '..OBBBBBBBBBBO..', '..ODDDDDDDDDDO..', '..ODO.OO..ODO...',
            '..OO..OO..OO....',
        ],
    },
    bird: {
        motion: 'walk',
        grid: [
            '..........Y.Y...', '..........D.D...', '.........OOOO...', '........OLWWBO..', '........OBWKBOO.', '........OBBBMWWO',
            '..OOO..OBBBBOOO.', '.OBBBOOOBBBBO...', '.OBLBBBBBBBBO...', '..OOBBSBBBBO....', '....ODDDDDDO....', '.....OD..DO.....',
            '.....OO..OO.....',
        ],
    },
}

/** Tiere als Gegner (Farben aus den Daten). */
export const ANIMAL_ART: Record<string, { grid: Grid; motion: Motion }> = {
    hallucigenia: {
        motion: 'walk',
        grid: [
            '................', '................', '...A..A..A..A...', '...O..O..O..O...', '..OOOOOOOOOOOO..', '.OLBBBBBBBBBBBO.',
            '.OBBSBBSBBSBBKO.', '..OOOOOOOOOOOO..', '..O.O.O.O.O.O...', '..O.O.O.O.O.O...',
        ],
    },
    trilobite: {
        motion: 'walk',
        grid: [
            '................', '................', '....O.O.O.O.....', '...OOOOOOOOOOO..', '..OLBDBDBDBBBBO.', '.OLBDBDBDBDBBKO.',
            '.OBBBBBBBBBBBBO.', '.OBDBDBDBDBBBKO.', '..ODDDDDDDDDDO..', '...OOOOOOOOOOO..', '....O.O.O.O.....', '...O.O.O.O......',
        ],
    },
    anomalocaris: {
        motion: 'bob',
        grid: [
            '................', '..O.O.O.O.......', '.OLBLBLBLBO.....', '.OBDBDBDBDBOOO..', 'OBBBBBBBBBBBKOA.', 'OBSBBSBBSBBBBOAA',
            'OBBBBBBBBBBBKOA.', '.ODBDBDBDBDOOO..', '.ODDDDDDDDDO....', '..O.O.O.O.......',
        ],
    },
    springtail: {
        motion: 'walk',
        grid: [
            '................', '................', '................', '...........O.O..', '..........O.O...', '....OOOOOOOOO...',
            '...OLBBBBBBBKO..', '...OBBSBBSBBBO..', '....OOOOOOOOO...', '...O.O.O..O.O...', '..OO............',
        ],
    },
    millipede: {
        motion: 'walk',
        grid: [
            '................', '................', '................', '................', '.OOOOOOOOOOOOO..', 'OLBBLBBLBBLBBKO.',
            'OBDBBDBBDBBDBBO.', '.OOOOOOOOOOOOO..', '.O.O.O.O.O.O.O..', 'O.O.O.O.O.O.O...',
        ],
    },
    scorpion: {
        motion: 'walk',
        grid: [
            '..OOO...........', '.OBBAO..........', '.OBO.O..........', '.OBO............', '.OBBO...........', '..OBBOOOOOOO....',
            '...OBBBBBBBBOO..', '...OBSBSBSBBKOAO', '...ODDDDDDDDOOAA', '....O.O.O.O.O...', '...O.O.O.O.O....',
        ],
    },
    acanthostega: {
        motion: 'walk',
        grid: [
            '................', '................', '................', '..........OOOO..', '.........OBBBKO.', 'OOO......OBBBBBO',
            'OBBOOOOOOOBBBBBO', '.OBBBBBBBBBBBBO.', '..OSBSBBSBBSBO..', '..ODO.OO..ODO...', '...OO......OO...',
        ],
    },
    raptor: {
        motion: 'walk',
        grid: [
            '................', '..........OOO...', '.........OBBKO..', '.........OBBBBOO', '.........OBBOWO.', 'OO......OBBO....',
            'OBOOOOOOBBBO....', '.OBBBBBBBBO.....', '..OBSBSBBBO.....', '....OBO.OBO.....', '....OBO..OBO....', '...OOO..OOO.....',
        ],
    },
    triceratops: {
        motion: 'walk',
        grid: [
            '................', '..........A..A..', '.........OOOAAO.', '........OLBBBKAA', '......OOBBBBBBBO', '..OOOOBBBBBBBBAO',
            '.OBBBBBBBBBBBOO.', 'OBBSBBSBBSBBBO..', 'OBBBBBBBBBBBBO..', '.ODDDDDDDDDDO...', '.ODO.ODO.ODO....', '.OOO.OOO.OOO....',
        ],
    },
    smallmammal: {
        motion: 'walk',
        grid: [
            '................', '................', '................', '...........OO...', '..........OBBO..', '..O......OBBKBO.',
            '.OBOOOOOOOBBBBO.', '.OBBBBBBBBBBBBO.', '..OBSBBBBBSBO...', '..ODO.OO.ODO....', '..OO..OO..OO....',
        ],
    },
    bigbird: {
        motion: 'walk',
        grid: [
            '................', '..........OOOO..', '.........OBBKOOO', '.........OBBBAAO', '.........OBBOAO.', '..OOO...OBBBO...',
            '.OBBBOOOBBBBO...', '.OBLBBBBBBBBO...', '..OOBBSBBBBO....', '....ODDDDDDO....', '.....OA..AO.....', '.....OA..AO.....',
            '....OAA.OAA.....',
        ],
    },
    snake: {
        motion: 'bob',
        grid: [
            '................', '................', '...........OOO..', '..........OBBKO.', '...OOO....OBBBO.', '..OBBBO..OBBBO..',
            '.OBBSBBOOBBSO...', '.OBO.OBBBBBO....', '.OBO..OBSBO.....', '..OBO..OOO......', '..OBBO..........', '...OBBOOOOO.....',
            '....OBBBSBBO....', '.....OOOOOO.....',
        ],
    },
    hyaenodon: {
        motion: 'walk',
        grid: [
            '................', '................', '...........OOO..', '..........OBBKO.', '..O......OBBBBBO', '.OBO.....OBBBOWO',
            '.OBOOOOOOOBBBO..', '.OBBBBBBBBBBBO..', '..OBSBBBBSBBO...', '..ODO.OO.ODO....', '..ODO.OO.ODO....', '..OO..OO..OO....',
        ],
    },
    entelodont: {
        motion: 'walk',
        grid: [
            '................', '................', '..........OOOO..', '.........OBBBKO.', '...OOOOOOBBBBBBO', '..OLBBBBBBBBBOWO',
            '.OBBBBBBBBBBBOO.', '.OBSBBBBSBBBBO..', '.OBBBBBBBBBBBO..', '..ODDDDDDDDDO...', '..ODO.ODO.ODO...', '..OOO.OOO.OOO...',
        ],
    },
    deinotherium: {
        motion: 'walk',
        grid: [
            '................', '..OOOOOOOOO.....', '.OLBBBBBBBBOO...', 'OBBBBBBBBBBBBO..', 'OBBSBBBBBBBBKBO.', 'OBBBBBBBBBBBBBO.',
            'OBBBBBBBSBBBOBBO', '.ODDDDDDDDDDOBO.', '.ODO.ODO.ODOABO.', '.ODO.ODO.ODOA.O.', '.OOO.OOO.OOO..O.',
        ],
    },
    dunkleosteus: {
        motion: 'bob',
        grid: [
            '................', '................', '.......OOOOOOO..', '.O...OOAAAAAAAO.', '.OO.OBBBBBBAAKAO', '.ODOOBBBBBBBAAAO',
            '.ODDBBSBBBBBBAWO', '.ODOOBBBBBBBAWAO', '.OO.ODDDDDDDDAO.', '.O...OOOOOOOOO..',
        ],
    },
    andrewsarchus: {
        motion: 'walk',
        grid: [
            '................', '..........OOOOO.', '.........OBBBBKO', '...OOOOOOBBBBBBO', '..OLBBBBBBBBBWOW', '.OBBBBBBBBBBBOWO',
            '.OBSBBBBSBBBBOO.', '.OBBBBBBBBBBBO..', '..ODDDDDDDDDO...', '..ODO.ODO.ODO...', '..OOO.OOO.OOO...',
        ],
    },
}
