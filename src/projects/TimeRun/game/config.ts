// Feste Spielwerte (Spielfläche, Pools, Spieler-Grundwerte)
import type { BasePlayer } from '../logic/upgrades'

export const WIDTH = 390
export const HEIGHT = 844

/** Pool-Größen – mehr gleichzeitig gibt es nicht (Gegner darüber hinaus werden ausgelassen). */
export const MAX_ENEMIES = 450
export const MAX_PROJECTILES = 200
export const MAX_GEMS = 400

export const PLAYER_SIZE = 14
export const PLAYER_BASE: BasePlayer = { maxHp: 50, moveSpeed: 115, pickupRadius: 64, xpGain: 1, regen: 0 }
/** Unverwundbar nach einem Treffer (ms) */
export const HIT_COOLDOWN_MS = 450

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

export function hexToInt(hex: string): number {
    return parseInt(hex.slice(1), 16)
}
