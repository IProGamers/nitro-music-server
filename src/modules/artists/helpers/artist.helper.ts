import { createImageLinks } from '#common/helpers'
import { createAlbumPayload } from '#modules/albums/helpers'
import { createSongPayload } from '#modules/songs/helpers'
import type {
  ArtistAPIResponseModel,
  ArtistMapAPIResponseModel,
  ArtistMapModel,
  ArtistModel
} from '#modules/artists/models'
import type { z } from 'zod'

/**
 * Safely parse a JSON string coming from the upstream API. JioSaavn sometimes
 * returns malformed / non-JSON values for fields like `bio`, `languages` and
 * `similar`. A raw JSON.parse here would throw and crash the whole artist
 * response with a 500 — making the artist page render empty in production.
 */
const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Coerce an upstream field to an array. JioSaavn sometimes returns topSongs /
 * topAlbums / singles / similarArtists as a nested object (e.g. { songs: [...] })
 * or even a non-iterable value instead of a flat array — calling .map on that
 * throws and 500s the whole artist response. This normalizes it safely.
 */
const ensureArray = (value: any): any[] => {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.songs)) return value.songs
    if (Array.isArray(value.albums)) return value.albums
    if (Array.isArray(value.results)) return value.results
    if (Array.isArray(value.data)) return value.data
  }
  return []
}

export const createArtistPayload = (artist: z.infer<typeof ArtistAPIResponseModel>): z.infer<typeof ArtistModel> => ({
  id: artist.artistId || artist.id,
  name: artist.name,
  url: artist.urls?.overview || artist.perma_url,
  type: artist.type,
  followerCount: artist.follower_count ? Number(artist.follower_count) : null,
  fanCount: artist.fan_count || null,
  isVerified: artist.isVerified || null,
  dominantLanguage: artist.dominantLanguage || null,
  dominantType: artist.dominantType || null,
  bio: safeJsonParse(artist.bio),
  dob: artist.dob || null,
  fb: artist.fb || null,
  twitter: artist.twitter || null,
  wiki: artist.wiki || null,
  availableLanguages: artist.availableLanguages || null,
  isRadioPresent: artist.isRadioPresent || null,
  image: createImageLinks(artist.image),
  topSongs: ensureArray(artist.topSongs).map(createSongPayload),
  topAlbums: ensureArray(artist.topAlbums).map(createAlbumPayload),
  singles: ensureArray(artist.singles).map(createSongPayload),
  similarArtists:
    ensureArray(artist.similarArtists).map((similarArtist: any) => ({
      id: similarArtist.id,
      name: similarArtist.name,
      url: similarArtist.perma_url,
      image: createImageLinks(similarArtist.image_url),
      languages: safeJsonParse(similarArtist.languages),
      wiki: similarArtist.wiki || null,
      dob: similarArtist.dob || null,
      fb: similarArtist.fb || null,
      twitter: similarArtist.twitter || null,
      isRadioPresent: similarArtist.isRadioPresent || null,
      type: similarArtist.type || null,
      dominantType: similarArtist.dominantType || null,
      aka: similarArtist.aka || null,
      bio: safeJsonParse(similarArtist.bio),
      similarArtists: safeJsonParse(similarArtist.similar)
    })) || null
})

export const createArtistMapPayload = (
  artist: z.infer<typeof ArtistMapAPIResponseModel>
): z.infer<typeof ArtistMapModel> => ({
  id: artist.id,
  name: artist.name,
  role: artist.role,
  image: createImageLinks(artist.image),
  type: artist.type,
  url: artist.perma_url
})
