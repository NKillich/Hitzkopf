// Platzhalter-Cover (wenn Spotify kein Bild liefert): zwei Farben + eine Form, stabil pro Schlüssel
const COVER_COLORS = [
    ['#FF5A1F', '#FFD23F'], ['#2F6BFF', '#A9C8FF'], ['#12A57A', '#C8F4E4'], ['#E83F6F', '#FFC2D4'],
    ['#7A5CFA', '#D7CCFF'], ['#F2B705', '#1C1E24'], ['#1C1E24', '#FF8A5B'], ['#00A6C8', '#FF5EA8']
]

const hashOf = (str = '') => {
    let h = 0
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
    return h
}

export default function CoverArt({ src, seed, size, radius }) {
    const h = hashOf(String(seed || ''))
    const [c1, c2] = COVER_COLORS[h % COVER_COLORS.length]
    const k = (h >> 3) % 3
    const r = (f) => Math.round(size * f)
    let shape
    if (k === 0) shape = { width: r(0.72), height: r(0.72), right: -r(0.16), bottom: -r(0.16), borderRadius: '50%', background: c2 }
    else if (k === 1) shape = { left: 0, right: 0, bottom: 0, height: r(0.42), background: c2 }
    else shape = { width: r(0.6), height: r(0.6), left: r(0.2), top: r(0.2), borderRadius: '50%', border: `${Math.max(4, r(0.1))}px solid ${c2}`, boxSizing: 'border-box' }
    return (
        <span style={{ width: size, height: size, borderRadius: radius, background: c1, position: 'relative', display: 'block', flex: 'none', overflow: 'hidden' }}>
            {src
                ? <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ position: 'absolute', display: 'block', ...shape }} />}
        </span>
    )
}
