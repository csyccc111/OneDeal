// 供应商付款业务核心逻辑（与客户侧 Payment 完全对称：一笔款冲多单、超分配拦截、事务）
import { prisma } from "@/lib/prisma";
import { PurchaseServiceError } from "@/lib/services/purchase";

export type SupplierPaymentInput = {
  supplierId: number;
  amountCents: number;
  method: string;
  paidAt: Date;
  remark: string | null;
  allocations: { poId: number; amountCents: number }[];
};

// 新建供应商付款：分配总额必须等于付款金额，每单不超过未付余额，采购单必须属于该供应商
export async function createSupplierPayment(input: SupplierPaymentInput) {
  const { supplierId, amountCents, allocations } = input;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PurchaseServiceError("付款金额必须是大于 0 的整数分");
  }
  if (!["现金", "转账", "承兑"].includes(input.method)) {
    throw new PurchaseServiceError("付款方式无效");
  }
  if (allocations.length === 0) {
    throw new PurchaseServiceError("请至少分配一个采购单");
  }
  const allocTotal = allocations.reduce((s, a) => s + a.amountCents, 0);
  if (allocTotal !== amountCents) {
    throw new PurchaseServiceError(
      `分配总额（${allocTotal} 分）必须等于付款金额（${amountCents} 分）`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) throw new PurchaseServiceError("供应商不存在");

    const seen = new Set<number>();
    for (const alloc of allocations) {
      if (!Number.isInteger(alloc.amountCents) || alloc.amountCents <= 0) {
        throw new PurchaseServiceError("每笔分配金额必须大于 0");
      }
      if (seen.has(alloc.poId)) {
        throw new PurchaseServiceError("同一采购单不能重复分配");
      }
      seen.add(alloc.poId);

      const po = await tx.purchaseOrder.findUnique({
        where: { id: alloc.poId },
        select: { id: true, supplierId: true },
      });
      if (!po || po.supplierId !== supplierId) {
        throw new PurchaseServiceError("分配采购单不存在或不属于该供应商");
      }
      const [payable, paid] = await Promise.all([
        tx.purchaseItem.aggregate({
          where: { poId: alloc.poId },
          _sum: { amountCents: true },
        }),
        tx.supplierPaymentAllocation.aggregate({
          where: { poId: alloc.poId },
          _sum: { amountCents: true },
        }),
      ]);
      const balance = (payable._sum.amountCents ?? 0) - (paid._sum.amountCents ?? 0);
      if (alloc.amountCents > balance) {
        throw new PurchaseServiceError(
          `采购单 ${alloc.poId} 未付余额不足（余额 ${balance} 分，分配 ${alloc.amountCents} 分）`,
        );
      }
    }

    const payment = await tx.supplierPayment.create({
      data: {
        supplierId,
        amountCents,
        method: input.method,
        paidAt: input.paidAt,
        remark: input.remark,
      },
    });
    await tx.supplierPaymentAllocation.createMany({
      data: allocations.map((a) => ({
        paymentId: payment.id,
        poId: a.poId,
        amountCents: a.amountCents,
      })),
    });
  });
}
