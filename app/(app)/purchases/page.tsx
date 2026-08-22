import Link from "next/link";
import { Plus } from "lucide-react";
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

const PAGE_SIZE = 15;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const supplierId = Number(sp.supplierId) || undefined;
  const pageNum = Math.max(1, Number(sp.page) || 1);

  const where = supplierId ? { supplierId } : {};
  const [total, purchases] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { name: true } },
        items: { select: { amountCents: true } },
        allocations: { select: { amountCents: true } },
      },
      orderBy: { poDate: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const rows = purchases.map((po) => {
    const payable = po.items.reduce((s, i) => s + i.amountCents, 0);
    const paid = po.allocations.reduce((s, a) => s + a.amountCents, 0);
    const balance = payable - paid;
    return { ...po, payable, paid, balance };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryString = supplierId ? `&supplierId=${supplierId}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">采购单</h1>
        <Link href="/purchases/new">
          <Button>
            <Plus className="h-4 w-4" />
            新建采购单
          </Button>
        </Link>
      </div>

      <form method="get" className="flex max-w-xs items-center gap-2">
        <select
          name="supplierId"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue={supplierId ?? ""}
        >
          <option value="">全部供应商</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          筛选
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>采购单号</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>日期</TableHead>
              <TableHead className="text-right">应付(元)</TableHead>
              <TableHead className="text-right">已付(元)</TableHead>
              <TableHead className="text-right">余额(元)</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  还没有采购单，点右上角新建
                </TableCell>
              </TableRow>
            )}
            {rows.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-medium">
                  <Link href={`/purchases/${po.id}`} className="hover:underline">
                    {po.poNo}
                  </Link>
                </TableCell>
                <TableCell>{po.supplier.name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {po.poDate.toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatYuan(po.payable)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatYuan(po.paid)}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    po.balance > 0 ? "font-medium text-destructive" : ""
                  }`}
                >
                  {formatYuan(po.balance)}
                </TableCell>
                <TableCell>
                  {po.balance > 0 ? (
                    <Badge variant="secondary">未结清</Badge>
                  ) : (
                    <Badge variant="default">已结清</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 张采购单 · 第 {pageNum}/{totalPages} 页
        </span>
        <div className="flex gap-2">
          {pageNum > 1 && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/purchases?page=${pageNum - 1}${queryString}`} />}>
              上一页
            </Button>
          )}
          {pageNum < totalPages && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/purchases?page=${pageNum + 1}${queryString}`} />}>
              下一页
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
