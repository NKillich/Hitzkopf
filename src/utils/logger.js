// Debug-Ausgaben nur im Dev-Server (npm run dev). Im Production-Build sind sie No-Ops.
// Fehler weiterhin direkt mit console.error ausgeben.
const noop = () => {}

export const log = import.meta.env.DEV ? console.log.bind(console) : noop
export const warn = import.meta.env.DEV ? console.warn.bind(console) : noop
