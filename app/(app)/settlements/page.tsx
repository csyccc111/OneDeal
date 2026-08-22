import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatYuan } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaymentForm } from "@/components/payment-form";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "aging", label: "客户未收" },
  { key: "records", label: "收款记录" },
  { key: "new", label: "新建收款" },
  { key: "monthly", label: "月度对账" },
] as const;

function TabNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/settlements?tab=${t.key}`}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm transition-colors",
            active === t.key
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function agingColor(days: number): string {
  if (days > 60) return "font-medium text-destructive"; // 红
  if (days > 30) return "font-medium text-amber-600"; // 黄
  return "";
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    show?: string;
    customerId?: string;
    month?: string;
    basis?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab ?? "aging";
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, contact: true, settleMode: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">结算管理</h1>
      <TabNav active={tab} />

      {tab === "new" && <PaymentForm customers={customers} />}

      {tab === "aging" && <AgingView showAll={sp.show === "all"} />}

      {tab === "records" && (
        <RecordsView customers={customers} customerId={sp.customerId} />
      )}

      {tab === "monthly" && (
        <MonthlyView
          customers={customers}
          month={sp.month}
          customerId={sp.customerId}
          basis={sp.basis}
        />
      )}
    </div>
  );
}

// ==================== 客户未收 + 账龄 ====================

async function AgingView({ showAll }: { showAll: boolean }) {
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
    { name: string; unpaid: number; maxDays: number; orderCount: number }
  >();
  for (const o of orders) {
    const receivable = o.items.reduce((s, i) => s + i.amountCents, 0);
    const paid = o.allocations.reduce((s, a) => s + a.amountCents, 0);
    const unpaid = receivable - paid;
    if (unpaid <= 0) continue;
    const agingDate = o.shipments[0]?.shippedAt ?? o.createdAt;
    const days = Math.max(0, daysBetween(agingDate, today));
    const cur = byCustomer.get(o.customer.id) ?? {
      name: o.customer.name,
      unpaid: 0,
      maxDays: 0,
      orderCount: 0,
    };
    cur.unpaid += unpaid;
    cur.maxDays = Math.max(cur.maxDays, days);
    cur.orderCount += 1;
    byCustomer.set(o.customer.id, cur);
  }

  const rows = [...byCustomer.entries()].sort((a, b) => b[1].unpaid - a[1].unpaid);
  const totalUnpaid = rows.reduce((s, [, v]) => s + v.unpaid, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">客户未收汇总（欠款）</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            总未收 <span className="font-semibold text-foreground">{formatYuan(totalUnpaid)} 元</span>
            {!showAll && (
              <>
                {" "}· 仅显示有欠款的客户（
                <Link href="/settlements?tab=aging&show=all" className="underline">
                  显示全部客户
                </Link>
                ）
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead className="text-right">未收金额(元)</TableHead>
                  <TableHead className="text-right">未收订单数</TableHead>
                  <TableHead className="text-right">最长账龄</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      暂无欠款客户 🎉
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(([id, v]) => (
                  <TableRow key={id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatYuan(v.unpaid)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.orderCount}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", agingColor(v.maxDays))}>
                      {v.maxDays} 天
                      {v.maxDays > 60 ? " 🔴" : v.maxDays > 30 ? " 🟡" : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            账龄 = 今天 − 订单发货日（未发货按创建日）；&gt;30 天标黄、&gt;60 天标红。作废订单不计入。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== 收款记录 ====================

async function RecordsView({
  customers,
  customerId,
}: {
  customers: { id: number; name: string }[];
  customerId?: string;
}) {
  const cid = Number(customerId) || undefined;
  const payments = await prisma.payment.findMany({
    where: cid ? { customerId: cid } : {},
    orderBy: { paidAt: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true } },
      allocations: { include: { order: { select: { orderNo: true } } } },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">收款记录（最近 100 笔）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form method="get" className="flex max-w-xs items-center gap-2">
          <input type="hidden" name="tab" value="records" />
          <select
            name="customerId"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            defaultValue={cid ?? ""}
          >
            <option value="">全部客户</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            筛选
          </Button>
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>方式</TableHead>
                <TableHead className="text-right">金额(元)</TableHead>
                <TableHead>冲抵订单</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    暂无收款记录
                  </TableCell>
                </TableRow>
              )}
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">
                    {p.paidAt.toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="font-medium">{p.customer.name}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatYuan(p.amountCents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.allocations.map((a) => (
                      <span key={a.id} className="mr-2 inline-block">
                        {a.order.orderNo}: {formatYuan(a.amountCents)}
                      </span>
                    ))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.remark ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== 月度对账 ====================

async function MonthlyView({
  customers,
  month,
  customerId,
  basis,
}: {
  customers: { id: number; name: string }[];
  month?: string;
  customerId?: string;
  basis?: string;
}) {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : undefined;
  const cid = Number(customerId) || undefined;
  const byShipped = basis === "shipped";
  const today = new Date();
  const defaultMonth = m ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [year, monthNum] = defaultMonth.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 1);

  const customerWhere = cid ? { customerId: cid } : {};

  const [monthOrders, monthPayments] = await Promise.all([
    prisma.order.findMany({
      where: {
        // 口径：创建日期 或 发货日期（最早发货日落在当月）
        ...(byShipped
          ? { shipments: { some: { shippedAt: { gte: start, lt: end } } } }
          : { createdAt: { gte: start, lt: end } }),
        cancelledAt: null,
        ...customerWhere,
      },
      include: {
        customer: { select: { name: true } },
        items: { select: { amountCents: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: start, lt: end }, ...customerWhere },
      include: { customer: { select: { name: true } } },
      orderBy: { paidAt: "asc" },
    }),
  ]);

  const orderTotal = monthOrders.reduce(
    (s, o) => s + o.items.reduce((x, i) => x + i.amountCents, 0),
    0,
  );
  const payTotal = monthPayments.reduce((s, p) => s + p.amountCents, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">月度对账（{defaultMonth}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="monthly" />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">年月</label>
              <input
                type="month"
                name="month"
                defaultValue={defaultMonth}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">客户</label>
              <select
                name="customerId"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                defaultValue={cid ?? ""}
              >
                <option value="">全部客户</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">订单口径</label>
              <select
                name="basis"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                defaultValue={byShipped ? "shipped" : "created"}
              >
                <option value="created">按创建日期</option>
                <option value="shipped">按发货日期</option>
              </select>
            </div>
            <Button type="submit" variant="secondary">
              查询
            </Button>
          </form>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">当月订单金额</p>
              <p className="text-lg font-semibold">{formatYuan(orderTotal)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">当月收款金额</p>
              <p className="text-lg font-semibold">{formatYuan(payTotal)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">差额（未收结转）</p>
              <p
                className={`text-lg font-semibold ${
                  orderTotal - payTotal > 0 ? "text-destructive" : ""
                }`}
              >
                {formatYuan(orderTotal - payTotal)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead colSpan={3}>当月订单</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead>单号</TableHead>
                    <TableHead>客户</TableHead>
                    <TableHead className="text-right">金额(元)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        无
                      </TableCell>
                    </TableRow>
                  )}
                  {monthOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.orderNo}</TableCell>
                      <TableCell>{o.customer.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatYuan(o.items.reduce((s, i) => s + i.amountCents, 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead colSpan={3}>当月收款</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>客户</TableHead>
                    <TableHead className="text-right">金额(元)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthPayments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        无
                      </TableCell>
                    </TableRow>
                  )}
                  {monthPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">
                        {p.paidAt.toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell>{p.customer.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatYuan(p.amountCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            口径：订单按创建月份、收款按收款日期月份；差额 = 当月新增应收 − 当月实收（未收结转）。作废订单不计入。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
