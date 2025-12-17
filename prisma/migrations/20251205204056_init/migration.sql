-- CreateTable
CREATE TABLE "History" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "songId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
