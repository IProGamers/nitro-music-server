import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export class HistoryService {
    async getHistory() {
        try {
            return await prisma.history.findMany({
                orderBy: { playedAt: 'desc' },
                take: 50
            })
        } catch (error) {
            console.error('Error fetching history:', error)
            return []
        }
    }

    async addHistory(data: { songId: string; name: string; artist: string; image: string; audioUrl: string }) {
        try {
            return await prisma.history.upsert({
                where: { songId: data.songId },
                update: {
                    playedAt: new Date(),
                    // Optionally update other details if they changed
                    name: data.name,
                    artist: data.artist,
                    image: data.image,
                    audioUrl: data.audioUrl
                },
                create: {
                    ...data,
                    playedAt: new Date()
                }
            })
        } catch (error) {
            console.error('Error adding to history:', error)
            throw error
        }
    }

    async clearHistory() {
        try {
            return await prisma.history.deleteMany({})
        } catch (error) {
            console.error('Error clearing history:', error)
            throw error
        }
    }
}

