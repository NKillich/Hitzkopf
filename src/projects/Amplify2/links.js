// Links zu einer Amplify-2.0-Playlist (Hash-Routen, funktionieren auf GitHub Pages ohne Umleitung)
const appBase = () => `${window.location.origin}${import.meta.env.BASE_URL}`

export const joinLink = (code) => `${appBase()}#amplify2/${code}`
export const boardLink = (code) => `${appBase()}#live2/${code}`
