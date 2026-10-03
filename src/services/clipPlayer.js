// Gemeinsame Instanz für die App; die Logik steckt in clipPlayerCore.js (dort ohne Browser testbar).
import spotifyService from './spotifyService.js'
import { log } from '../utils/logger.js'
import { ClipPlayer } from './clipPlayerCore.js'

const clip = new ClipPlayer(spotifyService, { log })

// Ablaufprotokoll zum Weitergeben: in der Browser-Konsole  copy(ssTrace())  eingeben
if (typeof window !== 'undefined') window.ssTrace = () => clip.dump()

export default clip
