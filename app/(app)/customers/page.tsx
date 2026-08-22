import Link from "next/link";
import { Plus, Pencil, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatYuan } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerDeleteButton } from "@/components/customer-delete-dialog";

const PAGE_SIZE = 10;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const query = q.trim();
  const pageNum = Math.max(1, Number(page) || 1);

  const where = query
    ? {
        OR: [
          { name: { contains: query } },
          { wechatRemark: { contains: query } },
        ],
      }
    : {};

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // 未收金额 = 订单金额合计 - 已分配收款合计
  const rows = await Promise.all(
    customers.map(async (c) => {
      const [orderSum, paidSum] = await Promise.all([
        prisma.orderItem.aggregate({
          // 未收只统计未作废订单
          where: { order: { customerId: c.id, cancelledAt: null } },
          _sum: { amountCents: true },
        }),
        prisma.paymentAllocation.aggregate({
          where: { order: { customerId: c.id } },
          _sum: { amountCents: true },
        }),
      ]);
      const receivable = orderSum._sum.amountCents ?? 0;
      const paid = paidSum._sum.amountCents ?? 0;
      return { ...c, receivable, paid, unpaid: receivable - paid };
    }),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryString = query ? `&q=${encodeURIComponent(query)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">客户管理</h1>
        <Link href="/customers/new">
          <Button>
            <Plus className="h-4 w-4" />
            新建客户
          </Button>
        </Link>
      </div>

      <form method="get" className="flex max-w-sm gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="搜索名称/微信备注"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          搜索
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客户名</TableHead>
              <TableHead>联系人</TableHead>
              <TableHead>结算方式</TableHead>
              <TableHead>账期(天)</TableHead>
              <TableHead className="text-right">未收金额</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {query ? "没有匹配的客户" : "还没有客户，点右上角新建"}
                </TableCell>
              </TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${c.id}/edit`} className="hover:underline">
                    {c.name}
                  </Link>
                  {c.wechatRemark && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.wechatRemark}
                    </span>
                  )}
                </TableCell>
                <TableCell>{c.contact ?? "—"}</TableCell>
                <TableCell>{c.settleMode}</TableCell>
                <TableCell>{c.settleMode === "月结" ? c.creditDays : "—"}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    c.unpaid > 0 ? "font-medium text-destructive" : ""
                  }`}
                >
                  {formatYuan(c.unpaid)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/customers/${c.id}/edit`}>
                      <Button variant="ghost" size="icon" aria-label="编辑">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <CustomerDeleteButton
                      customerId={c.id}
                      customerName={c.name}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 个客户 · 第 {pageNum}/{totalPages} 页
        </span>
        <div className="flex gap-2">
          {pageNum > 1 && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/customers?page=${pageNum - 1}${queryString}`} />}>
              上一页
            </Button>
          )}
          {pageNum < totalPages && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/customers?page=${pageNum + 1}${queryString}`} />}>
              下一页
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
