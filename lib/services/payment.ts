// 结算业务核心：收款（冲抵多单）、开票、未收计算
import { prisma } from "@/lib/prisma";
import { OrderServiceError } from "@/lib/services/order";

// 订单应收金额（未作废订单的明细合计）
export async function orderReceivable(orderId: number): Promise<number> {
  const agg = await prisma.orderItem.aggregate({
    where: { orderId },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

// 订单已收金额（分配明细合计）
export async function orderPaid(orderId: number): Promise<number> {
  const agg = await prisma.paymentAllocation.aggregate({
    where: { orderId },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

// 订单未收余额
export async function orderUnpaid(orderId: number): Promise<number> {
  return (await orderReceivable(orderId)) - (await orderPaid(orderId));
}

export type PaymentInput = {
  customerId: number;
  amountCents: number;
  method: string;
  paidAt: Date;
  remark: string | null;
  allocations: { orderId: number; amountCents: number }[];
};

// 新建收款：一笔款拆到多个订单（分配总额必须等于收款金额，每单不超过未收余额）
export async function createPayment(input: PaymentInput) {
  const { customerId, amountCents, allocations } = input;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new OrderServiceError("收款金额必须是大于 0 的整数分");
  }
  if (!["现金", "转账", "承兑"].includes(input.method)) {
    throw new OrderServiceError("收款方式无效");
  }
  if (allocations.length === 0) {
    throw new OrderServiceError("请至少分配一个订单");
  }
  const allocTotal = allocations.reduce((s, a) => s + a.amountCents, 0);
  if (allocTotal !== amountCents) {
    throw new OrderServiceError(
      `分配总额（${allocTotal} 分）必须等于收款金额（${amountCents} 分）`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new OrderServiceError("客户不存在");

    const seen = new Set<number>();
    for (const alloc of allocations) {
      if (!Number.isInteger(alloc.amountCents) || alloc.amountCents <= 0) {
        throw new OrderServiceError("每笔分配金额必须大于 0");
      }
      if (seen.has(alloc.orderId)) {
        throw new OrderServiceError("同一订单不能重复分配");
      }
      seen.add(alloc.orderId);

      const order = await tx.order.findUnique({
        where: { id: alloc.orderId },
        select: { id: true, customerId: true, cancelledAt: true },
      });
      if (!order || order.customerId !== customerId) {
        throw new OrderServiceError("分配订单不存在或不属于该客户");
      }
      if (order.cancelledAt) {
        throw new OrderServiceError("已作废订单不能分配收款");
      }
      // 该订单未收余额
      const [receivable, paid] = await Promise.all([
        tx.orderItem.aggregate({
          where: { orderId: alloc.orderId },
          _sum: { amountCents: true },
        }),
        tx.paymentAllocation.aggregate({
          where: { orderId: alloc.orderId },
          _sum: { amountCents: true },
        }),
      ]);
      const unpaid = (receivable._sum.amountCents ?? 0) - (paid._sum.amountCents ?? 0);
      if (alloc.amountCents > unpaid) {
        throw new OrderServiceError(
          `订单 ${alloc.orderId} 未收余额不足（未收 ${unpaid} 分，分配 ${alloc.amountCents} 分）`,
        );
      }
    }

    const payment = await tx.payment.create({
      data: {
        customerId,
        amountCents,
        method: input.method,
        paidAt: input.paidAt,
        remark: input.remark,
      },
    });
    await tx.paymentAllocation.createMany({
      data: allocations.map((a) => ({
        paymentId: payment.id,
        orderId: a.orderId,
        amountCents: a.amountCents,
      })),
    });
  });
}

// 开票：票号唯一；开票金额不能超过订单剩余未开金额（订单金额 - 已开）
export async function createInvoice(input: {
  orderId: number;
  invoiceNo: string;
  amountCents: number;
  invoiceDate: Date;
  remark: string | null;
}) {
  const invoiceNo = input.invoiceNo.trim();
  if (!invoiceNo) throw new OrderServiceError("票号必填");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new OrderServiceError("开票金额必须是大于 0 的整数分");
  }

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new OrderServiceError("订单不存在");
    if (order.cancelledAt) throw new OrderServiceError("已作废订单不能开票");

    const [receivable, invoiced] = await Promise.all([
      tx.orderItem.aggregate({
        where: { orderId: input.orderId },
        _sum: { amountCents: true },
      }),
      tx.invoice.aggregate({
        where: { orderId: input.orderId },
        _sum: { amountCents: true },
      }),
    ]);
    const remain =
      (receivable._sum.amountCents ?? 0) - (invoiced._sum.amountCents ?? 0);
    if (input.amountCents > remain) {
      throw new OrderServiceError(
        `开票金额超过剩余可开金额（剩余 ${remain} 分）`,
      );
    }

    try {
      await tx.invoice.create({
        data: {
          orderId: input.orderId,
          invoiceNo,
          amountCents: input.amountCents,
          invoiceDate: input.invoiceDate,
          remark: input.remark,
        },
      });
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "P2002") {
        throw new OrderServiceError("票号已存在");
      }
      throw e;
    }
  });
}
