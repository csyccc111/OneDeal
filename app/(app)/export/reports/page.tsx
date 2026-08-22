import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { formatYuan } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  getMonthlyTrend,
  getAgingRank,
  getYearlyByCustomer,
} from "@/lib/services/report-export";

// 统计报表打印预览（P18）：按 tab 服务端渲染 CSS 图表 + 表格，A4 打印输出
export default async function ReportsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "aging" || sp.tab === "yearly" ? sp.tab : "monthly";
  const year = /^\d{4}$/.test(sp.year ?? "")
    ? Number(sp.year)
    : new Date().getFullYear();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 操作栏（打印时隐藏） */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/reports" />}>
          <ArrowLeft className="h-4 w-4" />
          返回报表
        </Button>
        <form method="post" action="/api/export/reports" className="inline-flex">
          <input type="hidden" name="year" value={year} />
          <Button type="submit" size="sm">
            <Download className="h-4 w-4" />
            下载 Excel（三 Sheet）
          </Button>
        </form>
        <PrintButton />
        <span className="text-xs text-muted-foreground">
          当前：{year} 年 · {tab === "monthly" ? "月度趋势" : tab === "aging" ? "欠款排行" : "客户年累计"}
        </span>
      </div>

      {/* 打印区 */}
      <div className="rounded-md border bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-4 text-center">
          <h1 className="text-xl font-bold">统计报表（{year}年）</h1>
        </div>

        {tab === "monthly" && <MonthlySection year={year} />}
        {tab === "aging" && <AgingSection />}
        {tab === "yearly" && <YearlySection year={year} />}
      </div>

      {/* 打印样式 */}
      <style>{`
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
    </div>
  );
}

// ==================== 月度趋势 ====================

function yuanShort(cents: number): string {
  const yuan = cents / 100;
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
  if (yuan >= 1000) return `${(yuan / 1000).toFixed(1)}千`;
  return yuan.toFixed(0);
}

async function MonthlySection({ year }: { year: number }) {
  const months = await getMonthlyTrend(year);
  const maxAmount = Math.max(1, ...months.map((m) => m.amountCents));
  const totalAmount = months.reduce((s, m) => s + m.amountCents, 0);
  const totalCount = months.reduce((s, m) => s + m.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          全年订单金额：<b>{formatYuan(totalAmount)}</b> 元
        </span>
        <span>
          全年订单数：<b>{totalCount}</b> 单
        </span>
      </div>

      {/* CSS 柱状图 */}
      <div>
        <div className="flex h-40 items-end gap-1.5 sm:gap-3">
          {months.map((m) => {
            const pct = Math.max(2, Math.round((m.amountCents / maxAmount) * 100));
            return (
              <div
                key={m.month}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-[10px] text-muted-foreground sm:text-xs">
                  {yuanShort(m.amountCents)}
                </span>
                <div
                  className={cn("w-full rounded-t", m.amountCents > 0 ? "bg-primary" : "bg-muted")}
                  style={{ height: `${pct}%` }}
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

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1 break-words text-left">月份</th>
            <th className="border px-2 py-1 break-words text-right">订单金额(元)</th>
            <th className="border px-2 py-1 break-words text-right">订单数量</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td className="border px-2 py-1 break-words">{m.month}月</td>
              <td className="border px-2 py-1 break-words text-right tabular-nums">
                {formatYuan(m.amountCents)}
              </td>
              <td className="border px-2 py-1 break-words text-right tabular-nums">{m.count}</td>
            </tr>
          ))}
          <tr className="bg-muted/40">
            <td className="border px-2 py-1 break-words font-semibold">全年合计</td>
            <td className="border px-2 py-1 break-words text-right font-semibold tabular-nums">
              {formatYuan(totalAmount)}
            </td>
            <td className="border px-2 py-1 break-words text-right font-semibold tabular-nums">
              {totalCount}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        按订单创建月份统计（作废订单不计入）。
      </p>
    </div>
  );
}

// ==================== 欠款排行 ====================

async function AgingSection() {
  const rows = await getAgingRank();
  const total = rows.reduce((s, v) => s + v.unpaidCents, 0);

  return (
    <div className="space-y-5">
      <p className="text-sm">
        欠款客户 {rows.length} 家 · 总未收{" "}
        <b>{formatYuan(total)} 元</b>
      </p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">暂无欠款客户 🎉</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1 break-words text-left">客户</th>
              <th className="border px-2 py-1 break-words text-right">未收金额(元)</th>
              <th className="border px-2 py-1 break-words text-right">未收订单数</th>
              <th className="border px-2 py-1 break-words text-right">最长账龄</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.customerId}>
                <td className="border px-2 py-1 break-words font-medium">{v.name}</td>
                <td className="border px-2 py-1 break-words text-right tabular-nums font-medium">
                  {formatYuan(v.unpaidCents)}
                </td>
                <td className="border px-2 py-1 break-words text-right tabular-nums">{v.orderCount}</td>
                <td className="border px-2 py-1 break-words text-right tabular-nums">
                  {v.maxDays} 天{v.maxDays > 60 ? "（超60天）" : v.maxDays > 30 ? "（超30天）" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted-foreground">
        账龄 = 今天 − 订单发货日（未发货按创建日）；超过 30 天标黄、超过 60 天标红。作废订单不计入。
      </p>
    </div>
  );
}

// ==================== 客户年累计 ====================

async function YearlySection({ year }: { year: number }) {
  const rows = await getYearlyByCustomer(year);
  const totalAmount = rows.reduce((s, v) => s + v.amountCents, 0);
  const totalCount = rows.reduce((s, v) => s + v.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          {year}年订单总额：<b>{formatYuan(totalAmount)}</b> 元
        </span>
        <span>
          订单总数：<b>{totalCount}</b> 单
        </span>
        <span>
          客户数：<b>{rows.length}</b> 家
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">该年没有订单</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1 break-words text-left">客户</th>
              <th className="border px-2 py-1 break-words text-right">年订单金额(元)</th>
              <th className="border px-2 py-1 break-words text-right">订单数</th>
              <th className="border px-2 py-1 break-words text-right">当前未收(元)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.customerId}>
                <td className="border px-2 py-1 break-words font-medium">{v.name}</td>
                <td className="border px-2 py-1 break-words text-right tabular-nums">
                  {formatYuan(v.amountCents)}
                </td>
                <td className="border px-2 py-1 break-words text-right tabular-nums">{v.count}</td>
                <td className="border px-2 py-1 break-words text-right tabular-nums">
                  {formatYuan(v.unpaidCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted-foreground">
        按订单创建年份统计（作废订单不计入）；当前未收 = 该年订单中尚未被收款冲抵的金额。
      </p>
    </div>
  );
}
