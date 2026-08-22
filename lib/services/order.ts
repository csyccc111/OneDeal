// 订单业务核心逻辑（与 Next.js 解耦，可独立测试）
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { ORDER_STATUS_FLOW, type OrderStatus } from "@/lib/constants";
import { formatYuan, lineAmountCents } from "@/lib/money";

export class OrderServiceError extends Error {}

export type OrderItemInput = {
  product: string;
  spec: string | null;
  unit: string;
  qty: number;
  unitPriceMills: number; // 单价（厘，1元=1000厘）
  note: string | null;
  itemCode?: string | null; // 物料编号（可空）
};

export type OrderInput = {
  customerId: number;
  customerOrderNo: string | null; // 客户订单号（客户侧单号，可空）
  taxType: string;
  taxRateBp: number | null; // 税率万分比，含税时自定义（仅记录）
  dueDate: Date | null;
  remark: string | null;
  items: OrderItemInput[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 单号生成：YYYYMMDD-序号（当天序号从库内最大值+1，冲突重试）
export async function generateOrderNo(d: Date = new Date()): Promise<string> {
  const prefix = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await prisma.order.findFirst({
      where: { orderNo: { startsWith: prefix } },
      orderBy: { orderNo: "desc" },
      select: { orderNo: true },
    });
    const seq = latest ? Number(latest.orderNo.split("-")[1] ?? 0) + 1 : 1;
    const orderNo = `${prefix}-${String(seq).padStart(3, "0")}`;
    const exists = await prisma.order.findUnique({
      where: { orderNo },
      select: { id: true },
    });
    if (!exists) return orderNo;
  }
  throw new OrderServiceError("单号生成失败，请重试");
}

function amountCents(item: OrderItemInput): number {
  return lineAmountCents(item.qty, item.unitPriceMills);
}

// 创建订单（含多行，初始状态 待确认，写状态日志）
export async function createOrder(input: OrderInput) {
  if (input.items.length === 0) {
    throw new OrderServiceError("请至少添加一个订单行");
  }
  const orderNo = await generateOrderNo();
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNo,
        customerId: input.customerId,
        customerOrderNo: input.customerOrderNo,
        taxType: input.taxType,
        taxRateBp: input.taxRateBp,
        dueDate: input.dueDate,
        remark: input.remark,
        status: "待确认",
        items: {
          create: input.items.map((it) => ({
            ...it,
            amountCents: amountCents(it),
          })),
        },
      },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId: created.id,
        fromStatus: null,
        toStatus: "待确认",
        note: "创建订单",
      },
    });
    return created;
  });
  return order;
}

// 状态流转：只能按 待确认→排产→生产中→已发货→已结算，不可跳步/回退
// 流转到"已发货"时校验所有订单行已发完（净已发 + 废品 ≥ 计划数）
// 可作废状态（未发货阶段）
const CANCELLABLE_STATUSES = new Set(["待确认", "排产", "生产中"]);

// 作废订单：必填原因，留痕（写状态日志），不物理删除
export async function cancelOrder(orderId: number, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) throw new OrderServiceError("作废原因必填");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      shipments: { select: { id: true } },
      allocations: { select: { id: true } },
      invoices: { select: { id: true } },
    },
  });
  if (!order) throw new OrderServiceError("订单不存在");
  if (order.cancelledAt) throw new OrderServiceError("订单已作废");
  if (!CANCELLABLE_STATUSES.has(order.status)) {
    throw new OrderServiceError(
      "仅「待确认/排产/生产中」的订单可作废（已发货/已结算不允许）",
    );
  }
  if (order.shipments.length > 0) {
    throw new OrderServiceError("该订单已有发货/退货记录，不能作废");
  }
  if (order.allocations.length > 0) {
    throw new OrderServiceError("该订单已有收款分配，不能作废");
  }
  if (order.invoices.length > 0) {
    throw new OrderServiceError("该订单已有开票记录，不能作废");
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { cancelledAt: new Date(), cancelReason: trimmed },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "已作废",
        note: trimmed,
      },
    });
  });
}

export async function transitionOrderStatus(
  orderId: number,
  toStatus: string,
  note: string | null,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderServiceError("订单不存在");
  if (order.status === "已结算") {
    throw new OrderServiceError("订单已结算，不能再流转");
  }
  const expectedNext =
    ORDER_STATUS_FLOW[order.status as OrderStatus] ?? null;
  if (expectedNext !== toStatus) {
    throw new OrderServiceError(
      expectedNext === null
        ? "当前状态不能流转"
        : `只能流转到「${expectedNext}」`,
    );
  }

  if (toStatus === "已发货") {
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    const unfinished = items.filter(
      (it) => it.shippedQty - it.returnedQty + it.defectiveQty < it.qty,
    );
    if (unfinished.length > 0) {
      throw new OrderServiceError(
        `还有 ${unfinished.length} 行未发完：${unfinished
          .map((it) => it.product)
          .join("、")}，请先完成发货`,
      );
    }
  }

  if (toStatus === "已结算") {
    // 校验未收 = 0（应收 - 已分配收款）
    const [receivable, paid] = await Promise.all([
      prisma.orderItem.aggregate({
        where: { orderId },
        _sum: { amountCents: true },
      }),
      prisma.paymentAllocation.aggregate({
        where: { orderId },
        _sum: { amountCents: true },
      }),
    ]);
    const unpaid = (receivable._sum.amountCents ?? 0) - (paid._sum.amountCents ?? 0);
    if (unpaid > 0) {
      throw new OrderServiceError(
        `订单还有未收金额 ${formatYuan(unpaid)} 元，请先完成收款`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: toStatus },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        note: note ?? null,
      },
    });
  });
}

type ItemRow = Prisma.OrderItemGetPayload<Record<string, never>>;

function diffScalar(
  field: string,
  oldValue: string | null,
  newValue: string | null,
  logs: { field: string; oldValue: string; newValue: string }[],
) {
  const a = oldValue ?? "";
  const b = newValue ?? "";
  if (a !== b) {
    logs.push({ field, oldValue: a, newValue: b });
  }
}

// 更新订单（订单字段 + 行增删改），变更写入 ChangeLog；已结算禁止改行（已发货放开，2026-08-19 用户要求）
// newOrderNo：可选，传新单号时校验并更新（支持编辑订单号，2026-08-19 用户要求）
export async function updateOrderWithItems(
  orderId: number,
  input: OrderInput,
  newOrderNo?: string,
) {
  if (input.items.length === 0) {
    throw new OrderServiceError("订单至少需要一个订单行");
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new OrderServiceError("订单不存在");

  // 订单号修改：非空、长度、唯一（除自身）
  const orderNo = newOrderNo?.trim() ?? order.orderNo;
  if (orderNo === "") throw new OrderServiceError("订单号不能为空");
  if (orderNo.length > 30) throw new OrderServiceError("订单号过长（≤30 字符）");
  if (orderNo !== order.orderNo) {
    const dup = await prisma.order.findUnique({
      where: { orderNo },
      select: { id: true },
    });
    if (dup) throw new OrderServiceError(`订单号已存在：${orderNo}`);
  }

  const locked = order.status === "已结算";

  // 提交的行：带 id 的是存量行（更新），不带的是新增行
  type SubmittedItem = OrderItemInput & { id?: number };
  const submitted = input.items as SubmittedItem[];

  // 已删除的旧行：有 id 且不在提交列表中的
  const submittedIds = new Set(
    submitted.filter((i) => i.id != null).map((i) => i.id as number),
  );
  const removed = order.items.filter((i) => !submittedIds.has(i.id));

  if (locked && (removed.length > 0 || submitted.some((i) => i.id == null))) {
    throw new OrderServiceError("已结算订单不能增删订单行");
  }

  return prisma.$transaction(async (tx) => {
    const logs: { field: string; oldValue: string; newValue: string }[] = [];

    // 订单字段 diff
    diffScalar("orderNo", order.orderNo, orderNo, logs);
    diffScalar("taxType", order.taxType, input.taxType, logs);
    diffScalar(
      "taxRateBp",
      order.taxRateBp != null ? String(order.taxRateBp) : null,
      input.taxRateBp != null ? String(input.taxRateBp) : null,
      logs,
    );
    diffScalar(
      "dueDate",
      order.dueDate ? order.dueDate.toISOString() : null,
      input.dueDate ? input.dueDate.toISOString() : null,
      logs,
    );
    diffScalar("remark", order.remark, input.remark, logs);

    const oldById = new Map(order.items.map((i) => [i.id, i]));

    for (const [idx, item] of submitted.entries()) {
      const prefix = `items.${idx}`;
      if (item.id != null) {
        const old = oldById.get(item.id);
        if (!old) throw new OrderServiceError("订单行数据无效");
        if (locked) {
          // 已结算：行不允许任何变更（含数量/价格）
          if (
            old.product !== item.product ||
            old.spec !== item.spec ||
            old.unit !== item.unit ||
            old.qty !== item.qty ||
            old.unitPriceMills !== item.unitPriceMills ||
            old.note !== item.note ||
            old.itemCode !== item.itemCode
          ) {
            throw new OrderServiceError("已结算订单不能修改订单行");
          }
          // 行无变化，跳过该行的 diff 与更新（订单级字段仍可改）
          continue;
        }
        // 数量不能小于已发数量（含已发货状态编辑的保护）
        if (item.qty < old.shippedQty) {
          throw new OrderServiceError(
            `「${item.product}」数量不能小于已发数量（${old.shippedQty}）`,
          );
        }
        diffScalar(`${prefix}.product`, old.product, item.product, logs);
        diffScalar(`${prefix}.spec`, old.spec, item.spec, logs);
        diffScalar(`${prefix}.unit`, old.unit, item.unit, logs);
        diffScalar(`${prefix}.qty`, String(old.qty), String(item.qty), logs);
        diffScalar(
          `${prefix}.itemCode`,
          old.itemCode ?? "",
          item.itemCode ?? "",
          logs,
        );
        diffScalar(
          `${prefix}.unitPriceMills`,
          String(old.unitPriceMills),
          String(item.unitPriceMills),
          logs,
        );
        diffScalar(`${prefix}.note`, old.note, item.note, logs);
        const newAmount = amountCents(item);
        diffScalar(
          `${prefix}.amountCents`,
          String(old.amountCents),
          String(newAmount),
          logs,
        );
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            product: item.product,
            spec: item.spec,
            unit: item.unit,
            qty: item.qty,
            unitPriceMills: item.unitPriceMills,
            amountCents: newAmount,
            note: item.note,
            itemCode: item.itemCode ?? null,
          },
        });
      } else {
        await tx.orderItem.create({
          data: {
            orderId,
            product: item.product,
            spec: item.spec,
            unit: item.unit,
            qty: item.qty,
            unitPriceMills: item.unitPriceMills,
            amountCents: amountCents(item),
            note: item.note,
            itemCode: item.itemCode ?? null,
          },
        });
        logs.push({
          field: `${prefix}.新增`,
          oldValue: "",
          newValue: `${item.product} x${item.qty}`,
        });
      }
    }

    // 删除被移除的行（有发货/退货记录的禁止删）
    for (const old of removed) {
      const shipmentCount = await tx.shipment.count({
        where: { itemId: old.id },
      });
      if (shipmentCount > 0) {
        throw new OrderServiceError(
          `「${old.product}」已有发货/退货记录，不能删除该行`,
        );
      }
      await tx.orderItem.delete({ where: { id: old.id } });
      logs.push({
        field: `items.${submitted.length}.删除`,
        oldValue: `${old.product} x${old.qty}`,
        newValue: "",
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        orderNo,
        customerId: input.customerId,
        customerOrderNo: input.customerOrderNo,
        taxType: input.taxType,
        taxRateBp: input.taxRateBp,
        dueDate: input.dueDate,
        remark: input.remark,
      },
    });

    for (const log of logs) {
      await tx.changeLog.create({
        data: { orderId, field: log.field, oldValue: log.oldValue, newValue: log.newValue },
      });
    }

    return { changed: logs.length };
  });
}
