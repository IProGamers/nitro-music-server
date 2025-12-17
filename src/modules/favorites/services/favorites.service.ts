import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export class FavoritesService {
    async getFavorites() {
        return await prisma.favorite.findMany({
            orderBy: { addedAt: 'desc' }
        })
    }

    async addFavorite(data: { songId: string; name: string; artist: string; image: string; audioUrl: string }) {
        // Check if exists
        const exists = await prisma.favorite.findUnique({ where: { songId: data.songId } })
        if (exists) return exists

        return await prisma.favorite.create({
            data
        })
    }

    async removeFavorite(songId: string) {
        return await prisma.favorite.delete({
            where: { songId }
        })
    }

    async checkFavorite(songId: string) {
        const exists = await prisma.favorite.findUnique({ where: { songId } })
        return !!exists
    }
}
