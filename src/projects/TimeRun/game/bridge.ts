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
    /** Erfahrung im aktuellen Level / bis zum nächsten Level */
    xp: number
    xpNeeded: number
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
    /** bisherige Upgrades mit Level (Leiste unten) */
    owned: OwnedUpgradeView[]
}

export interface OwnedUpgradeView { id: string; name: string; icon: IconKey; level: number; maxLevel: number }

export interface UpgradeCard {
    name: string
    /** Wirkung (erster Satz der Beschreibung) */
    effect: string
    /** Rest der Beschreibung (Fakt), evtl. leer */
    fact: string
    rarity: Rarity
    icon: IconKey
    /** bisheriges Level (0 = neu) und höchstes Level */
    level: number
    maxLevel: number
    kind: 'weapon' | 'passive'
}
export interface EvolutionCard { name: string; desc: string; grants: string[]; real: boolean; general: boolean; icon: IconKey }

export type Overlay =
    | { type: 'levelup'; level: number; choices: UpgradeCard[]; rerolls: number }
    | {
        type: 'evolution'; fromName: string; toCode: string; toName: string; range: string; future: boolean
        options: EvolutionCard[]; tags: string[]; path: string[]
    }
    | { type: 'pause'; stages?: TeleportStage[] }
    | {
        /** „Tada“ nach der Evolution: alte → neue Form, neues Merkmal, Durchbruch-Boni */
        type: 'evolved'; code: string; stageName: string; trait: string; desc: string; real: boolean
        oldImg: string; newImg: string; bonuses: string[]
    }
    | {
        type: 'end'; won: boolean; reachedCode: string; reachedName: string; year: string
        stageIndex: number; stageCount: number; timeSec: number; kills: number; level: number
        realCount: number; pastCount: number; badge: boolean; path: { name: string; real: boolean }[]; newRecord: boolean
    }

/** Teleporter (nur Debug): Stufen, zu denen man springen kann */
export interface TeleportStage { id: string; code: string; name: string; phase: number; boss: boolean }

export interface BestRun { stageIndex: number; stageCount: number; code: string; name: string }

export interface UiState {
    screen: 'start' | 'run'
    ready: boolean
    error: string | null
    hud: HudState | null
    /** Hinweis unten (Onboarding, Easter Egg); swipe = Wisch-Hand zeigen */
    hint: { text: string; swipe: boolean } | null
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
    /** Debug: zu Stufe `id` springen, `at` = Anteil der Höhe (0 = Start, 0.5 = Mitte, 1 = vor Ende/Boss) */
    teleport(id: string, at: number): void
    /** nach der Tada-Karte weiterspielen */
    continueEvolution(): void
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
            screen: 'start', ready: false, error: null, hud: null, hint: null, overlay: null, overlayAt: 0,
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
