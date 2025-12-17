import { z } from 'zod'

export const FavoriteModel = z.object({
    id: z.number(),
    songId: z.string(),
    name: z.string(),
    artist: z.string(),
    image: z.string(),
    audioUrl: z.string(),
    addedAt: z.string()
})
