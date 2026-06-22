import { AlbumController, ArtistController, SearchController, SongController, HistoryController, FavoritesController, ProfileController, ModuleController } from '#modules/index'
import { PlaylistController } from '#modules/playlists/controllers'
import { App } from './app'
import { audioProxy } from './modules/audio-proxy/audio-proxy.route'
import { recommendations } from './modules/recommendations/recommendations.route'
import { youtube } from './modules/youtube/youtube.route'

const appInstance = new App([
  new SearchController(),
  new SongController(),
  new AlbumController(),
  new ArtistController(),
  new PlaylistController(),
  new HistoryController(),
  new FavoritesController(),
  new ProfileController(),
  new ModuleController()
])

const app = appInstance.getApp()

// Add the audio proxy route for CORS-free downloads
app.route('/api/audio', audioProxy)

// Last.fm-powered similar-track recommendations (for the play queue / radio)
app.route('/api/recommendations', recommendations)

// YouTube Music source (dual-source: search + audio streaming proxy)
app.route('/api/youtube', youtube)

// Bun's default per-request idleTimeout is 10s, which can cut off a cold yt-dlp
// stream resolution before bytes start flowing. Bun reads this off the
// default-exported object; the Vercel/Netlify adapters ignore the extra prop.
;(app as unknown as { idleTimeout?: number }).idleTimeout = 120

export default app

