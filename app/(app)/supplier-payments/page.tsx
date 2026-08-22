import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatYuan } from "@/lib/money";
import { Button } from "@/components/ui/button";
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
import { SupplierPaymentForm } from "@/components/supplier-payment-form";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "aging", label: "货款视图" },
  { key: "records", label: "付款记录" },
  { key: "new", label: "新建付款" },
] as const;

function TabNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/supplier-payments?tab=${t.key}`}
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

export default async function SupplierPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    supplierId?: string;
    show?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab ?? "aging";
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, contact: true, settleMode: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">供应商货款</h1>
      <TabNav active={tab} />

      {tab === "new" && <SupplierPaymentForm suppliers={suppliers} />}

      {tab === "aging" && <AgingView showAll={sp.show === "all"} />}

      {tab === "records" && (
        <RecordsView suppliers={suppliers} supplierId={sp.supplierId} />
      )}
    </div>
  );
}

// ==================== 货款视图（应付/已付/余额 + 账龄） ====================

async function AgingView({ showAll }: { showAll: boolean }) {
  const pos = await prisma.purchaseOrder.findMany({
    include: {
      supplier: { select: { id: true, name: true } },
      items: { select: { amountCents: true } },
      allocations: { select: { amountCents: true } },
    },
  });

  const today = new Date();
  const bySupplier = new Map<
    number,
    { name: string; payable: number; paid: number; balance: number; maxDays: number; poCount: number }
  >();
  for (const po of pos) {
    const payable = po.items.reduce((s, i) => s + i.amountCents, 0);
    const paid = po.allocations.reduce((s, a) => s + a.amountCents, 0);
    const balance = payable - paid;
    const days = Math.max(0, daysBetween(po.poDate, today));
    const cur = bySupplier.get(po.supplier.id) ?? {
      name: po.supplier.name,
      payable: 0,
      paid: 0,
      balance: 0,
      maxDays: 0,
      poCount: 0,
    };
    cur.payable += payable;
    cur.paid += paid;
    cur.balance += balance;
    cur.maxDays = Math.max(cur.maxDays, days);
    cur.poCount += 1;
    bySupplier.set(po.supplier.id, cur);
  }

  const rows = [...bySupplier.entries()].sort((a, b) => b[1].balance - a[1].balance);
  const visible = showAll ? rows : rows.filter(([, v]) => v.balance > 0);
  const totalBalance = rows.reduce((s, [, v]) => s + v.balance, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">供应商货款汇总</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            应付余额合计{" "}
            <span className="font-semibold text-foreground">{formatYuan(totalBalance)} 元</span>
            {!showAll && (
              <>
                {" "}· 仅显示有余额的供应商（
                <Link href="/supplier-payments?tab=aging&show=all" className="underline">
                  显示全部
                </Link>
                ）
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">应付(元)</TableHead>
                  <TableHead className="text-right">已付(元)</TableHead>
                  <TableHead className="text-right">余额(元)</TableHead>
                  <TableHead className="text-right">采购单数</TableHead>
                  <TableHead className="text-right">最长账龄</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      暂无应付余额 🎉
                    </TableCell>
                  </TableRow>
                )}
                {visible.map(([id, v]) => (
                  <TableRow key={id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatYuan(v.payable)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatYuan(v.paid)}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        v.balance > 0 ? "font-medium text-destructive" : ""
                      }`}
                    >
                      {formatYuan(v.balance)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.poCount}</TableCell>
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
            账龄 = 今天 − 采购单日期（取该供应商最长账龄）；&gt;30 天标黄、&gt;60 天标红。余额 = 采购单合计 − 已冲抵付款。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== 付款记录 ====================

async function RecordsView({
  suppliers,
  supplierId,
}: {
  suppliers: { id: number; name: string }[];
  supplierId?: string;
}) {
  const sid = Number(supplierId) || undefined;
  const payments = await prisma.supplierPayment.findMany({
    where: sid ? { supplierId: sid } : {},
    orderBy: { paidAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { name: true } },
      allocations: { include: { purchaseOrder: { select: { poNo: true } } } },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">付款记录（最近 100 笔）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form method="get" className="flex max-w-xs items-center gap-2">
          <input type="hidden" name="tab" value="records" />
          <select
            name="supplierId"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            defaultValue={sid ?? ""}
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

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>方式</TableHead>
                <TableHead className="text-right">金额(元)</TableHead>
                <TableHead>冲抵采购单</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    暂无付款记录
                  </TableCell>
                </TableRow>
              )}
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">
                    {p.paidAt.toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="font-medium">{p.supplier.name}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatYuan(p.amountCents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.allocations.map((a) => (
                      <span key={a.id} className="mr-2 inline-block">
                        {a.purchaseOrder.poNo}: {formatYuan(a.amountCents)}
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
