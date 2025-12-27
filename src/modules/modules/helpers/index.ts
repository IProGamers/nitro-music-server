import { createAlbumPayload } from '#modules/albums/helpers'
import { createPlaylistPayload } from '#modules/playlists/helpers'
import { createSongPayload } from '#modules/songs/helpers'
import type { Modules, ModulesAPIResponseModel } from '#modules/modules/models'
import type { z } from 'zod'

export const createModulesPayload = (modules: z.infer<typeof ModulesAPIResponseModel>): Modules => {
    return {
        albums: modules.new_albums?.map(createAlbumPayload) || [],
        charts: modules.charts?.map(createPlaylistPayload) || [],
        playlists: modules.top_playlists?.map(createPlaylistPayload) || [],
        trending: {
            songs: modules.new_trending
                ?.filter((item: any) => item.type === 'song')
                ?.map(createSongPayload) || [],
            albums: modules.new_trending
                ?.filter((item: any) => item.type === 'album')
                ?.map(createAlbumPayload) || []
        }
    }
}
