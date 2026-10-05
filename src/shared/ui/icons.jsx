// Strich-Symbole der Apps im neuen Design (24er-Raster, Farbe über currentColor)
const Svg = ({ size = 20, w = 2.2, fill = 'none', children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const IconMoon = () => <Svg w={2}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>
export const IconSun = () => <Svg w={2}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
export const IconBack = () => <Svg size={22}><path d="M15 6l-6 6 6 6" /></Svg>
export const IconNext = () => <Svg size={20} w={2.4}><path d="M9 6l6 6-6 6" /></Svg>
export const IconCheck = ({ size = 18, w = 3 }) => <Svg size={size} w={w}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
export const IconX = ({ size = 18, w = 2.6 }) => <Svg size={size} w={w}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const IconLock = ({ size = 20, w = 2.2 }) => <Svg size={size} w={w}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
export const IconPlay = ({ size = 18 }) => <Svg size={size} fill="currentColor" w={0}><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></Svg>
export const IconPause = ({ size = 18 }) => <Svg size={size} w={0}><rect x="6" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /><rect x="13.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /></Svg>
export const IconNote = ({ size = 22 }) => <Svg size={size}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></Svg>
export const IconSearch = ({ size = 20 }) => <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Svg>
export const IconRetry = ({ size = 18 }) => <Svg size={size}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></Svg>
export const IconReplay = ({ size = 18 }) => <Svg size={size}><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v5h5" /></Svg>
export const IconEye = ({ size = 22 }) => <Svg size={size}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
export const IconEyeOff = ({ size = 22 }) => <Svg size={size}><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9" /><path d="M9.9 4.2A9.8 9.8 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2" /><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="M2 2l20 20" /></Svg>
export const IconAlert = ({ size = 22 }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Svg>
export const IconClock = ({ size = 24 }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
export const IconChevron = ({ open }) => <span style={{ display: 'flex', transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform .2s' }}><Svg size={22} w={2.4}><path d="M6 9l6 6 6-6" /></Svg></span>
export const IconWave = ({ size = 13 }) => <Svg size={size} w={3}><path d="M5 10v4M10 6v12M15 8v8M20 11v2" /></Svg>
export const IconInfo = () => <Svg size={18} w={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></Svg>
export const IconPlus = ({ size = 22 }) => <Svg size={size} w={2.6}><path d="M12 5v14M5 12h14" /></Svg>
export const IconTrash = ({ size = 18 }) => <Svg size={size} w={2}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Svg>
export const IconUsers = ({ size = 16 }) => <Svg size={size} w={2}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></Svg>
export const IconGear = ({ size = 22 }) => <Svg size={size} w={2}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>
export const IconThumbUp = ({ size = 20 }) => <Svg size={size} w={2}><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.5 20H7" /></Svg>
export const IconThumbDown = ({ size = 20 }) => <Svg size={size} w={2}><path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zM17 13l-4 8a2.5 2.5 0 0 1-2.5-2.5V15H5.3a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.5 4H17" /></Svg>
export const IconQueue = ({ size = 18 }) => <Svg size={size} w={2.2}><path d="M4 6h16M4 12h10M4 18h10M18 14v6l4-3z" /></Svg>
export const IconLeave = ({ size = 20 }) => <Svg size={size} w={2.2}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></Svg>
export const IconBallot = ({ size = 22 }) => <Svg size={size} w={2}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V10M9.5 7.5l1.5 1.5 3-3M8 15h8" /></Svg>
export const IconSpeaker = ({ size = 18 }) => <Svg size={size} w={2}><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="12" cy="14" r="3.5" /><path d="M12 7v.01" /></Svg>
export const IconShare = ({ size = 20 }) => <Svg size={size} w={2.2}><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" /><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></Svg>
export const IconHelp = ({ size = 16 }) => <Svg size={size} w={2.4}><path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18v.01" /></Svg>
export const IconCopy = ({ size = 18 }) => <Svg size={size} w={2}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></Svg>
export const IconTv = ({ size = 18 }) => <Svg size={size} w={2}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></Svg>
export const IconDice = ({ size = 20 }) => <Svg size={size} w={2}><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M8.5 8.5v.01M15.5 8.5v.01M12 12v.01M8.5 15.5v.01M15.5 15.5v.01" strokeWidth="3" /></Svg>
export const IconStar = ({ size = 20 }) => <Svg size={size} w={2}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></Svg>
export const IconFlame = ({ size = 20 }) => <Svg size={size} w={2}><path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.8-3-6-4-9.5-1.5 2-2 3.5-2 5-1-1-1.5-2-1.5-3.5C8 9 5.5 11.5 5.5 14.5A6.5 6.5 0 0 0 12 21z" /></Svg>
export const IconMic = ({ size = 20 }) => <Svg size={size} w={2}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></Svg>
export const IconSkip = ({ size = 18 }) => <Svg size={size} w={0}><path d="M5 5.5v13l9.5-6.5z" fill="currentColor" /><rect x="16" y="5" width="3" height="14" rx="1" fill="currentColor" /></Svg>
export const IconVolume = ({ size = 18 }) => <Svg size={size} w={2}><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></Svg>
export const IconTrophy = ({ size = 22 }) => <Svg size={size} w={2}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 13v4M8.5 20h7M10 17h4" /></Svg>
export const IconExpand = ({ size = 20 }) => <Svg size={size} w={2.2}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>
export const IconShrink = ({ size = 20 }) => <Svg size={size} w={2.2}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></Svg>
