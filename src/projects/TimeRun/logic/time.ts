// Echte Zeitangaben: Jahr innerhalb einer Stufe und lesbare Anzeige („vor 3,42 Mrd. Jahren“, „1969“).

/** Bezugsjahr für „vor … Jahren“ */
export const PRESENT_YEAR = 2026
/** Ab hier zeigen wir keine Jahreszahl mehr, sondern „ferne Zukunft“. */
const FAR_FUTURE = 2100

/** Jahr innerhalb einer Stufe – läuft gleichmäßig mit dem Fortschritt (0…1). */
export function yearAt(fromYear: number, toYear: number, progress: number): number {
    const p = Math.min(1, Math.max(0, progress))
    return fromYear + (toYear - fromYear) * p
}

const de = (n: number, digits = 0) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Lesbare Zeitangabe für ein Kalenderjahr (negativ = v. Chr.). */
export function formatYear(year: number): string {
    if (year > FAR_FUTURE) return 'ferne Zukunft'
    if (year >= 0) return String(Math.floor(year))
    const ago = PRESENT_YEAR - year
    if (ago >= 1e9) return `vor ${de(ago / 1e9, 2)} Mrd. Jahren`
    if (ago >= 1e8) return `vor ${de(Math.round(ago / 1e6))} Mio. Jahren`
    if (ago >= 1e7) return `vor ${de(ago / 1e6, 1)} Mio. Jahren`
    if (ago >= 1e6) return `vor ${de(ago / 1e6, 2)} Mio. Jahren`
    if (ago > 12000) return `vor ${de(Math.round(ago / 1000) * 1000)} Jahren`
    // ab ca. 10.000 v. Chr. als Jahreszahl
    return `${de(Math.round(-year / 10) * 10)} v. Chr.`
}

/** Zeitraum einer Stufe, z. B. „vor 3,80 – 2,70 Mrd. Jahren“ (für Banner/Auswahl). */
export function formatRange(fromYear: number, toYear: number): string {
    const a = formatYear(fromYear)
    const b = formatYear(toYear)
    // gleiche Einheit zusammenfassen: „vor 4,00 – 3,80 Mrd. Jahren“
    const ma = /^vor (.+?) ((?:Mrd\. |Mio\. )?Jahren)$/.exec(a)
    const mb = /^vor (.+?) ((?:Mrd\. |Mio\. )?Jahren)$/.exec(b)
    if (ma && mb && ma[2] === mb[2]) return `vor ${ma[1]} – ${mb[1]} ${ma[2]}`
    return `${a} – ${b}`
}

/** Kurz für Schilder: „3,80 Mrd.“, „66 Mio.“, „12.000“, „1957“. */
export function shortYear(year: number): string {
    const f = formatYear(year)
    const m = /^vor (.+?) (?:(Mrd\.|Mio\.) )?Jahren$/.exec(f)
    return m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : f
}
