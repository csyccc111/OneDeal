// 送货单业务核心逻辑：XS 单号 / 勾选订单行生成快照 / 数量上限校验 / 打印计数
// 开单即发货：创建送货单时同步累加 shippedQty 并生成发货记录（删单一并回退）
import { prisma } from "@/lib/prisma";
import { lineAmountCents } from "@/lib/money";

export class DeliveryNoteServiceError extends Error {}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 单号生成：XS-YYYYMMDD-序号（当天自增+重试）
// 注意：noteNo 格式 XS-日期-序号，split("-") 后 [1]=日期 [2]=序号
export async function generateNoteNo(d: Date = new Date()): Promise<string> {
  const prefix = `XS-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await prisma.deliveryNote.findFirst({
      where: { noteNo: { startsWith: prefix } },
      orderBy: { noteNo: "desc" },
      select: { noteNo: true },
    });
    const seq = latest ? Number(latest.noteNo.split("-")[2] ?? 0) + 1 : 1;
    const noteNo = `${prefix}-${String(seq).padStart(3, "0")}`;
    const exists = await prisma.deliveryNote.findUnique({
      where: { noteNo },
      select: { id: true },
    });
    if (!exists) return noteNo;
  }
  throw new DeliveryNoteServiceError("送货单号生成失败，请重试");
}

export type DeliveryLineInput = {
  orderItemId: number;
  qty: number; // 本次送货数量（正整数）
};

export type CreateDeliveryNoteInput = {
  customerId: number;
  noteDate: Date;
  contact: string | null;
  address: string | null;
  remark: string | null;
  lines: DeliveryLineInput[];
};

// 创建送货单：勾选订单行+数量（上限=该行剩余未发量 qty-净已发-废品；跨订单限同一客户），行快照写入
export async function createDeliveryNote(input: CreateDeliveryNoteInput) {
  if (input.lines.length === 0) {
    throw new DeliveryNoteServiceError("请至少勾选一个订单行");
  }
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1) {
      throw new DeliveryNoteServiceError("送货数量必须是 ≥1 的整数");
    }
  }

  const noteNo = await generateNoteNo(input.noteDate);

  return prisma.$transaction(async (tx) => {
    // 校验客户
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) throw new DeliveryNoteServiceError("客户不存在");

    // 校验订单行（同一客户、未作废、数量不超剩余未发量）
    const itemIds = input.lines.map((l) => l.orderItemId);
    const items = await tx.orderItem.findMany({
      where: { id: { in: itemIds } },
      include: { order: { select: { id: true, orderNo: true, customerOrderNo: true, customerId: true, cancelledAt: true } } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const seenItem = new Set<number>();
    for (const l of input.lines) {
      if (seenItem.has(l.orderItemId)) {
        throw new DeliveryNoteServiceError("同一订单行不能重复勾选");
      }
      seenItem.add(l.orderItemId);
      const it = byId.get(l.orderItemId);
      if (!it) throw new DeliveryNoteServiceError("订单行不存在");
      if (it.order.customerId !== input.customerId) {
        throw new DeliveryNoteServiceError("勾选的订单行不属于该客户");
      }
      if (it.order.cancelledAt) {
        throw new DeliveryNoteServiceError(`订单 ${it.order.orderNo} 已作废，不能生成送货单`);
      }
      // 开单即发货：历史送货单数量已计入 shippedQty，剩余未发量只按净已发算
      const shipped = it.shippedQty - it.returnedQty; // 净已发
      const available = it.qty - shipped - it.defectiveQty; // 剩余未发量
      if (l.qty > available) {
        throw new DeliveryNoteServiceError(
          `「${it.product}」剩余可发 ${available}，本次 ${l.qty} 超出上限（已发货 ${shipped}）`,
        );
      }
    }

    const note = await tx.deliveryNote.create({
      data: {
        noteNo,
        customerId: input.customerId,
        noteDate: input.noteDate,
        contact: input.contact,
        address: input.address,
        remark: input.remark,
        items: {
          create: input.lines.map((l) => {
            const it = byId.get(l.orderItemId)!;
            return {
              orderItemId: it.id,
              orderId: it.order.id,
              orderNo: it.order.orderNo,
              customerOrderNo: it.order.customerOrderNo,
              itemCode: it.itemCode,
              product: it.product,
              spec: it.spec,
              unit: it.unit,
              qty: l.qty,
              unitPriceMills: it.unitPriceMills,
              amountCents: lineAmountCents(l.qty, it.unitPriceMills),
              note: it.note,
            };
          }),
        },
      },
    });
    // 开送货单 = 自动记发货（shippedQty 同步累加，防重复开单/重复记账；删除送货单时一并回退）
    // 同时生成发货记录，对账单/报表"按发货日期"统计才不会漏
    for (const l of input.lines) {
      const it = byId.get(l.orderItemId)!;
      await tx.orderItem.update({
        where: { id: l.orderItemId },
        data: {
          deliveryNoteQty: { increment: l.qty },
          shippedQty: { increment: l.qty },
        },
      });
      await tx.shipment.create({
        data: {
          orderId: it.order.id,
          itemId: it.id,
          type: "发货",
          qty: l.qty,
          shippedAt: input.noteDate,
          note: `送货单 ${note.noteNo} 自动生成`,
        },
      });
    }
    return note;
  });
}

// 打印计数 +1（打印页触发）
export async function incrementPrintedCount(noteId: number): Promise<void> {
  await prisma.deliveryNote.update({
    where: { id: noteId },
    data: { printedCount: { increment: 1 } },
  });
}

export async function getDeliveryNoteWithItems(noteId: number) {
  return prisma.deliveryNote.findUnique({
    where: { id: noteId },
    include: {
      customer: { select: { id: true, name: true, contact: true, phone: true } },
      items: { orderBy: { id: "asc" } },
    },
  });
}

// 删除送货单（快照表，不影响订单/发货记录；行随级联删除）—— 2026-08-19 用户要求
// 同时回退订单行"已开送货单数量"（用户要求：删单后数量恢复）
export async function deleteDeliveryNote(
  noteId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = await prisma.deliveryNote.findUnique({
    where: { id: noteId },
    include: { items: { select: { orderItemId: true, orderId: true, qty: true } } },
  });
  if (!note) return { ok: false, error: "送货单不存在" };

  await prisma.$transaction(async (tx) => {
    await tx.deliveryNote.delete({ where: { id: noteId } }); // DeliveryNoteItem 级联删除
    // 回退已开送货单数量 + 已发货数量，并删除开单时自动生成的发货记录
    for (const it of note.items) {
      await tx.orderItem.update({
        where: { id: it.orderItemId },
        data: {
          deliveryNoteQty: { decrement: it.qty },
          shippedQty: { decrement: it.qty },
        },
      });
      await tx.shipment.deleteMany({
        where: {
          orderId: it.orderId,
          itemId: it.orderItemId,
          note: `送货单 ${note.noteNo} 自动生成`,
        },
      });
    }
  });
  return { ok: true };
}

// 某客户未发完的订单行（供新建送货单勾选；作废排除；剩余量按净已发计算，开单即发货）
export async function unsentOrderItems(customerId: number): Promise<
  {
    orderItemId: number;
    orderId: number;
    orderNo: string;
    customerOrderNo: string | null;
    itemCode: string | null;
    product: string;
    spec: string | null;
    unit: string;
    qty: number;
    shipped: number;
    returned: number;
    defective: number;
    deliveryNoteQty: number; // 已开送货单数量
    available: number; // 剩余可开
    unitPriceMills: number;
    amountCents: number;
  }[]
> {
  const items = await prisma.orderItem.findMany({
    where: { order: { customerId, cancelledAt: null } },
    include: { order: { select: { orderNo: true, customerOrderNo: true } } },
    orderBy: [{ order: { orderNo: "asc" } }, { id: "asc" }],
  });
  return items
    .map((it) => {
      // 开单即发货：剩余可开只按净已发算（历史送货单已含在 shippedQty 内）
      const shipped = it.shippedQty - it.returnedQty;
      const available = it.qty - shipped - it.defectiveQty;
      return {
        orderItemId: it.id,
        orderId: it.orderId,
        orderNo: it.order.orderNo,
        customerOrderNo: it.order.customerOrderNo,
        itemCode: it.itemCode,
        product: it.product,
        spec: it.spec,
        unit: it.unit,
        qty: it.qty,
        shipped,
        returned: it.returnedQty,
        defective: it.defectiveQty,
        deliveryNoteQty: it.deliveryNoteQty,
        available,
        unitPriceMills: it.unitPriceMills,
        amountCents: it.amountCents,
      };
    })
    .filter((r) => r.available > 0);
}
