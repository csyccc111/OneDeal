// 导入执行：解析 → 客户归并 → 订单创建（含收款带入）
import { prisma } from "@/lib/prisma";
import {
  parseWorkbook,
  parseImportRows,
  groupIntoOrders,
  normalizeName,
  type ColumnMapping,
  type OrderDraft,
} from "@/lib/import/parser";

export type ImportFileInput = {
  fileName: string;
  buffer: Buffer;
  mapping: ColumnMapping;
};

export type ImportResult = {
  orderCount: number;
  itemCount: number;
  customerCreated: number;
  failed: { excelRow: number; fileName: string; reason: string }[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

export async function runImport(input: {
  files: ImportFileInput[];
  mergeByDate: boolean;
}): Promise<ImportResult> {
  if (input.files.length === 0) {
    throw new Error("请至少选择一个文件");
  }

  // 1) 解析所有文件
  const allItems: { excelRow: number; fileName: string; item: import("./parser").ParsedRow }[] = [];
  const failed: ImportResult["failed"] = [];
  for (const f of input.files) {
    const rows = parseWorkbook(f.buffer);
    if (rows.length <= 1) {
      failed.push({ excelRow: 0, fileName: f.fileName, reason: "文件没有数据行" });
      continue;
    }
    const { items, failed: rowFailed } = parseImportRows(rows, f.mapping);
    for (const rf of rowFailed) {
      failed.push({ excelRow: rf.excelRow, fileName: f.fileName, reason: rf.reason });
    }
    for (const it of items) {
      allItems.push({ excelRow: it.excelRow, fileName: f.fileName, item: it });
    }
  }

  // 2) 合并为订单
  const drafts = groupIntoOrders(
    allItems.map((x) => x.item),
    input.mergeByDate,
  );
  if (drafts.length === 0) {
    throw new Error("没有可导入的数据行");
  }

  // 3) 客户归并（按归一化名称匹配已有客户）
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true },
  });
  const byNorm = new Map<string, number>();
  for (const c of customers) {
    const n = normalizeName(c.name);
    if (!byNorm.has(n)) byNorm.set(n, c.id);
  }
  const customerIdByDraft = new Map<OrderDraft, number>();
  let customerCreated = 0;
  for (const d of drafts) {
    const existing = byNorm.get(d.customerNorm);
    if (existing) {
      customerIdByDraft.set(d, existing);
    } else {
      // 同一批内多个订单同名客户 → 新建一次
      const created = await prisma.customer.create({
        data: { name: d.customerNorm, settleMode: "现金" },
      });
      byNorm.set(d.customerNorm, created.id);
      customerIdByDraft.set(d, created.id);
      customerCreated++;
    }
  }

  // 4) 单号：按订单日期分组，日期内递增
  const orderNoByDraft = new Map<OrderDraft, string>();
  const byDate = new Map<string, OrderDraft[]>();
  for (const d of drafts) {
    const key = dateKey(d.date);
    const list = byDate.get(key) ?? [];
    list.push(d);
    byDate.set(key, list);
  }
  for (const [key, list] of byDate) {
    const latest = await prisma.order.findFirst({
      where: { orderNo: { startsWith: key } },
      orderBy: { orderNo: "desc" },
      select: { orderNo: true },
    });
    let seq = latest ? Number(latest.orderNo.split("-")[1] ?? 0) : 0;
    for (const d of list) {
      seq++;
      orderNoByDraft.set(d, `${key}-${String(seq).padStart(3, "0")}`);
    }
  }

  // 5) 事务创建订单（含收款）
  let orderCount = 0;
  let itemCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const d of drafts) {
      const unpaid = d.totalCents - Math.min(d.paidCents, d.totalCents);
      const status = unpaid > 0 ? "已发货" : "已结算";
      const order = await tx.order.create({
        data: {
          orderNo: orderNoByDraft.get(d)!,
          customerId: customerIdByDraft.get(d)!,
          customerOrderNo: d.customerOrderNo,
          taxType: "无",
          taxRateBp: null,
          status,
          remark: "历史数据导入",
          createdAt: d.date,
          updatedAt: d.date,
          items: {
            create: d.items.map((it) => ({
              product: it.product,
              itemCode: it.code,
              spec: it.spec,
              unit: it.unit,
              qty: it.qty,
              unitPriceMills: it.priceMills,
              amountCents: it.amountCents,
              note: it.remark,
            })),
          },
        },
      });
      itemCount += d.items.length;
      orderCount++;

      await tx.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: status,
          note: "历史数据导入",
          changedAt: d.date,
        },
      });

      // 已收金额带入：创建收款并冲抵该订单（不超过订单金额）
      const paid = Math.min(d.paidCents, d.totalCents);
      if (paid > 0) {
        const payment = await tx.payment.create({
          data: {
            customerId: order.customerId,
            amountCents: paid,
            method: "现金",
            paidAt: d.date,
            remark: "历史数据导入",
          },
        });
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            orderId: order.id,
            amountCents: paid,
          },
        });
      }
    }
  });

  return { orderCount, itemCount, customerCreated, failed };
}
