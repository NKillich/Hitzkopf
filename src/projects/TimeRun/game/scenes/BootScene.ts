// Prüft die Daten und erzeugt Platzhalter-Grafiken (farbige Rechtecke).
import Phaser from 'phaser'
import { loadData } from '../../logic/data'
import { PLAYER_SIZE } from '../config'
import type { UiBridge } from '../bridge'
import { generateSprites } from '../sprites'
import { generateMicrobeArt } from '../art/microbes'
import { generateBackgrounds } from '../art/backgrounds'

export class BootScene extends Phaser.Scene {
    constructor() { super('boot') }

    create() {
        const bridge = this.registry.get('bridge') as UiBridge
        let data
        try {
            data = loadData()
        } catch (err) {
            console.error(err)
            bridge.set({ error: String((err as Error).message) })
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
        rect('player', PLAYER_SIZE, PLAYER_SIZE, 0x3dcf9e, 0x0d0a12)
        rect('shot', 4, 4, 0xffffff)
        rect('gem', 5, 5, 0xa6f7da, 0xffffff)
        rect('bar', 4, 4, 0xffffff)
        // Hintergrund-Kachel: Raster, damit man Bewegung sieht (Farbe kommt per Tint)
        g.clear()
        g.fillStyle(0xffffff, 1).fillRect(0, 0, 32, 1).fillRect(0, 0, 1, 32)
        g.generateTexture('grid', 32, 32)
        // Ziellinie am Ende einer Epoche (Schachbrett)
        g.clear()
        g.fillStyle(0xffffff, 0.85).fillRect(0, 0, 8, 4).fillRect(8, 4, 8, 4)
        g.fillStyle(0x000000, 0.6).fillRect(8, 0, 8, 4).fillRect(0, 4, 8, 4)
        g.generateTexture('finish', 16, 8)
        g.destroy()
        generateSprites(this)
        // Paket 1: farbige Figuren + eigene Hintergründe (Phase 1–2)
        const mobs = data.epochs.flatMap(e => [...e.enemies, ...(e.boss ? [e.boss] : [])])
            .filter(x => x.art).map(x => ({ id: x.id, art: x.art!, color: x.color }))
        generateMicrobeArt(this, mobs)
        generateBackgrounds(this)

        // Das Spiel startet erst mit „Run starten“ auf dem Startbildschirm (React)
        bridge.set({ ready: true })
        this.scene.stop()
    }
}
