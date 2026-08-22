// 采购单业务核心逻辑（与 Next.js 解耦，可独立测试）
// 与客户侧 Order 对称：单号 P+YYYYMMDD-序号；有付款冲抵后禁止改行/换供应商
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { lineAmountCents } from "@/lib/money";

export class PurchaseServiceError extends Error {}

export type PurchaseItemInput = {
  id?: number; // 已有行（编辑时携带）
  product: string;
  spec: string | null;
  unit: string;
  qty: number;
  unitPriceMills: number; // 单价（厘，1元=1000厘）
  note: string | null;
};

export type PurchaseInput = {
  supplierId: number;
  poDate: Date;
  remark: string | null;
  items: PurchaseItemInput[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 采购单号生成：P + YYYYMMDD-序号（当天从库内最大值+1，冲突重试）
export async function generatePoNo(d: Date = new Date()): Promise<string> {
  const prefix = `P${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await prisma.purchaseOrder.findFirst({
      where: { poNo: { startsWith: prefix } },
      orderBy: { poNo: "desc" },
      select: { poNo: true },
    });
    const seq = latest ? Number(latest.poNo.split("-")[1] ?? 0) + 1 : 1;
    const poNo = `${prefix}-${String(seq).padStart(3, "0")}`;
    const exists = await prisma.purchaseOrder.findUnique({
      where: { poNo },
      select: { id: true },
    });
    if (!exists) return poNo;
  }
  throw new PurchaseServiceError("采购单号生成失败，请重试");
}

function validateItems(items: PurchaseItemInput[]): string | null {
  if (items.length === 0) return "请至少添加一个采购行";
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.product.trim()) return `第 ${i + 1} 行品名为空`;
    if (!Number.isInteger(it.qty) || it.qty < 1) {
      return `第 ${i + 1} 行数量必须是 ≥1 的整数`;
    }
    if (!Number.isInteger(it.unitPriceMills) || it.unitPriceMills < 0) {
      return `第 ${i + 1} 行单价格式无效（最多三位小数）`;
    }
  }
  return null;
}

function amountOf(it: PurchaseItemInput): number {
  return lineAmountCents(it.qty, it.unitPriceMills);
}

// 创建采购单（多行，事务）
export async function createPurchaseOrder(input: PurchaseInput) {
  const invalid = validateItems(input.items);
  if (invalid) throw new PurchaseServiceError(invalid);
  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
    select: { id: true },
  });
  if (!supplier) throw new PurchaseServiceError("供应商不存在");

  const poNo = await generatePoNo(input.poDate);
  const po = await prisma.$transaction(async (tx) => {
    return tx.purchaseOrder.create({
      data: {
        poNo,
        supplierId: input.supplierId,
        poDate: input.poDate,
        remark: input.remark,
        items: {
          create: input.items.map((it) => ({
            product: it.product.trim(),
            spec: it.spec,
            unit: it.unit,
            qty: it.qty,
            unitPriceMills: it.unitPriceMills,
            amountCents: amountOf(it),
            note: it.note,
          })),
        },
      },
    });
  });
  return po;
}

// 更新采购单：无冲抵可全改（含行增删改）；有冲抵仅允许改 poDate/remark（行与供应商锁定）
export async function updatePurchaseOrder(
  poId: number,
  input: PurchaseInput,
): Promise<{ changed: boolean }> {
  const invalid = validateItems(input.items);
  if (invalid) throw new PurchaseServiceError(invalid);

  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true, allocations: { select: { id: true } } },
    });
    if (!po) throw new PurchaseServiceError("采购单不存在");

    const hasAllocation = po.allocations.length > 0;
    if (hasAllocation) {
      // 锁定：供应商与行不允许任何变更
      if (po.supplierId !== input.supplierId) {
        throw new PurchaseServiceError("已有付款冲抵的采购单不能更换供应商");
      }
      const oldById = new Map(po.items.map((i) => [i.id, i]));
      if (po.items.length !== input.items.length) {
        throw new PurchaseServiceError("已有付款冲抵的采购单不能增删采购行");
      }
      for (const it of input.items) {
        if (it.id == null) {
          throw new PurchaseServiceError("已有付款冲抵的采购单不能新增采购行");
        }
        const old = oldById.get(it.id);
        if (
          !old ||
          old.product !== it.product ||
          old.spec !== it.spec ||
          old.unit !== it.unit ||
          old.qty !== it.qty ||
          old.unitPriceMills !== it.unitPriceMills ||
          old.note !== it.note
        ) {
          throw new PurchaseServiceError(
            "已有付款冲抵的采购单不能修改采购行（仅可改日期/备注）",
          );
        }
      }
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { poDate: input.poDate, remark: input.remark },
      });
      return { changed: false };
    }

    // 无冲抵：全量更新（行 diff 更新/新增/删除）
    const oldById = new Map(po.items.map((i) => [i.id, i]));
    for (const it of input.items) {
      if (it.id != null) {
        const old = oldById.get(it.id);
        if (!old) throw new PurchaseServiceError("采购行数据无效");
        await tx.purchaseItem.update({
          where: { id: it.id },
          data: {
            product: it.product,
            spec: it.spec,
            unit: it.unit,
            qty: it.qty,
            unitPriceMills: it.unitPriceMills,
            amountCents: amountOf(it),
            note: it.note,
          },
        });
      } else {
        await tx.purchaseItem.create({
          data: {
            poId,
            product: it.product,
            spec: it.spec,
            unit: it.unit,
            qty: it.qty,
            unitPriceMills: it.unitPriceMills,
            amountCents: amountOf(it),
            note: it.note,
          },
        });
      }
    }
    const submittedIds = new Set(
      input.items.filter((i) => i.id != null).map((i) => i.id as number),
    );
    for (const old of po.items) {
      if (!submittedIds.has(old.id)) {
        await tx.purchaseItem.delete({ where: { id: old.id } });
      }
    }
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        supplierId: input.supplierId,
        poDate: input.poDate,
        remark: input.remark,
      },
    });
    return { changed: true };
  });
}

// 删除采购单：有付款冲抵禁止删除
export async function deletePurchaseOrder(poId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { allocations: { select: { id: true } } },
    });
    if (!po) throw new PurchaseServiceError("采购单不存在");
    if (po.allocations.length > 0) {
      throw new PurchaseServiceError("已有付款冲抵的采购单不能删除");
    }
    await tx.purchaseItem.deleteMany({ where: { poId } });
    await tx.purchaseOrder.delete({ where: { id: poId } });
  });
}

// 采购单应付/已付/余额（分）
export async function purchasePayable(poId: number): Promise<number> {
  const agg = await prisma.purchaseItem.aggregate({
    where: { poId },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

export async function purchasePaid(poId: number): Promise<number> {
  const agg = await prisma.supplierPaymentAllocation.aggregate({
    where: { poId },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

export async function purchaseBalance(poId: number): Promise<number> {
  return (await purchasePayable(poId)) - (await purchasePaid(poId));
}

// 未结清采购单（含余额，供付款表单使用）
export async function unpaidPurchaseOrders(supplierId: number): Promise<
  { id: number; poNo: string; poDate: Date; payable: number; paid: number; balance: number }[]
> {
  const pos = await prisma.purchaseOrder.findMany({
    where: { supplierId },
    include: {
      items: { select: { amountCents: true } },
      allocations: { select: { amountCents: true } },
    },
    orderBy: { poDate: "asc" },
  });
  return pos
    .map((po) => {
      const payable = po.items.reduce((s, i) => s + i.amountCents, 0);
      const paid = po.allocations.reduce((s, a) => s + a.amountCents, 0);
      return { id: po.id, poNo: po.poNo, poDate: po.poDate, payable, paid, balance: payable - paid };
    })
    .filter((p) => p.balance > 0);
}
