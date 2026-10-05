// Links zu einer Amplify-Playlist (Hash-Routen, funktionieren auf GitHub Pages ohne Umleitung)
const appBase = () => `${window.location.origin}${import.meta.env.BASE_URL}`

export const joinLink = (code) => `${appBase()}#amplify/${code}`
export const boardLink = (code) => `${appBase()}#live/${code}`
