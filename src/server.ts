import { AlbumController, ArtistController, SearchController, SongController, HistoryController, FavoritesController, ProfileController, ModuleController } from '#modules/index'
import { PlaylistController } from '#modules/playlists/controllers'
import { App } from './app'
import { audioProxy } from './modules/audio-proxy/audio-proxy.route'
import { recommendations } from './modules/recommendations/recommendations.route'

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

export default app

