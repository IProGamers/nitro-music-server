import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export class HistoryService {
    async getHistory() {
        return await prisma.history.findMany({
            orderBy: { playedAt: 'desc' },
            take: 50
        })
    }

    async addHistory(data: { songId: string; name: string; artist: string; image: string; audioUrl: string }) {
        return await prisma.history.create({
            data
        })
    }
}
