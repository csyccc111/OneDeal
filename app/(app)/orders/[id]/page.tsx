import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Clock, History, Truck, RotateCcw, Wallet, FileText, Paperclip, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatYuan, formatYuanMills, formatTaxRateBp } from "@/lib/money";
import { ORDER_STATUS_FLOW } from "@/lib/constants";
import { isFullyShipped } from "@/lib/services/shipment";
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
import { OrderStatusTransition } from "@/components/order-status-transition";
import { ShipmentDialog } from "@/components/shipment-dialog";
import { DefectiveDialog } from "@/components/defective-dialog";
import { CancelOrderDialog } from "@/components/cancel-order-dialog";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { AttachmentUpload } from "@/components/attachment-upload";
import { AttachmentDeleteButton } from "@/components/attachment-delete-button";

function formatDateTime(d: Date): string {
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: true,
      statusLogs: { orderBy: { changedAt: "desc" } },
      changeLogs: { orderBy: { changedAt: "desc" }, take: 50 },
      shipments: {
        orderBy: { shippedAt: "desc" },
        include: { item: { select: { product: true } } },
      },
      allocations: {
        include: { payment: { select: { paidAt: true, method: true } } },
      },
      invoices: { orderBy: { invoiceDate: "desc" } },
      attachments: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!order) notFound();

  const totalCents = order.items.reduce((s, it) => s + it.amountCents, 0);
  const paidCents = order.allocations.reduce((s, a) => s + a.amountCents, 0);
  const unpaidCents = totalCents - paidCents;
  const invoicedCents = order.invoices.reduce((s, i) => s + i.amountCents, 0);
  const cancelled = order.cancelledAt != null;
  const settled = order.status === "已结算";
  // 已发货也可编辑（2026-08-19 用户要求）；已结算/作废锁定
  const locked = settled || cancelled;
  const cancellable =
    !cancelled && ["待确认", "排产", "生产中"].includes(order.status);
  const canOperate = !settled && !cancelled;
  const nextStatus = ORDER_STATUS_FLOW[order.status as keyof typeof ORDER_STATUS_FLOW];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{order.orderNo}</h1>
          {cancelled ? (
            <Badge variant="destructive">已作废</Badge>
          ) : (
            <Badge variant="secondary">{order.status}</Badge>
          )}
        </div>
        {!cancelled && (
          <div className="flex gap-2">
            {nextStatus && (
              <OrderStatusTransition
                orderId={order.id}
                currentStatus={order.status}
                nextStatus={nextStatus}
              />
            )}
            {!locked && (
              <Link href={`/orders/${order.id}/edit`}>
                <Button variant="outline">
                  <Pencil className="h-4 w-4" />
                  编辑
                </Button>
              </Link>
            )}
            {cancellable && (
              <CancelOrderDialog orderId={order.id} orderNo={order.orderNo} />
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">订单信息</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">客户</p>
            <p className="font-medium">{order.customer.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">客户订单号</p>
            <p>{order.customerOrderNo ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">含税类型</p>
            <p>
              {order.taxType}
              {order.taxType === "含税" && order.taxRateBp != null
                ? `（${formatTaxRateBp(order.taxRateBp)}%）`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">交期</p>
            <p>{order.dueDate ? order.dueDate.toLocaleDateString("zh-CN") : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">订单金额</p>
            <p className="text-base font-semibold">{formatYuan(totalCents)} 元</p>
          </div>
          <div>
            <p className="text-muted-foreground">创建时间</p>
            <p>{formatDateTime(order.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">备注</p>
            <p>{order.remark ?? "—"}</p>
          </div>
          {cancelled && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-muted-foreground">作废信息</p>
              <p className="font-medium text-destructive">
                {formatDateTime(order.cancelledAt!)} · {order.cancelReason}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">订单行明细</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>品名</TableHead>
                <TableHead>规格</TableHead>
                <TableHead>物料编号</TableHead>
                <TableHead>单位</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">单价(元)</TableHead>
                <TableHead className="text-right">小计(元)</TableHead>
                <TableHead className="text-right">已发/退/废</TableHead>
                <TableHead>备注</TableHead>
                {canOperate && <TableHead className="text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((it) => {
                const shipped = it.shippedQty - it.returnedQty; // 净已发
                const available = it.qty - shipped - it.defectiveQty; // 可再发
                const fullyShipped = isFullyShipped(it);
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">
                      {it.product}
                      {fullyShipped && (
                        <Badge variant="secondary" className="ml-2">
                          已发完
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{it.spec ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {it.itemCode ?? "—"}
                    </TableCell>
                    <TableCell>{it.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.qty}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatYuanMills(it.unitPriceMills)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatYuan(it.amountCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.shippedQty}/{it.returnedQty}/{it.defectiveQty}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {it.note ?? "—"}
                    </TableCell>
                    {canOperate && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <ShipmentDialog
                            orderId={order.id}
                            itemId={it.id}
                            itemName={it.product}
                            type="发货"
                            defaultQty={Math.max(0, available)}
                          />
                          <ShipmentDialog
                            orderId={order.id}
                            itemId={it.id}
                            itemName={it.product}
                            type="退货"
                            defaultQty={Math.max(0, shipped)}
                          />
                          <DefectiveDialog
                            orderId={order.id}
                            itemId={it.id}
                            itemName={it.product}
                            current={it.defectiveQty}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" />
            发货 / 退货记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          {order.shipments.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无记录</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>品名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.shipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap">
                        {s.shippedAt.toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell>{s.item.product}</TableCell>
                      <TableCell>
                        {s.type === "发货" ? (
                          <Badge variant="secondary">
                            <Truck className="mr-1 h-3 w-3" />
                            发货
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            退货
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.qty}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            结算信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">应收</p>
              <p className="text-lg font-semibold">{formatYuan(totalCents)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">已收</p>
              <p className="text-lg font-semibold">{formatYuan(paidCents)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">未收</p>
              <p
                className={`text-lg font-semibold ${
                  unpaidCents > 0 ? "text-destructive" : ""
                }`}
              >
                {formatYuan(unpaidCents)}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">开票</p>
              <p className="text-lg font-semibold">{formatYuan(invoicedCents)}</p>
              <Badge variant="secondary" className="mt-1">
                {invoicedCents <= 0
                  ? "未开票"
                  : invoicedCents >= totalCents
                    ? "已开票"
                    : "部分开票"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">收款分配明细</p>
              </div>
              {order.allocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无收款</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>方式</TableHead>
                      <TableHead className="text-right">金额(元)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.allocations.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap">
                          {a.payment.paidAt.toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell>{a.payment.method}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatYuan(a.amountCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">开票记录</p>
                {!cancelled && totalCents - invoicedCents > 0 && (
                  <InvoiceDialog
                    orderId={order.id}
                    orderNo={order.orderNo}
                    remainCents={totalCents - invoicedCents}
                  />
                )}
              </div>
              {order.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无开票记录</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>票号</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead className="text-right">金额(元)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          <FileText className="mr-1 inline h-3 w-3" />
                          {inv.invoiceNo}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {inv.invoiceDate.toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatYuan(inv.amountCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4" />
            附件（截图/图纸）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!cancelled && <AttachmentUpload orderId={order.id} />}
          {order.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无附件</p>
          ) : (
            <div className="space-y-2">
              {order.attachments.map((att) => {
                const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(att.filePath);
                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 rounded-md border p-2"
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/attachments/${att.id}`}
                        alt={att.fileName}
                        className="h-12 w-12 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {att.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {att.fileType} ·{" "}
                        {att.uploadedAt.toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="下载附件"
                      nativeButton={false}
                      render={
                        <a
                          href={`/api/attachments/${att.id}?download=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      }
                    />
                    <AttachmentDeleteButton
                      attachmentId={att.id}
                      fileName={att.fileName}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              状态时间线
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.statusLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无记录</p>
            ) : (
              <ol className="space-y-3">
                {order.statusLogs.map((log) => (
                  <li key={log.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p>
                        {log.fromStatus ? `${log.fromStatus} → ` : ""}
                        <span className="font-medium">{log.toStatus}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {formatDateTime(log.changedAt)}
                        </span>
                      </p>
                      {log.note && (
                        <p className="text-xs text-muted-foreground">
                          {log.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              变更历史（改价/改数留痕）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.changeLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无变更记录</p>
            ) : (
              <div className="space-y-3 text-sm">
                {order.changeLogs.map((log) => (
                  <div key={log.id} className="border-l-2 border-muted pl-3">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(log.changedAt)} · {log.field}
                    </p>
                    <p>
                      <span className="text-muted-foreground line-through">
                        {log.oldValue || "—"}
                      </span>
                      <span className="mx-1">→</span>
                      <span className="font-medium">
                        {log.newValue || "（已删除）"}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
