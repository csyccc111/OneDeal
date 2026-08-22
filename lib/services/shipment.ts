// 发货 / 退货 / 废品记账（订单行级，事务保证 Shipment 记录与 OrderItem 汇总同步）
import { prisma } from "@/lib/prisma";
import { OrderServiceError } from "@/lib/services/order";

// 净已发 = 累计发货 - 累计退货
function netShipped(item: { shippedQty: number; returnedQty: number }): number {
  return item.shippedQty - item.returnedQty;
}

// 某行是否已发完：净已发 + 废品 ≥ 计划数（与"未发量 qty - shipped + returned - defective"口径一致）
export function isFullyShipped(item: {
  qty: number;
  shippedQty: number;
  returnedQty: number;
  defectiveQty: number;
}): boolean {
  return netShipped(item) + item.defectiveQty >= item.qty;
}

// 未发量（可再发货数量）
function availableToShip(item: {
  qty: number;
  shippedQty: number;
  returnedQty: number;
  defectiveQty: number;
}): number {
  return item.qty - netShipped(item) - item.defectiveQty;
}

export async function recordShipment(input: {
  orderId: number;
  itemId: number;
  type: "发货" | "退货";
  qty: number;
  shippedAt: Date;
  note: string | null;
}) {
  const { orderId, itemId, type, qty } = input;
  if (!Number.isInteger(qty) || qty < 1) {
    throw new OrderServiceError("数量必须是 ≥1 的整数");
  }

  await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({ where: { id: itemId } });
    if (!item || item.orderId !== orderId) {
      throw new OrderServiceError("订单行不存在");
    }
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderServiceError("订单不存在");
    if (order.status === "已结算") {
      throw new OrderServiceError("已结算订单不能再记录发货/退货");
    }

    if (type === "发货") {
      const available = availableToShip(item);
      if (qty > available) {
        throw new OrderServiceError(
          `发货数量超过该行未发量（最多 ${available}）`,
        );
      }
      await tx.orderItem.update({
        where: { id: itemId },
        data: { shippedQty: item.shippedQty + qty },
      });
    } else {
      const shipped = netShipped(item);
      if (qty > shipped) {
        throw new OrderServiceError(
          `退货数量超过该行已发量（最多 ${shipped}）`,
        );
      }
      await tx.orderItem.update({
        where: { id: itemId },
        data: { returnedQty: item.returnedQty + qty },
      });
    }

    await tx.shipment.create({
      data: {
        orderId,
        itemId,
        type,
        qty,
        shippedAt: input.shippedAt,
        note: input.note,
      },
    });
  });
}

// 直接设置行废品数（≥0，写 ChangeLog 留痕）
export async function setDefectiveQty(input: {
  orderId: number;
  itemId: number;
  defectiveQty: number;
  note: string | null;
}) {
  const { orderId, itemId } = input;
  if (!Number.isInteger(input.defectiveQty) || input.defectiveQty < 0) {
    throw new OrderServiceError("废品数必须是 ≥0 的整数");
  }

  await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({ where: { id: itemId } });
    if (!item || item.orderId !== orderId) {
      throw new OrderServiceError("订单行不存在");
    }
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderServiceError("订单不存在");
    if (order.status === "已结算") {
      throw new OrderServiceError("已结算订单不能再修改废品数");
    }

    // 废品是独立损失记录，上限为计划数量（与已发/退货互不挤占）
    const maxDefective = item.qty;
    if (input.defectiveQty > maxDefective) {
      throw new OrderServiceError(
        `废品数不能超过 ${maxDefective}（计划数量）`,
      );
    }
    if (input.defectiveQty === item.defectiveQty) return;

    await tx.orderItem.update({
      where: { id: itemId },
      data: { defectiveQty: input.defectiveQty },
    });
    await tx.changeLog.create({
      data: {
        orderId,
        field: `items.${itemId}.defectiveQty`,
        oldValue: String(item.defectiveQty),
        newValue: `${input.defectiveQty}${
          input.note ? `（${input.note}）` : ""
        }`,
      },
    });
  });
}
