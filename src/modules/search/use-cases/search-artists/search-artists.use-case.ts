import { Endpoints } from '#common/constants'
import { useFetch } from '#common/helpers'
import { createArtistMapPayload } from '#modules/artists/helpers'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types'
import type { SearchArtistAPIResponseModel, SearchArtistModel } from '#modules/search/models'
import type { z } from 'zod'

export interface SearchArtistsArgs {
  query: string
  page: number
  limit: number
}

export class SearchArtistsUseCase implements IUseCase<SearchArtistsArgs, z.infer<typeof SearchArtistModel>> {
  constructor() { }

  async execute({ query, limit, page }: SearchArtistsArgs): Promise<z.infer<typeof SearchArtistModel>> {
    const { data } = await useFetch<z.infer<typeof SearchArtistAPIResponseModel>>({
      endpoint: Endpoints.search.artists,
      params: {
        q: query,
        p: page,
        n: limit
      }
    })

    if (!data) throw new HTTPException(404, { message: 'artist not found' })

    return {
      total: data.total,
      start: data.start,
      results:
        data.results
          ?.filter((artist) => {
            const type = artist.type || ''
            // Much less restrictive filter to ensure we get results for most queries
            return type === 'artist'
          })
          // Remove duplicates
          ?.filter((artist, index, self) => index === self.findIndex((a) => a.id === artist.id))
          // Intelligently sort based on name relevance, collaboration detection, and popularity
          ?.sort((a, b) => {
            const q = query.toLowerCase().trim();
            const nameA = a.name.toLowerCase().trim();
            const nameB = b.name.toLowerCase().trim();

            const containsA = nameA.includes(q);
            const containsB = nameB.includes(q);

            // Priority 0: Only compare if it actually matches the query
            if (containsA && !containsB) return -1;
            if (!containsA && containsB) return 1;

            // Priority 1: Exact Name Match
            const isExactA = nameA === q;
            const isExactB = nameB === q;
            if (isExactA && !isExactB) return -1;
            if (!isExactA && isExactB) return 1;

            // Help detect "Single Artist" vs "Collaborations/Compilations"
            const isCollab = (name: string) => /[&|,x]/.test(name) || /\b(feat|with|feat\.|vs|and)\b/i.test(name);
            const collabA = isCollab(nameA);
            const collabB = isCollab(nameB);

            // Priority 2: Not a Collaboration (Single Artist Profile)
            if (!collabA && collabB) return -1;
            if (collabA && !collabB) return 1;

            // Priority 3: Name Starts With Query
            const startsWithA = nameA.startsWith(q);
            const startsWithB = nameB.startsWith(q);
            if (startsWithA && !startsWithB) return -1;
            if (!startsWithA && startsWithB) return 1;

            // Priority 4: Shortest Name (closest to query length)
            if (containsA && containsB) {
              if (nameA.length < nameB.length) return -1;
              if (nameA.length > nameB.length) return 1;
            }

            // Priority 5: Popularity (CTR)
            return (b.ctr || 0) - (a.ctr || 0);
          })
          ?.map(createArtistMapPayload)
          .slice(0, limit) || []
    }
  }
}
