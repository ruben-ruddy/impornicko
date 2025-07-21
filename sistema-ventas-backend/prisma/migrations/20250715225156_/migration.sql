/*
  Warnings:

  - A unique constraint covering the columns `[url]` on the table `dms` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `url` to the `dms` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "dms" ADD COLUMN     "url" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "dms_url_key" ON "dms"("url");
