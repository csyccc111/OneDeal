import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/orders/unpaid?customerId=N —— 某客户未收订单列表（新建收款分配用）
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const customerId = Number(searchParams.get("customerId"));
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "客户 ID 无效" }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: {
      customerId,
      cancelledAt: null,
      status: { not: "已结算" },
    },
    orderBy: { createdAt: "asc" },
    include: {
      items: { select: { amountCents: true } },
      allocations: { select: { amountCents: true } },
    },
  });

  const result = orders
    .map((o) => {
      const receivable = o.items.reduce((s, i) => s + i.amountCents, 0);
      const paid = o.allocations.reduce((s, a) => s + a.amountCents, 0);
      return {
        id: o.id,
        orderNo: o.orderNo,
        status: o.status,
        receivable,
        paid,
        unpaid: receivable - paid,
      };
    })
    .filter((o) => o.unpaid > 0);

  return NextResponse.json({ orders: result });
}
