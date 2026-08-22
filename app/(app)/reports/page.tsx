import Link from "next/link";
import { Download, FileText } from "lucide-react";
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
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getMonthlyTrend,
  getAgingRank,
  getYearlyByCustomer,
} from "@/lib/services/report-export";

const TABS = [
  { key: "monthly", label: "月度趋势" },
  { key: "aging", label: "欠款排行" },
  { key: "yearly", label: "客户年累计" },
] as const;

function TabNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/reports?tab=${t.key}`}
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

function agingColor(days: number): string {
  if (days > 60) return "font-medium text-destructive"; // 红
  if (days > 30) return "font-medium text-amber-600"; // 黄
  return "";
}

// 万元缩写（1234567 → 123.5万；12345 → 1.2万；800 → 800）
function yuanShort(cents: number): string {
  const yuan = cents / 100;
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
  if (yuan >= 1000) return `${(yuan / 1000).toFixed(1)}千`;
  return yuan.toFixed(0);
}

// 每 tab 顶部的导出/打印操作栏（打印时隐藏）—— P18
function TabActions({
  tab,
  year,
}: {
  tab: string;
  year: number;
}) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <form method="post" action="/api/export/reports" className="inline-flex">
        <input type="hidden" name="year" value={year} />
        <Button size="sm" type="submit">
          <Download className="h-4 w-4" />
          导出 Excel
        </Button>
      </form>
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={<Link href={`/export/reports?tab=${tab}&year=${year}`} />}
      >
        <FileText className="h-4 w-4" />
        打印预览
      </Button>
      <PrintButton />
      <span className="text-xs text-muted-foreground">
        Excel 含全部三个报表（单文件三 Sheet）；打印预览按当前 tab 输出。
      </span>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string; metric?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab ?? "monthly";
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : new Date().getFullYear();
  const metric = sp.metric === "count" ? "count" : "amount";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">统计报表</h1>
      <TabNav active={tab} />
      <TabActions tab={tab} year={year} />

      {tab === "monthly" && <MonthlyTrend year={year} metric={metric} />}
      {tab === "aging" && <AgingRank />}
      {tab === "yearly" && <YearlyByCustomer year={year} />}
    </div>
  );
}

// ==================== 月度趋势 ====================

async function MonthlyTrend({ year, metric }: { year: number; metric: "amount" | "count" }) {
  const months = await getMonthlyTrend(year);

  const maxAmount = Math.max(1, ...months.map((m) => m.amountCents));
  const maxCount = Math.max(1, ...months.map((m) => m.count));
  const totalAmount = months.reduce((s, m) => s + m.amountCents, 0);
  const totalCount = months.reduce((s, m) => s + m.count, 0);
  const valueOf = (m: (typeof months)[number]) => (metric === "amount" ? m.amountCents : m.count);
  const maxOf = metric === "amount" ? maxAmount : maxCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">月度订单趋势（{year}年）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="monthly" />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">年份</label>
            <input
              type="number"
              name="year"
              min={2020}
              max={2100}
              defaultValue={year}
              className="h-10 w-28 rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">指标</label>
            <select
              name="metric"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              defaultValue={metric}
            >
              <option value="amount">订单金额</option>
              <option value="count">订单数量</option>
            </select>
          </div>
          <button type="submit" className="h-10 rounded-md border px-4 text-sm hover:bg-muted">
            查询
          </button>
        </form>

        <div className="flex flex-wrap gap-6 text-sm">
          <span>
            全年订单金额：<b className="text-base">{formatYuan(totalAmount)}</b> 元
          </span>
          <span>
            全年订单数：<b className="text-base">{totalCount}</b> 单
          </span>
        </div>

        {/* 纯 CSS 柱状图：柱体从底部生长，月份标签固定底部 */}
        <div>
          <div className="flex h-40 items-end gap-1.5 sm:gap-3">
            {months.map((m) => {
              const v = valueOf(m);
              const pct = Math.max(2, Math.round((v / maxOf) * 100));
              return (
                <div
                  key={m.month}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="text-[10px] text-muted-foreground sm:text-xs">
                    {metric === "amount" ? yuanShort(m.amountCents) : m.count || ""}
                  </span>
                  <div
                    className={cn(
                      "w-full rounded-t",
                      v > 0 ? "bg-primary" : "bg-muted",
                    )}
                    style={{ height: `${pct}%` }}
                    title={`${year}年${m.month}月：${
                      metric === "amount" ? `${formatYuan(m.amountCents)} 元` : `${m.count} 单`
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 sm:gap-3">
            {months.map((m) => (
              <span
                key={m.month}
                className="min-w-0 flex-1 text-center text-xs text-muted-foreground"
              >
                {m.month}月
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          按订单创建月份统计（作废订单不计入）。{metric === "amount" ? "柱高 = 当月订单金额" : "柱高 = 当月订单数量"}，悬停柱体可查看精确值。
        </p>
      </CardContent>
    </Card>
  );
}

// ==================== 欠款排行 ====================

async function AgingRank() {
  const rows = await getAgingRank();

  const total = rows.reduce((s, v) => s + v.unpaidCents, 0);
  const top = rows.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">客户欠款排行（Top 10）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          欠款客户 {rows.length} 家 · 总未收{" "}
          <span className="font-semibold text-foreground">{formatYuan(total)} 元</span>
        </p>

        {/* 条形图（CSS 宽度比例） */}
        <div className="space-y-2">
          {top.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无欠款客户 🎉
            </p>
          )}
          {top.map((v) => (
            <div key={v.customerId} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{v.name}</span>
                <span className="ml-2 shrink-0 tabular-nums">
                  {formatYuan(v.unpaidCents)} 元
                  <span className={cn("ml-2 text-xs", agingColor(v.maxDays))}>
                    {v.maxDays} 天
                  </span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    v.maxDays > 60
                      ? "bg-destructive"
                      : v.maxDays > 30
                        ? "bg-amber-500"
                        : "bg-primary",
                  )}
                  style={{ width: `${Math.max(2, (v.unpaidCents / total) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

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
              {rows.map((v) => (
                <TableRow key={v.customerId}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatYuan(v.unpaidCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.orderCount}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", agingColor(v.maxDays))}>
                    {v.maxDays} 天
                    {v.maxDays > 60 ? " 🔴" : v.maxDays > 30 ? " 🟡" : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          账龄 = 今天 − 订单发货日（未发货按创建日）；超过 30 天标黄、超过 60 天标红。作废订单不计入。
        </p>
      </CardContent>
    </Card>
  );
}

// ==================== 客户年累计 ====================

async function YearlyByCustomer({ year }: { year: number }) {
  const rows = await getYearlyByCustomer(year);
  const totalAmount = rows.reduce((s, v) => s + v.amountCents, 0);
  const totalCount = rows.reduce((s, v) => s + v.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">客户年累计（{year}年）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="yearly" />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">年份</label>
            <input
              type="number"
              name="year"
              min={2020}
              max={2100}
              defaultValue={year}
              className="h-10 w-28 rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <button type="submit" className="h-10 rounded-md border px-4 text-sm hover:bg-muted">
            查询
          </button>
        </form>

        <div className="flex flex-wrap gap-6 text-sm">
          <span>
            {year}年订单总额：<b className="text-base">{formatYuan(totalAmount)}</b> 元
          </span>
          <span>
            订单总数：<b className="text-base">{totalCount}</b> 单
          </span>
          <span>
            客户数：<b className="text-base">{rows.length}</b> 家
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">该年没有订单</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead className="text-right">年订单金额(元)</TableHead>
                  <TableHead className="text-right">订单数</TableHead>
                  <TableHead className="text-right">当前未收(元)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v) => (
                  <TableRow key={v.customerId}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatYuan(v.amountCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.count}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        v.unpaidCents > 0 ? "font-medium text-destructive" : "",
                      )}
                    >
                      {formatYuan(v.unpaidCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          按订单创建年份统计（作废订单不计入）；当前未收 = 该年订单中尚未被收款冲抵的金额。
        </p>
      </CardContent>
    </Card>
  );
}
