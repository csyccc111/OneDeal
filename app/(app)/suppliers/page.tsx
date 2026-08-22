import Link from "next/link";
import { Plus, Pencil, Search, ShoppingCart, Banknote } from "lucide-react";
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
import { SupplierDeleteButton } from "@/components/supplier-delete-dialog";

const PAGE_SIZE = 10;

export default async function SuppliersPage({
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
          { contact: { contains: query } },
        ],
      }
    : {};

  const [total, suppliers] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // 应付总额 = 采购单金额合计 - 已冲抵付款合计
  const rows = await Promise.all(
    suppliers.map(async (s) => {
      const [poSum, paidSum] = await Promise.all([
        prisma.purchaseItem.aggregate({
          where: { purchaseOrder: { supplierId: s.id } },
          _sum: { amountCents: true },
        }),
        prisma.supplierPaymentAllocation.aggregate({
          where: { purchaseOrder: { supplierId: s.id } },
          _sum: { amountCents: true },
        }),
      ]);
      const payable = poSum._sum.amountCents ?? 0;
      const paid = paidSum._sum.amountCents ?? 0;
      return { ...s, payable, paid, balance: payable - paid };
    }),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryString = query ? `&q=${encodeURIComponent(query)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">供应商管理</h1>
        <div className="flex gap-2">
          <Link href="/purchases">
            <Button variant="outline">
              <ShoppingCart className="h-4 w-4" />
              采购单
            </Button>
          </Link>
          <Link href="/supplier-payments">
            <Button variant="outline">
              <Banknote className="h-4 w-4" />
              货款与付款
            </Button>
          </Link>
          <Link href="/suppliers/new">
            <Button>
              <Plus className="h-4 w-4" />
              新建供应商
            </Button>
          </Link>
        </div>
      </div>

      <form method="get" className="flex max-w-sm gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="搜索名称/联系人"
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
              <TableHead>供应商名</TableHead>
              <TableHead>联系人</TableHead>
              <TableHead>结算方式</TableHead>
              <TableHead>账期(天)</TableHead>
              <TableHead className="text-right">应付(元)</TableHead>
              <TableHead className="text-right">已付(元)</TableHead>
              <TableHead className="text-right">余额(元)</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {query ? "没有匹配的供应商" : "还没有供应商，点右上角新建"}
                </TableCell>
              </TableRow>
            )}
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <Link href={`/suppliers/${s.id}/edit`} className="hover:underline">
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell>{s.contact ?? "—"}</TableCell>
                <TableCell>{s.settleMode}</TableCell>
                <TableCell>{s.settleMode === "月结" ? s.creditDays : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatYuan(s.payable)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatYuan(s.paid)}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    s.balance > 0 ? "font-medium text-destructive" : ""
                  }`}
                >
                  {formatYuan(s.balance)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {/* 采购单入口：高亮主色（P17） */}
                    <Link href={`/purchases?supplierId=${s.id}`}>
                      <Button size="sm">
                        <ShoppingCart className="h-4 w-4" />
                        采购单
                      </Button>
                    </Link>
                    <Link href={`/suppliers/${s.id}/edit`}>
                      <Button variant="ghost" size="icon" aria-label="编辑">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <SupplierDeleteButton
                      supplierId={s.id}
                      supplierName={s.name}
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
          共 {total} 个供应商 · 第 {pageNum}/{totalPages} 页
        </span>
        <div className="flex gap-2">
          {pageNum > 1 && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/suppliers?page=${pageNum - 1}${queryString}`} />}>
              上一页
            </Button>
          )}
          {pageNum < totalPages && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/suppliers?page=${pageNum + 1}${queryString}`} />}>
              下一页
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
