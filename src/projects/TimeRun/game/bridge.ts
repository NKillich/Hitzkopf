// Brücke zwischen Phaser (Spielwelt) und der React-Oberfläche (HUD, Auswahl, Menüs).
// Das Spiel schreibt einen unveränderlichen Zustand, React liest ihn per useSyncExternalStore
// und ruft die Aktionen auf. Klein gehalten, damit es nicht im Phaser-Bundle landen muss.

export type IconKey =
    | 'speed' | 'heart' | 'damage' | 'cooldown' | 'range' | 'xp' | 'multi' | 'pierce' | 'regen' | 'magnet' | 'toxin'
    | 'cell' | 'colony' | 'fish' | 'paw' | 'tool' | 'rocket'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface TimelineDot {
    code: string
    status: 'done' | 'current' | 'skipped' | 'future'
    real?: boolean
}

export interface HudState {
    code: string
    name: string
    year: string
    weapon: string
    hp: number
    maxHp: number
    level: number
    xpFrac: number
    timeSec: number
    kills: number
    tags: string[]
    progress: number
    stageIndex: number
    stageCount: number
    timeline: TimelineDot[]
    boss: { name: string; frac: number } | null
    fps: number
    enemies: number
}

export interface UpgradeCard { name: string; desc: string; rarity: Rarity; levelText: string; icon: IconKey }
export interface EvolutionCard { name: string; desc: string; grants: string[]; real: boolean; general: boolean; icon: IconKey }

export type Overlay =
    | { type: 'levelup'; level: number; choices: UpgradeCard[]; rerolls: number; skills: { name: string; level: number }[] }
    | {
        type: 'evolution'; fromName: string; toCode: string; toName: string; range: string; future: boolean
        options: EvolutionCard[]; tags: string[]; path: string[]
    }
    | { type: 'pause' }
    | {
        type: 'end'; won: boolean; reachedCode: string; reachedName: string; year: string
        stageIndex: number; stageCount: number; timeSec: number; kills: number; level: number
        realCount: number; pastCount: number; badge: boolean; path: { name: string; real: boolean }[]; newRecord: boolean
    }

export interface BestRun { stageIndex: number; stageCount: number; code: string; name: string }

export interface UiState {
    screen: 'start' | 'run'
    ready: boolean
    error: string | null
    hud: HudState | null
    overlay: Overlay | null
    /** Zeitpunkt (performance.now) des letzten Öffnens – kurze Klicksperre gegen versehentliches Wählen */
    overlayAt: number
    banner: { id: number; text: string } | null
    best: BestRun | null
    debug: boolean
}

export interface UiActions {
    startRun(): void
    pickUpgrade(i: number): void
    reroll(): void
    pickEvolution(i: number): void
    pause(): void
    resume(): void
    restart(): void
    toMenu(): void
    debugBurst(): void
    debugGoal(): void
}

const BEST_KEY = 'ages_up_best_v1'

export function loadBest(): BestRun | null {
    try {
        const raw = localStorage.getItem(BEST_KEY)
        return raw ? JSON.parse(raw) as BestRun : null
    } catch { return null }
}

export function saveBest(b: BestRun) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)) } catch { /* privat/gesperrt: dann eben nicht */ }
}

export class UiBridge {
    private state: UiState
    private readonly listeners = new Set<() => void>()
    actions: Partial<UiActions> = {}

    constructor(debug = false) {
        this.state = {
            screen: 'start', ready: false, error: null, hud: null, overlay: null, overlayAt: 0,
            banner: null, best: loadBest(), debug,
        }
    }

    getState = (): UiState => this.state

    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn)
        return () => this.listeners.delete(fn)
    }

    set(patch: Partial<UiState>) {
        this.state = { ...this.state, ...patch }
        for (const fn of this.listeners) fn()
    }

    setOverlay(overlay: Overlay | null) {
        this.set({ overlay, overlayAt: performance.now() })
    }

    call<K extends keyof UiActions>(name: K, ...args: Parameters<UiActions[K]>) {
        const fn = this.actions[name] as ((...a: unknown[]) => void) | undefined
        fn?.(...args)
    }
}
