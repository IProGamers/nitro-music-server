-- CreateTable
CREATE TABLE "Favorite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "songId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_songId_key" ON "Favorite"("songId");
