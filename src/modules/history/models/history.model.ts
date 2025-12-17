import { z } from 'zod'

export const HistoryModel = z.object({
    id: z.number(),
    songId: z.string(),
    name: z.string(),
    artist: z.string(),
    image: z.string(),
    audioUrl: z.string(),
    playedAt: z.string()
})
