// HUD (XP-Leiste, Level, Zeit) + Level-up-Auswahl + Run-Ende. Liegt über der Spielszene.
import Phaser from 'phaser'
import type { Upgrade } from '../../logic/types'
import type { OwnedUpgrades } from '../../logic/upgrades'
import { FONT, HEIGHT, RARITY_COLOR, RARITY_LABEL, WIDTH } from '../config'
import type { GameScene } from './GameScene'

const text = (size: number, color = '#ffffff', bold = false): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', resolution: 2,
})

const CARD_W = 330
const CARD_H = 112
/** Kurze Sperre nach dem Öffnen, damit der Finger vom Joystick nicht aus Versehen wählt. */
const INPUT_GUARD_MS = 400

interface Card {
    box: Phaser.GameObjects.Rectangle
    rarity: Phaser.GameObjects.Text
    name: Phaser.GameObjects.Text
    desc: Phaser.GameObjects.Text
    level: Phaser.GameObjects.Text
    container: Phaser.GameObjects.Container
}

export class UIScene extends Phaser.Scene {
    private xpFill!: Phaser.GameObjects.Rectangle
    private levelText!: Phaser.GameObjects.Text
    private timeText!: Phaser.GameObjects.Text
    private killText!: Phaser.GameObjects.Text
    private epochText!: Phaser.GameObjects.Text
    private debugText?: Phaser.GameObjects.Text

    private levelUpLayer!: Phaser.GameObjects.Container
    private levelUpTitle!: Phaser.GameObjects.Text
    private cards: Card[] = []
    private choices: Upgrade[] = []
    private shownAt = 0
    private armed: number | null = null

    private gameOverLayer!: Phaser.GameObjects.Container
    private gameOverStats!: Phaser.GameObjects.Text

    constructor() { super('ui') }

    private get game_(): GameScene {
        return this.scene.get('game') as GameScene
    }

    create() {
        // HUD
        this.add.rectangle(0, 0, WIDTH, 50, 0x000000, 0.35).setOrigin(0)   // dunkler Streifen, damit der HUD lesbar bleibt
        this.add.rectangle(0, 0, WIDTH, 10, 0x000000, 0.6).setOrigin(0)
        this.xpFill = this.add.rectangle(0, 0, 0, 10, 0x6bf0ff).setOrigin(0)
        this.levelText = this.add.text(WIDTH - 8, 14, '', text(14, '#ffffff', true)).setOrigin(1, 0)   // links oben liegt der Zurück-Knopf
        this.timeText = this.add.text(WIDTH / 2, 14, '', text(16, '#ffffff', true)).setOrigin(0.5, 0)
        this.killText = this.add.text(WIDTH - 8, 32, '', text(12, '#d0d8e4')).setOrigin(1, 0)
        this.epochText = this.add.text(WIDTH / 2, 34, '', text(11, '#9fb3c8')).setOrigin(0.5, 0)

        if (this.registry.get('debug')) {
            this.debugText = this.add.text(8, 56, '', text(11, '#ffe066'))
            const btn = this.add.text(WIDTH - 8, 56, '[+300 Gegner]', text(12, '#ffe066', true)).setOrigin(1, 0)
                .setInteractive({ useHandCursor: true })
            btn.on('pointerup', () => this.game_.spawnBurst(300))
        }

        this.buildLevelUp()
        this.buildGameOver()
    }

    private buildLevelUp() {
        const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070c, 0.78).setOrigin(0).setInteractive()   // fängt Klicks ab
        this.levelUpTitle = this.add.text(WIDTH / 2, 170, '', text(26, '#ffffff', true)).setOrigin(0.5)
        const sub = this.add.text(WIDTH / 2, 204, 'Wähle ein Upgrade', text(14, '#b8c4d4')).setOrigin(0.5)
        this.levelUpLayer = this.add.container(0, 0, [dim, this.levelUpTitle, sub]).setDepth(100).setVisible(false)

        this.cards = []
        for (let i = 0; i < 3; i++) {
            const x = (WIDTH - CARD_W) / 2
            const y = 250 + i * (CARD_H + 18)
            const box = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x1a2030).setOrigin(0).setStrokeStyle(2, 0xffffff)
                .setInteractive({ useHandCursor: true })
            const rarity = this.add.text(14, 12, '', text(11, '#ffffff', true))
            const level = this.add.text(CARD_W - 14, 12, '', text(11, '#b8c4d4')).setOrigin(1, 0)
            const name = this.add.text(14, 34, '', text(19, '#ffffff', true))
            const desc = this.add.text(14, 66, '', { ...text(14, '#d0d8e4'), wordWrap: { width: CARD_W - 28 } })
            const container = this.add.container(x, y, [box, rarity, level, name, desc])
            this.levelUpLayer.add(container)
            box.on('pointerdown', () => {
                if (this.time.now - this.shownAt >= INPUT_GUARD_MS) this.armed = i
            })
            box.on('pointerup', () => {
                if (this.armed === i) this.pick(i)
                this.armed = null
            })
            box.on('pointerout', () => { if (this.armed === i) this.armed = null })
            this.cards.push({ box, rarity, name, desc, level, container })
        }
    }

    private buildGameOver() {
        const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070c, 0.85).setOrigin(0).setInteractive()
        const title = this.add.text(WIDTH / 2, 300, 'Run vorbei', text(30, '#ff6b6b', true)).setOrigin(0.5)
        this.gameOverStats = this.add.text(WIDTH / 2, 370, '', { ...text(16, '#e0e6ee'), align: 'center' }).setOrigin(0.5, 0)
        const btnBox = this.add.rectangle(WIDTH / 2, 520, 220, 56, 0x2bd96b).setInteractive({ useHandCursor: true })
        const btnText = this.add.text(WIDTH / 2, 520, 'Nochmal', text(20, '#06210f', true)).setOrigin(0.5)
        btnBox.on('pointerup', () => {
            this.gameOverLayer.setVisible(false)
            this.game_.restartRun()
        })
        this.gameOverLayer = this.add.container(0, 0, [dim, title, this.gameOverStats, btnBox, btnText]).setDepth(110).setVisible(false)
    }

    update() {
        const game = this.game_
        const run = game.run
        if (!run) return
        this.xpFill.width = WIDTH * Math.min(1, run.xp / run.xpNeeded)
        this.levelText.setText(`Lv ${run.level}`)
        this.timeText.setText(formatTime(run.timeSec))
        this.killText.setText(`Besiegt ${run.kills}`)
        this.epochText.setText(`${run.epoch.name} · ${run.weaponName}`)
        if (this.debugText) {
            this.debugText.setText(`${Math.round(this.game.loop.actualFps)} FPS · ${run.enemiesAlive} Gegner`)
        }
    }

    showLevelUp(choices: Upgrade[], owned: OwnedUpgrades) {
        this.choices = choices
        this.shownAt = this.time.now
        this.armed = null
        this.levelUpTitle.setText(`Level ${this.game_.run.level}!`)
        this.cards.forEach((c, i) => {
            const u = choices[i]
            c.container.setVisible(!!u)
            if (!u) return
            const color = RARITY_COLOR[u.rarity]
            c.box.setStrokeStyle(u.rarity === 'common' ? 2 : 3, color)
            c.rarity.setText(RARITY_LABEL[u.rarity].toUpperCase()).setColor('#' + color.toString(16).padStart(6, '0'))
            const lvl = owned[u.id] ?? 0
            c.level.setText(lvl ? `Stufe ${lvl} → ${lvl + 1}` : 'Neu')
            c.name.setText(u.name)
            c.desc.setText(u.description)
        })
        this.levelUpLayer.setVisible(true)
    }

    private pick(i: number) {
        const u = this.choices[i]
        if (!u) return
        this.levelUpLayer.setVisible(false)
        this.game_.chooseUpgrade(u)
    }

    showGameOver() {
        const run = this.game_.run
        this.gameOverStats.setText(`Zeit ${formatTime(run.timeSec)}\nLevel ${run.level}\nBesiegt ${run.kills}`)
        this.gameOverLayer.setVisible(true)
    }
}

function formatTime(sec: number): string {
    const s = Math.floor(sec)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
