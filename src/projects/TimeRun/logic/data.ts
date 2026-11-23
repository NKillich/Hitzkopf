// Lädt die JSON-Daten und prüft sie beim Start, damit Tippfehler sofort auffallen.
import epochsJson from '../data/epochs.json'
import genesJson from '../data/genes.json'
import upgradesJson from '../data/upgrades.json'
import evolutionJson from '../data/evolution-options.json'
import type { GameData, Rarity, Stat } from './types'

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary']
const STATS: Stat[] = ['maxHp', 'moveSpeed', 'pickupRadius', 'xpGain', 'regen',
    'damage', 'cooldown', 'range', 'projectileSpeed', 'projectiles', 'pierce']
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function duplicates(ids: string[]): string[] {
    const seen = new Set<string>()
    const dup = new Set<string>()
    for (const id of ids) (seen.has(id) ? dup : seen).add(id)
    return [...dup]
}

/** Liste aller Fehler in den Daten (leer = alles in Ordnung). */
export function validateData(d: GameData): string[] {
    const errors: string[] = []
    const epochIds = new Set(d.epochs.map(e => e.id))

    for (const id of duplicates(d.epochs.map(e => e.id))) errors.push(`epochs: id „${id}“ doppelt`)
    for (const e of d.epochs) {
        if (e.phase !== 'biologisch' && e.phase !== 'kulturell') errors.push(`epochs/${e.id}: phase „${e.phase}“ unbekannt`)
        if (!COLOR_RE.test(e.background) || !COLOR_RE.test(e.gridColor)) errors.push(`epochs/${e.id}: Farbe ungültig`)
        const enemyIds = new Set(e.enemies.map(x => x.id))
        for (const id of duplicates(e.enemies.map(x => x.id))) errors.push(`epochs/${e.id}: Gegner „${id}“ doppelt`)
        for (const x of e.enemies) {
            if (!COLOR_RE.test(x.color)) errors.push(`epochs/${e.id}/${x.id}: Farbe ungültig`)
            if (!(x.hp > 0 && x.size > 0 && x.speed >= 0 && x.xp >= 0)) errors.push(`epochs/${e.id}/${x.id}: Werte ungültig`)
        }
        const checkWaves = (waves: typeof e.waves, where: string) => {
            for (const w of waves) {
                if (!enemyIds.has(w.enemy)) errors.push(`${where}: Welle nennt unbekannten Gegner „${w.enemy}“`)
                if (!(w.every > 0 && w.count > 0 && w.to > w.from)) errors.push(`${where}: Welle „${w.enemy}“ ab ${w.from} s ungültig`)
            }
        }
        checkWaves(e.waves, `epochs/${e.id}`)
        if (e.enemies.length > 0) {
            // spielbar → braucht Höhe und Boss
            if (!(typeof e.height === 'number' && e.height > 0)) errors.push(`epochs/${e.id}: height fehlt oder ≤ 0`)
            if (!e.boss) errors.push(`epochs/${e.id}: boss fehlt`)
            else {
                if (!COLOR_RE.test(e.boss.color)) errors.push(`epochs/${e.id}/boss: Farbe ungültig`)
                if (!(e.boss.hp > 0 && e.boss.size > 0)) errors.push(`epochs/${e.id}/boss: Werte ungültig`)
            }
        }
        for (const v of e.variants ?? []) {
            if ((v.background && !COLOR_RE.test(v.background)) || (v.gridColor && !COLOR_RE.test(v.gridColor))) {
                errors.push(`epochs/${e.id}/${v.id}: Farbe ungültig`)
            }
            checkWaves(v.extraWaves ?? [], `epochs/${e.id}/${v.id}`)
        }
    }
    if (!d.epochs.some(e => e.enemies.length > 0)) errors.push('epochs: keine spielbare Epoche (mit Gegnern)')

    for (const id of duplicates(d.genes.map(g => g.id))) errors.push(`genes: id „${id}“ doppelt`)
    if (!d.genes.some(g => g.id === d.startGene)) errors.push(`genes: startGene „${d.startGene}“ fehlt`)
    for (const g of d.genes) {
        for (const ep of Object.keys(g.forms)) if (!epochIds.has(ep)) errors.push(`genes/${g.id}: Form für unbekannte Epoche „${ep}“`)
    }

    for (const id of duplicates(d.upgrades.map(u => u.id))) errors.push(`upgrades: id „${id}“ doppelt`)
    for (const u of d.upgrades) {
        if (!RARITIES.includes(u.rarity)) errors.push(`upgrades/${u.id}: Seltenheit „${u.rarity}“ unbekannt`)
        if (!(u.maxLevel >= 1)) errors.push(`upgrades/${u.id}: maxLevel muss ≥ 1 sein`)
        if (!u.effects.length) errors.push(`upgrades/${u.id}: keine Effekte`)
        for (const e of u.effects) {
            if (!STATS.includes(e.stat)) errors.push(`upgrades/${u.id}: Wert „${e.stat}“ unbekannt`)
            if (e.op !== 'add' && e.op !== 'mul') errors.push(`upgrades/${u.id}: op „${e.op}“ unbekannt`)
        }
    }

    for (const id of duplicates(d.evolutionOptions.map(o => o.id))) errors.push(`evolution-options: id „${id}“ doppelt`)
    const byStage = new Map<string, typeof d.evolutionOptions>()
    for (const o of d.evolutionOptions) {
        if (!epochIds.has(o.stage)) errors.push(`evolution-options/${o.id}: Stufe „${o.stage}“ unbekannt`)
        if (o.general && (o.requires.length || o.excludes.length)) errors.push(`evolution-options/${o.id}: allgemeine Option darf nichts voraussetzen`)
        const both = o.requires.filter(t => o.excludes.includes(t))
        if (both.length) errors.push(`evolution-options/${o.id}: Tag „${both[0]}“ steht in requires und excludes`)
        byStage.set(o.stage, [...(byStage.get(o.stage) ?? []), o])
    }
    for (const [stage, opts] of byStage) {
        if (opts.length < 2) errors.push(`evolution-options: Stufe „${stage}“ braucht mindestens 2 Optionen`)
        if (!opts.some(o => o.general)) errors.push(`evolution-options: Stufe „${stage}“ hat keine allgemeine Option`)
    }
    return errors
}

/** Rohdaten aus den JSON-Dateien (ungeprüft). */
export function rawData(): GameData {
    return {
        epochs: epochsJson.epochs as GameData['epochs'],
        genes: genesJson.genes as GameData['genes'],
        startGene: genesJson.startGene,
        upgrades: upgradesJson.upgrades as GameData['upgrades'],
        evolutionOptions: evolutionJson.options as GameData['evolutionOptions'],
    }
}

/** Geprüfte Daten – wirft mit allen Fehlern auf einmal, wenn etwas nicht stimmt. */
export function loadData(): GameData {
    const data = rawData()
    const errors = validateData(data)
    if (errors.length) throw new Error('TimeRun-Daten fehlerhaft:\n' + errors.join('\n'))
    return data
}
