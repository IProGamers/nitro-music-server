import { AlbumController, ArtistController, SearchController, SongController, HistoryController, FavoritesController } from '#modules/index'
import { PlaylistController } from '#modules/playlists/controllers'
import { App } from './app'

const app = new App([
  new SearchController(),
  new SongController(),
  new AlbumController(),
  new ArtistController(),
  new PlaylistController(),
  new HistoryController(),
  new FavoritesController()
]).getApp()

export default app
