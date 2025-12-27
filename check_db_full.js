
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const history = await prisma.history.findMany({
            orderBy: { playedAt: 'desc' },
            take: 20
        });
        console.log('--- ALL HISTORY ENTRIES ---');
        history.forEach(h => {
            console.log(`ID: ${h.id} | SongID: ${h.songId} | Name: ${h.name} | PlayedAt: ${h.playedAt}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
