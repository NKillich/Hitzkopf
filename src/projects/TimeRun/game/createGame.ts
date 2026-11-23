// Startet das Phaser-Spiel in einem Container-Element (wird von TimeRun.jsx erst bei Bedarf geladen).
import Phaser from 'phaser'
import { HEIGHT, WIDTH } from './config'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'

export interface GameOptions {
    debug?: boolean
}

export function createGame(parent: HTMLElement, options: GameOptions = {}): Phaser.Game {
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: '#000000',
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
            preBoot: game => game.registry.set('debug', !!options.debug),
        },
        scene: [BootScene, GameScene, UIScene],
    })
    // Im Debug-Modus für Tests in der Konsole erreichbar
    if (options.debug) (window as unknown as { __timerun?: Phaser.Game }).__timerun = game
    return game
}
