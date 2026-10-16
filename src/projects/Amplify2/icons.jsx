// Eigene Icons für Amplify 2.0 (Pfeile fürs Voting) – im Stil von shared/ui/icons
const Svg = ({ size, w = 2.4, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
export const IconArrowUp = ({ size = 18 }) => <Svg size={size}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
export const IconArrowDown = ({ size = 18 }) => <Svg size={size}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
export const IconSmile = ({ size = 24 }) => <Svg size={size} w={2}><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5v.01M15 9.5v.01" /></Svg>
// Spotify-Symbol (Kreis mit drei Bögen) für den Knopf „Spotify öffnen“
export const IconSpotify = ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#1DB954" />
        <path d="M6.6 9.3c3.6-1.1 7.7-.8 10.9 1M7.2 12.3c3-.9 6.3-.6 9 .8M7.8 15.1c2.4-.7 4.9-.5 7.1.6" fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
)
// QR-Code scannen: gemeinsames Symbol (auch auf der Startseite)
export { IconQr } from '../../shared/ui/icons'
