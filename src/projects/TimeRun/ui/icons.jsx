// Pixel-Symbole als kleine Raster („#“ = gefüllt) → SVG mit scharfen Kanten.

const GRIDS = {
    damage: ['......#', '.....#.', '#...#..', '.#.#...', '..#....', '.#.#...', '#......'],
    cooldown: ['.#####.', '#..#..#', '#..#..#', '#..##.#', '#.....#', '#.....#', '.#####.'],
    range: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
    xp: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
    multi: ['#..#..#', '#..#..#', '#..#..#', '.......', '#..#..#', '#..#..#', '.......'],
    pierce: ['.......', '....#..', '.....#.', '#######', '.....#.', '....#..', '.......'],
    regen: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
    magnet: ['##...##', '##...##', '##...##', '##...##', '##...##', '.#####.', '..###..'],
    cell: ['..###..', '.#####.', '###.###', '##...##', '###.###', '.#####.', '..###..'],
    colony: ['###.###', '###.###', '###.###', '.......', '..###..', '..###..', '..###..'],
    fish: ['........', '..####.#', '.######.', '#.#####.', '.######.', '..####.#', '........'],
    paw: ['.#.#.#.', '.#.#.#.', '.......', '..###..', '.#####.', '.#####.', '..###..'],
    tool: ['.####..', '######.', '.####..', '...#...', '...#...', '...#...', '...#...'],
    rocket: ['...#...', '..###..', '..#.#..', '..###..', '..###..', '.#####.', '#.#.#.#'],
    arrowLeft: ['...#...', '..##...', '.######', '#######', '.######', '..##...', '...#...'],
    pause: ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##'],
    play: ['##....', '####..', '######', '######', '####..', '##....'],
    dna: ['#.....#', '.#...#.', '..###..', '..#.#..', '..###..', '.#...#.', '#.....#'],
}

// Fertige Pfade aus der Vorlage (Klickdummy)
const PATHS = {
    speed: { w: 7, h: 8, d: 'M3 0h3v1H5v1H4v1h3v1H6v1H5v1H4v1H3v1H2V6h1V5H0V4h1V3h1V2h1z' },
    toxin: { w: 6, h: 8, d: 'M2 0h2v2h1v2h1v3H5v1H1V7H0V4h1V2h1z' },
    heart: { w: 7, h: 6, d: 'M1 0h2v1h1V0h2v1h1v2h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1V1h1z' },
}

function gridPath(rows) {
    let d = ''
    rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '#') d += `M${x} ${y}h1v1h-1z`
    })
    return { w: Math.max(...rows.map(r => r.length)), h: rows.length, d }
}

// alle Raster einmal beim Laden in Pfade umwandeln
const ALL = { ...Object.fromEntries(Object.entries(GRIDS).map(([k, rows]) => [k, gridPath(rows)])), ...PATHS }

export function PixelIcon({ name, size = 28, color = 'currentColor', title }) {
    const def = ALL[name]
    if (!def) return null
    const h = Math.round(size * def.h / def.w)
    return (
        <svg width={size} height={h} viewBox={`0 0 ${def.w} ${def.h}`} shapeRendering="crispEdges" fill={color}
            aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} aria-label={title}>
            <path d={def.d} />
        </svg>
    )
}
