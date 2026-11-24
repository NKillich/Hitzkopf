import { describe, it, expect } from 'vitest'
import { rawData, validateData } from './data'
import { availableEvolutions, applyEvolution } from './evolution'
import { pickUpgrades, computeStats, eligibleUpgrades } from './upgrades'
import { spawnsDue, xpForLevel } from './waves'
import {
    buildTimeline, firstPlayable, heightProgress, isPlayable, nextPlayable, resolveEpoch, sortedEpochs, transitionStage,
} from './epochs'
import { formatRange, formatYear, yearAt } from './time'
import { activeForm, applyForm, canEat, canEatEnemy, playerSize, rangedActive, weaponKind, weaponLabel } from './weapon'
import { bodyFor, groundFor, outfitFor, SHAPES } from './appearance'
import { ART_KEYS } from '../game/art/microbes'
import { hasStageArt, propCount } from '../game/art/backgrounds'
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

    it('meldet fehlende Höhe, falsche Zeiten und Codes', () => {
        const d = rawData()
        delete d.epochs[0].height
        d.epochs[1].fromYear = 0
        d.epochs[1].toYear = -1
        d.epochs[2].code = '9.9'
        const errors = validateData(d).join('\n')
        expect(errors).toContain('height fehlt')
        expect(errors).toContain('fromYear muss vor toYear')
        expect(errors).toContain('code „9.9“')
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
            ['stoffwechsel', 'archaee'], ['photosynthese', 'sauerstoff-ueberlebender'], ['endosymbiose', 'mitochondrien'],
            ['kolonien', 'kragengeissel-kolonie'], ['mehrzeller', 'gewebe-nerven'], ['kambrium', 'chorda'], ['landgang', 'kiefer-knochen'],
            ['landwirbeltiere', 'vierbeiner'], ['dinosaurier', 'krokodil-linie'], ['saeugetiere', 'krokodil-ueberlebt'],
            ['primaten', 'gruppenleben'], ['hominiden', 'werkzeugnutzer'], ['jaeger-sammler', 'feuer-sprache'],
            ['zivilisation', 'ackerbau-schrift'], ['erdorbit', 'satelliten'], ['mond-mars', 'mondstation'], ['tiefraum', 'krokodil-astronauten'],
        ]
        for (const [stage, id] of path) {
            const choice = availableEvolutions(all, stage, tags).find(o => o.id === id)
            expect(choice, `${id} in ${stage}`).toBeDefined()
            tags = applyEvolution(tags, choice!)
        }
        for (const t of ['reptil', 'krokodil', 'räuber', 'raumfahrt', 'krokodil-astronaut']) expect(tags.has(t)).toBe(true)
    })

    it('die echte Zeitlinie ist immer durchspielbar (bis heute genau eine echte Option je Stufe)', () => {
        const d = rawData()
        let tags = new Set<string>()
        for (const e of sortedEpochs(d.epochs).slice(1)) {
            const offered = availableEvolutions(d.evolutionOptions, e.id, tags)
            const real = offered.filter(o => o.real)
            expect(offered.length, `${e.id}: echte Zeitlinie braucht eine Alternative`).toBeGreaterThanOrEqual(2)
            if (e.fromYear < 2026) expect(real.map(o => o.id), e.id).toHaveLength(1)
            else expect(real, e.id).toHaveLength(0)
            tags = applyEvolution(tags, real[0] ?? offered.find(o => o.general)!)
        }
        expect(tags.has('raumfahrt')).toBe(true)
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

describe('Stufen (18 nach der Vorlage)', () => {
    const data = rawData()

    it('18 Stufen 1.1–6.3, alle spielbar, Reihenfolge stimmt', () => {
        const list = sortedEpochs(data.epochs)
        expect(list.map(e => e.code)).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3',
            '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '6.1', '6.2', '6.3'])
        expect(list.every(isPlayable)).toBe(true)
        expect(firstPlayable(data.epochs)?.code).toBe('1.1')
        expect(nextPlayable(data.epochs, 'urzellen')?.code).toBe('1.2')
        expect(nextPlayable(data.epochs, 'tiefraum')).toBeUndefined()
        expect(transitionStage(data.epochs, 'urzellen')?.id).toBe('stoffwechsel')
    })

    it('Zeiträume wie in der Vorlage', () => {
        const by = Object.fromEntries(data.epochs.map(e => [e.code, e]))
        const range = (c: string) => [by[c].fromYear, by[c].toYear]
        expect(range('1.1')).toEqual([-4e9, -3.8e9])
        expect(range('1.3')).toEqual([-2.7e9, -2.0e9])
        expect(range('2.3')).toEqual([-800e6, -540e6])
        expect(range('3.1')).toEqual([-541e6, -485e6])
        expect(range('3.2')).toEqual([-470e6, -400e6])
        expect(range('4.1')).toEqual([-320e6, -66e6])
        expect(range('4.3')).toEqual([-55e6, -6e6])
        expect(range('5.2')).toEqual([-1.8e6, -10000])
        expect(range('5.3')).toEqual([-10000, 1957])
        expect(range('6.1')).toEqual([1957, 2026])
    })

    it('Boss nur am Ende jeder Hauptphase', () => {
        expect(sortedEpochs(data.epochs).filter(e => e.boss).map(e => e.code)).toEqual(['1.3', '2.3', '3.3', '4.3', '5.3', '6.3'])
    })

    it('jede Stufe ab 1.2 hat mindestens 2 Optionen, eine davon allgemein', () => {
        for (const e of sortedEpochs(data.epochs).slice(1)) {
            expect(data.evolutionOptions.filter(o => o.stage === e.id).length, e.id).toBeGreaterThanOrEqual(2)
            expect(availableEvolutions(data.evolutionOptions, e.id, new Set()).some(o => o.general), e.id).toBe(true)
        }
    })

    it('Varianten ändern Name, Farben und Wellen', () => {
        const e = { ...data.epochs[0], variants: [{ id: 'v', name: 'Variante', requires: ['x'], background: '#000000', extraWaves: [data.epochs[0].waves[0]] }] }
        expect(resolveEpoch(e, new Set()).variantId).toBeUndefined()
        const r = resolveEpoch(e, new Set(['x']))
        expect(r.variantId).toBe('v')
        expect(r.name).toBe('Variante')
        expect(r.waves.length).toBe(e.waves.length + 1)
    })

    it('Höhe: 0 am Start, 1 am Ziel, begrenzt', () => {
        expect(heightProgress(1000, 1000, 500)).toBe(0)
        expect(heightProgress(1000, 750, 500)).toBe(0.5)
        expect(heightProgress(1000, 0, 500)).toBe(1)
        expect(heightProgress(1000, 1200, 500)).toBe(0)
    })

    it('Zeitstrahl: gespielt, aktuell, kommend + Wahl', () => {
        const arch = data.evolutionOptions.find(o => o.id === 'archaee')!
        const tl = buildTimeline(data.epochs, 'photosynthese', ['urzellen', 'stoffwechsel'], { stoffwechsel: arch })
        const by = Object.fromEntries(tl.map(t => [t.id, t]))
        expect(by.urzellen.status).toBe('done')
        expect(by.stoffwechsel.status).toBe('done')
        expect(by.stoffwechsel.choice).toBe('Archaee')
        expect(by.photosynthese.status).toBe('current')
        expect(by.tiefraum.status).toBe('future')
    })
})

describe('Zeitangaben', () => {
    it('Jahr läuft gleichmäßig mit dem Fortschritt', () => {
        expect(yearAt(-4e9, -3.8e9, 0)).toBe(-4e9)
        expect(yearAt(-4e9, -3.8e9, 0.5)).toBe(-3.9e9)
        expect(yearAt(-4e9, -3.8e9, 2)).toBe(-3.8e9)
    })

    it('Anzeige in Mrd./Mio./Jahren, v. Chr., Jahreszahl, Zukunft', () => {
        expect(formatYear(-3.42e9)).toBe('vor 3,42 Mrd. Jahren')
        expect(formatYear(-480e6)).toBe('vor 480 Mio. Jahren')
        expect(formatYear(-55e6)).toBe('vor 55,0 Mio. Jahren')
        expect(formatYear(-3.2e6)).toBe('vor 3,20 Mio. Jahren')
        expect(formatYear(-300000)).toBe('vor 302.000 Jahren')
        expect(formatYear(-9500)).toBe('9.500 v. Chr.')
        expect(formatYear(1969.4)).toBe('1969')
        expect(formatYear(2400)).toBe('ferne Zukunft')
    })

    it('Zeitraum fasst gleiche Einheiten zusammen', () => {
        expect(formatRange(-4e9, -3.8e9)).toBe('vor 4,00 – 3,80 Mrd. Jahren')
        expect(formatRange(-800e6, -540e6)).toBe('vor 800 – 540 Mio. Jahren')
        expect(formatRange(-2.0e9, -1.5e9)).toBe('vor 2,00 – 1,50 Mrd. Jahren')
        expect(formatRange(-1.8e6, -10000)).toBe('vor 1,80 Mio. Jahren – vor 12.000 Jahren')
        expect(formatRange(-10000, 1957)).toBe('vor 12.000 Jahren – 1957')
        expect(formatRange(2055, 2300)).toBe('2055 – ferne Zukunft')
    })
})

describe('Waffen je Stufe & Fressen', () => {
    const data = rawData()
    const gene = data.genes.find(g => g.id === data.startGene)!
    const base = { maxHp: 50, moveSpeed: 100, pickupRadius: 50, xpGain: 1, regen: 0, ...gene.base }

    it('Form gilt ab ihrer Stufe, bis die nächste kommt', () => {
        expect(activeForm(gene, data.epochs, 'urzellen')?.name).toBe('Toxin')
        expect(activeForm(gene, data.epochs, 'mehrzeller')?.name).toBe('Toxin')
        expect(activeForm(gene, data.epochs, 'kambrium')?.name).toBe('Stachel')
        expect(activeForm(gene, data.epochs, 'landgang')?.name).toBe('Stachel')
        expect(activeForm(gene, data.epochs, 'saeugetiere')?.name).toBe('Klauen')
        expect(activeForm(gene, data.epochs, 'tiefraum')?.name).toBe('Laser')
        expect(weaponKind(gene, activeForm(gene, data.epochs, 'landwirbeltiere'))).toBe('melee')
        expect(weaponKind(gene, activeForm(gene, data.epochs, 'erdorbit'))).toBe('beam')
    })

    it('Phase 1–2: fressen, Fernwaffe erst mit Toxin; ab Phase 3 immer', () => {
        expect(canEat(gene, 1)).toBe(true)
        expect(canEat(gene, 2)).toBe(true)
        expect(canEat(gene, 3)).toBe(false)
        expect(rangedActive(gene, 1, new Set())).toBe(false)
        expect(rangedActive(gene, 1, new Set(['toxin']))).toBe(true)
        expect(rangedActive(gene, 3, new Set())).toBe(true)
        expect(weaponLabel(gene, activeForm(gene, data.epochs, 'urzellen'), 1, new Set())).toBe('Fressen')
        expect(weaponLabel(gene, activeForm(gene, data.epochs, 'urzellen'), 1, new Set(['toxin']))).toBe('Fressen + Toxin')
        expect(weaponLabel(gene, activeForm(gene, data.epochs, 'jaeger-sammler'), 5, new Set())).toBe('Speer')
    })

    it('man wächst mit dem Level und frisst nur Kleinere, nie Bosse', () => {
        expect(playerSize(1, true)).toBe(32)
        expect(playerSize(50, true)).toBe(48)
        expect(playerSize(5, false)).toBe(20)
        expect(canEatEnemy(32, 20, false)).toBe(true)
        expect(canEatEnemy(32, 34, false)).toBe(false)
        expect(canEatEnemy(48, 46, false)).toBe(true)
        expect(canEatEnemy(48, 84, true)).toBe(false)
    })

    it('Faktoren der Form wirken auf die Werte', () => {
        const s = applyForm(base, gene.forms['zivilisation'])
        expect(s.damage).toBeCloseTo(3 * 1.6)
        expect(s.range).toBeCloseTo(230 * 1.4)
        expect(s.projectiles).toBe(2)
        expect(applyForm(base, undefined)).toBe(base)
    })

    it('Upgrades nur in ihren Phasen; Toxin-Ausstoß schaltet Stärkeres Toxin frei', () => {
        const ids = (phase: number, tags = new Set<string>()) => eligibleUpgrades(data.upgrades, {}, tags, phase).map(u => u.id)
        expect(ids(1)).toContain('toxin')
        expect(ids(1)).not.toContain('staerkeres-toxin')
        expect(ids(1, new Set(['toxin']))).toContain('staerkeres-toxin')
        expect(ids(1, new Set(['toxin']))).not.toContain('toxin')
        expect(ids(5)).toContain('ausdauerlauf')
        expect(ids(5)).not.toContain('geissel')
        expect(ids(6)).toContain('anpassung')
        for (let p = 1; p <= 6; p++) expect(ids(p).length, `Phase ${p}`).toBeGreaterThanOrEqual(5)
    })
})

describe('Aussehen', () => {
    const t = (...tags: string[]) => new Set(tags)

    it('Körper folgt Phase und Evolution', () => {
        expect(bodyFor(1, '1.2', t())).toBe('cell')
        expect(bodyFor(2, '2.3', t())).toBe('colony')
        expect(bodyFor(3, '3.1', t())).toBe('fish')
        expect(bodyFor(3, '3.3', t('vierbeiner'))).toBe('tetrapod')
        expect(bodyFor(3, '3.2', t('gliederfüsser'))).toBe('arthropod')
        expect(bodyFor(4, '4.1', t('vierbeiner', 'synapside'))).toBe('mammal')
        expect(bodyFor(4, '4.1', t('vierbeiner', 'krokodil', 'reptil'))).toBe('reptile')
        expect(bodyFor(4, '4.2', t('dinosaurier', 'vogel'))).toBe('bird')
        expect(bodyFor(5, '5.1', t('säuger', 'primat'))).toBe('human')
        expect(bodyFor(6, '6.3', t('krokodil', 'raumfahrt'))).toBe('reptile')   // Krokodil-Astronaut
    })

    it('echte Zeitlinie wird zum Menschen, Ausrüstung je Epoche', () => {
        const d = rawData()
        let tags = new Set<string>()
        for (const e of sortedEpochs(d.epochs).slice(1)) {
            const real = availableEvolutions(d.evolutionOptions, e.id, tags).find(o => o.real)
            if (real) tags = applyEvolution(tags, real)
        }
        expect(bodyFor(5, '5.3', tags)).toBe('human')
        expect(outfitFor('5.1')).toBe('none')
        expect(outfitFor('5.2')).toBe('cloak')
        expect(outfitFor('5.3')).toBe('tunic')
        expect(outfitFor('6.2')).toBe('suit')
        // Wege/Pflaster erst ab Sesshaftigkeit, vorher Grasland
        expect(groundFor(5, '5.1')).toBe('ground4')
        expect(groundFor(5, '5.3')).toBe('ground5')
        expect(groundFor(6, '6.1')).toBe('ground6')
    })

    it('jeder Gegner und Boss hat eine bekannte Form', () => {
        for (const e of rawData().epochs) {
            for (const x of [...e.enemies, ...(e.boss ? [e.boss] : [])]) expect(SHAPES, x.id).toContain(x.shape)
        }
    })
})

describe('Paket 1: Figuren Phase 1–2', () => {
    it('jeder Gegner und Boss in Phase 1–2 hat eine vorhandene Figur', () => {
        for (const e of rawData().epochs.filter(x => x.phase <= 2)) {
            for (const x of [...e.enemies, ...(e.boss ? [e.boss] : [])]) expect(ART_KEYS, `${e.id}/${x.id}`).toContain(x.art)
        }
    })

    it('jede Stufe in Phase 1–2 hat einen eigenen Hintergrund mit Deko', () => {
        for (const e of rawData().epochs.filter(x => x.phase <= 2)) {
            expect(hasStageArt(e.id), e.id).toBe(true)
            expect(propCount(e.id), e.id).toBeGreaterThanOrEqual(2)
        }
    })

    it('Hauptfigur frisst am Anfang nur die Kleinen, Mittlere ab Level 3', () => {
        const [small, mid, big] = rawData().epochs[0].enemies.map(x => x.size)
        expect(canEatEnemy(playerSize(1, true), small, false)).toBe(true)
        expect(canEatEnemy(playerSize(1, true), mid, false)).toBe(false)
        expect(canEatEnemy(playerSize(3, true), mid, false)).toBe(true)
        expect(canEatEnemy(playerSize(1, true), big, false)).toBe(false)
    })
})
