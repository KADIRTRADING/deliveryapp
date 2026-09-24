-- AlterTable
ALTER TABLE "products" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "products_searchText_idx" ON "products"("searchText");

-- CreateIndex
CREATE INDEX "restaurants_searchText_idx" ON "restaurants"("searchText");
