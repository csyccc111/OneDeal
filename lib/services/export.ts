// 导出服务：对账单 / 收货款记录（数据查询 + Excel 生成），与 Next.js 解耦可单测
import * as XLSX from "xlsx-js-style";
import { prisma } from "@/lib/prisma";
import { formatYuan, formatYuanMills } from "@/lib/money";
import {
  buildStatementGrid,
  type StatementColumn,
} from "@/lib/services/statement-template";
import { applyCellWrap } from "@/lib/xlsx-utils";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ==================== 对账单 ====================

export type StatementOrder = {
  orderNo: string;
  customerOrderNo: string | null; // 客户订单号（P16 调整新增列）
  createdAt: Date;
  status: string;
  amountCents: number;
  remark: string | null;
  items: {
    product: string;
    spec: string | null;
    itemCode: string | null;
    unit: string;
    qty: number;
    priceMills: number;
    amountCents: number;
    note: string | null;
    deliveryNoteNos: string[]; // 该订单行关联的送货单号（P16 调整新增列）
  }[];
};

export type StatementPayment = {
  paidAt: Date;
  method: string;
  amountCents: number;
  remark: string | null;
  allocations: { orderNo: string; amountCents: number }[];
};

export type StatementData = {
  customer: { id: number; name: string; contact: string | null };
  month: string; // "2026-08"
  basis: "created" | "shipped";
  orders: StatementOrder[];
  payments: StatementPayment[];
  orderTotalCents: number;
  payTotalCents: number;
};

// 对账单：某客户某月 订单（按创建月/发货月口径，作废排除） + 收款（按收款月）
export async function getStatementData(input: {
  customerId: number;
  month: string; // "2026-08"
  basis?: string; // created | shipped
}): Promise<StatementData | null> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, contact: true },
  });
  if (!customer) return null;

  const byShipped = input.basis === "shipped";
  const [year, monthNum] = input.month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 1);

  const orderWhere = {
    customerId: customer.id,
    cancelledAt: null,
    ...(byShipped
      ? { shipments: { some: { shippedAt: { gte: start, lt: end } } } }
      : { createdAt: { gte: start, lt: end } }),
  } as const;
  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  const [payments, dnItems] = await Promise.all([
    prisma.payment.findMany({
      where: { customerId: customer.id, paidAt: { gte: start, lt: end } },
      include: {
        allocations: { include: { order: { select: { orderNo: true } } } },
      },
      orderBy: { paidAt: "asc" },
    }),
    // 送货单号（DeliveryNoteItem 无 Prisma 关系，单独查询按订单行分组）
    prisma.deliveryNoteItem.findMany({
      where: { orderId: { in: orders.map((o) => o.id) } },
      include: { deliveryNote: { select: { noteNo: true } } },
    }),
  ]);

  // 订单行 → 送货单号列表
  const dnMap = new Map<number, string[]>();
  for (const d of dnItems) {
    const list = dnMap.get(d.orderItemId) ?? [];
    list.push(d.deliveryNote.noteNo);
    dnMap.set(d.orderItemId, list);
  }

  const mappedOrders: StatementOrder[] = orders.map((o) => ({
    orderNo: o.orderNo,
    customerOrderNo: o.customerOrderNo,
    createdAt: o.createdAt,
    status: o.status,
    amountCents: o.items.reduce((s, i) => s + i.amountCents, 0),
    remark: o.remark,
    items: o.items.map((i) => ({
      product: i.product,
      spec: i.spec,
      itemCode: i.itemCode,
      unit: i.unit,
      qty: i.qty,
      priceMills: i.unitPriceMills,
      amountCents: i.amountCents,
      note: i.note,
      deliveryNoteNos: (dnMap.get(i.id) ?? []).sort(),
    })),
  }));
  const mappedPayments: StatementPayment[] = payments.map((p) => ({
    paidAt: p.paidAt,
    method: p.method,
    amountCents: p.amountCents,
    remark: p.remark,
    allocations: p.allocations.map((a) => ({
      orderNo: a.order.orderNo,
      amountCents: a.amountCents,
    })),
  }));

  return {
    customer,
    month: input.month,
    basis: byShipped ? "shipped" : "created",
    orders: mappedOrders,
    payments: mappedPayments,
    orderTotalCents: mappedOrders.reduce((s, o) => s + o.amountCents, 0),
    payTotalCents: mappedPayments.reduce((s, p) => s + p.amountCents, 0),
  };
}

// 对账单 → Excel buffer（Sheet1 订单明细+汇总，Sheet2 收款明细）
// 按预设列配置输出（P16）
export function statementToExcel(
  data: StatementData,
  columns: StatementColumn[],
  templateInfo: { title: string; terms: string | null },
): Buffer {
  const monthLabel = `${data.month.slice(0, 4)}年${Number(data.month.slice(5))}月`;
  const basisLabel = data.basis === "shipped" ? "按发货日期" : "按创建日期";
  const grid = buildStatementGrid(data, columns);

  const wb = XLSX.utils.book_new();

  // Sheet1：对账单（按预设列配置）
  const sheet1: (string | number)[][] = [
    [templateInfo.title],
    [`客户：${data.customer.name}`, `月份：${monthLabel}`, `口径：${basisLabel}`],
    [],
    grid.headers,
    ...grid.rows.map((r) => r.map((c) => c.v)),
    ...grid.summaryRows.map((r) => r.map((c) => c.v)),
  ];
  if (templateInfo.terms) {
    sheet1.push([]);
    sheet1.push([templateInfo.terms]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1);
  ws1["!cols"] = grid.headers.map((_, i) => {
    const col = columns.filter((c) => c.visible)[i];
    return { wch: col?.width ?? 12 };
  });
  applyCellWrap(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, "对账单");

  // Sheet2：收款明细
  const sheet2: (string | number)[][] = [
    ["收款明细"],
    [`客户：${data.customer.name}`, `月份：${monthLabel}`],
    [],
    ["序号", "收款日期", "方式", "金额(元)", "冲抵订单", "备注"],
  ];
  data.payments.forEach((p, i) => {
    sheet2.push([
      i + 1,
      fmtDate(p.paidAt),
      p.method,
      Number(formatYuan(p.amountCents)),
      p.allocations.map((a) => `${a.orderNo}:${formatYuan(a.amountCents)}`).join("；") ||
        "（未分配）",
      p.remark ?? "",
    ]);
  });
  sheet2.push([]);
  sheet2.push(["收款合计", "", "", Number(formatYuan(data.payTotalCents))]);

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2);
  ws2["!cols"] = [
    { wch: 5 }, { wch: 11 }, { wch: 8 }, { wch: 10 }, { wch: 40 }, { wch: 20 },
  ];
  applyCellWrap(ws2);
  XLSX.utils.book_append_sheet(wb, ws2, "收款明细");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}

// ==================== 收货款记录 ====================

export type PaymentsExportRow = {
  paidAt: Date;
  customerName: string;
  method: string;
  amountCents: number;
  remark: string | null;
  allocations: { orderNo: string; amountCents: number }[];
};

export type PaymentsExportData = {
  from: string; // "2026-01-01"
  to: string; // "2026-08-31"
  customer: { id: number; name: string } | null; // null = 全部客户
  payments: PaymentsExportRow[];
  totalCents: number;
};

// 收货款记录：收款流水（客户可选=全部，日期范围）
export async function getPaymentsExportData(input: {
  customerId?: number;
  from?: string; // "2026-01-01"
  to?: string; // "2026-08-31"
}): Promise<PaymentsExportData | null> {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (input.from && !dateRe.test(input.from)) return null;
  if (input.to && !dateRe.test(input.to)) return null;

  const customer = input.customerId
    ? await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true },
      })
    : null;
  if (input.customerId && !customer) return null;

  const gte = input.from ? new Date(`${input.from}T00:00:00`) : new Date("1970-01-01");
  const toDate = input.to ? new Date(`${input.to}T23:59:59`) : new Date();
  const payments = await prisma.payment.findMany({
    where: {
      paidAt: { gte, lte: toDate },
      ...(customer ? { customerId: customer.id } : {}),
    },
    include: {
      customer: { select: { name: true } },
      allocations: { include: { order: { select: { orderNo: true } } } },
    },
    orderBy: { paidAt: "asc" },
  });

  const mapped: PaymentsExportRow[] = payments.map((p) => ({
    paidAt: p.paidAt,
    customerName: p.customer.name,
    method: p.method,
    amountCents: p.amountCents,
    remark: p.remark,
    allocations: p.allocations.map((a) => ({
      orderNo: a.order.orderNo,
      amountCents: a.amountCents,
    })),
  }));

  return {
    from: input.from ?? "全部",
    to: input.to ?? "至今",
    customer,
    payments: mapped,
    totalCents: mapped.reduce((s, p) => s + p.amountCents, 0),
  };
}

// 收货款记录 → Excel buffer
export function paymentsToExcel(data: PaymentsExportData): Buffer {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ["收货款记录"],
    [
      `客户：${data.customer ? data.customer.name : "全部客户"}`,
      `日期范围：${data.from} 至 ${data.to}`,
    ],
    [],
    ["序号", "收款日期", "客户", "方式", "金额(元)", "冲抵订单", "备注"],
  ];
  data.payments.forEach((p, i) => {
    rows.push([
      i + 1,
      fmtDate(p.paidAt),
      p.customerName,
      p.method,
      Number(formatYuan(p.amountCents)),
      p.allocations.map((a) => `${a.orderNo}:${formatYuan(a.amountCents)}`).join("；") ||
        "（未分配）",
      p.remark ?? "",
    ]);
  });
  rows.push([]);
  rows.push(["合计", "", "", "", Number(formatYuan(data.totalCents))]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 5 }, { wch: 11 }, { wch: 16 }, { wch: 8 },
    { wch: 10 }, { wch: 40 }, { wch: 20 },
  ];
  applyCellWrap(ws);
  XLSX.utils.book_append_sheet(wb, ws, "收货款记录");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}

// ==================== 供应商货款记录（P17） ====================

export type SupplierSummaryRow = {
  supplierId: number;
  name: string;
  payableCents: number; // 应付（范围内采购单合计）
  paidCents: number; // 已付（范围内采购单被冲抵合计）
  balanceCents: number; // 余额
  maxDays: number; // 最长账龄（今天 - poDate）
  poCount: number;
};

export type SupplierPaymentExportRow = {
  paidAt: Date;
  supplierName: string;
  method: string;
  amountCents: number;
  remark: string | null;
  allocations: { poNo: string; amountCents: number }[];
};

export type SupplierPaymentsExportData = {
  from: string; // "2026-08-01" 或 "全部"
  to: string; // "2026-08-31" 或 "至今"
  supplier: { id: number; name: string } | null; // null = 全部供应商
  summary: SupplierSummaryRow[];
  payments: SupplierPaymentExportRow[];
  totalPaidCents: number;
};

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

// 供应商货款：汇总（poDate 口径，与货款视图一致）+ 付款明细（paidAt 口径）
export async function getSupplierPaymentsExportData(input: {
  supplierId?: number;
  from?: string; // "2026-01-01"
  to?: string; // "2026-08-31"
}): Promise<SupplierPaymentsExportData | null> {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (input.from && !dateRe.test(input.from)) return null;
  if (input.to && !dateRe.test(input.to)) return null;

  const supplier = input.supplierId
    ? await prisma.supplier.findUnique({
        where: { id: input.supplierId },
        select: { id: true, name: true },
      })
    : null;
  if (input.supplierId && !supplier) return null;

  const gte = input.from ? new Date(`${input.from}T00:00:00`) : new Date("1970-01-01");
  const toDate = input.to ? new Date(`${input.to}T23:59:59`) : new Date();

  const poWhere = {
    ...(supplier ? { supplierId: supplier.id } : {}),
    poDate: { gte, lte: toDate },
  } as const;

  const [pos, payments] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: poWhere,
      include: {
        supplier: { select: { id: true, name: true } },
        items: { select: { amountCents: true } },
        allocations: { select: { amountCents: true } },
      },
      orderBy: { poDate: "asc" },
    }),
    prisma.supplierPayment.findMany({
      where: {
        paidAt: { gte, lte: toDate },
        ...(supplier ? { supplierId: supplier.id } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        allocations: { include: { purchaseOrder: { select: { poNo: true } } } },
      },
      orderBy: { paidAt: "asc" },
    }),
  ]);

  // 汇总（口径与货款视图一致：应付=采购单行合计，已付=被冲抵合计，账龄=今天-poDate 取最大）
  const today = new Date();
  const map = new Map<number, SupplierSummaryRow>();
  for (const po of pos) {
    const payable = po.items.reduce((s, i) => s + i.amountCents, 0);
    const paid = po.allocations.reduce((s, a) => s + a.amountCents, 0);
    const days = daysBetween(po.poDate, today);
    const cur = map.get(po.supplier.id) ?? {
      supplierId: po.supplier.id,
      name: po.supplier.name,
      payableCents: 0,
      paidCents: 0,
      balanceCents: 0,
      maxDays: 0,
      poCount: 0,
    };
    cur.payableCents += payable;
    cur.paidCents += paid;
    cur.balanceCents += payable - paid;
    cur.maxDays = Math.max(cur.maxDays, days);
    cur.poCount += 1;
    map.set(po.supplier.id, cur);
  }
  const summary = [...map.values()].sort((a, b) => b.balanceCents - a.balanceCents);

  const mappedPayments: SupplierPaymentExportRow[] = payments.map((p) => ({
    paidAt: p.paidAt,
    supplierName: p.supplier.name,
    method: p.method,
    amountCents: p.amountCents,
    remark: p.remark,
    allocations: p.allocations.map((a) => ({
      poNo: a.purchaseOrder.poNo,
      amountCents: a.amountCents,
    })),
  }));

  return {
    from: input.from ?? "全部",
    to: input.to ?? "至今",
    supplier,
    summary,
    payments: mappedPayments,
    totalPaidCents: mappedPayments.reduce((s, p) => s + p.amountCents, 0),
  };
}

// 供应商货款 → Excel（Sheet1 应付汇总，Sheet2 付款明细）
export function supplierPaymentsToExcel(
  data: SupplierPaymentsExportData,
): Buffer {
  const wb = XLSX.utils.book_new();

  // Sheet1：应付汇总
  const sheet1: (string | number)[][] = [
    ["供应商货款汇总"],
    [
      `供应商：${data.supplier ? data.supplier.name : "全部供应商"}`,
      `采购单日期：${data.from} 至 ${data.to}`,
    ],
    [],
    ["供应商", "应付(元)", "已付(元)", "余额(元)", "采购单数", "最长账龄(天)", "账龄状态"],
  ];
  for (const s of data.summary) {
    const status = s.maxDays > 60 ? "超60天" : s.maxDays > 30 ? "超30天" : "正常";
    sheet1.push([
      s.name,
      Number(formatYuan(s.payableCents)),
      Number(formatYuan(s.paidCents)),
      Number(formatYuan(s.balanceCents)),
      s.poCount,
      s.maxDays,
      status,
    ]);
  }
  if (data.summary.length === 0) {
    sheet1.push(["（该范围内无采购单）"]);
  }
  const totalBalance = data.summary.reduce((s, r) => s + r.balanceCents, 0);
  sheet1.push([]);
  sheet1.push(["余额合计", "", "", Number(formatYuan(totalBalance))]);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1);
  ws1["!cols"] = [
    { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 14 }, { wch: 10 },
  ];
  applyCellWrap(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, "应付汇总");

  // Sheet2：付款明细
  const sheet2: (string | number)[][] = [
    ["付款明细"],
    [
      `供应商：${data.supplier ? data.supplier.name : "全部供应商"}`,
      `付款日期：${data.from} 至 ${data.to}`,
    ],
    [],
    ["序号", "付款日期", "供应商", "方式", "金额(元)", "冲抵采购单", "备注"],
  ];
  data.payments.forEach((p, i) => {
    sheet2.push([
      i + 1,
      fmtDate(p.paidAt),
      p.supplierName,
      p.method,
      Number(formatYuan(p.amountCents)),
      p.allocations
        .map((a) => `${a.poNo}:${formatYuan(a.amountCents)}`)
        .join("；") || "（未分配）",
      p.remark ?? "",
    ]);
  });
  if (data.payments.length === 0) {
    sheet2.push(["（该范围内无付款记录）"]);
  }
  sheet2.push([]);
  sheet2.push(["付款合计", "", "", "", Number(formatYuan(data.totalPaidCents))]);

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2);
  ws2["!cols"] = [
    { wch: 5 }, { wch: 11 }, { wch: 20 }, { wch: 8 },
    { wch: 12 }, { wch: 40 }, { wch: 20 },
  ];
  applyCellWrap(ws2);
  XLSX.utils.book_append_sheet(wb, ws2, "付款明细");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}
