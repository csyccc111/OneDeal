import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatYuan, formatYuanMills } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { PurchaseDeleteButton } from "@/components/purchase-delete-dialog";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const poId = Number(id);
  if (!Number.isInteger(poId)) notFound();

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: { select: { name: true, contact: true } },
      items: true,
      allocations: {
        include: { payment: { select: { paidAt: true, method: true, remark: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!po) notFound();

  const payable = po.items.reduce((s, i) => s + i.amountCents, 0);
  const paid = po.allocations.reduce((s, a) => s + a.amountCents, 0);
  const balance = payable - paid;
  const locked = po.allocations.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href="/purchases" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">{po.poNo}</h1>
          {balance > 0 ? (
            <Badge variant="secondary">未结清</Badge>
          ) : (
            <Badge variant="default">已结清</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/purchases/${po.id}/edit`} />}>
            <Pencil className="h-4 w-4" />
            {locked ? "编辑（仅日期/备注）" : "编辑"}
          </Button>
          {!locked && <PurchaseDeleteButton poId={po.id} poNo={po.poNo} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">采购信息</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">供应商</p>
            <p className="font-medium">{po.supplier.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">采购日期</p>
            <p className="font-medium">{po.poDate.toLocaleDateString("zh-CN")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">应付/已付/余额</p>
            <p className="font-medium">
              {formatYuan(payable)} / {formatYuan(paid)} /{" "}
              <span className={balance > 0 ? "text-destructive" : ""}>
                {formatYuan(balance)}
              </span>
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">备注</p>
            <p>{po.remark ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">采购明细</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>品名</TableHead>
                <TableHead>规格</TableHead>
                <TableHead>单位</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">单价(元)</TableHead>
                <TableHead className="text-right">小计(元)</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.product}</TableCell>
                  <TableCell>{it.spec ?? "—"}</TableCell>
                  <TableCell>{it.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatYuanMills(it.unitPriceMills)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatYuan(it.amountCents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{it.note ?? "—"}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-right font-semibold" colSpan={5}>
                  应付合计
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatYuan(payable)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {locked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">付款冲抵明细</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>付款日期</TableHead>
                  <TableHead>方式</TableHead>
                  <TableHead className="text-right">冲抵金额(元)</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.allocations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      {a.payment.paidAt.toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell>{a.payment.method}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatYuan(a.amountCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.payment.remark ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="text-right font-semibold" colSpan={2}>
                    已付合计
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatYuan(paid)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        状态由冲抵余额自动决定：余额 &gt; 0 为未结清，全部冲抵后自动变为已结清。
      </p>
    </div>
  );
}
