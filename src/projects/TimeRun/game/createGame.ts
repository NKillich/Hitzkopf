// Startet das Phaser-Spiel in einem Container-Element (wird von TimeRun.jsx erst bei Bedarf geladen).
// Die Oberfläche (HUD, Menüs) ist React; beide sprechen über die UiBridge miteinander.
import Phaser from 'phaser'
import { HEIGHT, WIDTH } from './config'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'
import type { UiBridge } from './bridge'

export interface GameOptions {
    debug?: boolean
    bridge: UiBridge
}

export function createGame(parent: HTMLElement, options: GameOptions): Phaser.Game {
    const { bridge } = options
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: '#14101E',
        pixelArt: true,
        roundPixels: true,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        input: { activePointers: 3 },
        physics: {
            default: 'arcade',
            arcade: { debug: false },
        },
        callbacks: {
            preBoot: g => {
                g.registry.set('debug', !!options.debug)
                g.registry.set('bridge', bridge)
            },
        },
        scene: [BootScene, GameScene],
    })
    // „Run starten“ – startet die Spielszene (läuft sie schon, wird sie neu gestartet)
    bridge.actions.startRun = () => {
        bridge.set({ overlay: null, stageCard: null, banner: null })
        game.scene.start('game')
    }
    // Im Debug-Modus für Tests in der Konsole erreichbar
    if (options.debug) (window as unknown as { __timerun?: Phaser.Game }).__timerun = game
    return game
}
