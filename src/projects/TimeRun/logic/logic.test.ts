import { describe, it, expect } from 'vitest'
import { rawData, validateData } from './data'
import { availableEvolutions, applyEvolution } from './evolution'
import { pickUpgrades, computeStats, eligibleUpgrades } from './upgrades'
import { spawnsDue, xpForLevel } from './waves'
import { buildTimeline, firstPlayable, heightProgress, nextPlayable, resolveEpoch, transitionStage } from './epochs'
import type { EvolutionOption, Upgrade, Wave } from './types'

describe('Daten', () => {
    it('die mitgelieferten JSON-Dateien sind fehlerfrei', () => {
        expect(validateData(rawData())).toEqual([])
    })

    it('meldet unbekannte Gegner, Stufen und fehlende allgemeine Option', () => {
        const d = rawData()
        d.epochs[0].waves.push({ enemy: 'gibtsnicht', from: 0, to: 10, every: 1, count: 1 })
        d.evolutionOptions = [
            { id: 'a', stage: 'nirgendwo', name: 'A', description: '', requires: [], excludes: [], grants: [] },
            { id: 'b', stage: 'mehrzeller', name: 'B', description: '', requires: ['x'], excludes: ['x'], grants: [] },
        ]
        const errors = validateData(d).join('\n')
        expect(errors).toContain('gibtsnicht')
        expect(errors).toContain('nirgendwo')
        expect(errors).toContain('requires und excludes')
        expect(errors).toContain('keine allgemeine Option')
    })
})

describe('Evolution (Tags)', () => {
    const opts: EvolutionOption[] = [
        { id: 'panzer', stage: 'tierklasse', name: '', description: '', requires: ['land', 'räuber'], excludes: [], grants: ['reptil'] },
        { id: 'flug', stage: 'tierklasse', name: '', description: '', requires: [], excludes: ['wasser'], grants: ['luft'] },
        { id: 'allg', stage: 'tierklasse', name: '', description: '', requires: [], excludes: [], grants: ['säuger'], general: true },
        { id: 'anders', stage: 'antike', name: '', description: '', requires: [], excludes: [], grants: [] },
    ]

    it('requires: alle Tags nötig', () => {
        expect(availableEvolutions(opts, 'tierklasse', new Set(['land'])).map(o => o.id)).toEqual(['flug', 'allg'])
        expect(availableEvolutions(opts, 'tierklasse', new Set(['land', 'räuber'])).map(o => o.id)).toEqual(['panzer', 'flug', 'allg'])
    })

    it('excludes verhindert, allgemeine Option bleibt immer', () => {
        expect(availableEvolutions(opts, 'tierklasse', new Set(['wasser'])).map(o => o.id)).toEqual(['allg'])
    })

    it('grants fügt Tags hinzu, ohne die alten zu verändern', () => {
        const before = new Set(['land', 'räuber'])
        const after = applyEvolution(before, opts[0])
        expect([...after].sort()).toEqual(['land', 'reptil', 'räuber'])
        expect(before.has('reptil')).toBe(false)
    })

    it('Krokodil im Weltall entsteht aus den echten Daten', () => {
        const all = rawData().evolutionOptions
        let tags = new Set<string>()
        const path: [string, string][] = [
            ['mehrzeller', 'jaeger-zellverband'], ['lebensraum', 'an-land'], ['tierklasse', 'panzerechse'],
            ['intelligenz', 'werkzeuggebrauch'], ['steinzeit', 'kriegerstamm'], ['industrie', 'dampfmaschine'], ['zukunft', 'raumfahrt'],
        ]
        for (const [stage, id] of path) {
            const choice = availableEvolutions(all, stage, tags).find(o => o.id === id)
            expect(choice, `${id} in ${stage}`).toBeDefined()
            tags = applyEvolution(tags, choice!)
        }
        for (const t of ['reptil', 'räuber', 'kriegerisch', 'raumfahrt']) expect(tags.has(t)).toBe(true)
    })
})

describe('Upgrades', () => {
    const ups: Upgrade[] = [
        { id: 'a', name: '', description: '', rarity: 'common', maxLevel: 2, effects: [{ stat: 'damage', op: 'add', value: 1 }] },
        { id: 'b', name: '', description: '', rarity: 'legendary', maxLevel: 1, effects: [{ stat: 'damage', op: 'mul', value: 2 }] },
        { id: 'c', name: '', description: '', rarity: 'rare', maxLevel: 1, requires: ['räuber'], effects: [{ stat: 'cooldown', op: 'mul', value: 0.5 }] },
        { id: 'd', name: '', description: '', rarity: 'epic', maxLevel: 3, excludes: ['räuber'], effects: [{ stat: 'projectiles', op: 'add', value: 1 }] },
    ]

    it('ausgereizte und unpassende Upgrades fallen weg', () => {
        expect(eligibleUpgrades(ups, { a: 2 }, new Set()).map(u => u.id)).toEqual(['b', 'd'])
        expect(eligibleUpgrades(ups, {}, new Set(['räuber'])).map(u => u.id)).toEqual(['a', 'b', 'c'])
    })

    it('liefert 3 verschiedene, bei weniger Auswahl entsprechend weniger', () => {
        let seed = 1
        const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        for (let i = 0; i < 50; i++) {
            const ids = pickUpgrades(ups, {}, new Set(['räuber']), rng).map(u => u.id)
            expect(ids).toHaveLength(3)
            expect(new Set(ids).size).toBe(3)
        }
        expect(pickUpgrades(ups, { a: 2, b: 1, d: 3 }, new Set())).toEqual([])
    })

    it('Seltenheit gewichtet: gewöhnlich kommt viel öfter als legendär', () => {
        let common = 0, legendary = 0
        let seed = 7
        const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        for (let i = 0; i < 2000; i++) {
            const first = pickUpgrades(ups, {}, new Set(), rng, 1)[0].id
            if (first === 'a') common++
            if (first === 'b') legendary++
        }
        expect(common).toBeGreaterThan(legendary * 5)
    })

    it('Werte: erst addieren, dann multiplizieren', () => {
        const base = { maxHp: 50, moveSpeed: 100, pickupRadius: 50, xpGain: 1, regen: 0 }
        const weapon = { damage: 3, cooldownMs: 600, range: 200, projectileSpeed: 300, projectiles: 1, pierce: 0 }
        const s = computeStats(base, weapon, ups, { a: 2, b: 1, c: 1, d: 1 })
        expect(s.damage).toBe((3 + 2) * 2)
        expect(s.cooldownMs).toBe(300)
        expect(s.projectiles).toBe(2)
    })
})

describe('Wellen', () => {
    const waves: Wave[] = [{ enemy: 'x', from: 10, to: 20, every: 2, count: 3 }]

    it('feuert bei from, from+every … bis vor to', () => {
        expect(spawnsDue(waves, 0, 9.9)).toEqual([])
        expect(spawnsDue(waves, 9.9, 10)).toEqual([{ enemy: 'x', count: 3 }])
        expect(spawnsDue(waves, 10, 11.9)).toEqual([])
        expect(spawnsDue(waves, 0, 100)).toEqual([{ enemy: 'x', count: 15 }])   // 10,12,…,18
    })

    it('kleine Schritte ergeben dieselbe Summe wie ein großer', () => {
        let sum = 0
        for (let t = 0; t < 30; t += 0.016) sum += spawnsDue(waves, t, t + 0.016).reduce((s, r) => s + r.count, 0)
        expect(sum).toBe(15)
    })

    it('XP-Kurve steigt', () => {
        for (let l = 1; l < 30; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l))
    })
})

describe('Epochen', () => {
    const data = rawData()

    it('Prototyp: Ursuppe → Steinzeit → Mittelalter, danach Ende', () => {
        expect(firstPlayable(data.epochs)?.id).toBe('ursuppe')
        expect(nextPlayable(data.epochs, 'ursuppe')?.id).toBe('steinzeit')
        expect(nextPlayable(data.epochs, 'steinzeit')?.id).toBe('mittelalter')
        expect(nextPlayable(data.epochs, 'mittelalter')).toBeUndefined()
    })

    it('am Ende einer Epoche gilt die direkt folgende Stufe (auch wenn nicht spielbar)', () => {
        expect(transitionStage(data.epochs, 'ursuppe')?.id).toBe('mehrzeller')
        expect(transitionStage(data.epochs, 'steinzeit')?.id).toBe('antike')
        expect(transitionStage(data.epochs, 'zukunft')).toBeUndefined()
    })

    it('die zwei Mikroben-Pfade führen zu verschiedenen Steinzeit-Varianten', () => {
        const stein = data.epochs.find(e => e.id === 'steinzeit')!
        const opts = availableEvolutions(data.evolutionOptions, 'mehrzeller', new Set())
        const jaeger = applyEvolution(new Set(), opts.find(o => o.id === 'jaeger-zellverband')!)
        const filter = applyEvolution(new Set(), opts.find(o => o.id === 'filtrierer')!)
        const kolonie = applyEvolution(new Set(), opts.find(o => o.id === 'zellkolonie')!)
        expect(resolveEpoch(stein, jaeger).variantId).toBe('jaegerstamm')
        expect(resolveEpoch(stein, filter).variantId).toBe('sammlerstamm')
        expect(resolveEpoch(stein, kolonie).variantId).toBeUndefined()
        expect(resolveEpoch(stein, jaeger).waves.length).toBe(stein.waves.length + 1)
    })

    it('jede Wahl am Ende einer spielbaren Epoche hat mindestens 2 Optionen (ohne Tags)', () => {
        for (const id of ['ursuppe', 'steinzeit']) {
            const stage = transitionStage(data.epochs, id)!
            expect(availableEvolutions(data.evolutionOptions, stage.id, new Set()).length).toBeGreaterThanOrEqual(2)
        }
    })

    it('Höhe: 0 am Start, 1 am Ziel, begrenzt', () => {
        expect(heightProgress(1000, 1000, 500)).toBe(0)
        expect(heightProgress(1000, 750, 500)).toBe(0.5)
        expect(heightProgress(1000, 0, 500)).toBe(1)
        expect(heightProgress(1000, 1200, 500)).toBe(0)
    })

    it('Zeitstrahl: gespielt, aktuell, übersprungen, kommend + Wahl', () => {
        const filtr = data.evolutionOptions.find(o => o.id === 'filtrierer')!
        const tl = buildTimeline(data.epochs, 'steinzeit', ['ursuppe'], { mehrzeller: filtr })
        const by = Object.fromEntries(tl.map(t => [t.id, t]))
        expect(by.ursuppe.status).toBe('done')
        expect(by.mehrzeller.status).toBe('skipped')
        expect(by.mehrzeller.choice).toBe('Filtrierer')
        expect(by.steinzeit.status).toBe('current')
        expect(by.mittelalter.status).toBe('future')
    })

    it('Datenprüfung meldet spielbare Epoche ohne Höhe/Boss', () => {
        const d = rawData()
        delete d.epochs[0].height
        delete d.epochs[0].boss
        const errors = validateData(d).join('\n')
        expect(errors).toContain('height fehlt')
        expect(errors).toContain('boss fehlt')
    })
})
