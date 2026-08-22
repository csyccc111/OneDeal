-- 订单行增加"已生成送货单数量"：开送货单时累加、删除送货单时回退，防重复开单（2026-08-19 用户要求）
ALTER TABLE "OrderItem" ADD COLUMN "deliveryNoteQty" INTEGER NOT NULL DEFAULT 0;

-- 回填：现有送货单明细数量累加到对应订单行（历史已开过的单不再重复可开）
UPDATE "OrderItem"
SET "deliveryNoteQty" = (
  SELECT COALESCE(SUM("DeliveryNoteItem"."qty"), 0)
  FROM "DeliveryNoteItem"
  WHERE "DeliveryNoteItem"."orderItemId" = "OrderItem"."id"
);
