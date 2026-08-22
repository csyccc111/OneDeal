-- P16 调整：取消客户特定预设（客户绑定字段保留但不再使用），所有客户使用默认预设
-- 默认预设列配置更新：新增 序号(seq)、客户订单号(customerOrderNo)、送货单号(deliveryNoteNo) 三列

-- Order 增加客户订单号（客户侧单号，可空）
ALTER TABLE "Order" ADD COLUMN "customerOrderNo" TEXT;

-- 更新默认预设列配置（13 列：序号/订单号/客户订单号/送货单号/订单日期/品名/规格/物料编号/数量/单位/单价/金额/备注）
UPDATE "StatementTemplate"
SET "columns" = '[{"key":"seq","label":"序号","visible":true,"width":6},{"key":"orderNo","label":"订单号","visible":true,"width":16},{"key":"customerOrderNo","label":"客户订单号","visible":true,"width":18},{"key":"deliveryNoteNo","label":"送货单号","visible":true,"width":16},{"key":"orderDate","label":"订单日期","visible":true,"width":12},{"key":"product","label":"品名","visible":true,"width":24},{"key":"spec","label":"规格","visible":true,"width":16},{"key":"itemCode","label":"物料编号","visible":true,"width":14},{"key":"qty","label":"数量","visible":true,"width":8},{"key":"unit","label":"单位","visible":true,"width":8},{"key":"unitPrice","label":"单价(元)","visible":true,"width":10},{"key":"amount","label":"金额(元)","visible":true,"width":12},{"key":"note","label":"备注","visible":true,"width":20}]',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isDefault" = 1;
