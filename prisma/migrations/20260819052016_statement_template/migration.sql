-- CreateTable
CREATE TABLE "StatementTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '对账单',
    "terms" TEXT,
    "columns" TEXT NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "wechatRemark" TEXT,
    "settleMode" TEXT NOT NULL DEFAULT '现金',
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "statementTemplateId" INTEGER,
    CONSTRAINT "Customer_statementTemplateId_fkey" FOREIGN KEY ("statementTemplateId") REFERENCES "StatementTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("contact", "createdAt", "creditDays", "id", "name", "phone", "settleMode", "updatedAt", "wechatRemark") SELECT "contact", "createdAt", "creditDays", "id", "name", "phone", "settleMode", "updatedAt", "wechatRemark" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE INDEX "Customer_settleMode_idx" ON "Customer"("settleMode");
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "StatementTemplate_name_key" ON "StatementTemplate"("name");

-- CreateIndex
CREATE INDEX "StatementTemplate_isDefault_idx" ON "StatementTemplate"("isDefault");

-- Seed 默认预设（列 = 全部标准字段，标题"对账单"，条款空；名称固定"默认预设"）
INSERT INTO "StatementTemplate" ("name", "title", "terms", "columns", "isDefault", "createdAt", "updatedAt")
VALUES (
  '默认预设',
  '对账单',
  NULL,
  '[{"key":"orderNo","label":"订单号","visible":true},{"key":"orderDate","label":"订单日期","visible":true},{"key":"product","label":"品名","visible":true},{"key":"spec","label":"规格","visible":true},{"key":"itemCode","label":"物料编号","visible":true},{"key":"qty","label":"数量","visible":true},{"key":"unit","label":"单位","visible":true},{"key":"unitPrice","label":"单价(元)","visible":true},{"key":"amount","label":"金额(元)","visible":true},{"key":"note","label":"备注","visible":true}]',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
