// 统计报表导出（P18）：查询函数与报表页共用（同一数据源保证数字一致），Excel 三 Sheet 生成
// 与 Next.js 解耦可单测
import * as XLSX from "xlsx-js-style";
import { prisma } from "@/lib/prisma";
import { formatYuan } from "@/lib/money";
import { applyCellWrap } from "@/lib/xlsx-utils";

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

// ==================== 查询（与 /reports 页面口径一致） ====================

// 月度趋势：某年 1-12 月订单金额/数量（作废排除）
export type MonthlyTrendRow = {
  month: number; // 1-12
  amountCents: number;
  count: number;
};

export async function getMonthlyTrend(year: number): Promise<MonthlyTrendRow[]> {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end }, cancelledAt: null },
    select: { createdAt: true, items: { select: { amountCents: true } } },
  });
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    amountCents: 0,
    count: 0,
  }));
  for (const o of orders) {
    const m = o.createdAt.getMonth();
    months[m].amountCents += o.items.reduce((s, i) => s + i.amountCents, 0);
    months[m].count += 1;
  }
  return months;
}

// 欠款排行：按客户聚合未收（作废排除；账龄=今天-发货日，未发货按创建日）
export type AgingRankRow = {
  customerId: number;
  name: string;
  unpaidCents: number;
  maxDays: number;
  orderCount: number;
};

export async function getAgingRank(): Promise<AgingRankRow[]> {
  const orders = await prisma.order.findMany({
    where: { cancelledAt: null },
    include: {
      customer: { select: { id: true, name: true } },
      items: { select: { amountCents: true } },
      allocations: { select: { amountCents: true } },
      shipments: {
        select: { shippedAt: true },
        orderBy: { shippedAt: "asc" },
        take: 1,
      },
    },
  });

  const today = new Date();
  const byCustomer = new Map<
    number,
    { name: string; unpaidCents: number; maxDays: number; orderCount: number }
  >();
  for (const o of orders) {
    const receivable = o.items.reduce((s, i) => s + i.amountCents, 0);
    const paid = o.allocations.reduce((s, a) => s + a.amountCents, 0);
    const unpaid = receivable - paid;
    if (unpaid <= 0) continue;
    const agingDate = o.shipments[0]?.shippedAt ?? o.createdAt;
    const days = daysBetween(agingDate, today);
    const cur = byCustomer.get(o.customer.id) ?? {
      name: o.customer.name,
      unpaidCents: 0,
      maxDays: 0,
      orderCount: 0,
    };
    cur.unpaidCents += unpaid;
    cur.maxDays = Math.max(cur.maxDays, days);
    cur.orderCount += 1;
    byCustomer.set(o.customer.id, cur);
  }
  return [...byCustomer.entries()]
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => b.unpaidCents - a.unpaidCents);
}

// 客户年累计：某年各客户订单金额/订单数/当前未收（作废排除）
export type YearlyRow = {
  customerId: number;
  name: string;
  amountCents: number;
  count: number;
  unpaidCents: number;
};

export async function getYearlyByCustomer(year: number): Promise<YearlyRow[]> {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end }, cancelledAt: null },
    include: {
      customer: { select: { id: true, name: true } },
      items: { select: { amountCents: true } },
      allocations: { select: { amountCents: true } },
    },
  });

  const byCustomer = new Map<
    number,
    { name: string; amountCents: number; count: number; unpaidCents: number }
  >();
  for (const o of orders) {
    const amount = o.items.reduce((s, i) => s + i.amountCents, 0);
    const unpaid = amount - o.allocations.reduce((s, a) => s + a.amountCents, 0);
    const cur = byCustomer.get(o.customer.id) ?? {
      name: o.customer.name,
      amountCents: 0,
      count: 0,
      unpaidCents: 0,
    };
    cur.amountCents += amount;
    cur.count += 1;
    cur.unpaidCents += unpaid;
    byCustomer.set(o.customer.id, cur);
  }
  return [...byCustomer.entries()]
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

// ==================== Excel（单个 xlsx 三 Sheet，P18） ====================

export type ReportExportData = {
  year: number;
  monthly: MonthlyTrendRow[];
  aging: AgingRankRow[];
  yearly: YearlyRow[];
};

export async function getReportExportData(year: number): Promise<ReportExportData> {
  const [monthly, aging, yearly] = await Promise.all([
    getMonthlyTrend(year),
    getAgingRank(),
    getYearlyByCustomer(year),
  ]);
  return { year, monthly, aging, yearly };
}

export function reportToExcel(data: ReportExportData): Buffer {
  const wb = XLSX.utils.book_new();
  const yearLabel = `${data.year}年`;

  // Sheet1：月度趋势
  const sheet1: (string | number)[][] = [
    [`${yearLabel} 月度订单趋势`],
    [],
    ["月份", "订单金额(元)", "订单数量"],
    ...data.monthly.map((m) => [
      `${m.month}月`,
      Number(formatYuan(m.amountCents)),
      m.count,
    ]),
    [
      "全年合计",
      Number(
        formatYuan(data.monthly.reduce((s, m) => s + m.amountCents, 0)),
      ),
      data.monthly.reduce((s, m) => s + m.count, 0),
    ],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1);
  ws1["!cols"] = [{ wch: 10 }, { wch: 16 }, { wch: 10 }];
  applyCellWrap(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, "月度趋势");

  // Sheet2：欠款排行
  const sheet2: (string | number)[][] = [
    ["客户欠款排行"],
    [],
    ["客户", "未收金额(元)", "未收订单数", "最长账龄(天)", "账龄状态"],
    ...data.aging.map((r) => [
      r.name,
      Number(formatYuan(r.unpaidCents)),
      r.orderCount,
      r.maxDays,
      r.maxDays > 60 ? "超60天" : r.maxDays > 30 ? "超30天" : "正常",
    ]),
  ];
  if (data.aging.length === 0) sheet2.push(["（暂无欠款客户）"]);
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2);
  ws2["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
  ];
  applyCellWrap(ws2);
  XLSX.utils.book_append_sheet(wb, ws2, "欠款排行");

  // Sheet3：客户年累计
  const sheet3: (string | number)[][] = [
    [`${yearLabel} 客户年累计`],
    [],
    ["客户", "年订单金额(元)", "订单数", "当前未收(元)"],
    ...data.yearly.map((r) => [
      r.name,
      Number(formatYuan(r.amountCents)),
      r.count,
      Number(formatYuan(r.unpaidCents)),
    ]),
  ];
  if (data.yearly.length === 0) sheet3.push(["（该年无订单）"]);
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3);
  ws3["!cols"] = [
    { wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 16 },
  ];
  applyCellWrap(ws3);
  XLSX.utils.book_append_sheet(wb, ws3, "客户年累计");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}
