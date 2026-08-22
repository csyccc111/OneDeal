import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { formatYuan } from "@/lib/money";
import { ORDER_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const PAYMENT_FILTERS = ["全部", "未收齐", "已收齐"] as const;
type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "全部";
  const rawPayment = sp.payment ?? "全部";
  const payment: PaymentFilter =
    rawPayment === "未收齐" || rawPayment === "已收齐" ? rawPayment : "全部";
  const from = (sp.from ?? "").trim();
  const to = (sp.to ?? "").trim();
  const cid = Number(sp.customerId);
  const hasCustomer = Number.isInteger(cid) && cid > 0;
  const pageNum = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.OrderWhereInput = {
    // "全部"显示所有订单（含已作废）；其他状态筛选时排除作废；"已作废"只看作废
    ...(status === "已作废"
      ? { cancelledAt: { not: null } }
      : status !== "全部"
        ? { status, cancelledAt: null }
        : {}),
    ...(q
      ? {
          OR: [
            { orderNo: { contains: q } },
            { customer: { name: { contains: q } } },
            { items: { some: { product: { contains: q } } } },
          ],
        }
      : {}),
    ...(hasCustomer ? { customerId: cid } : {}),
  };

  // 下单日期范围（含首尾两天）
  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (DATE_RE.test(from)) dateFilter.gte = new Date(`${from}T00:00:00`);
  if (DATE_RE.test(to)) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    dateFilter.lt = d;
  }
  if (dateFilter.gte || dateFilter.lt) where.createdAt = dateFilter;

  // 收款状态：已收齐 / 未收齐（作废订单金额视为 0，即已收齐）
  if (payment === "已收齐" || payment === "未收齐") {
    const candidates = await prisma.order.findMany({
      where,
      select: {
        id: true,
        cancelledAt: true,
        items: { select: { amountCents: true } },
        allocations: { select: { amountCents: true } },
      },
    });
    const ids = candidates
      .filter((o) => {
        const amount = o.cancelledAt
          ? 0
          : o.items.reduce((s, i) => s + i.amountCents, 0);
        const received = o.allocations.reduce((s, i) => s + i.amountCents, 0);
        return payment === "已收齐" ? received >= amount : received < amount;
      })
      .map((o) => o.id);
    where.id = { in: ids };
  }

  const [total, orders, customers] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { name: true } },
        items: {
          select: { qty: true, shippedQty: true, amountCents: true },
        },
      },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows = orders.map((o) => {
    const amount = o.items.reduce((s, it) => s + it.amountCents, 0);
    const shipped = o.items.reduce((s, it) => s + it.shippedQty, 0);
    const qty = o.items.reduce((s, it) => s + it.qty, 0);
    return { ...o, amount, shipped, qty };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilter =
    q !== "" || status !== "全部" || hasCustomer || from !== "" || to !== "" || payment !== "全部";

  // 构建带全部筛选参数的查询串（over 可覆盖 status，用于状态 chips）
  const buildParams = (over: { status?: string } = {}) => {
    const p = new URLSearchParams();
    const s = over.status ?? status;
    if (s !== "全部") p.set("status", s);
    if (q) p.set("q", q);
    if (hasCustomer) p.set("customerId", String(cid));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (payment !== "全部") p.set("payment", payment);
    return p.toString();
  };
  const qs = buildParams();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">订单台账</h1>
        <Link href="/orders/new">
          <Button>
            <Plus className="h-4 w-4" />
            新建订单
          </Button>
        </Link>
      </div>

      <form
        key={[q, status, hasCustomer ? String(cid) : "", payment, from, to].join("|")}
        method="get"
        className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3"
      >
        <div className="relative w-full sm:w-52">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="搜索单号/客户/品名"
            className="pl-9"
          />
        </div>
        <Select
          name="customerId"
          defaultValue={hasCustomer ? String(cid) : ""}
          items={customers.map((c) => ({ value: String(c.id), label: c.name }))}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="全部客户" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={String(c.id)} label={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="payment" defaultValue={payment}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_FILTERS.map((p) => (
              <SelectItem key={p} value={p} label={p}>
                收款：{p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            name="from"
            defaultValue={from}
            aria-label="开始日期"
            className="w-38"
          />
          <span className="text-sm text-muted-foreground">至</span>
          <Input
            type="date"
            name="to"
            defaultValue={to}
            aria-label="结束日期"
            className="w-38"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href="/orders" />}
        >
          重置
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {["全部", ...ORDER_STATUSES, "已作废"].map((s) => (
          <Link
            key={s}
            href={`/orders?${buildParams({ status: s })}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              status === s
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {s}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>单号</TableHead>
              <TableHead>客户</TableHead>
              <TableHead className="text-right">金额(元)</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>交期</TableHead>
              <TableHead className="text-right">已发</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  {hasFilter
                    ? "没有匹配的订单，试试放宽筛选条件"
                    : "还没有订单，点右上角新建"}
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  <Link href={`/orders/${o.id}`} className="hover:underline">
                    {o.orderNo}
                  </Link>
                </TableCell>
                <TableCell>{o.customer.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={
                      o.cancelledAt ? "text-muted-foreground line-through" : ""
                    }
                  >
                    {formatYuan(o.amount)}
                  </span>
                </TableCell>
                <TableCell>
                  {o.cancelledAt ? (
                    <Badge variant="destructive">已作废</Badge>
                  ) : (
                    <Badge variant="secondary">{o.status}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {o.dueDate ? o.dueDate.toLocaleDateString("zh-CN") : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {o.qty > 0 ? `${o.shipped}/${o.qty}` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 个订单 · 第 {pageNum}/{totalPages} 页
        </span>
        <div className="flex gap-2">
          {pageNum > 1 && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={`/orders?page=${pageNum - 1}${qs ? `&${qs}` : ""}`}
                />
              }
            >
              上一页
            </Button>
          )}
          {pageNum < totalPages && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={`/orders?page=${pageNum + 1}${qs ? `&${qs}` : ""}`}
                />
              }
            >
              下一页
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
