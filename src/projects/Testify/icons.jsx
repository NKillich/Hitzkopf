// Testify-Symbole (24er-Raster, Farbe über currentColor) – ergänzen shared/ui/icons.jsx
const Svg = ({ size = 20, w = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const IconHeart = ({ size = 22 }) => <Svg size={size}><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" /></Svg>
export const IconFriends = ({ size = 22 }) => <Svg size={size}><circle cx="8.5" cy="8.5" r="3.2" /><circle cx="16" cy="8.5" r="3.2" /><path d="M3 19a5.5 5.5 0 0 1 11 0M12.5 15a5.5 5.5 0 0 1 8.5 4" /></Svg>
export const IconGrid = ({ size = 18 }) => <Svg size={size}><rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" /></Svg>
export const IconSwap = ({ size = 18 }) => <Svg size={size}><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" /></Svg>
export const IconScale = ({ size = 18 }) => <Svg size={size} w={2.4}><path d="M5 19v-2M10 19v-5M15 19v-8M20 19V7" /></Svg>
export const IconArrow = ({ size = 20 }) => <Svg size={size} w={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const IconCards = ({ size = 18 }) => <Svg size={size}><rect x="4" y="5" width="7" height="14" rx="1.5" /><rect x="14" y="5" width="6" height="14" rx="1.5" /></Svg>
export const IconMinus = ({ size = 18 }) => <Svg size={size} w={3}><path d="M6 12h12" /></Svg>
