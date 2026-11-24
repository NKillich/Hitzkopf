// Easter Egg: Wer am Anfang (Stufe 1.1) nach unten schwimmt, reist in der Zeit zurück bis zum Urknall.
// Stationen mit belegbaren Zeitpunkten (Jahre vor heute); die Tiefe (px unter dem Start) ist gerafft.
import { PRESENT_YEAR } from './time'

export interface BigBangStation {
    /** px unter dem Start von Stufe 1.1 */
    depth: number
    /** Jahre vor heute */
    ago: number
    text: string
}

export const BIGBANG_STATIONS: BigBangStation[] = [
    { depth: 0, ago: 4.0e9, text: '' },
    { depth: 500, ago: 4.5e9, text: 'Vermutlich prallt ein Himmelskörper (Theia) auf die junge Erde. Aus den Trümmern entsteht der Mond.' },
    { depth: 900, ago: 4.54e9, text: 'Die Erde ballt sich aus Staub und Gestein zusammen.' },
    { depth: 1300, ago: 4.6e9, text: 'Die Sonne entsteht aus einer Wolke aus Gas und Staub.' },
    { depth: 2000, ago: 13.6e9, text: 'Die ersten Sterne leuchten auf – ca. 200 Mio. Jahre nach dem Urknall.' },
    { depth: 2600, ago: 13.8e9, text: 'Der Urknall: Raum, Zeit und Materie beginnen.' },
]

/** Ab dieser Tiefe ist man am Urknall angekommen. */
export const BIGBANG_DEPTH = BIGBANG_STATIONS[BIGBANG_STATIONS.length - 1].depth

/** Kalenderjahr (negativ) zu einer Tiefe unter dem Start – stückweise linear zwischen den Stationen. */
export function bigBangYear(depth: number): number {
    const s = BIGBANG_STATIONS
    const d = Math.max(0, Math.min(BIGBANG_DEPTH, depth))
    let i = 1
    while (i < s.length - 1 && s[i].depth < d) i++
    const a = s[i - 1]
    const b = s[i]
    const f = (d - a.depth) / (b.depth - a.depth)
    return PRESENT_YEAR - (a.ago + (b.ago - a.ago) * f)
}
