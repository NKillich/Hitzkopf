// Prüft die Daten und erzeugt Platzhalter-Grafiken (farbige Rechtecke).
import Phaser from 'phaser'
import { loadData } from '../../logic/data'
import { PLAYER_SIZE } from '../config'

export class BootScene extends Phaser.Scene {
    constructor() { super('boot') }

    create() {
        let data
        try {
            data = loadData()
        } catch (err) {
            this.add.text(12, 12, String((err as Error).message), { fontSize: '12px', color: '#ff8080', wordWrap: { width: 366 } })
            console.error(err)
            return
        }
        this.registry.set('data', data)

        const g = this.add.graphics()
        const rect = (key: string, w: number, h: number, color: number, border?: number) => {
            g.clear()
            g.fillStyle(color, 1).fillRect(0, 0, w, h)
            if (border !== undefined) g.fillStyle(border, 1).fillRect(0, 0, w, 1).fillRect(0, h - 1, w, 1).fillRect(0, 0, 1, h).fillRect(w - 1, 0, 1, h)
            g.generateTexture(key, w, h)
        }
        // Weiße Vorlagen werden per Tint eingefärbt (Gegnerfarbe aus den Daten)
        rect('px', 8, 8, 0xffffff, 0xdddddd)
        rect('player', PLAYER_SIZE, PLAYER_SIZE, 0x5ad1ff, 0xffffff)
        rect('shot', 4, 4, 0xffffff)
        rect('gem', 5, 5, 0x6bf0ff, 0xffffff)
        rect('bar', 4, 4, 0xffffff)
        // Hintergrund-Kachel: Raster, damit man Bewegung sieht (Farbe kommt per Tint)
        g.clear()
        g.fillStyle(0xffffff, 1).fillRect(0, 0, 32, 1).fillRect(0, 0, 1, 32)
        g.generateTexture('grid', 32, 32)
        g.destroy()

        this.scene.start('game')
    }
}
