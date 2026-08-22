-- 送货单明细快照增加"客户订单号"列（打印页展示用，2026-08-19 用户要求）
ALTER TABLE "DeliveryNoteItem" ADD COLUMN "customerOrderNo" TEXT;

-- 回填已有送货单明细：按来源订单取客户订单号
UPDATE "DeliveryNoteItem"
SET "customerOrderNo" = (
  SELECT "Order"."customerOrderNo"
  FROM "Order"
  WHERE "Order"."id" = "DeliveryNoteItem"."orderId"
);
