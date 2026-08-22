import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 导出中心：对账单 / 收货款记录（表单 → 预览 → 下载 Excel / 打印 PDF）
// 对账单统一使用系统默认预设（P16 调整：取消客户特定预设）
export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "payments" || sp.tab === "supplier-payments" ? sp.tab : "statement";
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">导出</h1>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "statement", label: "对账单" },
            { key: "payments", label: "收货款记录" },
            { key: "supplier-payments", label: "供应商货款" },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={`/export?tab=${t.key}`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "statement" ? (        <form
          method="get"
          action="/export/statement"
          className="space-y-4 rounded-md border p-4"
        >
          <p className="text-sm text-muted-foreground">
            按客户 + 月份生成对账单：订单明细（金额合计）、收款明细（冲抵订单）、差额结转。
            可下载 Excel 或打印 / 存为 PDF。
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">客户 *</label>
              <select
                name="customerId"
                required
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  选择客户
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">月份 *</label>
              <input
                type="month"
                name="month"
                required
                defaultValue={defaultMonth}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">订单口径</label>
              <select
                name="basis"
                defaultValue="created"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="created">按创建日期</option>
                <option value="shipped">按发货日期</option>
              </select>
            </div>
          </div>
          <Button type="submit">预览 / 导出</Button>
        </form>
      ) : tab === "supplier-payments" ? (
        <form
          method="get"
          action="/export/supplier-payments"
          className="space-y-4 rounded-md border p-4"
        >
          <p className="text-sm text-muted-foreground">
            供应商货款导出：应付汇总（采购单口径，含账龄）+ 付款明细，可按供应商与日期范围筛选。
            可下载 Excel 或打印 / 存为 PDF。
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">供应商（可选）</label>
              <select
                name="supplierId"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">全部供应商</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">开始日期（可选）</label>
              <input
                type="date"
                name="from"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">结束日期（可选）</label>
              <input
                type="date"
                name="to"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            汇总按采购单日期归入范围，账龄 = 今天 − 采购单日期（超过 30 天标黄、超过 60 天标红）；付款明细按付款日期归入范围。
          </p>
          <Button type="submit">预览 / 导出</Button>
        </form>
      ) : (
        <form
          method="get"
          action="/export/payments"
          className="space-y-4 rounded-md border p-4"
        >
          <p className="text-sm text-muted-foreground">
            收款流水导出（客户、日期、方式、金额、冲抵订单），可按客户与日期范围筛选。
            可下载 Excel 或打印 / 存为 PDF。
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">客户（可选）</label>
              <select
                name="customerId"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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
              <label className="text-xs text-muted-foreground">开始日期（可选）</label>
              <input
                type="date"
                name="from"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">结束日期（可选）</label>
              <input
                type="date"
                name="to"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
          </div>
          <Button type="submit">预览 / 导出</Button>
        </form>
      )}
    </div>
  );
}
