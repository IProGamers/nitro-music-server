import { z } from 'zod'

export const UserProfileModel = z.object({
    id: z.number(),
    name: z.string(),
    bio: z.string(),
    image: z.string().nullable(),
    tier: z.enum(['NITRO_CORE', 'NITRO_ELITE', 'NITRO_SUPREME']),
    isAdmin: z.boolean(),
    updatedAt: z.string().or(z.date())
})
