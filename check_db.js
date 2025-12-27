
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const history = await prisma.history.findMany({
            orderBy: { playedAt: 'desc' }
        });
        console.log('--- HISTORY ENTRIES ---');
        console.log(JSON.stringify(history, null, 2));

        const counts = await prisma.history.groupBy({
            by: ['songId'],
            _count: {
                _all: true
            }
        });
        console.log('--- SONG ID COUNTS ---');
        console.log(JSON.stringify(counts, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
