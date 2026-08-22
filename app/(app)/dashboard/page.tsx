import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatYuan } from "@/lib/money";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BackupButton } from "@/components/backup-button";
import { cn } from "@/lib/utils";

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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

  let monthOrderCount = 0;
  let monthOrderAmount = 0;
  let totalUnpaid = 0;
  let overdue30 = 0;
  let overdue60 = 0;

  const unpaidByCustomer = new Map<
    number,
    { name: string; unpaid: number; maxDays: number }
  >();

  for (const o of orders) {
    const amount = o.items.reduce((s, i) => s + i.amountCents, 0);
    const paid = o.allocations.reduce((s, a) => s + a.amountCents, 0);
    const unpaid = amount - paid;

    if (o.createdAt >= monthStart && o.createdAt < nextMonth) {
      monthOrderCount++;
      monthOrderAmount += amount;
    }
    if (unpaid > 0) {
      totalUnpaid += unpaid;
      const agingDate = o.shipments[0]?.shippedAt ?? o.createdAt;
      const days = Math.max(0, daysBetween(agingDate, now));
      if (days > 60) overdue60++;
      if (days > 30) overdue30++;
      const cur = unpaidByCustomer.get(o.customer.id) ?? {
        name: o.customer.name,
        unpaid: 0,
        maxDays: 0,
      };
      cur.unpaid += unpaid;
      cur.maxDays = Math.max(cur.maxDays, days);
      unpaidByCustomer.set(o.customer.id, cur);
    }
  }

  const topCustomers = [...unpaidByCustomer.entries()]
    .sort((a, b) => b[1].unpaid - a[1].unpaid)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          仪表盘（{now.getFullYear()} 年 {now.getMonth() + 1} 月）
        </h1>
        <BackupButton />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">本月订单数</p>
            <p className="text-2xl font-semibold">{monthOrderCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">本月订单金额(元)</p>
            <p className="text-2xl font-semibold">
              {formatYuan(monthOrderAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">总未收金额(元)</p>
            <p
              className={cn(
                "text-2xl font-semibold",
                totalUnpaid > 0 && "text-destructive",
              )}
            >
              {formatYuan(totalUnpaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">超期未收笔数</p>
            <p className="text-2xl font-semibold">
              <span className={cn(overdue30 > 0 && "text-amber-600")}>
                &gt;30 天：{overdue30}
              </span>
              <span className={cn("ml-2", overdue60 > 0 && "text-destructive")}>
                &gt;60 天：{overdue60}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">未收金额排行 Top 10</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>排名</TableHead>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">未收金额(元)</TableHead>
                <TableHead className="text-right">最长账龄</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCustomers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    暂无欠款客户 🎉
                  </TableCell>
                </TableRow>
              )}
              {topCustomers.map(([id, v], idx) => (
                <TableRow key={id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    <Link
                      href={`/settlements?tab=aging`}
                      className="font-medium hover:underline"
                    >
                      {v.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatYuan(v.unpaid)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      v.maxDays > 60
                        ? "font-medium text-destructive"
                        : v.maxDays > 30
                          ? "font-medium text-amber-600"
                          : "",
                    )}
                  >
                    {v.maxDays} 天
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            账龄 = 今天 − 订单发货日（未发货按创建日）；&gt;30 天标黄、&gt;60
            天标红。作废订单不计入。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
