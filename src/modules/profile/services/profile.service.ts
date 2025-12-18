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

        return profile
    }

    async updateProfile(data: { name?: string; bio?: string; image?: string | null }) {
        const profile = await this.getProfile()

        return await prisma.userProfile.update({
            where: { id: profile.id },
            data
        })
    }

    async updateTier(tier: 'NITRO_CORE' | 'NITRO_ELITE' | 'NITRO_SUPREME') {
        const profile = await this.getProfile()

        return await prisma.userProfile.update({
            where: { id: profile.id },
            data: { tier }
        })
    }

    async setAdmin(isAdmin: boolean) {
        const profile = await this.getProfile()

        return await prisma.userProfile.update({
            where: { id: profile.id },
            data: { isAdmin }
        })
    }
}
