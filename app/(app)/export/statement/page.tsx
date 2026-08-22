import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import {
  getStatementData,
  fmtDate,
  type StatementData,
} from "@/lib/services/export";
import {
  buildStatementGrid,
  getDefaultTemplate,
  type StatementColumn,
  type GridCell,
} from "@/lib/services/statement-template";
import { formatYuan } from "@/lib/money";

// 对账单预览页（打印样式：Ctrl+P 打印 / 另存 PDF）—— 按对账单预设渲染（P16）
export default async function StatementPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    customerId?: string;
    month?: string;
    basis?: string;
  }>;
}) {
  const sp = await searchParams;
  const customerId = Number(sp.customerId);
  const month = sp.month ?? "";
  if (!Number.isInteger(customerId) || customerId <= 0 || !/^\d{4}-\d{2}$/.test(month)) {
    notFound();
  }

  const data = await getStatementData({
    customerId,
    month,
    basis: sp.basis === "shipped" ? "shipped" : "created",
  });
  if (!data) notFound();

  // 统一使用系统默认预设（P16 调整：取消客户特定预设）
  const template = await getDefaultTemplate();

  const monthLabel = `${data.month.slice(0, 4)}年${Number(data.month.slice(5))}月`;
  const basisLabel = data.basis === "shipped" ? "按发货日期" : "按创建日期";
  const diff = data.orderTotalCents - data.payTotalCents;
  const grid = buildStatementGrid(data, template.columns);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 操作栏（打印时隐藏） */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/export" />}>
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
        <span className="text-xs text-muted-foreground">
          预设：{template.name}（默认）
        </span>
        <form
          method="post"
          action="/api/export/statement"
          className="inline-flex"
        >
          <input type="hidden" name="customerId" value={data.customer.id} />
          <input type="hidden" name="month" value={data.month} />
          <input type="hidden" name="basis" value={data.basis} />
          <Button type="submit" size="sm">
            <Download className="h-4 w-4" />
            下载 Excel
          </Button>
        </form>
        <PrintButton />
      </div>

      {/* 打印区 */}
      <div className="rounded-md border bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-4 text-center">
          <h1 className="text-xl font-bold">{template.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            客户：{data.customer.name}
            {data.customer.contact ? `（${data.customer.contact}）` : ""} · 月份：{monthLabel} · 口径：{basisLabel}
          </p>
        </div>

        {data.orders.length === 0 && data.payments.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            该月没有订单与收款记录
          </p>
        ) : (
          <div className="space-y-6">
            {/* 订单明细（按预设列） */}
            <section>
              <h2 className="mb-2 text-base font-semibold">订单明细</h2>
              {data.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">无</p>
              ) : (
                <StatementGridTable
                  grid={grid}
                  columns={template.columns}
                />
              )}
            </section>

            {/* 收款明细 */}
            <section>
              <h2 className="mb-2 text-base font-semibold">收款明细</h2>
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">无</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border px-2 py-1 break-words text-left">日期</th>
                      <th className="border px-2 py-1 break-words text-left">方式</th>
                      <th className="border px-2 py-1 break-words text-right">金额(元)</th>
                      <th className="border px-2 py-1 break-words text-left">冲抵订单</th>
                      <th className="border px-2 py-1 break-words text-left">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p, i) => (
                      <tr key={i}>
                        <td className="border px-2 py-1 break-words whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                        <td className="border px-2 py-1 break-words">{p.method}</td>
                        <td className="border px-2 py-1 break-words text-right tabular-nums">{formatYuan(p.amountCents)}</td>
                        <td className="border px-2 py-1 break-words">
                          {p.allocations.length > 0
                            ? p.allocations.map((a) => `${a.orderNo}:${formatYuan(a.amountCents)}`).join("；")
                            : "（未分配）"}
                        </td>
                        <td className="border px-2 py-1 break-words">{p.remark ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* 汇总 */}
            <section className="border-t pt-3">
              <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                <span>
                  订单金额合计：<b>{formatYuan(data.orderTotalCents)}</b> 元
                </span>
                <span>
                  收款合计：<b>{formatYuan(data.payTotalCents)}</b> 元
                </span>
                <span>
                  差额（未收结转）：
                  <b className={diff > 0 ? "text-destructive" : ""}>{formatYuan(diff)}</b> 元
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                口径：订单按{basisLabel}归月，收款按收款日期归月；差额 = 当月新增应收 − 当月实收。作废订单不计入。
              </p>
            </section>

            {/* 条款 */}
            {template.terms && (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                {template.terms}
              </p>
            )}
          </div>
        )}
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

function StatementGridTable({
  grid,
  columns,
}: {
  grid: ReturnType<typeof buildStatementGrid>;
  columns: StatementColumn[];
}) {
  const isAmount = (i: number) => columns.filter((c) => c.visible)[i]?.key === "amount";
  const rightAlign = (i: number) =>
    ["qty", "unitPrice", "amount"].includes(
      columns.filter((c) => c.visible)[i]?.key ?? "",
    );

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {grid.headers.map((h, i) => (
            <th
              key={i}
              className={`border px-2 py-1 break-words ${rightAlign(i) ? "text-right" : "text-left"}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <Cell key={ci} cell={cell} right={rightAlign(ci)} boldAmount={isAmount(ci)} />
            ))}
          </tr>
        ))}
        {grid.summaryRows.map((row, ri) => (
          <tr key={`s${ri}`} className={ri === 2 ? "" : "bg-muted/40"}>
            {row.map((cell, ci) => (
              <Cell key={ci} cell={cell} right={rightAlign(ci)} boldAmount={isAmount(ci)} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({
  cell,
  right,
  boldAmount,
}: {
  cell: GridCell;
  right: boolean;
  boldAmount: boolean;
}) {
  const cls = [
    "border px-2 py-1 break-words",
    right ? "text-right tabular-nums" : "text-left",
    cell.bold ? "font-semibold" : "",
    boldAmount && String(cell.v) !== "" && !cell.bold ? "font-medium" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <td className={cls}>{cell.v === "" ? "" : cell.v}</td>;
}
