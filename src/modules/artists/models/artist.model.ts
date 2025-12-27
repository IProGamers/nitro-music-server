import { DownloadLinkModel } from '#common/models'
import { AlbumAPIResponseModel, AlbumModel } from '#modules/albums/models'
import { SongAPIResponseModel, SongModel } from '#modules/songs/models'
import { z } from 'zod'

export const ArtistAPIResponseModel = z
  .object({
    artistId: z.string(),
    name: z.string(),
    subtitle: z.string(),
    image: z.string(),
    follower_count: z.string(),
    type: z.string(),
    isVerified: z.boolean(),
    dominantLanguage: z.string(),
    dominantType: z.string(),
    topSongs: z.array(SongAPIResponseModel),
    topAlbums: z.array(AlbumAPIResponseModel),
    singles: z.array(SongAPIResponseModel),
    dedicated_artist_playlist: z.array(z.any()).optional().nullable(),
    featured_artist_playlist: z.array(z.any()).optional().nullable(),
    similarArtists: z.array(z.any()).optional().nullable(),
    isRadioPresent: z.boolean().optional().nullable(),
    bio: z.string().optional().nullable(),
    dob: z.string().optional().nullable(),
    fb: z.string().optional().nullable(),
    twitter: z.string().optional().nullable(),
    wiki: z.string().optional().nullable(),
    urls: z.any().optional().nullable(),
    availableLanguages: z.array(z.string()).optional().nullable(),
    fan_count: z.string().optional().nullable(),
    topEpisodes: z.array(z.any()).optional().nullable(),
    is_followed: z.boolean().optional().nullable()
  })
  .extend({
    id: z.string(),
    perma_url: z.string()
  })

export const ArtistModel = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  type: z.string(),
  image: z.array(DownloadLinkModel),
  followerCount: z.number().nullable(),
  fanCount: z.string().nullable(),
  isVerified: z.boolean().nullable(),
  dominantLanguage: z.string().nullable(),
  dominantType: z.string().nullable(),
  bio: z
    .array(
      z.object({
        text: z.string().nullable(),
        title: z.string().nullable(),
        sequence: z.number().nullable()
      })
    )
    .nullable(),
  dob: z.string().nullable(),
  fb: z.string().nullable(),
  twitter: z.string().nullable(),
  wiki: z.string().nullable(),
  availableLanguages: z.array(z.string()).nullable(),
  isRadioPresent: z.boolean().nullable(),
  topSongs: z.array(SongModel).nullable(),
  topAlbums: z.array(AlbumModel).nullable(),
  singles: z.array(SongModel).nullable(),
  similarArtists: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string(),
        image: z.array(DownloadLinkModel),
        languages: z.record(z.string(), z.string()).nullable(),
        wiki: z.string().nullable(),
        dob: z.string().nullable(),
        fb: z.string().nullable(),
        twitter: z.string().nullable(),
        isRadioPresent: z.boolean().nullable(),
        type: z.string().nullable(),
        dominantType: z.string().nullable(),
        aka: z.string().nullable(),
        bio: z.string().nullable(),
        similarArtists: z
          .array(
            z.object({
              id: z.string(),
              name: z.string()
            })
          )
          .nullable()
      })
    )
    .nullable()
})
