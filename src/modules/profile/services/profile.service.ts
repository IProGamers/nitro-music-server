import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export class ProfileService {
    async getProfile() {
        let profile = await prisma.userProfile.findFirst()

        if (!profile) {
            // Create default profile if not exists
            profile = await prisma.userProfile.create({
                data: {
                    id: 1,
                    name: 'Guest User',
                    bio: 'Music enthusiast & audiophile. Exploring the universe of sound one track at a time.'
                }
            })
        }

        return profile as unknown as {
            id: number
            name: string
            bio: string
            image: string | null
            tier: 'NITRO_CORE' | 'NITRO_ELITE' | 'NITRO_SUPREME'
            isAdmin: boolean
            updatedAt: Date
        }
    }

    async updateProfile(data: { name?: string; bio?: string; image?: string | null }) {
        const profile = await this.getProfile()

        return (await prisma.userProfile.update({
            where: { id: profile.id },
            data
        })) as unknown as {
            id: number
            name: string
            bio: string
            image: string | null
            tier: 'NITRO_CORE' | 'NITRO_ELITE' | 'NITRO_SUPREME'
            isAdmin: boolean
            updatedAt: Date
        }
    }

    async updateTier(tier: 'NITRO_CORE' | 'NITRO_ELITE' | 'NITRO_SUPREME') {
        const profile = await this.getProfile()

        return (await prisma.userProfile.update({
            where: { id: profile.id },
            data: { tier }
        })) as unknown as {
            id: number
            name: string
            bio: string
            image: string | null
            tier: 'NITRO_CORE' | 'NITRO_ELITE' | 'NITRO_SUPREME'
            isAdmin: boolean
            updatedAt: Date
        }
    }

    async setAdmin(isAdmin: boolean) {
        const profile = await this.getProfile()

        return (await prisma.userProfile.update({
            where: { id: profile.id },
            data: { isAdmin }
        })) as unknown as {
            id: number
            name: string
            bio: string
            image: string | null
            tier: 'NITRO_CORE' | 'NITRO_ELITE' | 'NITRO_SUPREME'
            isAdmin: boolean
            updatedAt: Date
        }
    }
}
