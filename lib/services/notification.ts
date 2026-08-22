import { prisma } from "@/lib/prisma";

export interface NewOrderInfo {
  id: number;
  orderNo: string;
  customerName: string;
  amountCents: number;
  status: string;
  createdAt: string; // ISO 字符串
}

/** since 之后新创建的订单（作废排除，按创建时间升序，最多 20 条） */
export async function newOrdersSince(since: Date): Promise<NewOrderInfo[]> {
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gt: since },
      cancelledAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    include: {
      customer: { select: { name: true } },
      items: { select: { amountCents: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    customerName: o.customer.name,
    amountCents: o.items.reduce((s, i) => s + i.amountCents, 0),
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));
}
