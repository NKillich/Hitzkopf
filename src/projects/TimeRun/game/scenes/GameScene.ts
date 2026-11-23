// Spielwelt: Spieler, Gegner-Wellen (Pool), Auto-Attack, XP-Kristalle, Level-up.
import Phaser from 'phaser'
import type { EnemyType, Epoch, Gene, GameData, PlayerStats, Upgrade } from '../../logic/types'
import { computeStats, pickUpgrades, type OwnedUpgrades } from '../../logic/upgrades'
import { spawnsDue, xpForLevel } from '../../logic/waves'
import {
    HEIGHT, HIT_COOLDOWN_MS, MAX_ENEMIES, MAX_GEMS, MAX_PROJECTILES, PLAYER_BASE, PLAYER_SIZE,
    RECYCLE_BELOW, WIDTH, hexToInt,
} from '../config'
import { Joystick } from '../Joystick'
import type { UIScene } from './UIScene'

class Enemy extends Phaser.Physics.Arcade.Image {
    declare body: Phaser.Physics.Arcade.Body
    kind!: EnemyType
    hp = 0
    flashUntil = 0
}

class Shot extends Phaser.Physics.Arcade.Image {
    declare body: Phaser.Physics.Arcade.Body
    damage = 0
    pierceLeft = 0
    expireAt = 0
    readonly hit = new Set<Enemy>()
}

class Gem extends Phaser.GameObjects.Image {
    value = 0
    magnet = false
}

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
    dead: boolean
}

export class GameScene extends Phaser.Scene {
    private gd!: GameData
    private epoch!: Epoch
    private gene!: Gene
    private enemyTypes = new Map<string, EnemyType>()

    private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
    private hpBarBg!: Phaser.GameObjects.Image
    private hpBarFill!: Phaser.GameObjects.Image
    private bg!: Phaser.GameObjects.TileSprite
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
    private fireTimer = 0
    private invulnUntil = 0
    private owned: OwnedUpgrades = {}
    private tags = new Set<string>()
    private pendingLevelUps = 0
    private choosing = false
    run!: RunInfo

    constructor() { super('game') }

    create() {
        this.gd = this.registry.get('data') as GameData
        this.epoch = [...this.gd.epochs].sort((a, b) => a.order - b.order)[0]
        this.gene = this.gd.genes.find(g => g.id === this.gd.startGene)!
        this.enemyTypes = new Map(this.epoch.enemies.map(e => [e.id, e]))

        this.timeMs = 0
        this.fireTimer = 0
        this.invulnUntil = 0
        this.owned = {}
        this.tags = new Set()
        this.pendingLevelUps = 0
        this.choosing = false
        this.enemyCursor = 0
        const stats = computeStats(PLAYER_BASE, this.gene.base, this.gd.upgrades, this.owned)
        const form = this.gene.forms[this.epoch.id]
        this.run = {
            epoch: this.epoch, weaponName: form?.name ?? this.gene.name, timeSec: 0, level: 1, xp: 0,
            xpNeeded: xpForLevel(1), hp: stats.maxHp, stats, kills: 0, enemiesAlive: 0, dead: false,
        }

        this.physics.resume()   // nach Neustart war die Welt evtl. noch angehalten
        // Welt: nach oben offen, Breite = Bildschirm
        this.physics.world.setBounds(0, -1e7, WIDTH, 2e7)
        const cam = this.cameras.main
        cam.setBackgroundColor(this.epoch.background)
        cam.setBounds(0, -1e7, WIDTH, 2e7)
        this.bg = this.add.tileSprite(0, 0, WIDTH, HEIGHT, 'grid').setOrigin(0).setScrollFactor(0)
            .setTint(hexToInt(this.epoch.gridColor)).setDepth(-10)

        this.player = this.physics.add.image(WIDTH / 2, HEIGHT * 0.7, 'player').setCollideWorldBounds(true).setDepth(10)
        this.hpBarBg = this.add.image(0, 0, 'bar').setDisplaySize(20, 3).setTint(0x400000).setDepth(11)
        this.hpBarFill = this.add.image(0, 0, 'bar').setOrigin(0, 0.5).setDisplaySize(20, 3).setTint(0x4cff6a).setDepth(12)
        cam.startFollow(this.player, true, 1, 0.12)
        cam.setFollowOffset(0, HEIGHT * 0.18)   // Spieler etwas unter der Mitte → mehr Sicht nach oben

        this.joystick = new Joystick(this)

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
        const shotTint = hexToInt(form?.color ?? '#ffffff')
        for (let i = 0; i < MAX_PROJECTILES; i++) {
            const s = this.shotGroup.create(0, 0, 'shot') as Shot
            s.setTint(shotTint).setDepth(8)
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

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.joystick.destroy())
        this.scene.launch('ui')
    }

    private get ui(): UIScene {
        return this.scene.get('ui') as UIScene
    }

    update(_time: number, deltaMs: number) {
        if (this.run.dead) return
        const dt = Math.min(deltaMs, 50) / 1000   // große Sprünge (Tab im Hintergrund) abfangen
        const prevSec = this.timeMs / 1000
        this.timeMs += dt * 1000
        const now = this.timeMs
        const t = now / 1000
        this.run.timeSec = t
        const stats = this.run.stats

        // Spieler
        this.joystick.read(this.move)
        this.player.setVelocity(this.move.x * stats.moveSpeed, this.move.y * stats.moveSpeed)
        if (stats.regen > 0) this.run.hp = Math.min(stats.maxHp, this.run.hp + stats.regen * dt)
        this.player.setAlpha(now < this.invulnUntil ? 0.55 : 1)
        const px = this.player.x
        const py = this.player.y
        this.hpBarBg.setPosition(px, py - PLAYER_SIZE)
        this.hpBarFill.setPosition(px - 10, py - PLAYER_SIZE).setDisplaySize(20 * Math.max(0, this.run.hp / stats.maxHp), 3)

        const cam = this.cameras.main
        this.bg.tilePositionY = cam.scrollY

        // Wellen
        for (const req of spawnsDue(this.epoch.waves, prevSec, t)) {
            const type = this.enemyTypes.get(req.enemy)
            if (type) for (let i = 0; i < req.count; i++) this.spawnEnemy(type)
        }

        // Gegner laufen auf den Spieler zu (keine Kollision untereinander – spart Rechenzeit)
        const bottom = cam.scrollY + HEIGHT + RECYCLE_BELOW
        let alive = 0
        for (const e of this.enemies) {
            if (!e.active) continue
            alive++
            if (e.y > bottom) {
                e.body.reset(Phaser.Math.Between(8, WIDTH - 8), cam.scrollY - Phaser.Math.Between(20, 100))
            }
            const dx = px - e.x
            const dy = py - e.y
            const len = Math.hypot(dx, dy) || 1
            e.body.velocity.set((dx / len) * e.kind.speed, (dy / len) * e.kind.speed)
            if (e.flashUntil && now > e.flashUntil) {
                e.flashUntil = 0
                e.setTintMode(Phaser.TintModes.MULTIPLY).setTint(hexToInt(e.kind.color))
            }
        }
        this.run.enemiesAlive = alive

        // Auto-Attack
        this.fireTimer += dt * 1000
        if (this.fireTimer >= stats.cooldownMs) {
            const target = this.nearestEnemy(px, py, stats.range)
            if (target) {
                this.fire(px, py, target, stats, now)
                this.fireTimer = 0
            }
        }
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
                const step = Math.min(len, 420 * dt)
                g.x += (dx / len) * step
                g.y += (dy / len) * step
            }
        }

        if (this.pendingLevelUps > 0 && !this.choosing) this.openLevelUp()
    }

    private spawnEnemy(type: EnemyType, y?: number) {
        let e: Enemy | undefined
        for (let i = 0; i < this.enemies.length; i++) {
            const c = this.enemies[(this.enemyCursor + i) % this.enemies.length]
            if (!c.active) { e = c; this.enemyCursor = (this.enemyCursor + i + 1) % this.enemies.length; break }
        }
        if (!e) return   // Pool voll
        const cam = this.cameras.main
        const x = Phaser.Math.Between(type.size, WIDTH - type.size)
        e.enableBody(true, x, y ?? cam.scrollY - Phaser.Math.Between(16, 90), true, true)
        e.kind = type
        e.hp = type.hp
        e.flashUntil = 0
        e.setDisplaySize(type.size, type.size).setTintMode(Phaser.TintModes.MULTIPLY).setTint(hexToInt(type.color)).setDepth(6)
    }

    /** Debug: viele Gegner auf einmal (oberhalb und im oberen Drittel). */
    spawnBurst(n: number) {
        const types = this.epoch.enemies
        const cam = this.cameras.main
        for (let i = 0; i < n; i++) {
            this.spawnEnemy(types[i % types.length], cam.scrollY - Phaser.Math.Between(10, 400))
        }
    }

    private nearestEnemy(x: number, y: number, range: number): Enemy | null {
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
        e.hp -= s.damage
        if (e.hp <= 0) this.killEnemy(e)
        else {
            e.flashUntil = this.timeMs + 70
            e.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
        }
        if (s.pierceLeft > 0) s.pierceLeft--
        else s.disableBody(true, true)
    }

    private killEnemy(e: Enemy) {
        this.run.kills++
        this.dropGem(e.x, e.y, e.kind.xp)
        e.disableBody(true, true)
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
        g.setPosition(x, y).setActive(true).setVisible(true).setScale(value >= 4 ? 1.6 : 1)
        g.value = value
        g.magnet = false
    }

    private collectGem(g: Gem) {
        g.setActive(false).setVisible(false)
        this.run.xp += g.value * this.run.stats.xpGain
        while (this.run.xp >= this.run.xpNeeded) {
            this.run.xp -= this.run.xpNeeded
            this.run.level++
            this.run.xpNeeded = xpForLevel(this.run.level)
            this.pendingLevelUps++
        }
    }

    private onPlayerHit(e: Enemy) {
        if (!e.active || this.run.dead || this.timeMs < this.invulnUntil) return
        this.invulnUntil = this.timeMs + HIT_COOLDOWN_MS
        this.run.hp -= e.kind.damage
        this.cameras.main.shake(90, 0.004)
        if (this.run.hp <= 0) {
            this.run.hp = 0
            this.run.dead = true
            this.joystick.release()
            this.physics.pause()
            this.ui.showGameOver()
        }
    }

    // ---- Level-up ----

    private openLevelUp() {
        const choices = pickUpgrades(this.gd.upgrades, this.owned, this.tags)
        if (!choices.length) { this.pendingLevelUps = 0; return }
        this.choosing = true
        this.joystick.release()
        this.scene.pause()
        this.ui.showLevelUp(choices, this.owned)
    }

    /** Vom UI aufgerufen, wenn ein Upgrade gewählt wurde. */
    chooseUpgrade(u: Upgrade) {
        this.owned[u.id] = (this.owned[u.id] ?? 0) + 1
        for (const t of u.grants ?? []) this.tags.add(t)
        const before = this.run.stats.maxHp
        this.run.stats = computeStats(PLAYER_BASE, this.gene.base, this.gd.upgrades, this.owned)
        if (this.run.stats.maxHp > before) this.run.hp += this.run.stats.maxHp - before
        this.pendingLevelUps--
        const next = this.pendingLevelUps > 0 ? pickUpgrades(this.gd.upgrades, this.owned, this.tags) : []
        if (next.length) {
            this.ui.showLevelUp(next, this.owned)
            return
        }
        this.pendingLevelUps = 0
        this.choosing = false
        this.scene.resume()
    }

    restartRun() {
        this.scene.restart()
    }
}
