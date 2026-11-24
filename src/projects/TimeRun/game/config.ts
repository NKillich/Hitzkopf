import Phaser from 'phaser'
// Feste Spielwerte (Spielfläche, Pools, Spieler-Grundwerte)
import type { BasePlayer } from '../logic/upgrades'

export const WIDTH = 390
export const HEIGHT = 844
/**
 * Das Spielbild wird in doppelter Auflösung gezeichnet (780 × 1688, Kamera-Zoom 2),
 * damit Texte auf dem Boden scharf bleiben. Welt-Koordinaten bleiben 390 × 844.
 */
export const RES = 2
/**
 * Bildschirmfeste Objekte (scrollFactor 0) werden um die Kameramitte gezoomt →
 * die sichtbare Fläche beginnt bei (VIEW_OX, VIEW_OY); ebenso liegt der obere Bildrand bei scrollY + VIEW_OY.
 */
export const VIEW_OX = (WIDTH * (RES - 1)) / 2
export const VIEW_OY = (HEIGHT * (RES - 1)) / 2

/** Pool-Größen – mehr gleichzeitig gibt es nicht (Gegner darüber hinaus werden ausgelassen). */
export const MAX_ENEMIES = 450
export const MAX_PROJECTILES = 200
export const MAX_GEMS = 400

export const PLAYER_SIZE = 20
export const PLAYER_BASE: BasePlayer = { maxHp: 50, moveSpeed: 115, pickupRadius: 64, xpGain: 1, regen: 0 }
/** Unverwundbar nach einem Treffer (ms) */
export const HIT_COOLDOWN_MS = 450
/** Fress-Phasen: so oft kann man größere Gegner/Bosse anknabbern (ms) */
export const BITE_COOLDOWN_MS = 250
/** Fress-Phasen: Verdauungspause nach jedem Bissen (ms) */
export const DIGEST_MS = 400
/** Fress-Phasen: so weit (px) über den Zellrand hinaus wird Beute in Bewegung geschluckt */
export const EAT_REACH = 10

/** Gegner, die so weit unter dem Bildschirm sind, werden wieder oben eingesetzt. */
export const RECYCLE_BELOW = 160

/** So nah an der Ziellinie erscheint der Boss (Spielpixel). */
export const BOSS_TRIGGER_DISTANCE = 350
/** Pause nach dem Boss, bevor die Evolutionswahl kommt (Kristalle fliegen noch ein). */
export const CLEAR_DELAY_MS = 1200

export const JOYSTICK_RADIUS = 52
export const JOYSTICK_DEADZONE = 0.12

export const RARITY_COLOR = { common: 0xb8c0cc, rare: 0x4aa3ff, epic: 0xb46cff, legendary: 0xffb020 } as const
export const RARITY_LABEL = { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' } as const

export const FONT = 'ui-monospace, "Courier New", monospace'

/**
 * Text glatt filtern: Wegen pixelArt würden Texte mit „Nearest“ verkleinert –
 * dabei verschwinden dünne Linien wie „-“, „–“ und „→“. Gilt auch für Texte in Containern.
 */
export function smoothTexts(objects: Phaser.GameObjects.GameObject[]) {
    for (const o of objects) {
        if (o instanceof Phaser.GameObjects.Text) smoothText(o)
        else if (o instanceof Phaser.GameObjects.Container) smoothTexts(o.list)
    }
}

const SMOOTHED = new WeakSet<Phaser.GameObjects.Text>()

/** Ligaturen verhindern: Die Pixel-Schrift zeichnet „fi“/„fl“ sonst als ein seltsames Zeichen. */
export function noLigatures(text: string): string {
    return text.replace(/f(?=[filt])/g, 'f‌')
}

function smoothText(t: Phaser.GameObjects.Text) {
    const apply = () => t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
    apply()
    if (SMOOTHED.has(t)) return
    SMOOTHED.add(t)
    // Phaser legt bei jeder Textänderung die Textur neu an (wieder „Nearest“) → danach erneut glätten
    const update = t.updateText.bind(t)
    t.updateText = () => {
        const fixed = noLigatures(t.text)
        if (fixed !== t.text) { t.setText(fixed); return t }   // setText ruft updateText erneut auf
        const r = update()
        apply()
        return r
    }
    t.setText(noLigatures(t.text))   // vorhandenen Text gleich korrigieren
}

export function hexToInt(hex: string): number {
    return parseInt(hex.slice(1), 16)
}
