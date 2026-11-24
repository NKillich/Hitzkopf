// Spielwelt: Spieler, Gegner-Wellen (Pool), Auto-Attack, XP-Kristalle, Level-up,
// Höhe pro Epoche → Boss am oberen Ende → Evolutionswahl → nächste Epoche.
import Phaser from 'phaser'
import type { EnemyType, Epoch, EvolutionOption, Gene, GameData, GeneForm, PlayerStats, Stat, Upgrade, WeaponKind } from '../../logic/types'
import { applyBreakthroughs, computeStats, pickUpgrades, splitDescription, type OwnedUpgrades } from '../../logic/upgrades'
import { spawnsDue, xpForLevel } from '../../logic/waves'
import { availableEvolutions, applyEvolution } from '../../logic/evolution'
import { formatRange, formatYear, PRESENT_YEAR, shortYear, yearAt } from '../../logic/time'
import { BIGBANG_DEPTH, BIGBANG_STATIONS, bigBangYear } from '../../logic/bigbang'
import { activeForm, applyForm, canEat, canEatEnemy, playerSize, rangedActive, weaponKind, weaponLabel } from '../../logic/weapon'
import {
    buildTimeline, firstPlayable, heightProgress, nextPlayable, resolveEpoch, sortedEpochs, transitionStage, type TimelineEntry,
} from '../../logic/epochs'
import {
    BITE_COOLDOWN_MS, DIGEST_MS, EAT_REACH, BOSS_TRIGGER_DISTANCE, CLEAR_DELAY_MS, HEIGHT, HIT_COOLDOWN_MS, MAX_ENEMIES, MAX_GEMS, MAX_PROJECTILES,
    PLAYER_BASE, PLAYER_SIZE, RECYCLE_BELOW, RES, VIEW_OX, VIEW_OY, WIDTH, hexToInt, smoothTexts,
} from '../config'
import { Joystick } from '../Joystick'
import { saveBest, type IconKey, type OwnedUpgradeView, type UiBridge } from '../bridge'
import { bodyFor, groundFor, outfitFor, PLAYER_TINT, type Shape } from '../../logic/appearance'
import { outfitKey, shapeKey } from '../sprites'
import { HERO_BODY_KEYS, heroKey, microbeBody, mobKey, stageFormBody } from '../art/microbes'
import {
    hasStageArt, isLightStage, particleKey, particleKindFor, propCount, propKey, tileFactorFor, tileKey, type ParticleKind,
} from '../art/backgrounds'
import { realPathTo, teleportLevel } from '../../logic/teleport'

class Enemy extends Phaser.Physics.Arcade.Image {
    declare body: Phaser.Physics.Arcade.Body
    kind!: EnemyType
    hp = 0
    flashUntil = 0
    isBoss = false
    /** Phase für das seitliche Schlingern treibender Gegner */
    wobble = 0
    /** farbige Figur (kein Tint) – zeigt Bild 0/1 */
    animFrame = -1
}

class Shot extends Phaser.Physics.Arcade.Image {
    declare body: Phaser.Physics.Arcade.Body
    damage = 0
    pierceLeft = 0
    expireAt = 0
    readonly hit = new Set<Enemy>()
}

const ICON_BY_STAT: Record<Stat, IconKey> = {
    moveSpeed: 'speed', maxHp: 'heart', damage: 'damage', cooldown: 'cooldown', range: 'range', projectileSpeed: 'range',
    xpGain: 'xp', projectiles: 'multi', pierce: 'pierce', regen: 'regen', pickupRadius: 'magnet',
}
/** Upgrades mit diesen Werten zählen als „Waffe“, alle anderen als „Passiv“. */
const WEAPON_STATS = new Set<Stat>(['damage', 'cooldown', 'range', 'projectileSpeed', 'projectiles', 'pierce'])
const ICON_BY_PHASE: IconKey[] = ['cell', 'colony', 'fish', 'paw', 'tool', 'rocket']
/** So oft pro Sekunde bekommt der HUD neue Werte (React muss nicht jedes Bild neu zeichnen). */
const HUD_INTERVAL_MS = 100
/** Sichtbarkeit der Bodenkachel (Rest = dunkle Grundfarbe der Stufe) */
const BG_ALPHA = 0.5
/** Abstand (px) über dem Stufenstart: Unterkante des Stufennamens bzw. des ersten Textes */
const FLOOR_TITLE_ABOVE = 140
const FLOOR_TEXT1_ABOVE = 300
/** Hintergrund blendet über diese Strecke (px) vor und nach jeder Stufengrenze über – in beide Richtungen. */
const BG_BLEND = 300
const FONT_UI = '"Pixelify Sans", ui-monospace, monospace'
const FONT_NUM = '"Silkscreen", ui-monospace, monospace'
const ONBOARD_KEY = 'ages_up_onboard_v1'
const BIGBANG_KEY = 'ages_up_bigbang_v1'

function storageGet(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}
function storageSet(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* privat/gesperrt */ }
}

/** Symbol eines Upgrades (Toxin hat ein eigenes, sonst nach dem ersten Wert). */
function upgradeIcon(u: Upgrade): IconKey {
    return u.grants?.includes('toxin') ? 'toxin' : ICON_BY_STAT[u.effects[0]?.stat ?? 'damage']
}

class Gem extends Phaser.GameObjects.Image {
    value = 0
    magnet = false
}

/** climb = nach oben kämpfen, boss = Boss ist da, cleared = Boss besiegt (gleich kommt die Wahl) */
export type EpochPhase = 'climb' | 'boss' | 'cleared'

export interface RunInfo {
    epoch: Epoch
    weaponName: string
    timeSec: number
    level: number
    xp: number
    xpNeeded: number
    hp: number
    stats: PlayerStats
    kills: number
    enemiesAlive: number
    /** geschaffte Höhe der aktuellen Epoche, 0…1 */
    progress: number
    phase: EpochPhase
    boss: { name: string; hp: number; maxHp: number } | null
    /** gewählte Evolutionen in Reihenfolge */
    path: EvolutionOption[]
    /** aktuelles Jahr (Kalenderjahr, negativ = v. Chr.) – läuft mit der Höhe */
    year: number
    dead: boolean
    won: boolean
}

export class GameScene extends Phaser.Scene {
    private gd!: GameData
    /** Epoche wie in den Daten (ohne Variante) – für den Ablauf */
    private baseEpoch!: Epoch
    /** mit Variante – für Gegner, Wellen, Farben */
    private epoch!: Epoch
    private gene!: Gene
    private enemyTypes = new Map<string, EnemyType>()

    private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
    /** Ausrüstung der Epoche (Umhang, Kleidung, Raumanzug) über dem Körper */
    private outfitImg!: Phaser.GameObjects.Image
    private body_: Shape = 'cell'
    private hpBarBg!: Phaser.GameObjects.Image
    private hpBarFill!: Phaser.GameObjects.Image
    private bg!: Phaser.GameObjects.TileSprite
    /** Hintergrund der nächsten Stufe – wird am Ende der Stufe eingeblendet */
    private bgNext!: Phaser.GameObjects.TileSprite
    /** Parallax: Schwebeteilchen nah über dem Boden (1,35×) und ganz vorn (1,8×) */
    private nearA!: Phaser.GameObjects.TileSprite
    private nearB!: Phaser.GameObjects.TileSprite
    private particleKind: ParticleKind = 'water'
    /** wie schnell die Bodenkachel mitzieht (1 = fest mit der Welt, im All langsamer) */
    private bgFactor = 1
    private bgNextFactor = 1
    /** Hintergrund nach Höhe: vorige Stufe (zum Zurückschwimmen) und nächste Stufe */
    private prevEpoch: Epoch | null = null
    private nextEpoch: Epoch | null = null
    private bgLowId = ''
    private bgHighId = ''
    /** Anzahl Evolutionen (Durchbrüche) – jede stärkt Schaden und Leben dauerhaft */
    private breakthroughs = 0
    /** Onboarding beim ersten Run: 0 = schwimmen lernen, 1 = fressen, 2 = nach oben, 3 = fertig */
    private onboard = 3
    private onboardAt = 0
    private movedMs = 0
    /** Easter Egg „Urknall“: schon erreicht in diesem Run */
    private bigBangDone = false
    /** bis dahin überschreibt das Onboarding keinen anderen Hinweis */
    private hintLockUntil = 0
    /** Hauptfigur (Phase 1–2): Bild 0/1 */
    private heroFrame = 0
    private heroFrameAt = 0
    private finishLine!: Phaser.GameObjects.TileSprite
    private finishText!: Phaser.GameObjects.Text
    private joystick!: Joystick
    private readonly move = new Phaser.Math.Vector2()

    private enemyGroup!: Phaser.Physics.Arcade.Group
    private shotGroup!: Phaser.Physics.Arcade.Group
    private enemies: Enemy[] = []
    private shots: Shot[] = []
    private gems: Gem[] = []
    private enemyCursor = 0

    // Laufzeit-Zustand
    private timeMs = 0
    private epochTimeMs = 0
    private epochStartY = 0
    private endY = 0
    private clearedAt = 0
    private boss: Enemy | null = null
    private fireTimer = 0
    private invulnUntil = 0
    private owned: OwnedUpgrades = {}
    private tags = new Set<string>()
    private visited: string[] = []
    private choices: Record<string, EvolutionOption> = {}
    private pendingLevelUps = 0
    private choosing = false
    // Waffe der aktuellen Stufe
    private form: GeneForm | undefined
    private wstats!: PlayerStats
    private wkind: WeaponKind = 'projectile'
    private ranged = true
    private eating = false
    private playerSz = PLAYER_SIZE
    private biteReadyAt = 0
    private eatReadyAt = 0
    /** höchste erreichte Höhe in der Stufe (px) – Wellen kommen nur beim Hochkämpfen */
    private climbMax = 0
    /** Lineal + Bodentexte der aktuellen und der vorigen Stufe */
    private worldObjs: Phaser.GameObjects.GameObject[] = []
    private prevWorldObjs: Phaser.GameObjects.GameObject[] = []
    /** Effekte für Nahkampf/Strahl (werden pro Bild neu gezeichnet) */
    private fx!: Phaser.GameObjects.Graphics
    private effects: { kind: 'ring' | 'line'; x: number; y: number; x2: number; y2: number; r: number; until: number; color: number }[] = []
    /** Raster für das Abstoßen der Gegner untereinander */
    private readonly grid = new Map<number, Enemy[]>()
    // Oberfläche (React) über die Brücke
    private offeredUpgrades: Upgrade[] = []
    private offeredEvos: EvolutionOption[] = []
    private rerolls = 1
    private lastHudAt = -Infinity
    private bannerId = 0
    run!: RunInfo

    constructor() { super('game') }

    create() {
        this.gd = this.registry.get('data') as GameData
        this.gene = this.gd.genes.find(g => g.id === this.gd.startGene)!

        this.timeMs = 0
        this.fireTimer = 0
        this.invulnUntil = 0
        this.owned = {}
        this.tags = new Set()
        this.visited = []
        this.choices = {}
        this.pendingLevelUps = 0
        this.choosing = false
        this.enemyCursor = 0
        this.boss = null
        this.effects = []
        this.rerolls = 1
        this.eatReadyAt = 0
        this.worldObjs = []
        this.prevWorldObjs = []
        this.prevEpoch = null
        this.nextEpoch = null
        this.bgLowId = ''
        this.bgHighId = ''
        this.breakthroughs = 0
        this.bigBangDone = false
        this.hintLockUntil = 0
        this.movedMs = 0
        this.onboard = storageGet(ONBOARD_KEY) ? 3 : 0
        this.onboardAt = 0
        this.lastHudAt = -Infinity
        this.offeredUpgrades = []
        this.offeredEvos = []
        const stats = computeStats(PLAYER_BASE, this.gene.base, this.gd.upgrades, this.owned)
        const first = firstPlayable(this.gd.epochs)!
        this.run = {
            epoch: first, weaponName: this.gene.name, timeSec: 0, level: 1, xp: 0,
            xpNeeded: xpForLevel(1), hp: stats.maxHp, stats, kills: 0, enemiesAlive: 0,
            progress: 0, phase: 'climb', boss: null, path: [], year: first.fromYear, dead: false, won: false,
        }

        this.physics.resume()   // nach Neustart war die Welt evtl. noch angehalten
        const cam = this.cameras.main
        // doppelte Auflösung: Zoom 2, Welt bleibt 390 breit
        cam.setZoom(RES)
        cam.setBounds(0, -1e8, WIDTH, 2e8)
        // Boden gedämpft: blendet zur dunklen Grundfarbe der Stufe hin, damit sich Gegner gut abheben.
        // bg = untere Stufe, bgNext = obere Stufe an der nächstgelegenen Grenze (Überblendung nach Höhe)
        const screen = (depth: number, alpha: number) => this.add.tileSprite(VIEW_OX, VIEW_OY, WIDTH, HEIGHT, 'grid')
            .setOrigin(0).setScrollFactor(0).setDepth(depth).setAlpha(alpha)
        this.bg = screen(-10, BG_ALPHA)
        this.bgNext = screen(-9.5, 0)
        this.nearA = screen(3, 0.35)
        this.nearB = screen(20, 0.14)
        this.finishLine = this.add.tileSprite(0, 0, WIDTH, 8, 'finish').setOrigin(0, 1).setDepth(-5)
        this.finishText = this.add.text(WIDTH / 2, 0, '', {
            fontFamily: '"Pixelify Sans", ui-monospace, monospace', fontSize: '13px', color: '#ffffff', resolution: 2,
        }).setOrigin(0.5, 0).setAlpha(0.7).setDepth(-5)
        smoothTexts([this.finishText])

        this.player = this.physics.add.image(WIDTH / 2, 0, shapeKey('cell')).setCollideWorldBounds(true).setDepth(10)
        this.outfitImg = this.add.image(0, 0, shapeKey('cell')).setDepth(10.5).setVisible(false)
        this.hpBarBg = this.add.image(0, 0, 'bar').setDisplaySize(20, 3).setTint(0x400000).setDepth(11)
        this.hpBarFill = this.add.image(0, 0, 'bar').setOrigin(0, 0.5).setDisplaySize(20, 3).setTint(0x4cff6a).setDepth(12)
        cam.startFollow(this.player, true, 1, 0.12)   // Spieler genau in der Bildmitte

        this.joystick = new Joystick(this)
        this.fx = this.add.graphics().setDepth(9)

        // Pools vorab anlegen, damit beim Spielen nichts neu erzeugt wird
        this.enemyGroup = this.physics.add.group({ classType: Enemy, maxSize: MAX_ENEMIES })
        this.enemies = []
        for (let i = 0; i < MAX_ENEMIES; i++) {
            const e = this.enemyGroup.create(0, 0, 'px') as Enemy
            e.disableBody(true, true)
            this.enemies.push(e)
        }
        this.shotGroup = this.physics.add.group({ classType: Shot, maxSize: MAX_PROJECTILES })
        this.shots = []
        for (let i = 0; i < MAX_PROJECTILES; i++) {
            const s = this.shotGroup.create(0, 0, 'shot') as Shot
            s.setDepth(8)
            s.disableBody(true, true)
            this.shots.push(s)
        }
        this.gems = []
        for (let i = 0; i < MAX_GEMS; i++) {
            const g = new Gem(this, 0, 0, 'gem')
            g.setActive(false).setVisible(false).setDepth(5)
            this.add.existing(g)
            this.gems.push(g)
        }

        this.physics.add.overlap(this.shotGroup, this.enemyGroup, (a, b) => this.onShotHit(a as unknown as Shot, b as unknown as Enemy))
        this.physics.add.overlap(this.player, this.enemyGroup, (_p, e) => this.onPlayerHit(e as unknown as Enemy))

        this.startEpoch(first)
        cam.centerOn(this.player.x, this.player.y)

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.joystick.destroy())
        this.registerActions()
        this.bridge.set({ screen: 'run', overlay: null, banner: null, hint: null })
        this.publishHud()
    }

    private get bridge(): UiBridge {
        return this.registry.get('bridge') as UiBridge
    }

    /** Aktionen, die die Oberfläche auslösen kann. */
    private registerActions() {
        const b = this.bridge
        b.actions.pickUpgrade = (i: number) => { const u = this.offeredUpgrades[i]; if (u) this.chooseUpgrade(u) }
        b.actions.reroll = () => this.reroll()
        b.actions.pickEvolution = (i: number) => { const o = this.offeredEvos[i]; if (o) this.chooseEvolution(o) }
        b.actions.pause = () => this.pauseRun()
        b.actions.resume = () => this.resumeRun()
        b.actions.restart = () => this.restartRun()
        b.actions.toMenu = () => this.toMenu()
        b.actions.debugBurst = () => this.spawnBurst(300)
        b.actions.debugGoal = () => this.skipToGoal()
        b.actions.teleport = (id: string, at: number) => this.teleport(id, at)
        b.actions.continueEvolution = () => this.continueEvolution()
    }

    private publishHud() {
        this.lastHudAt = this.timeMs
        const tl = this.timeline()
        const idx = tl.findIndex(t => t.status === 'current')
        this.bridge.set({
            hud: {
                code: this.epoch.code,
                name: this.epoch.shortName,
                year: formatYear(this.run.year),
                weapon: this.run.weaponName,
                hp: Math.max(0, this.run.hp),
                maxHp: this.run.stats.maxHp,
                level: this.run.level,
                xpFrac: Math.min(1, this.run.xp / this.run.xpNeeded),
                xp: Math.floor(this.run.xp),
                xpNeeded: this.run.xpNeeded,
                timeSec: this.run.timeSec,
                kills: this.run.kills,
                tags: [...this.tags].slice(-4),
                progress: this.run.progress,
                stageIndex: idx + 1,
                stageCount: tl.length,
                timeline: tl.map(t => ({ code: t.code, status: t.status, real: !!this.choices[t.id]?.real })),
                boss: this.boss?.active ? { name: this.boss.kind.name, frac: Math.max(0, this.boss.hp) / this.boss.kind.hp } : null,
                fps: Math.round(this.game.loop.actualFps),
                enemies: this.run.enemiesAlive,
                owned: this.ownedView(),
            },
        })
    }

    /** Bisherige Upgrades mit Level für die Leiste unten (Reihenfolge wie gewählt). */
    private ownedView(): OwnedUpgradeView[] {
        const out: OwnedUpgradeView[] = []
        for (const [id, level] of Object.entries(this.owned)) {
            const u = this.gd.upgrades.find(x => x.id === id)
            if (u && level > 0) out.push({ id, name: u.name, icon: upgradeIcon(u), level, maxLevel: u.maxLevel })
        }
        return out
    }

    private pauseRun() {
        if (this.choosing || this.run.dead || this.run.won || this.scene.isPaused()) return
        this.joystick.release()
        this.scene.pause()
        this.publishHud()
        const stages = this.bridge.getState().debug
            ? sortedEpochs(this.gd.epochs).filter(e => e.enemies.length > 0)
                .map(e => ({ id: e.id, code: e.code, name: e.shortName, phase: e.phase, boss: !!e.boss }))
            : undefined
        this.bridge.setOverlay({ type: 'pause', stages })
    }

    private resumeRun() {
        if (this.bridge.getState().overlay?.type !== 'pause') return
        this.bridge.setOverlay(null)
        this.scene.resume()
    }

    private toMenu() {
        this.bridge.set({ screen: 'start', overlay: null, hud: null, banner: null })
        this.scene.stop()
    }

    /** Neue Epoche ab der aktuellen Position des Spielers. */
    private startEpoch(base: Epoch) {
        this.prevEpoch = this.epoch ?? null
        this.baseEpoch = base
        this.epoch = resolveEpoch(base, this.tags)
        this.visited.push(base.id)
        this.enemyTypes = new Map(this.epoch.enemies.map(e => [e.id, e]))
        this.epochTimeMs = 0
        this.boss = null

        const following = nextPlayable(this.gd.epochs, base.id)
        this.nextEpoch = following ? resolveEpoch(following, this.tags) : null
        this.bgLowId = ''
        this.bgHighId = ''

        // Waffe nimmt die Form der Stufe an (gilt bis zur nächsten Form)
        this.form = activeForm(this.gene, this.gd.epochs, base.id)
        const tint = hexToInt(this.form?.color ?? '#ffffff')
        for (const s of this.shots) s.setTint(tint)
        this.refreshWeapon()
        this.refreshAppearance()

        this.epochStartY = this.player.y
        this.endY = this.epochStartY - (this.epoch.height ?? 5000)
        this.physics.world.setBounds(0, -1e8, WIDTH, 2e8)
        // Ziellinie: goldener Balken mit Schild (wird in buildStageWorld gezeichnet)
        this.finishLine.setVisible(false)
        this.finishText.setVisible(false)
        this.climbMax = 0
        this.buildStageWorld()
        this.updateBackground(this.player.y)

        this.run.epoch = this.epoch
        this.run.phase = 'climb'
        this.run.progress = 0
        this.run.boss = null
    }

    /**
     * Boden der Stufe: Zeitstrahl als Lineal am linken Rand, Stufenname am Anfang, Beschreibungstexte
     * (Anfang + Mitte) und oben die goldene Linie mit Schild zur nächsten Stufe. Alles liegt unter
     * Figur und Gegnern; scharf, weil das Spielbild in doppelter Auflösung gezeichnet wird.
     */
    private buildStageWorld() {
        for (const o of this.prevWorldObjs) o.destroy()
        this.prevWorldObjs = this.worldObjs
        this.worldObjs = []
        const e = this.epoch
        const h = e.height ?? 5000
        const bottom = Math.round(this.epochStartY)
        const top = bottom - h
        const light = isLightStage(e.id)
        const ink = light ? '#1a1f24' : '#F4EEDC'
        const inkNum = light ? 0x1a1f24 : 0xf4eedc
        const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.worldObjs.push(o); return o }
        const txt = (x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) =>
            add(this.add.text(x, y, text, { fontFamily: FONT_UI, resolution: RES, ...style }).setDepth(-4))

        const g = add(this.add.graphics().setDepth(-6))
        g.fillStyle(inkNum, 0.16).fillRect(6, top, 2, h)
        for (let i = 0; i <= 20; i++) {
            const y = Math.round(bottom - (h * i) / 20)
            const major = i % 5 === 0
            g.fillStyle(inkNum, major ? 0.32 : 0.18).fillRect(6, y - 1, major ? 12 : 6, 2)
            if (major && i < 20) {
                txt(22, y, formatYear(yearAt(e.fromYear, e.toYear, i / 20)), { fontSize: '11px', color: ink })
                    .setOrigin(0, 0.5).setAlpha(0.55)
            }
        }

        // Kasten hinter Bodentexten (dunkel, auf hellem Boden hell)
        const boxes = add(this.add.graphics().setDepth(-5))
        const box = (y0: number, y1: number) => boxes.fillStyle(light ? 0xf4f8fa : 0x0d0a12, light ? 0.6 : 0.55).fillRect(45, y0, 300, y1 - y0)
        const block = (y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) => {
            const t = txt(WIDTH / 2, y - 7, text, { align: 'center', wordWrap: { width: 280 }, lineSpacing: 4, ...style }).setOrigin(0.5, 1)
            box(t.y - t.height - 7, y)
            return t
        }

        // Stufenname + Zeitraum kurz über dem Start
        const titleBottom = bottom - FLOOR_TITLE_ABOVE
        const range = txt(WIDTH / 2, titleBottom - 7, formatRange(e.fromYear, e.toYear), {
            fontSize: '12px', color: light ? '#1e5a4a' : '#A6F7DA', align: 'center',
        }).setOrigin(0.5, 1)
        const title = txt(WIDTH / 2, range.y - range.height - 4, `${e.code} ${e.name}`, {
            fontSize: '18px', fontStyle: 'bold', color: light ? '#6a3a10' : '#FFD27A', align: 'center', wordWrap: { width: 280 },
        }).setOrigin(0.5, 1)
        box(title.y - title.height - 7, titleBottom)

        // Beschreibung: erster Text mit Abstand über dem Namen, der zweite etwa in der Mitte
        e.texts.forEach((text, i) => {
            const y = i === 0 ? bottom - FLOOR_TEXT1_ABOVE : Math.round(bottom - h * (0.62 + 0.2 * (i - 1)))
            block(y, text, { fontSize: '14px', color: ink }).setAlpha(0.92)
        })

        if (this.visited.length === 1) {
            // Onboarding (nur beim allerersten Run): Hinweis auf dem Boden über den Texten
            if (this.onboard < 3) {
                block(bottom - 470, 'Nach oben schwimmen = die Zeit läuft vorwärts. An der goldenen Linie entwickelst du dich weiter.', {
                    fontSize: '13px', color: '#FFD27A',
                })
            }
            // Easter Egg: Stationen bis zum Urknall unter dem Start der ersten Stufe
            for (const st of BIGBANG_STATIONS) {
                if (st.text) block(bottom + st.depth, `${formatYear(PRESENT_YEAR - st.ago)}\n${st.text}`, { fontSize: '13px', color: '#D9CFEA' })
            }
        }

        this.buildGoalLine(top)

        // Deko passend zur Stufe (Steine, Pflanzen, Schlote …), dezent im Hintergrund
        const props = propCount(e.id)
        if (props > 0) {
            const count = Math.floor(h / 85)
            for (let i = 0; i < count; i++) {
                const y = bottom - Math.random() * h
                const x = 18 + Math.random() * (WIDTH - 36)
                add(this.add.image(x, y, propKey(e.id, Math.floor(Math.random() * props)))
                    .setScale(2).setAlpha(0.35).setDepth(-8).setFlipX(Math.random() < 0.5))
            }
        }
        smoothTexts(this.worldObjs)
    }

    /** Goldene Linie am Ende der Stufe: Balken quer, dunkles Zinnenband darunter, Schild „↑ 1.3 Erste Zellen 3,80 MRD.“ */
    private buildGoalLine(y: number) {
        const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.worldObjs.push(o); return o }
        const g = add(this.add.graphics().setDepth(-3))
        // Zinnenband unter der Linie
        g.fillStyle(0x0d0a12, 0.45).fillRect(0, y + 4, WIDTH, 8)
        for (let x = 0; x < WIDTH; x += 16) g.fillRect(x, y + 12, 8, 8)
        // Balken: dunkle Kante, Gold, helle Oberkante
        g.fillStyle(0xb86e12, 1).fillRect(0, y - 4, WIDTH, 8)
        g.fillStyle(0xffb547, 1).fillRect(0, y - 4, WIDTH, 6)
        g.fillStyle(0xffe0a3, 1).fillRect(0, y - 4, WIDTH, 2)

        const next = this.nextEpoch
        const label = next ? `↑ ${next.code} ${next.shortName}` : '↑ Ziel'
        const name = add(this.add.text(0, 0, label, { fontFamily: FONT_UI, fontSize: '14px', fontStyle: 'bold', color: '#FFD27A', resolution: RES }))
        const year = add(this.add.text(0, 0, next ? shortYear(next.fromYear).toUpperCase() : '', {
            fontFamily: FONT_NUM, fontSize: '9px', color: '#F4EEDC', resolution: RES,
        }))
        const gap = year.text ? 8 : 0
        const w = Math.round(name.width + gap + year.width + 24)
        const hgt = 30
        const x0 = Math.round(WIDTH / 2 - w / 2)
        const chip = add(this.add.graphics().setDepth(-2))
        chip.fillStyle(0x0d0a12, 1).fillRect(x0 - 3, y - hgt / 2 - 3, w + 6, hgt + 6)
        chip.fillStyle(0xffb547, 1).fillRect(x0, y - hgt / 2, w, hgt)
        chip.fillStyle(0x2a2140, 1).fillRect(x0 + 3, y - hgt / 2 + 3, w - 6, hgt - 6)
        name.setOrigin(0, 0.5).setPosition(x0 + 12, y).setDepth(-1)
        year.setOrigin(0, 0.5).setPosition(x0 + 12 + name.width + gap, y + 1).setAlpha(0.85).setDepth(-1)
    }

    /**
     * Hintergrund nach Höhe: an der nächstgelegenen Stufengrenze blendet er über BG_BLEND px
     * von der unteren in die obere Stufe über – auch rückwärts beim Zurückschwimmen.
     */
    private updateBackground(py: number) {
        const h = this.epoch.height ?? 5000
        const upper = py < this.epochStartY - h / 2
        const low = upper ? this.epoch : (this.prevEpoch ?? this.epoch)
        const high = upper ? this.nextEpoch : this.epoch
        const boundary = upper ? this.endY : this.epochStartY
        let f = high && high !== low ? Phaser.Math.Clamp((boundary + BG_BLEND - py) / (2 * BG_BLEND), 0, 1) : 0
        f = f * f * (3 - 2 * f)   // weich
        const hi = high ?? low
        if (low.id !== this.bgLowId) {
            this.bgLowId = low.id
            this.applyBackground(this.bg, low)
            this.bgFactor = tileFactorFor(low.id)
        }
        if (hi.id !== this.bgHighId) {
            this.bgHighId = hi.id
            this.applyBackground(this.bgNext, hi)
            this.bgNextFactor = tileFactorFor(hi.id)
        }
        // Easter Egg: unter dem Start von 1.1 wird es nach und nach dunkel wie im All
        const egg = this.visited.length === 1 && !upper ? Phaser.Math.Clamp((py - this.epochStartY) / 1400, 0, 1) : 0
        this.bg.setAlpha(BG_ALPHA * (1 - f) * (1 - egg))
        this.bgNext.setAlpha(BG_ALPHA * f * (1 - egg))
        const a = Phaser.Display.Color.HexStringToColor(low.background)
        const b = Phaser.Display.Color.HexStringToColor(hi.background)
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(f * 100))
        const space = Phaser.Display.Color.HexStringToColor('#05040a')
        const d = Phaser.Display.Color.Interpolate.ColorWithColor(new Phaser.Display.Color(c.r, c.g, c.b), space, 100, Math.round(egg * 100))
        this.cameras.main.setBackgroundColor(Phaser.Display.Color.GetColor(d.r, d.g, d.b))
        // Schwebeteilchen: Art der Stufe, die gerade überwiegt (im Easter Egg Sterne)
        const kind: ParticleKind = egg > 0.4 ? 'stars' : particleKindFor((f < 0.5 ? low : hi).id)
        if (kind !== this.particleKind || !this.nearA.texture.key.startsWith('parts_')) {
            this.particleKind = kind
            this.nearA.setTexture(particleKey(kind, 0)).setTileScale(2, 2)
            this.nearB.setTexture(particleKey(kind, 1)).setTileScale(4, 4)
        }
    }

    /** Hauptfigur mit Gesicht + gelben Fühlern: Mikrobe (Phase 1–2), danach Körper je Evolution, ab 5.2 mit Ausrüstung. */
    private heroBody(): string | null {
        const e = this.baseEpoch
        if (e.phase <= 2) return microbeBody(e.id)
        const body = HERO_BODY_KEYS.includes(this.body_) ? this.body_ : 'mammal'
        const outfit = outfitFor(e.code)
        if (outfit === 'none') return stageFormBody(e.id, body) ?? body
        return `${body}-${outfit}`
    }

    private isHero(): boolean {
        return this.heroBody() !== null
    }

    /** Eigene Kachel der Stufe (farbig, doppelt groß) oder Bodenmuster in der Epochenfarbe. */
    private applyBackground(ts: Phaser.GameObjects.TileSprite, e: Epoch) {
        if (hasStageArt(e.id)) ts.setTexture(tileKey(e.id)).setTint(0xffffff).setTileScale(2, 2)
        else ts.setTexture(groundFor(e.phase, e.code)).setTint(hexToInt(e.gridColor)).setTileScale(1, 1)
    }

    /** Körper nach Phase/Evolution, Ausrüstung nach Epoche. */
    private refreshAppearance() {
        const e = this.baseEpoch
        this.body_ = bodyFor(e.phase, e.code, this.tags)
        if (this.isHero()) this.player.setTexture(heroKey(this.heroBody()!, this.heroFrame)).setTint(0xffffff)
        else this.player.setTexture(shapeKey(this.body_)).setTint(PLAYER_TINT[this.body_] ?? 0x3dcf9e)
        this.player.setDisplaySize(this.playerSz, this.playerSz)
        const outfit = outfitFor(e.code)
        const key = outfitKey(this.body_, outfit)
        const has = !this.isHero() && outfit !== 'none' && this.textures.exists(key)
        this.outfitImg.setVisible(has)
        if (has) this.outfitImg.setTexture(key)
    }

    /** Waffe, Fressen und Größe nach Stufe, Tags, Upgrades und Level neu bestimmen. */
    private refreshWeapon() {
        const phase = this.baseEpoch.phase
        this.eating = canEat(this.gene, phase)
        this.ranged = rangedActive(this.gene, phase, this.tags)
        this.wkind = weaponKind(this.gene, this.form)
        this.wstats = applyForm(this.run.stats, this.form)
        this.run.weaponName = weaponLabel(this.gene, this.form, phase, this.tags)
        this.playerSz = playerSize(this.run.level, this.eating)
        this.player.setDisplaySize(this.playerSz, this.playerSz)
    }

    /** Beginn (Jahr) einer Stufe – für die Auswertung „Echte Zeitlinie“. */
    stageFromYear(id: string): number {
        return this.gd.epochs.find(e => e.id === id)?.fromYear ?? 0
    }

    timeline(): TimelineEntry[] {
        return buildTimeline(this.gd.epochs, this.baseEpoch.id, this.visited.slice(0, -1), this.choices)
    }

    update(_time: number, deltaMs: number) {
        if (this.run.dead || this.run.won) return
        const dt = Math.min(deltaMs, 50) / 1000   // große Sprünge (Tab im Hintergrund) abfangen
        const prevEpochSec = this.epochTimeMs / 1000
        this.timeMs += dt * 1000
        this.epochTimeMs += dt * 1000
        const now = this.timeMs
        this.run.timeSec = now / 1000
        const stats = this.run.stats

        // Spieler
        this.joystick.read(this.move)
        this.player.setVelocity(this.move.x * stats.moveSpeed, this.move.y * stats.moveSpeed)
        if (stats.regen > 0) this.run.hp = Math.min(stats.maxHp, this.run.hp + stats.regen * dt)
        this.player.setAlpha(now < this.invulnUntil ? 0.55 : 1)
        if (this.isHero() && now >= this.heroFrameAt) {
            // Schwimmen: schneller wechseln, wenn man sich bewegt
            this.heroFrame = 1 - this.heroFrame
            this.heroFrameAt = now + (this.move.lengthSq() > 0.05 ? 160 : 420)
            this.player.setTexture(heroKey(this.heroBody()!, this.heroFrame))
        }
        if (this.move.x < -0.1) this.player.setFlipX(true)
        else if (this.move.x > 0.1) this.player.setFlipX(false)
        const px = this.player.x
        const py = this.player.y
        if (this.outfitImg.visible) {
            this.outfitImg.setPosition(px, py).setDisplaySize(this.playerSz, this.playerSz).setFlipX(this.player.flipX)
                .setAlpha(this.player.alpha)
        }
        this.hpBarBg.setPosition(px, py - this.playerSz / 2 - 6)
        this.hpBarFill.setPosition(px - 10, py - this.playerSz / 2 - 6).setDisplaySize(20 * Math.max(0, this.run.hp / stats.maxHp), 3)

        const cam = this.cameras.main
        const viewTop = cam.scrollY + VIEW_OY
        // Parallax: Boden fest mit der Welt (im All ferner Himmel langsamer), Teilchen davor schneller → Tiefe.
        // Teilchen bewegen sich nicht von selbst – nur, wenn man sich bewegt (hoch/runter mit der Kamera, seitlich mit der Figur).
        this.bg.tilePositionY = (viewTop * this.bgFactor) / this.bg.tileScaleY
        this.bgNext.tilePositionY = (viewTop * this.bgNextFactor) / this.bgNext.tileScaleY
        const side = px - WIDTH / 2
        this.nearA.tilePositionX = (side * 0.35) / 2
        this.nearA.tilePositionY = (viewTop * 1.35) / 2
        this.nearB.tilePositionX = (side * 0.8) / 4
        this.nearB.tilePositionY = (viewTop * 1.8) / 4
        this.updateBackground(py)

        // Höhe → Boss
        this.run.progress = this.run.phase === 'climb' ? heightProgress(this.epochStartY, py, this.epoch.height ?? 5000) : 1
        this.run.year = yearAt(this.epoch.fromYear, this.epoch.toYear, this.run.progress)
        this.updateBigBang(py)
        this.updateOnboarding(dt)
        if (this.run.phase === 'climb') {
            // Ende einer Hauptphase: Boss vor der Linie; sonst geht es an der Linie direkt zur Evolutionswahl
            if (this.epoch.boss && py <= this.endY + BOSS_TRIGGER_DISTANCE) this.startBoss()
            else if (!this.epoch.boss && py <= this.endY + this.playerSz) this.onStageCleared()
        }
        else if (this.run.phase === 'boss' && !this.boss) this.spawnBoss()   // Sicherung, falls er nicht erscheinen konnte

        // Wellen nur beim Hochkämpfen (nach erreichter Höhe), dazu wenige nach Zeit – beim Boss nichts Neues
        if (this.run.phase === 'climb') {
            const h = this.epoch.height ?? 5000
            const climb = Math.max(this.climbMax, this.epochStartY - py)
            const due = [
                ...spawnsDue(this.epoch.waves, this.climbMax / h, climb / h),
                ...spawnsDue(this.epoch.ambient ?? [], prevEpochSec, this.epochTimeMs / 1000),
            ]
            this.climbMax = climb
            for (const req of due) {
                const type = this.enemyTypes.get(req.enemy)
                if (type) for (let i = 0; i < req.count; i++) this.spawnEnemy(type)
            }
        }

        // Fress-Phasen: in Bewegung wird kleine Beute im Umkreis geschluckt (Phagozytose)
        if (this.eating && this.timeMs >= this.eatReadyAt && this.move.lengthSq() > 0.12) {
            const reach = this.playerSz / 2 + EAT_REACH
            for (const e of this.enemies) {
                if (!e.active || !canEatEnemy(this.playerSz, e.kind.size, e.isBoss)) continue
                const rr = reach + e.kind.size / 2
                if ((e.x - px) ** 2 + (e.y - py) ** 2 <= rr * rr) { this.eatEnemy(e); break }
            }
        }

        // Gegner laufen auf den Spieler zu und stoßen sich gegenseitig leicht ab (Raster, damit es schnell bleibt)
        this.buildGrid()
        const bottom = viewTop + HEIGHT + RECYCLE_BELOW
        let alive = 0
        for (const e of this.enemies) {
            if (!e.active) continue
            alive++
            const drift = e.kind.behavior === 'drift'
            if (e.y > bottom && !e.isBoss) {
                // Treibende sind vorbeigezogen; Jäger kommen von oben wieder
                if (drift) { e.disableBody(true, true); alive--; continue }
                e.body.reset(Phaser.Math.Between(8, WIDTH - 8), viewTop - Phaser.Math.Between(20, 100))
            }
            if (drift) {
                // mit der Strömung nach unten, leicht schlingernd
                e.body.velocity.set(Math.sin(now / 700 + e.wobble) * 14, e.kind.speed * 0.3)
            } else {
                const dx = px - e.x
                const dy = py - e.y
                const len = Math.hypot(dx, dy) || 1
                e.body.velocity.set((dx / len) * e.kind.speed, (dy / len) * e.kind.speed)
            }
            if (!e.isBoss) this.separate(e)
            if (e.body.velocity.x < -4) e.setFlipX(true)
            else if (e.body.velocity.x > 4) e.setFlipX(false)
            if (e.flashUntil && now > e.flashUntil) {
                e.flashUntil = 0
                e.setTintMode(Phaser.TintModes.MULTIPLY).setTint(e.kind.art ? 0xffffff : hexToInt(e.kind.color))
            }
            if (e.kind.art) {
                // zwei Bilder, leicht versetzt je Gegner, damit nicht alle im Gleichtakt wippen
                const f = Math.floor((now + e.wobble * 200) / 300) % 2
                if (f !== e.animFrame) { e.animFrame = f; e.setTexture(mobKey(e.kind.id, f)) }
            }
        }
        this.run.enemiesAlive = alive
        if (this.boss) this.run.boss = { name: this.boss.kind.name, hp: Math.max(0, this.boss.hp), maxHp: this.boss.kind.hp }

        // Auto-Attack (in den Fress-Phasen erst mit Toxin)
        const w = this.wstats
        this.fireTimer += dt * 1000
        if (this.ranged && this.fireTimer >= w.cooldownMs) {
            if (this.wkind === 'melee') {
                if (this.meleeAttack(px, py, w, now)) this.fireTimer = 0
            } else {
                const target = this.nearestEnemy(px, py, w.range)
                if (target) {
                    if (this.wkind === 'beam') this.beamAttack(px, py, target, w, now)
                    else this.fire(px, py, target, w, now)
                    this.fireTimer = 0
                }
            }
        }
        this.drawEffects(now)
        for (const s of this.shots) {
            if (s.active && now > s.expireAt) s.disableBody(true, true)
        }

        // XP-Kristalle: Magnet im Sammelradius
        const r2 = stats.pickupRadius * stats.pickupRadius
        for (const g of this.gems) {
            if (!g.active) continue
            const dx = px - g.x
            const dy = py - g.y
            const d2 = dx * dx + dy * dy
            if (d2 < 144) { this.collectGem(g); continue }
            if (g.magnet || d2 < r2) {
                g.magnet = true
                const len = Math.sqrt(d2)
                const step = Math.min(len, (this.run.phase === 'cleared' ? 900 : 420) * dt)
                g.x += (dx / len) * step
                g.y += (dy / len) * step
            }
        }

        if (now - this.lastHudAt >= HUD_INTERVAL_MS) this.publishHud()

        if (this.pendingLevelUps > 0 && !this.choosing) this.openLevelUp()
        else if (this.run.phase === 'cleared' && !this.choosing && this.pendingLevelUps === 0
            && now - this.clearedAt >= CLEAR_DELAY_MS && !this.gems.some(g => g.active)) {
            this.openEvolution()
        }
    }

    // ---- Boss ----

    private startBoss() {
        this.run.phase = 'boss'
        // Die Linie ist jetzt eine Wand, bis der Boss besiegt ist
        this.physics.world.setBounds(0, this.endY, WIDTH, 2e8)
        if (!this.epoch.boss) { this.onStageCleared(); return }
        this.spawnBoss()
        this.cameras.main.shake(250, 0.006)
        this.bridge.set({ banner: { id: ++this.bannerId, text: this.epoch.boss.name } })
    }

    private spawnBoss() {
        const type = this.epoch.boss!
        // knapp unter der Linie, damit auch ein stillstehender Boss (Stromatolith) erreichbar ist
        const by = this.endY + type.size * 0.6
        let e = this.spawnEnemy(type, by)
        if (!e) {
            // Pool voll: dem Boss Platz machen (der Gegner, der am weitesten weg ist, verschwindet)
            let far: Enemy | null = null
            let farD = -1
            for (const c of this.enemies) {
                if (!c.active) continue
                const d = Math.abs(c.y - this.player.y)
                if (d > farD) { farD = d; far = c }
            }
            far?.disableBody(true, true)
            e = this.spawnEnemy(type, by)
        }
        if (!e) return
        e.isBoss = true
        e.x = WIDTH / 2
        e.body.reset(WIDTH / 2, by)
        e.setDepth(7)
        this.boss = e
    }

    private onStageCleared() {
        this.run.phase = 'cleared'
        this.clearedAt = this.timeMs
        this.boss = null
        this.run.boss = null
        this.invulnUntil = this.timeMs + CLEAR_DELAY_MS + 1000
        // restliche Gegner verschwinden, alle Kristalle fliegen zum Spieler
        for (const e of this.enemies) if (e.active) e.disableBody(true, true)
        for (const g of this.gems) if (g.active) g.magnet = true
        this.finishLine.setVisible(false)
        this.finishText.setVisible(false)
        this.physics.world.setBounds(0, -1e8, WIDTH, 2e8)
    }

    // ---- Evolution / Epochenwechsel ----

    private openEvolution() {
        const next = nextPlayable(this.gd.epochs, this.baseEpoch.id)
        if (!next) { this.win(); return }
        const stage = transitionStage(this.gd.epochs, this.baseEpoch.id)
        const options = stage ? availableEvolutions(this.gd.evolutionOptions, stage.id, this.tags) : []
        if (!stage || !options.length) {
            this.startEpoch(next)
            return
        }
        this.choosing = true
        this.joystick.release()
        this.scene.pause()
        // echte Option zuerst, damit man sie leicht findet
        this.offeredEvos = [...options].sort((a, b) => Number(!!b.real) - Number(!!a.real)).slice(0, 4)
        this.publishHud()
        this.bridge.setOverlay({
            type: 'evolution',
            fromName: this.epoch.shortName,
            toCode: stage.code,
            toName: stage.name,
            range: formatRange(stage.fromYear, stage.toYear),
            future: stage.fromYear >= PRESENT_YEAR,
            options: this.offeredEvos.map(o => ({
                name: o.name, desc: o.description, grants: o.grants, real: !!o.real, general: !!o.general,
                icon: ICON_BY_PHASE[stage.phase - 1] ?? 'cell',
            })),
            tags: [...this.tags],
            path: this.run.path.map(p => p.name),
        })
    }

    /** Werte aus Gen, Upgrades und Durchbrüchen (jede Evolution stärkt dauerhaft). */
    private computeRunStats(): PlayerStats {
        return applyBreakthroughs(computeStats(PLAYER_BASE, this.gene.base, this.gd.upgrades, this.owned), this.breakthroughs)
    }

    /** Vom UI aufgerufen, wenn eine Evolution gewählt wurde: neue Stufe + Durchbruch, mit „Tada“. */
    chooseEvolution(o: EvolutionOption) {
        const next = nextPlayable(this.gd.epochs, this.baseEpoch.id)
        const oldKey = this.player.texture.key
        const oldWeapon = this.run.weaponName
        const oldDamage = this.run.stats.damage
        const oldHp = this.run.stats.maxHp
        this.tags = applyEvolution(this.tags, o)
        this.choices[o.stage] = o
        this.run.path = [...this.run.path, o]
        if (next) this.startEpoch(next)
        // Durchbruch: dauerhaft stärker, volle Lebenspunkte
        this.breakthroughs++
        this.run.stats = this.computeRunStats()
        this.refreshWeapon()
        this.run.hp = this.run.stats.maxHp
        this.bridge.setOverlay(null)
        this.scene.resume()
        this.publishHud()
        if (!next) return
        // Spiel läuft kurz für die Verwandlung, bleibt aber „in der Wahl“ (kein Level-up, keine Treffer)
        this.choosing = true
        this.invulnUntil = this.timeMs + 4000
        const newKey = this.player.texture.key
        this.playEvolveFx(oldKey)
        const bonuses = [
            `+${Math.round((this.run.stats.damage / oldDamage - 1) * 100)} % Schaden`,
            `+${Math.max(0, this.run.stats.maxHp - oldHp)} max. Leben, volle Lebenspunkte`,
        ]
        if (this.run.weaponName !== oldWeapon) bonuses.unshift(`Waffe entwickelt: ${oldWeapon} → ${this.run.weaponName}`)
        this.time.delayedCall(1150, () => {
            if (this.run.dead) return
            this.joystick.release()
            this.scene.pause()
            this.bridge.setOverlay({
                type: 'evolved', code: this.epoch.code, stageName: this.epoch.name, trait: o.name, desc: o.description,
                real: !!o.real, oldImg: this.textureUrl(oldKey), newImg: this.textureUrl(newKey), bonuses,
            })
        })
    }

    /** Nach der Tada-Karte weiterspielen. */
    private continueEvolution() {
        if (this.bridge.getState().overlay?.type !== 'evolved') return
        this.choosing = false
        this.invulnUntil = this.timeMs + 1200
        this.bridge.setOverlay(null)
        this.scene.resume()
        this.publishHud()
    }

    /** Bild einer Textur als Data-URL (für die Tada-Karte: alte → neue Form). */
    private textureUrl(key: string): string {
        try { return this.textures.getBase64(key) as string } catch { return '' }
    }

    /** Verwandlung: goldener Blitz, Strahlen, alte Form flackert in die neue, Funken, Aufploppen. */
    private playEvolveFx(oldKey: string) {
        const p = this.player
        const cam = this.cameras.main
        cam.flash(350, 255, 210, 122)
        cam.shake(200, 0.004)
        const ghost = this.add.image(p.x, p.y, oldKey).setDisplaySize(p.displayWidth, p.displayHeight).setDepth(10.6).setFlipX(p.flipX)
        let n = 0
        const flick = this.time.addEvent({
            delay: 90, repeat: 7, callback: () => {
                n++
                ghost.setVisible(n % 2 === 0)
                p.setVisible(n % 2 === 1)
                ghost.setPosition(p.x, p.y)
            },
        })
        this.time.delayedCall(800, () => { flick.remove(); ghost.destroy(); p.setVisible(true) })
        // Strahlen
        const rays = this.add.graphics().setDepth(9.5).setPosition(p.x, p.y)
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2
            rays.fillStyle(i % 2 ? 0xffe0a3 : 0xffb547, 0.55)
            rays.fillTriangle(0, 0, Math.cos(a - 0.08) * 90, Math.sin(a - 0.08) * 90, Math.cos(a + 0.08) * 90, Math.sin(a + 0.08) * 90)
        }
        rays.setScale(0.2)
        this.tweens.add({ targets: rays, scale: 1.3, angle: 60, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => rays.destroy() })
        // Funken
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2
            const d = 40 + Math.random() * 50
            const spark = this.add.rectangle(p.x, p.y, 3, 3, i % 3 ? 0xffd27a : 0xffffff).setDepth(11)
            this.tweens.add({
                targets: spark, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, alpha: 0, duration: 700 + Math.random() * 300,
                ease: 'Quad.easeOut', onComplete: () => spark.destroy(),
            })
        }
        // Aufploppen der neuen Form
        const sx = p.scaleX
        const sy = p.scaleY
        this.time.delayedCall(800, () => {
            p.setScale(sx * 1.6, sy * 1.6)
            this.tweens.add({ targets: p, scaleX: sx, scaleY: sy, duration: 320, ease: 'Back.easeOut' })
        })
    }

    private win() {
        this.run.won = true
        this.joystick.release()
        this.physics.pause()
        this.endRun(true)
    }

    /** Run-Ende: Auswertung „Echte Zeitlinie“ und bester Run (auf dem Gerät). */
    private endRun(won: boolean) {
        const list = sortedEpochs(this.gd.epochs)
        const stageIndex = list.findIndex(e => e.id === this.baseEpoch.id) + 1
        const past = this.run.path.filter(p => this.stageFromYear(p.stage) < PRESENT_YEAR)
        const realCount = past.filter(p => p.real).length
        const prev = this.bridge.getState().best
        const reached = won ? list.length : stageIndex
        const newRecord = !prev || reached > prev.stageIndex
        const best = newRecord
            ? { stageIndex: reached, stageCount: list.length, code: this.epoch.code, name: this.epoch.shortName }
            : prev
        if (newRecord) saveBest(best)
        this.publishHud()
        this.bridge.set({ best, banner: null })
        this.bridge.setOverlay({
            type: 'end', won, reachedCode: this.epoch.code, reachedName: this.epoch.shortName, year: formatYear(this.run.year),
            stageIndex, stageCount: list.length, timeSec: this.run.timeSec, kills: this.run.kills, level: this.run.level,
            realCount, pastCount: past.length, badge: won && past.length > 0 && realCount === past.length,
            path: this.run.path.map(p => ({ name: p.name, real: !!p.real })), newRecord,
        })
    }

    // ---- Gegner, Schüsse, XP ----

    private spawnEnemy(type: EnemyType, y?: number): Enemy | undefined {
        let e: Enemy | undefined
        for (let i = 0; i < this.enemies.length; i++) {
            const c = this.enemies[(this.enemyCursor + i) % this.enemies.length]
            if (!c.active) { e = c; this.enemyCursor = (this.enemyCursor + i + 1) % this.enemies.length; break }
        }
        if (!e) return undefined   // Pool voll
        const cam = this.cameras.main
        const x = Phaser.Math.Between(type.size, WIDTH - type.size)
        e.enableBody(true, x, y ?? cam.scrollY + VIEW_OY - Phaser.Math.Between(16, 90), true, true)
        e.kind = type
        e.hp = type.hp
        e.flashUntil = 0
        e.isBoss = false
        e.wobble = Math.random() * Math.PI * 2
        e.animFrame = -1
        if (type.art) e.setTexture(mobKey(type.id, 0))
        else e.setTexture(shapeKey((type.shape as Shape | undefined) ?? 'blob'))
        e.setDisplaySize(type.size, type.size).setTintMode(Phaser.TintModes.MULTIPLY)
            .setTint(type.art ? 0xffffff : hexToInt(type.color)).setDepth(6)
        return e
    }

    /** Debug: viele Gegner auf einmal (oberhalb und im oberen Drittel). */
    spawnBurst(n: number) {
        const types = this.epoch.enemies
        const cam = this.cameras.main
        for (let i = 0; i < n; i++) {
            this.spawnEnemy(types[i % types.length], cam.scrollY + VIEW_OY - Phaser.Math.Between(10, 400))
        }
    }

    /** Debug: kurz vor die Ziellinie springen. */
    skipToGoal() {
        if (this.run.phase !== 'climb') return
        this.player.body.reset(this.player.x, this.endY + (this.epoch.boss ? BOSS_TRIGGER_DISTANCE : 0) + 120)
    }

    /**
     * Debug-Teleporter: zu einer Stufe springen, als hätte man immer die echte Zeitlinie gewählt.
     * Level und Upgrades werden passend zur Stufe gesetzt; at = Anteil der Höhe (1 = vor Ende/Boss).
     */
    teleport(id: string, at: number) {
        const target = this.gd.epochs.find(e => e.id === id)
        const route = target && realPathTo(this.gd.epochs, this.gd.evolutionOptions, id)
        if (!target || !route) return
        // alles Laufende abräumen
        for (const e of this.enemies) if (e.active) { e.isBoss = false; e.disableBody(true, true) }
        for (const s of this.shots) if (s.active) s.disableBody(true, true)
        for (const g of this.gems) if (g.active) g.setActive(false).setVisible(false)
        for (const o of [...this.prevWorldObjs, ...this.worldObjs]) o.destroy()
        this.prevWorldObjs = []
        this.worldObjs = []
        this.epoch = undefined as unknown as Epoch   // keine „vorige Stufe“ für den Hintergrund nach dem Sprung
        this.effects = []
        this.boss = null

        // Weg, Tags und Level wie nach einem echten Run bis hierher
        this.tags = route.tags
        this.visited = route.visited
        this.choices = Object.fromEntries(route.path.map(o => [o.stage, o]))
        this.run.path = route.path
        this.owned = {}
        const level = teleportLevel(route.visited.length)
        for (let l = 1; l < level; l++) {
            const [u] = pickUpgrades(this.gd.upgrades, this.owned, this.tags, Math.random, 1, target.phase)
            if (!u) break
            this.owned[u.id] = (this.owned[u.id] ?? 0) + 1
            for (const t of u.grants ?? []) this.tags.add(t)
        }
        this.breakthroughs = route.path.length
        this.run.stats = this.computeRunStats()
        this.run.level = level
        this.run.xp = 0
        this.run.xpNeeded = xpForLevel(level)
        this.run.hp = this.run.stats.maxHp
        this.run.dead = false
        this.pendingLevelUps = 0
        this.choosing = false
        this.invulnUntil = this.timeMs + 1500

        this.startEpoch(target)
        const h = this.epoch.height ?? 5000
        // „vor Ende“: kurz vor den Boss bzw. die Linie
        const rise = at >= 1 ? Math.max(0, h - (this.epoch.boss ? BOSS_TRIGGER_DISTANCE : 0) - 160) : h * at
        this.player.body.reset(WIDTH / 2, this.epochStartY - rise)
        this.climbMax = rise
        this.cameras.main.centerOn(this.player.x, this.player.y)
        this.bridge.setOverlay(null)
        this.scene.resume()
        this.publishHud()
    }

    private nearestEnemy(x: number, y: number, range: number): Enemy | null {
        // Im Bosskampf hat der Boss Vorrang, sobald er in Reichweite ist
        const b = this.boss
        if (b?.active) {
            const r = range + b.kind.size / 2
            if ((b.x - x) ** 2 + (b.y - y) ** 2 <= r * r) return b
        }
        let best: Enemy | null = null
        let bestD = range * range
        for (const e of this.enemies) {
            if (!e.active) continue
            const dx = e.x - x
            const dy = e.y - y
            const d = dx * dx + dy * dy
            if (d < bestD) { bestD = d; best = e }
        }
        return best
    }

    private fire(x: number, y: number, target: Enemy, stats: PlayerStats, now: number) {
        const baseAngle = Math.atan2(target.y - y, target.x - x)
        const n = stats.projectiles
        const lifeMs = (stats.range / stats.projectileSpeed) * 1000 * 1.15
        for (let i = 0; i < n; i++) {
            const s = this.shots.find(c => !c.active)
            if (!s) return
            const a = baseAngle + (i - (n - 1) / 2) * 0.2
            s.enableBody(true, x, y, true, true)
            s.damage = stats.damage
            s.pierceLeft = stats.pierce
            s.expireAt = now + lifeMs
            s.hit.clear()
            s.setRotation(a)
            s.body.velocity.set(Math.cos(a) * stats.projectileSpeed, Math.sin(a) * stats.projectileSpeed)
        }
    }

    private onShotHit(s: Shot, e: Enemy) {
        if (!s.active || !e.active || s.hit.has(e)) return
        s.hit.add(e)
        this.damageEnemy(e, s.damage)
        if (s.pierceLeft > 0) s.pierceLeft--
        else s.disableBody(true, true)
    }

    private damageEnemy(e: Enemy, dmg: number) {
        e.hp -= dmg
        if (e.hp <= 0) this.killEnemy(e)
        else {
            e.flashUntil = this.timeMs + 70
            e.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
        }
    }

    /** Nahkampf (Biss, Klauen): trifft alle Gegner im Umkreis. */
    private meleeAttack(x: number, y: number, w: PlayerStats, now: number): boolean {
        const r = w.range
        let hit = false
        for (const e of this.enemies) {
            if (!e.active) continue
            const rr = r + e.kind.size / 2
            if ((e.x - x) ** 2 + (e.y - y) ** 2 <= rr * rr) { this.damageEnemy(e, w.damage); hit = true }
        }
        if (hit) this.effects.push({ kind: 'ring', x, y, x2: 0, y2: 0, r, until: now + 120, color: hexToInt(this.form?.color ?? '#ffffff') })
        return hit
    }

    /** Strahl (Laser): trifft alle Gegner auf der Linie zum Ziel; mehrere Strahlen leicht gefächert. */
    private beamAttack(x: number, y: number, target: Enemy, w: PlayerStats, now: number) {
        const base = Math.atan2(target.y - y, target.x - x)
        const n = w.projectiles
        const color = hexToInt(this.form?.color ?? '#ffffff')
        for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.18
            const ux = Math.cos(a)
            const uy = Math.sin(a)
            for (const e of this.enemies) {
                if (!e.active) continue
                const ex = e.x - x
                const ey = e.y - y
                const along = ex * ux + ey * uy
                if (along < 0 || along > w.range) continue
                const across = Math.abs(ex * uy - ey * ux)
                if (across <= e.kind.size / 2 + 3) this.damageEnemy(e, w.damage)
            }
            this.effects.push({ kind: 'line', x, y, x2: x + ux * w.range, y2: y + uy * w.range, r: 0, until: now + 90, color })
        }
    }

    private drawEffects(now: number) {
        this.fx.clear()
        // Verdauen: Ring um die Zelle läuft zu
        if (this.eating && this.timeMs < this.eatReadyAt) {
            const left = (this.eatReadyAt - this.timeMs) / DIGEST_MS
            const r = this.playerSz / 2 + 5
            this.fx.lineStyle(2, 0xa6f7da, 0.8).beginPath()
                .arc(this.player.x, this.player.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left).strokePath()
        }
        if (!this.effects.length) return
        this.effects = this.effects.filter(f => f.until > now)
        for (const f of this.effects) {
            if (f.kind === 'ring') this.fx.lineStyle(3, f.color, 0.8).strokeCircle(f.x, f.y, f.r)
            else this.fx.lineStyle(3, f.color, 0.9).lineBetween(f.x, f.y, f.x2, f.y2)
        }
    }

    // ---- Abstoßen der Gegner (Raster) ----

    private static readonly CELL = 24

    private cellKey(x: number, y: number): number {
        return Math.floor(y / GameScene.CELL) * 64 + Math.floor(x / GameScene.CELL)
    }

    private buildGrid() {
        for (const list of this.grid.values()) list.length = 0
        for (const e of this.enemies) {
            if (!e.active) continue
            const k = this.cellKey(e.x, e.y)
            let list = this.grid.get(k)
            if (!list) { list = []; this.grid.set(k, list) }
            list.push(e)
        }
        if (this.grid.size > 2000) this.grid.clear()   // leere Zellen nicht endlos sammeln
    }

    private separate(e: Enemy) {
        const cx = Math.floor(e.x / GameScene.CELL)
        const cy = Math.floor(e.y / GameScene.CELL)
        let pushX = 0
        let pushY = 0
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                const list = this.grid.get((cy + oy) * 64 + cx + ox)
                if (!list) continue
                for (const o of list) {
                    if (o === e) continue
                    const dx = e.x - o.x
                    const dy = e.y - o.y
                    const min = (e.kind.size + o.kind.size) * 0.45
                    const d2 = dx * dx + dy * dy
                    if (d2 >= min * min) continue
                    const d = Math.sqrt(d2) || 0.01
                    const f = (min - d) / d
                    pushX += dx * f
                    pushY += dy * f
                }
            }
        }
        if (pushX || pushY) {
            e.body.velocity.x += pushX * 8
            e.body.velocity.y += pushY * 8
        }
    }

    private killEnemy(e: Enemy) {
        this.run.kills++
        this.dropGem(e.x, e.y, e.kind.xp)
        const wasBoss = e.isBoss
        e.isBoss = false
        e.disableBody(true, true)
        if (wasBoss) this.onStageCleared()
    }

    private dropGem(x: number, y: number, value: number) {
        if (value <= 0) return
        const g = this.gems.find(c => !c.active)
        if (!g) {
            // Pool voll: Wert auf einen vorhandenen Kristall packen
            const any = this.gems[Phaser.Math.Between(0, this.gems.length - 1)]
            any.value += value
            any.setScale(Math.min(2, any.scale + 0.1))
            return
        }
        g.setPosition(x, y).setActive(true).setVisible(true).setScale(value >= 20 ? 2.4 : value >= 4 ? 1.6 : 1)
        g.value = value
        g.magnet = false
    }

    private collectGem(g: Gem) {
        g.setActive(false).setVisible(false)
        this.addXp(g.value)
    }

    private addXp(value: number) {
        const before = this.run.level
        this.run.xp += value * this.run.stats.xpGain
        while (this.run.xp >= this.run.xpNeeded) {
            this.run.xp -= this.run.xpNeeded
            this.run.level++
            this.run.xpNeeded = xpForLevel(this.run.level)
            this.pendingLevelUps++
        }
        // in den Fress-Phasen wächst man mit dem Level
        if (this.run.level !== before && this.eating) {
            this.playerSz = playerSize(this.run.level, true)
            this.player.setDisplaySize(this.playerSz, this.playerSz)
        }
    }

    /** Beute schlucken: XP direkt, danach kurz verdauen (keine Heilung). */
    private eatEnemy(e: Enemy) {
        if (this.onboard === 1) { this.onboard = 2; this.onboardAt = this.timeMs }
        this.eatReadyAt = this.timeMs + DIGEST_MS
        this.run.kills++
        e.disableBody(true, true)
        this.addXp(e.kind.xp)
    }

    private onPlayerHit(e: Enemy) {
        if (!e.active || this.run.dead) return
        if (this.eating) {
            // Fressen ist aktiv (Phagozytose): nur in Bewegung, danach kurz verdauen
            const moving = this.move.lengthSq() > 0.12
            const small = canEatEnemy(this.playerSz, e.kind.size, e.isBoss)
            if (moving && small && this.timeMs >= this.eatReadyAt) { this.eatEnemy(e); return }
            // Größere Gegner und Bosse kann man in Bewegung anknabbern
            if (moving && !small && this.timeMs >= this.biteReadyAt) {
                this.biteReadyAt = this.timeMs + BITE_COOLDOWN_MS
                this.damageEnemy(e, this.wstats.damage * 2)
                if (!e.active) return
            }
        }
        // Treibende Beute ist harmlos
        if (e.kind.behavior === 'drift' || e.kind.damage <= 0 || this.timeMs < this.invulnUntil) return
        this.invulnUntil = this.timeMs + HIT_COOLDOWN_MS
        this.run.hp -= e.kind.damage
        this.cameras.main.shake(90, 0.004)
        if (this.run.hp <= 0) this.die()
    }

    /** Sterbeanimation: rot blinken, kurz Zeitlupe, Figur zerplatzt in Pixel – dann Auswertung. */
    private die() {
        this.run.hp = 0
        this.run.dead = true
        this.joystick.release()
        this.physics.pause()
        this.bridge.set({ hint: null })
        this.publishHud()
        const p = this.player
        const cam = this.cameras.main
        cam.shake(260, 0.01)
        this.hpBarBg.setVisible(false)
        this.hpBarFill.setVisible(false)
        p.setAlpha(1).setTint(0xe8483b).setTintMode(Phaser.TintModes.FILL)
        this.tweens.add({ targets: p, alpha: 0.25, duration: 110, yoyo: true, repeat: 2 })
        this.time.delayedCall(700, () => {
            const colors = [0x3dcf9e, 0xa6f7da, 0x1e8a66, 0xf2c94c, 0xe8483b, 0x14202e]
            for (let i = 0; i < 34; i++) {
                const a = Math.random() * Math.PI * 2
                const d = 25 + Math.random() * 70
                const size = 2 + Math.floor(Math.random() * 3)
                const bit = this.add.rectangle(p.x, p.y, size, size, colors[i % colors.length]).setDepth(11)
                this.tweens.add({
                    targets: bit, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d + 10, alpha: 0, angle: Math.random() * 180,
                    duration: 650 + Math.random() * 450, ease: 'Quad.easeOut', onComplete: () => bit.destroy(),
                })
            }
            const ring = this.add.circle(p.x, p.y, 6).setStrokeStyle(3, 0xffffff, 0.9).setDepth(11)
            this.tweens.add({ targets: ring, radius: 46, alpha: 0, duration: 450, ease: 'Quad.easeOut', onComplete: () => ring.destroy() })
            p.setVisible(false)
            this.outfitImg.setVisible(false)
        })
        this.time.delayedCall(1700, () => this.endRun(false))
    }

    // ---- Onboarding + Easter Egg ----

    /**
     * Erster Run: 0 = „Ziehen = schwimmen“ bis man sich bewegt, 1 = „in kleinere Teilchen schwimmen = fressen“
     * bis zum ersten Fressen (spätestens 8 s), dann fertig (gespeichert). Der Hinweis „nach oben = Zeit vorwärts,
     * goldene Linie = Evolution“ steht auf dem Boden über dem Start.
     */
    private updateOnboarding(dt: number) {
        if (this.onboard >= 3 || this.choosing || this.timeMs < this.hintLockUntil) return
        const b = this.bridge
        const show = (text: string) => { if (b.getState().hint?.text !== text) b.set({ hint: { text, swipe: this.onboard === 0 } }) }
        if (this.onboard === 0) {
            show('Zieh über den Bildschirm, um zu schwimmen')
            if (this.move.lengthSq() > 0.1) this.movedMs += dt * 1000
            if (this.movedMs > 600) { this.onboard = 1; this.onboardAt = this.timeMs }
        } else if (this.onboard === 1) {
            show('Schwimm in kleinere Teilchen hinein – so frisst du sie')
            if (this.timeMs - this.onboardAt > 8000) this.onboard = 2
        } else {
            this.onboard = 3
            storageSet(ONBOARD_KEY, '1')
            b.set({ hint: null })
        }
    }

    /** Easter Egg: in Stufe 1.1 nach unten schwimmen → Zeit läuft rückwärts bis zum Urknall. */
    private updateBigBang(py: number) {
        if (this.visited.length !== 1 || this.run.phase !== 'climb') return
        const depth = py - this.epochStartY
        if (depth <= 0) return
        this.run.year = bigBangYear(depth)
        if (this.bigBangDone || depth < BIGBANG_DEPTH) return
        this.bigBangDone = true
        this.hintLockUntil = this.timeMs + 5000
        storageSet(BIGBANG_KEY, '1')
        const cam = this.cameras.main
        cam.flash(1400, 255, 255, 255)
        cam.shake(600, 0.012)
        this.bridge.set({
            banner: { id: ++this.bannerId, text: 'Urknall!' },
            hint: { text: 'Vor 13,8 Mrd. Jahren begann alles. Abzeichen „Ganz am Anfang“ freigeschaltet!', swipe: false },
        })
        this.time.delayedCall(1300, () => {
            if (this.run.dead) return
            this.player.body.reset(WIDTH / 2, this.epochStartY - 40)
            cam.centerOn(this.player.x, this.player.y)
        })
        this.time.delayedCall(5000, () => {
            if (this.bridge.getState().hint?.text.startsWith('Vor 13,8')) this.bridge.set({ hint: null })
        })
    }

    // ---- Level-up ----

    private openLevelUp() {
        const choices = pickUpgrades(this.gd.upgrades, this.owned, this.tags, Math.random, 3, this.baseEpoch.phase)
        if (!choices.length) { this.pendingLevelUps = 0; return }
        this.choosing = true
        this.joystick.release()
        this.scene.pause()
        this.publishHud()
        this.showUpgrades(choices)
    }

    private showUpgrades(choices: Upgrade[]) {
        this.offeredUpgrades = choices
        this.bridge.setOverlay({
            type: 'levelup',
            level: this.run.level,
            rerolls: this.rerolls,
            choices: choices.map(u => {
                const { effect, fact } = splitDescription(u.description)
                const weapon = !!u.grants?.includes('toxin') || u.effects.some(f => WEAPON_STATS.has(f.stat))
                return {
                    name: u.name, effect, fact, rarity: u.rarity,
                    level: this.owned[u.id] ?? 0, maxLevel: u.maxLevel,
                    kind: weapon ? 'weapon' : 'passive',
                    icon: u.grants?.includes('toxin') ? 'toxin' : ICON_BY_STAT[u.effects[0]?.stat ?? 'damage'],
                }
            }),
        })
    }

    /** „Neu würfeln“: einmal pro Run andere Upgrades anbieten. */
    private reroll() {
        if (this.rerolls <= 0 || this.bridge.getState().overlay?.type !== 'levelup') return
        const next = pickUpgrades(this.gd.upgrades, this.owned, this.tags, Math.random, 3, this.baseEpoch.phase)
        if (!next.length) return
        this.rerolls--
        this.showUpgrades(next)
    }

    /** Vom UI aufgerufen, wenn ein Upgrade gewählt wurde. */
    chooseUpgrade(u: Upgrade) {
        this.owned[u.id] = (this.owned[u.id] ?? 0) + 1
        for (const t of u.grants ?? []) this.tags.add(t)
        const before = this.run.stats.maxHp
        this.run.stats = this.computeRunStats()
        if (this.run.stats.maxHp > before) this.run.hp += this.run.stats.maxHp - before
        this.pendingLevelUps--
        this.refreshWeapon()
        const next = this.pendingLevelUps > 0 ? pickUpgrades(this.gd.upgrades, this.owned, this.tags, Math.random, 3, this.baseEpoch.phase) : []
        if (next.length) {
            this.showUpgrades(next)
            return
        }
        this.pendingLevelUps = 0
        this.choosing = false
        this.bridge.setOverlay(null)
        this.scene.resume()
        this.publishHud()
    }

    restartRun() {
        this.bridge.set({ overlay: null, banner: null })
        this.scene.restart()
    }
}
