import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import {
  getPaymentsExportData,
  fmtDate,
} from "@/lib/services/export";
import { formatYuan } from "@/lib/money";

// 收货款记录预览页（打印样式：Ctrl+P 打印 / 另存 PDF）
export default async function PaymentsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    customerId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  const customerIdRaw = sp.customerId;
  const customerId = customerIdRaw ? Number(customerIdRaw) : undefined;
  if (customerIdRaw && (!Number.isInteger(customerId) || customerId! <= 0)) {
    notFound();
  }
  const from = sp.from?.trim() || undefined;
  const to = sp.to?.trim() || undefined;

  const data = await getPaymentsExportData({ customerId, from, to });
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 操作栏（打印时隐藏） */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/export" />}>
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
        <form
          method="post"
          action="/api/export/payments"
          className="inline-flex"
        >
          {data.customer && (
            <input type="hidden" name="customerId" value={data.customer.id} />
          )}
          {from && <input type="hidden" name="from" value={from} />}
          {to && <input type="hidden" name="to" value={to} />}
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
          <h1 className="text-xl font-bold">收货款记录</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            客户：{data.customer ? data.customer.name : "全部客户"} · 日期范围：
            {data.from} 至 {data.to}
          </p>
        </div>

        {data.payments.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            该范围内没有收款记录
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border px-2 py-1 break-words text-left">序号</th>
                <th className="border px-2 py-1 break-words text-left">收款日期</th>
                <th className="border px-2 py-1 break-words text-left">客户</th>
                <th className="border px-2 py-1 break-words text-left">方式</th>
                <th className="border px-2 py-1 break-words text-right">金额(元)</th>
                <th className="border px-2 py-1 break-words text-left">冲抵订单</th>
                <th className="border px-2 py-1 break-words text-left">备注</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1 break-words text-right tabular-nums">{i + 1}</td>
                  <td className="border px-2 py-1 break-words whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                  <td className="border px-2 py-1 break-words font-medium">{p.customerName}</td>
                  <td className="border px-2 py-1 break-words">{p.method}</td>
                  <td className="border px-2 py-1 break-words text-right tabular-nums">
                    {formatYuan(p.amountCents)}
                  </td>
                  <td className="border px-2 py-1 break-words">
                    {p.allocations.length > 0
                      ? p.allocations.map((a) => `${a.orderNo}:${formatYuan(a.amountCents)}`).join("；")
                      : "（未分配）"}
                  </td>
                  <td className="border px-2 py-1 break-words">{p.remark ?? "—"}</td>
                </tr>
              ))}
              <tr>
                <td className="border px-2 py-1 break-words text-right font-semibold" colSpan={4}>
                  合计
                </td>
                <td className="border px-2 py-1 break-words text-right font-semibold tabular-nums">
                  {formatYuan(data.totalCents)}
                </td>
                <td className="border px-2 py-1 break-words" colSpan={2} />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* 打印样式 */}
      <style>{`
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
