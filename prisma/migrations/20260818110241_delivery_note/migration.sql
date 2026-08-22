-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "itemCode" TEXT;

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noteNo" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "noteDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact" TEXT,
    "address" TEXT,
    "remark" TEXT,
    "printedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryNoteItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noteId" INTEGER NOT NULL,
    "orderItemId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "orderNo" TEXT NOT NULL,
    "itemCode" TEXT,
    "product" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceMills" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "DeliveryNoteItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DeliveryNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_noteNo_key" ON "DeliveryNote"("noteNo");

-- CreateIndex
CREATE INDEX "DeliveryNote_customerId_idx" ON "DeliveryNote"("customerId");

-- CreateIndex
CREATE INDEX "DeliveryNote_noteDate_idx" ON "DeliveryNote"("noteDate");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_noteId_idx" ON "DeliveryNoteItem"("noteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_orderId_idx" ON "DeliveryNoteItem"("orderId");
