// HUD (XP, Level, echtes Jahr, Boss) + Zeitstrahl am Rand + Infokarte zur Stufe
// + Auswahl (Level-up / Evolution) + Run-Ende. Liegt über der Spielszene.
import Phaser from 'phaser'
import type { Epoch, EvolutionOption, Upgrade } from '../../logic/types'
import type { OwnedUpgrades } from '../../logic/upgrades'
import { formatRange, formatYear, PRESENT_YEAR } from '../../logic/time'
import { FONT, HEIGHT, RARITY_COLOR, RARITY_LABEL, WIDTH, smoothTexts } from '../config'
import type { GameScene } from './GameScene'

const text = (size: number, color = '#ffffff', bold = false): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', resolution: 2,
})
const css = (c: number) => '#' + c.toString(16).padStart(6, '0')

const CARD_W = 330
const CARD_H = 132
const CARD_GAP = 14
const MAX_CARDS = 4
/** Kurze Sperre nach dem Öffnen, damit der Finger vom Joystick nicht aus Versehen wählt. */
const INPUT_GUARD_MS = 400
const REAL_COLOR = 0xffd34d

// Zeitstrahl am rechten Rand: unten Stufe 1.1, oben 6.3
const TL_X = WIDTH - 12
const TL_TOP = 110
const TL_BOTTOM = 790

interface Card {
    box: Phaser.GameObjects.Rectangle
    badge: Phaser.GameObjects.Text
    right: Phaser.GameObjects.Text
    name: Phaser.GameObjects.Text
    desc: Phaser.GameObjects.Text
    container: Phaser.GameObjects.Container
}

interface CardItem {
    badge: string
    color: number
    right: string
    name: string
    desc: string
}

export class UIScene extends Phaser.Scene {
    private xpFill!: Phaser.GameObjects.Rectangle
    private levelText!: Phaser.GameObjects.Text
    private yearText!: Phaser.GameObjects.Text
    private killText!: Phaser.GameObjects.Text
    private epochText!: Phaser.GameObjects.Text
    private debugText?: Phaser.GameObjects.Text

    private bossLayer!: Phaser.GameObjects.Container
    private bossName!: Phaser.GameObjects.Text
    private bossFill!: Phaser.GameObjects.Rectangle

    private timelineGfx!: Phaser.GameObjects.Graphics
    private timelineLabels: Phaser.GameObjects.Text[] = []
    private timelineMarker!: Phaser.GameObjects.Rectangle
    private progressText!: Phaser.GameObjects.Text
    private timelineVersion = -1
    private currentOrder = 1
    private stageCount = 18

    private stageCard!: Phaser.GameObjects.Container
    private stageBg!: Phaser.GameObjects.Rectangle
    private stageTitle!: Phaser.GameObjects.Text
    private stageRange!: Phaser.GameObjects.Text
    private stageFact!: Phaser.GameObjects.Text

    private chooserLayer!: Phaser.GameObjects.Container
    private chooserTitle!: Phaser.GameObjects.Text
    private chooserSub!: Phaser.GameObjects.Text
    private chooserFoot!: Phaser.GameObjects.Text
    private cards: Card[] = []
    private onPick: ((i: number) => void) | null = null
    private itemCount = 0
    private shownAt = 0
    private armed: number | null = null

    private banner!: Phaser.GameObjects.Text

    private endLayer!: Phaser.GameObjects.Container
    private endTitle!: Phaser.GameObjects.Text
    private endStats!: Phaser.GameObjects.Text

    constructor() { super('ui') }

    private get game_(): GameScene {
        return this.scene.get('game') as GameScene
    }

    create() {
        this.timelineVersion = -1
        this.timelineLabels = []

        // HUD
        this.add.rectangle(0, 0, WIDTH, 50, 0x000000, 0.4).setOrigin(0)   // dunkler Streifen, damit der HUD lesbar bleibt
        this.add.rectangle(0, 0, WIDTH, 8, 0x000000, 0.6).setOrigin(0)
        this.xpFill = this.add.rectangle(0, 0, 0, 8, 0x6bf0ff).setOrigin(0)
        this.yearText = this.add.text(52, 12, '', text(15, '#ffffff', true))   // rechts neben dem Zurück-Knopf
        this.levelText = this.add.text(WIDTH - 8, 13, '', text(12, '#ffffff', true)).setOrigin(1, 0)   // links oben liegt der Zurück-Knopf
        this.killText = this.add.text(WIDTH - 8, 33, '', text(11, '#d0d8e4')).setOrigin(1, 0)
        this.epochText = this.add.text(52, 33, '', text(11, '#9fb3c8'))   // rechts neben dem Zurück-Knopf

        // Boss-Leiste
        this.bossName = this.add.text(WIDTH / 2, 58, '', text(13, '#ff9a9a', true)).setOrigin(0.5, 0)
        const bossBg = this.add.rectangle(WIDTH / 2, 80, 262, 10, 0x000000, 0.7).setStrokeStyle(1, 0xff9a9a)
        this.bossFill = this.add.rectangle(WIDTH / 2 - 130, 80, 260, 8, 0xff4d4d).setOrigin(0, 0.5)
        this.bossLayer = this.add.container(0, 0, [this.bossName, bossBg, this.bossFill]).setVisible(false)

        // Zeitstrahl
        this.timelineGfx = this.add.graphics()
        this.timelineMarker = this.add.rectangle(TL_X, TL_BOTTOM, 8, 8, 0x5ad1ff).setStrokeStyle(1, 0xffffff)
        this.progressText = this.add.text(TL_X - 10, TL_BOTTOM, '', text(10, '#cfe8ff', true)).setOrigin(1, 0.5)

        if (this.registry.get('debug')) {
            this.debugText = this.add.text(8, HEIGHT - 22, '', text(11, '#ffe066'))
            const burst = this.add.text(WIDTH - 28, HEIGHT - 24, '[+300]', text(12, '#ffe066', true)).setOrigin(1, 0)
                .setInteractive({ useHandCursor: true })
            burst.on('pointerup', () => this.game_.spawnBurst(300))
            const goal = this.add.text(WIDTH - 90, HEIGHT - 24, '[Ziel]', text(12, '#ffe066', true)).setOrigin(1, 0)
                .setInteractive({ useHandCursor: true })
            goal.on('pointerup', () => this.game_.skipToGoal())
        }

        this.banner = this.add.text(WIDTH / 2, 300, '', { ...text(22, '#ffffff', true), align: 'center', wordWrap: { width: 340 }, lineSpacing: 6 })
            .setOrigin(0.5).setAlpha(0).setDepth(90)

        this.buildStageCard()
        this.buildChooser()
        this.buildEnd()
        smoothTexts(this.children.list)

        // Infokarte zur ersten Stufe
        this.time.delayedCall(250, () => {
            const run = this.game_.run
            if (run) this.showStage(run.epoch, run.weaponName)
        })
    }

    private buildStageCard() {
        this.stageBg = this.add.rectangle(0, 0, 340, 100, 0x05070c, 0.82).setOrigin(0.5, 0).setStrokeStyle(1, 0x6bf0ff, 0.6)
        this.stageTitle = this.add.text(0, 12, '', { ...text(15, '#ffffff', true), align: 'center', wordWrap: { width: 316 } }).setOrigin(0.5, 0)
        this.stageRange = this.add.text(0, 0, '', { ...text(11, '#9fd8ff'), align: 'center', wordWrap: { width: 316 } }).setOrigin(0.5, 0)
        this.stageFact = this.add.text(0, 0, '', { ...text(12, '#dfe6ee'), align: 'center', wordWrap: { width: 316 }, lineSpacing: 2 }).setOrigin(0.5, 0)
        this.stageCard = this.add.container(WIDTH / 2, 96, [this.stageBg, this.stageTitle, this.stageRange, this.stageFact])
            .setAlpha(0).setDepth(80)
    }

    private buildChooser() {
        const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070c, 0.84).setOrigin(0).setInteractive()   // fängt Klicks ab
        this.chooserTitle = this.add.text(WIDTH / 2, 0, '', text(24, '#ffffff', true)).setOrigin(0.5)
        this.chooserSub = this.add.text(WIDTH / 2, 0, '', { ...text(13, '#b8c4d4'), align: 'center', wordWrap: { width: 340 }, lineSpacing: 2 }).setOrigin(0.5)
        this.chooserFoot = this.add.text(WIDTH / 2, 0, '', { ...text(11, '#8fa0b4'), align: 'center', wordWrap: { width: 340 } }).setOrigin(0.5, 0)
        this.chooserLayer = this.add.container(0, 0, [dim, this.chooserTitle, this.chooserSub, this.chooserFoot]).setDepth(100).setVisible(false)

        this.cards = []
        for (let i = 0; i < MAX_CARDS; i++) {
            const box = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x1a2030).setOrigin(0).setStrokeStyle(2, 0xffffff)
                .setInteractive({ useHandCursor: true })
            const badge = this.add.text(14, 11, '', text(10, '#ffffff', true))
            const right = this.add.text(CARD_W - 14, 11, '', text(10, '#b8c4d4')).setOrigin(1, 0)
            const name = this.add.text(14, 30, '', { ...text(17, '#ffffff', true), wordWrap: { width: CARD_W - 28 } })
            const desc = this.add.text(14, 58, '', { ...text(12, '#d0d8e4'), wordWrap: { width: CARD_W - 28 }, lineSpacing: 2 })
            const container = this.add.container((WIDTH - CARD_W) / 2, 0, [box, badge, right, name, desc])
            this.chooserLayer.add(container)
            box.on('pointerdown', () => {
                if (this.time.now - this.shownAt >= INPUT_GUARD_MS) this.armed = i
            })
            box.on('pointerup', () => {
                if (this.armed === i) this.pick(i)
                this.armed = null
            })
            box.on('pointerout', () => { if (this.armed === i) this.armed = null })
            this.cards.push({ box, badge, right, name, desc, container })
        }
    }

    private buildEnd() {
        const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070c, 0.9).setOrigin(0).setInteractive()
        this.endTitle = this.add.text(WIDTH / 2, 200, '', text(26, '#ff6b6b', true)).setOrigin(0.5)
        this.endStats = this.add.text(WIDTH / 2, 240, '', { ...text(13, '#e0e6ee'), align: 'center', wordWrap: { width: 340 }, lineSpacing: 4 })
            .setOrigin(0.5, 0)
        const btnBox = this.add.rectangle(WIDTH / 2, 700, 220, 56, 0x2bd96b).setInteractive({ useHandCursor: true })
        const btnText = this.add.text(WIDTH / 2, 700, 'Nochmal', text(20, '#06210f', true)).setOrigin(0.5)
        btnBox.on('pointerup', () => {
            this.endLayer.setVisible(false)
            this.game_.restartRun()
        })
        this.endLayer = this.add.container(0, 0, [dim, this.endTitle, this.endStats, btnBox, btnText]).setDepth(110).setVisible(false)
    }

    update() {
        const game = this.game_
        const run = game.run
        if (!run) return
        this.xpFill.width = WIDTH * Math.min(1, run.xp / run.xpNeeded)
        this.yearText.setText(formatYear(run.year))
        this.levelText.setText(`Lv ${run.level} · ${formatTime(run.timeSec)}`)
        this.killText.setText(`Besiegt ${run.kills}`)
        this.epochText.setText(`${run.epoch.code} ${run.epoch.shortName}`)

        this.bossLayer.setVisible(!!run.boss)
        if (run.boss) {
            this.bossName.setText(run.boss.name)
            this.bossFill.width = 260 * (run.boss.hp / run.boss.maxHp)
        }

        if (game.timelineVersion !== this.timelineVersion) {
            this.timelineVersion = game.timelineVersion
            this.drawTimeline()
        }
        // Markierung wandert von der aktuellen Stufe zur nächsten
        const y0 = this.tlY(this.currentOrder)
        const y1 = this.currentOrder < this.stageCount ? this.tlY(this.currentOrder + 1) : TL_TOP - 20
        this.timelineMarker.y = y0 + (y1 - y0) * run.progress
        this.progressText.setY(this.timelineMarker.y).setText(`${Math.floor(run.progress * 100)} %`)

        if (this.debugText) {
            this.debugText.setText(`${Math.round(this.game.loop.actualFps)} FPS · ${run.enemiesAlive} Gegner`)
        }
    }

    private tlY(order: number): number {
        return TL_BOTTOM - (order - 1) * ((TL_BOTTOM - TL_TOP) / Math.max(1, this.stageCount - 1))
    }

    private drawTimeline() {
        const entries = this.game_.timeline()
        this.stageCount = entries.length
        const g = this.timelineGfx.clear()
        const current = entries.findIndex(e => e.status === 'current')
        this.currentOrder = current + 1
        g.lineStyle(2, 0x3a4658, 0.9).lineBetween(TL_X, this.tlY(1), TL_X, this.tlY(entries.length))
        if (current > 0) g.lineStyle(2, 0x6bf0ff, 0.9).lineBetween(TL_X, this.tlY(1), TL_X, this.tlY(current + 1))
        for (const l of this.timelineLabels) l.destroy()
        this.timelineLabels = []
        entries.forEach((e, i) => {
            const y = this.tlY(i + 1)
            if (e.status === 'current') g.fillStyle(0xffffff, 1).fillCircle(TL_X, y, 4.5)
            else if (e.status === 'done') g.fillStyle(0x6bf0ff, 1).fillCircle(TL_X, y, 3.5)
            else if (e.status === 'skipped') g.fillStyle(0x55606e, 1).fillCircle(TL_X, y, 2.5)
            else g.lineStyle(1.5, 0x7a8698, 1).strokeCircle(TL_X, y, 3)
            // getroffene Entscheidung: goldene Marke links daneben
            if (e.choice) g.fillStyle(REAL_COLOR, 1).fillRect(TL_X - 10, y - 2, 4, 4)
            // Hauptphase beginnt: kleine Ziffer
            if (e.code.endsWith('.1')) {
                const label = this.add.text(TL_X - 16, y, e.code[0], text(9, '#6c7a8c', true)).setOrigin(1, 0.5)
                smoothTexts([label])
                this.timelineLabels.push(label)
            }
        })
    }

    /** Infokarte beim Betreten einer Stufe: Name, echter Zeitraum, belegbare Info. */
    showStage(epoch: Epoch, weaponName: string) {
        this.stageTitle.setText(`${epoch.code} ${epoch.name}`)
        const hint = weaponName.startsWith('Fressen') ? ' (Kleinere berühren, Größere anknabbern)' : ''
        this.stageRange.setText(`${formatRange(epoch.fromYear, epoch.toYear)}
Waffe: ${weaponName}${hint}`).setY(this.stageTitle.y + this.stageTitle.height + 4)
        this.stageFact.setText(epoch.fact).setY(this.stageRange.y + this.stageRange.height + 8)
        this.stageBg.setSize(340, this.stageFact.y + this.stageFact.height + 12)
        this.tweens.killTweensOf(this.stageCard)
        this.stageCard.setAlpha(0).setY(86)
        this.tweens.chain({
            targets: this.stageCard,
            tweens: [
                { alpha: 1, y: 96, duration: 300, ease: 'Quad.Out' },
                { alpha: 0, duration: 600, delay: 5500 },
            ],
        })
    }

    // ---- Auswahl (Level-up und Evolution) ----

    private openChooser(title: string, titleColor: string, sub: string, foot: string, items: CardItem[], onPick: (i: number) => void) {
        this.onPick = onPick
        this.itemCount = items.length
        this.shownAt = this.time.now
        this.armed = null
        // Infokarte ausblenden, solange gewählt wird
        this.tweens.killTweensOf(this.stageCard)
        this.stageCard.setAlpha(0)
        const n = Math.min(items.length, MAX_CARDS)
        const top = n > 3 ? 170 : 222
        this.chooserTitle.setText(title).setColor(titleColor).setY(top - 84)
        this.chooserSub.setText(sub).setY(top - 40)
        this.cards.forEach((c, i) => {
            const it = items[i]
            c.container.setVisible(!!it)
            if (!it) return
            c.container.setY(top + i * (CARD_H + CARD_GAP))
            c.box.setStrokeStyle(3, it.color)
            c.badge.setText(it.badge).setColor(css(it.color))
            c.right.setText(it.right)
            c.name.setText(it.name)
            c.desc.setText(it.desc).setY(c.name.y + c.name.height + 4)
        })
        this.chooserFoot.setText(foot).setY(top + n * (CARD_H + CARD_GAP) + 2)
        this.chooserLayer.setVisible(true)
    }

    private pick(i: number) {
        if (i >= this.itemCount || !this.onPick) return
        const cb = this.onPick
        this.onPick = null
        this.chooserLayer.setVisible(false)
        cb(i)
    }

    showLevelUp(choices: Upgrade[], owned: OwnedUpgrades) {
        const items = choices.map(u => {
            const lvl = owned[u.id] ?? 0
            return {
                badge: RARITY_LABEL[u.rarity].toUpperCase(), color: RARITY_COLOR[u.rarity],
                right: lvl ? `Stufe ${lvl} → ${lvl + 1}` : 'Neu', name: u.name, desc: u.description,
            }
        })
        this.openChooser(`Level ${this.game_.run.level}!`, '#ffffff', 'Wähle ein Upgrade', '', items,
            i => this.game_.chooseUpgrade(choices[i]))
    }

    showEvolution(options: EvolutionOption[], from: Epoch, stage: Epoch) {
        // echte Option zuerst, damit man sie leicht findet
        const shown = [...options].sort((a, b) => Number(!!b.real) - Number(!!a.real)).slice(0, MAX_CARDS)
        const items = shown.map(o => ({
            badge: o.real ? '★ ECHTE ZEITLINIE' : o.general ? 'ALLGEMEIN' : 'ANDERE ZEITLINIE',
            color: o.real ? REAL_COLOR : o.general ? 0x9aa6b8 : 0x6bdc8c,
            right: o.grants.length ? o.grants.join(', ') : '', name: o.name, desc: o.description,
        }))
        const path = this.game_.run.path
        const foot = path.length ? 'Bisher: ' + path.map(p => p.name).join(' → ') : ''
        const future = stage.fromYear >= PRESENT_YEAR ? '\nAb hier ist alles Zukunft – es gibt keine echte Zeitlinie.' : ''
        this.openChooser('Evolution', '#6bdc8c',
            `${from.code} geschafft! Weiter: ${stage.code} ${stage.name}\n${formatRange(stage.fromYear, stage.toYear)}${future}`,
            foot, items, i => this.game_.chooseEvolution(shown[i]))
    }

    /** Kurzer Schriftzug in der Mitte (z. B. Boss). */
    showBanner(msg: string, color = '#ffffff') {
        this.tweens.killTweensOf(this.banner)
        this.banner.setText(msg).setColor(color).setAlpha(0).setScale(0.9)
        this.tweens.chain({
            targets: this.banner,
            tweens: [
                { alpha: 1, scale: 1, duration: 260, ease: 'Back.Out' },
                { alpha: 0, duration: 500, delay: 1300 },
            ],
        })
    }

    showEnd(won: boolean) {
        const run = this.game_.run
        this.tweens.killTweensOf(this.stageCard)
        this.stageCard.setAlpha(0)
        this.endTitle.setText(won ? 'Ankunft in den Sternen!' : 'Run vorbei').setColor(won ? '#6bdc8c' : '#ff6b6b')
        // Echte Zeitlinie: nur Entscheidungen bis heute zählen
        const past = run.path.filter(p => this.game_.stageFromYear(p.stage) < PRESENT_YEAR)
        const real = past.filter(p => p.real).length
        const lines = [
            `Zeit ${formatTime(run.timeSec)} · Level ${run.level} · Besiegt ${run.kills}`,
            `${won ? 'Geschafft bis' : 'Gestorben in'}: ${run.epoch.code} ${run.epoch.shortName}`,
            `(${formatYear(run.year)})`,
            '',
        ]
        if (past.length) {
            lines.push(`Echte Zeitlinie: ${real} von ${past.length} Entscheidungen`)
            if (won && real === past.length) lines.push('★ Abzeichen „Echte Zeitlinie“ – genau wie in Wirklichkeit!')
            lines.push('')
        }
        lines.push(`Weg: ${run.path.length ? run.path.map(p => (p.real ? '★ ' : '') + p.name).join(' → ') : '–'}`)
        this.endStats.setText(lines.join('\n'))
        this.endLayer.setVisible(true)
    }
}

function formatTime(sec: number): string {
    const s = Math.floor(sec)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
