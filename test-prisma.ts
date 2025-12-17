import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        await prisma.$connect()
        console.log("Connected successfully!")
        const count = await prisma.history.count()
        console.log("History count:", count)
    } catch (e) {
        console.error("Error connecting:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
