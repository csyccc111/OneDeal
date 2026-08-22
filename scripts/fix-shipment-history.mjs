// 一次性数据修复：送货单与发货统一口径（开单即发货）
// 背景：旧版本"开送货单"只累加 deliveryNoteQty（防重复开单），
//       用户又需在订单页手动记"发货"（shippedQty），同一批货被扣两次。
// 修复：
//   1) shippedQty = MAX(shippedQty, deliveryNoteQty)（已开送货单即视为已发货）
//   2) 补录发货记录：送货单已开、但从未手动记过发货的差额（对账单按发货日期才不漏）
// 用法：node scripts/fix-shipment-history.mjs [数据库路径]
//       默认路径：/opt/onedeal/.next/standalone/data/onedeal.db
// 注意：执行前先备份数据库！
import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const dbPath =
  process.argv[2] ??
  "/opt/onedeal/.next/standalone/data/onedeal.db";

if (!existsSync(dbPath)) {
  console.error(`数据库不存在：${dbPath}`);
  console.error("请传入正确路径：node scripts/fix-shipment-history.mjs <数据库路径>");
  process.exit(1);
}

const db = new Database(dbPath);
console.log(`已打开数据库：${dbPath}\n`);

const tx = db.transaction(() => {
  // ---------- 1) 修正已发货数量 ----------
  const before = db
    .prepare(
      `SELECT COUNT(*) AS n FROM "OrderItem" WHERE deliveryNoteQty > shippedQty`,
    )
    .get().n;
  const fix = db.prepare(
    `UPDATE "OrderItem" SET shippedQty = MAX(shippedQty, deliveryNoteQty)
     WHERE deliveryNoteQty > shippedQty`,
  );
  fix.run();
  console.log(`1) 已发货数量修正：${before} 个订单行（shippedQty = MAX(shippedQty, deliveryNoteQty)）`);

  // ---------- 2) 补录发货记录 ----------
  const rows = db
    .prepare(
      `SELECT oi.id AS itemId, oi.orderId, oi.deliveryNoteQty AS dnQty,
              COALESCE((SELECT SUM(s.qty) FROM "Shipment" s
                        WHERE s.itemId = oi.id AND s.type = '发货'), 0) AS shippedRec
       FROM "OrderItem" oi
       WHERE oi.deliveryNoteQty > 0`,
    )
    .all();

  const firstNote = db.prepare(
    `SELECT dn.noteNo, dn.noteDate FROM "DeliveryNoteItem" dni
     JOIN "DeliveryNote" dn ON dn.id = dni.noteId
     WHERE dni.orderItemId = ?
     ORDER BY dn.noteDate ASC, dn.id ASC
     LIMIT 1`,
  );
  const insert = db.prepare(
    `INSERT INTO "Shipment" (orderId, itemId, type, qty, shippedAt, note)
     VALUES (?, ?, '发货', ?, ?, ?)`,
  );

  let added = 0;
  for (const r of rows) {
    const diff = r.dnQty - r.shippedRec;
    if (diff <= 0) continue;
    const n = firstNote.get(r.itemId);
    insert.run(
      r.orderId,
      r.itemId,
      diff,
      n?.noteDate ?? new Date().toISOString(),
      n ? `送货单 ${n.noteNo} 自动生成` : "历史数据补录",
    );
    added++;
    console.log(
      `   补录发货记录：订单行#${r.itemId} +${diff}（送货单 ${n?.noteNo ?? "?"}）`,
    );
  }
  console.log(`2) 补录发货记录：${added} 条`);
});

tx();

console.log("\n完成。请在系统里核对：");
console.log("  · 订单详情页「已发货」数字 = 实际发货量");
console.log("  · 新建送货单时「剩余可发」= 订单量 - 已发货（不再双扣）");
console.log("  · 对账单按发货日期 = 送货单金额（含自动补录部分）");

db.close();
