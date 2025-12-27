import { z } from 'zod'
import { AlbumModel } from '#modules/albums/models'
import { PlaylistModel } from '#modules/playlists/models'

import { SongModel } from '#modules/songs/models'

export const ModulesModel = z.object({
    albums: z.array(AlbumModel),
    charts: z.array(PlaylistModel),
    playlists: z.array(PlaylistModel),
    trending: z.object({
        songs: z.array(SongModel),
        albums: z.array(AlbumModel)
    })
})

export const ModulesAPIResponseModel = z.object({
    new_albums: z.array(z.any()),
    charts: z.array(z.any()),
    top_playlists: z.array(z.any()),
    new_trending: z.array(z.any()),
    tag_mixes: z.array(z.any()).optional()
})

export type Modules = z.infer<typeof ModulesModel>
