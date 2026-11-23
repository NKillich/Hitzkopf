// Virtueller Joystick: erscheint dort, wo der Finger (oder die Maus) aufsetzt.
// Zusätzlich WASD/Pfeiltasten für den PC.
import Phaser from 'phaser'
import { JOYSTICK_DEADZONE, JOYSTICK_RADIUS } from './config'

export class Joystick {
    /** Richtung, Länge 0…1 */
    readonly vector = new Phaser.Math.Vector2()
    private pointerId: number | null = null
    private baseX = 0
    private baseY = 0
    private readonly base: Phaser.GameObjects.Rectangle
    private readonly knob: Phaser.GameObjects.Rectangle
    private readonly keys?: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>
    private readonly scene: Phaser.Scene

    constructor(scene: Phaser.Scene) {
        this.scene = scene
        // eckig im Pixel-Stil wie in der Vorlage: Basis 112 px, Knopf 36 px
        this.base = scene.add.rectangle(0, 0, 112, 112, 0x0d0a12, 0.45).setStrokeStyle(4, 0xf4eedc, 0.5)
        this.knob = scene.add.rectangle(0, 0, 36, 36, 0xf4eedc, 0.75)
        for (const o of [this.base, this.knob]) o.setScrollFactor(0).setDepth(1000).setVisible(false)

        scene.input.on('pointerdown', this.onDown, this)
        scene.input.on('pointermove', this.onMove, this)
        scene.input.on('pointerup', this.onUp, this)
        scene.input.on('pointerupoutside', this.onUp, this)

        const kb = scene.input.keyboard
        if (kb) {
            const K = Phaser.Input.Keyboard.KeyCodes
            this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as Joystick['keys']
        }
    }

    private onDown(p: Phaser.Input.Pointer) {
        if (this.pointerId !== null) return
        this.pointerId = p.id
        this.baseX = p.x
        this.baseY = p.y
        this.base.setPosition(p.x, p.y).setVisible(true)
        this.knob.setPosition(p.x, p.y).setVisible(true)
        this.vector.set(0, 0)
    }

    private onMove(p: Phaser.Input.Pointer) {
        if (p.id !== this.pointerId) return
        const dx = p.x - this.baseX
        const dy = p.y - this.baseY
        const len = Math.hypot(dx, dy)
        const clamped = Math.min(len, JOYSTICK_RADIUS)
        const nx = len > 0 ? dx / len : 0
        const ny = len > 0 ? dy / len : 0
        this.knob.setPosition(this.baseX + nx * clamped, this.baseY + ny * clamped)
        const strength = clamped / JOYSTICK_RADIUS
        if (strength < JOYSTICK_DEADZONE) this.vector.set(0, 0)
        else this.vector.set(nx * strength, ny * strength)
    }

    private onUp(p: Phaser.Input.Pointer) {
        if (p.id !== this.pointerId) return
        this.release()
    }

    /** Loslassen erzwingen (z. B. nach einer Pause, in der der Finger weg ging). */
    release() {
        this.pointerId = null
        this.vector.set(0, 0)
        this.base.setVisible(false)
        this.knob.setVisible(false)
    }

    /** Richtung inkl. Tastatur (Tastatur gewinnt, wenn gedrückt). */
    read(out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
        const k = this.keys
        if (k) {
            const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0)
            const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0)
            if (x || y) return out.set(x, y).normalize()
        }
        return out.copy(this.vector)
    }

    destroy() {
        this.scene.input.off('pointerdown', this.onDown, this)
        this.scene.input.off('pointermove', this.onMove, this)
        this.scene.input.off('pointerup', this.onUp, this)
        this.scene.input.off('pointerupoutside', this.onUp, this)
    }
}
