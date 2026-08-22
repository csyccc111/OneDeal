import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import {
  getSupplierPaymentsExportData,
  fmtDate,
  type SupplierPaymentsExportData,
} from "@/lib/services/export";
import { formatYuan } from "@/lib/money";

// 供应商货款导出预览页（打印样式：Ctrl+P 打印 / 另存 PDF）—— P17
export default async function SupplierPaymentsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    supplierId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  const supplierId = Number(sp.supplierId) || undefined;
  const from = (sp.from ?? "").trim() || undefined;
  const to = (sp.to ?? "").trim() || undefined;
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) notFound();
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) notFound();

  const data = await getSupplierPaymentsExportData({ supplierId, from, to });
  if (!data) notFound();

  const totalBalance = data.summary.reduce((s, r) => s + r.balanceCents, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 操作栏（打印时隐藏） */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/export?tab=supplier-payments" />}>
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
        <form
          method="post"
          action="/api/export/supplier-payments"
          className="inline-flex"
        >
          <input
            type="hidden"
            name="supplierId"
            value={data.supplier?.id ?? ""}
          />
          <input type="hidden" name="from" value={data.from === "全部" ? "" : data.from} />
          <input type="hidden" name="to" value={data.to === "至今" ? "" : data.to} />
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
          <h1 className="text-xl font-bold">供应商货款</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            供应商：{data.supplier?.name ?? "全部"} · 采购单日期：{data.from} 至 {data.to}
          </p>
        </div>

        {/* 汇总表 */}
        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">应付汇总</h2>
          {data.summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">该范围内无采购单</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border px-2 py-1 break-words text-left">供应商</th>
                  <th className="border px-2 py-1 break-words text-right">应付(元)</th>
                  <th className="border px-2 py-1 break-words text-right">已付(元)</th>
                  <th className="border px-2 py-1 break-words text-right">余额(元)</th>
                  <th className="border px-2 py-1 break-words text-right">采购单数</th>
                  <th className="border px-2 py-1 break-words text-right">最长账龄</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.map((s) => (
                  <tr key={s.supplierId}>
                    <td className="border px-2 py-1 break-words font-medium">{s.name}</td>
                    <td className="border px-2 py-1 break-words text-right tabular-nums">{formatYuan(s.payableCents)}</td>
                    <td className="border px-2 py-1 break-words text-right tabular-nums">{formatYuan(s.paidCents)}</td>
                    <td className="border px-2 py-1 break-words text-right tabular-nums font-medium">
                      {formatYuan(s.balanceCents)}
                    </td>
                    <td className="border px-2 py-1 break-words text-right tabular-nums">{s.poCount}</td>
                    <td className="border px-2 py-1 break-words text-right tabular-nums">
                      {s.maxDays} 天
                      {s.maxDays > 60 ? "（超60天）" : s.maxDays > 30 ? "（超30天）" : ""}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40">
                  <td className="border px-2 py-1 break-words text-right font-semibold" colSpan={3}>
                    余额合计
                  </td>
                  <td className="border px-2 py-1 break-words text-right font-semibold tabular-nums">
                    {formatYuan(totalBalance)}
                  </td>
                  <td className="border px-2 py-1 break-words" colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* 付款明细 */}
        <section>
          <h2 className="mb-2 text-base font-semibold">付款明细</h2>
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">该范围内无付款记录</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border px-2 py-1 break-words text-left">日期</th>
                  <th className="border px-2 py-1 break-words text-left">供应商</th>
                  <th className="border px-2 py-1 break-words text-left">方式</th>
                  <th className="border px-2 py-1 break-words text-right">金额(元)</th>
                  <th className="border px-2 py-1 break-words text-left">冲抵采购单</th>
                  <th className="border px-2 py-1 break-words text-left">备注</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1 break-words whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                    <td className="border px-2 py-1 break-words">{p.supplierName}</td>
                    <td className="border px-2 py-1 break-words">{p.method}</td>
                    <td className="border px-2 py-1 break-words text-right tabular-nums">{formatYuan(p.amountCents)}</td>
                    <td className="border px-2 py-1 break-words">
                      {p.allocations.length > 0
                        ? p.allocations.map((a) => `${a.poNo}:${formatYuan(a.amountCents)}`).join("；")
                        : "（未分配）"}
                    </td>
                    <td className="border px-2 py-1 break-words">{p.remark ?? "—"}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40">
                  <td className="border px-2 py-1 break-words text-right font-semibold" colSpan={3}>
                    付款合计
                  </td>
                  <td className="border px-2 py-1 break-words text-right font-semibold tabular-nums">
                    {formatYuan(data.totalPaidCents)}
                  </td>
                  <td className="border px-2 py-1 break-words" colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <p className="mt-3 text-xs text-muted-foreground">
          汇总口径：应付 = 范围内采购单行合计；已付 = 这些采购单被付款冲抵的合计；余额 = 应付 − 已付；账龄 = 今天 − 采购单日期（取最长）。
          付款明细按付款日期归入范围。
        </p>
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
