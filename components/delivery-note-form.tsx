"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CustomerSelect,
  type CustomerOption,
} from "@/components/customer-select";
import { formatYuan, formatYuanMills } from "@/lib/money";
import { createDeliveryNoteAction } from "@/lib/actions/delivery-note";

type UnsentItem = {
  orderItemId: number;
  orderId: number;
  orderNo: string;
  customerOrderNo: string | null;
  itemCode: string | null;
  product: string;
  spec: string | null;
  unit: string;
  qty: number;
  shipped: number;
  returned: number;
  defective: number;
  deliveryNoteQty: number;
  available: number;
  unitPriceMills: number;
  amountCents: number;
};

type Line = {
  orderItemId: number;
  checked: boolean;
  qty: string;
};

function todayInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DeliveryNoteForm({
  customers,
}: {
  customers: CustomerOption[];
}) {
  const [state, formAction] = useActionState(createDeliveryNoteAction, {});
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [items, setItems] = useState<UnsentItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchSeq = useRef(0);

  useEffect(() => {
    if (!customerId) {
      setItems([]);
      setLines([]);
      return;
    }
    const seq = ++fetchSeq.current;
    setLoading(true);
    fetch(`/api/delivery-notes/unsent?customerId=${customerId}`)
      .then((r) => r.json())
      .then((data: { items?: UnsentItem[] }) => {
        if (seq !== fetchSeq.current) return;
        const list = data.items ?? [];
        setItems(list);
        setLines(
          list.map((it) => ({
            orderItemId: it.orderItemId,
            checked: false,
            qty: String(it.available),
          })),
        );
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  }, [customerId]);

  function updateLine(orderItemId: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => (l.orderItemId === orderItemId ? { ...l, ...patch } : l)),
    );
  }

  function selectAll() {
    setLines((prev) =>
      prev.map((l) => ({ ...l, checked: true, qty: String(l.qty) })),
    );
  }

  const checked = lines.filter((l) => l.checked);
  const totalQty = checked.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const totalCents = checked.reduce((s, l) => {
    const it = items.find((i) => i.orderItemId === l.orderItemId);
    if (!it) return s;
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1) return s;
    return s + Math.round((qty * it.unitPriceMills) / 10);
  }, 0);

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle>新建送货单</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>
                客户 <span className="text-destructive">*</span>
              </Label>
              <CustomerSelect
                value={customerId}
                onChange={setCustomerId}
                customers={customers}
              />
              <input type="hidden" name="customerId" value={customerId ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="noteDate">送货日期</Label>
              <Input
                id="noteDate"
                name="noteDate"
                type="date"
                defaultValue={todayInputValue()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">联系人（可选，默认留空）</Label>
              <Input id="contact" name="contact" placeholder="可填" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">客户地址（可选）</Label>
              <Input id="address" name="address" placeholder="可填" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remark">备注（可选）</Label>
              <Input id="remark" name="remark" placeholder="可填" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>勾选未发完的订单行（默认数量 = 剩余未发量）</Label>
              {items.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                  <PackageCheck className="h-4 w-4" />
                  全选
                </Button>
              )}
            </div>
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">加载中…</p>
            ) : !customerId ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                请先选择客户
              </p>
            ) : items.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                该客户没有未发完的订单行 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  let lineIdx = 0;
                  return items.map((it) => {
                    const line = lines.find((l) => l.orderItemId === it.orderItemId);
                    const checked = line?.checked ?? false;
                    if (checked) {
                      const idx = lineIdx++;
                      const l = line!;
                      return (
                        <div key={it.orderItemId} className="flex items-center gap-3 rounded-md border p-3">
                          <input type="hidden" name={`lines_${idx}_orderItemId`} value={it.orderItemId} />
                          <input type="hidden" name={`lines_${idx}_qty`} value={l.qty} />
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              updateLine(it.orderItemId, { checked: c === true })
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {it.product}
                              {it.itemCode ? (
                                <span className="ml-2 text-xs text-muted-foreground">#{it.itemCode}</span>
                              ) : null}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {it.orderNo}
                                {it.customerOrderNo
                                  ? `（客户单：${it.customerOrderNo}）`
                                  : ""}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {it.spec ?? "—"} · {it.unit} · 单价 {formatYuanMills(it.unitPriceMills)} ·{" "}
                              计划 {it.qty} · 已发 {it.shipped} · 退 {it.returned} · 废 {it.defective}
                              {it.deliveryNoteQty > 0
                                ? ` · 已开送货单 ${it.deliveryNoteQty}`
                                : ""}{" "}
                              · 剩余{" "}
                              <span className="font-medium">{it.available}</span>
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            max={it.available}
                            step={1}
                            className="w-24"
                            value={l.qty}
                            onChange={(e) =>
                              updateLine(it.orderItemId, { qty: e.target.value })
                            }
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={it.orderItemId} className="flex items-center gap-3 rounded-md border p-3">
                        <Checkbox
                          checked={false}
                          onCheckedChange={(c) =>
                            updateLine(it.orderItemId, { checked: c === true })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {it.product}
                            {it.itemCode ? (
                              <span className="ml-2 text-xs text-muted-foreground">#{it.itemCode}</span>
                            ) : null}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {it.orderNo}
                              {it.customerOrderNo
                                ? `（客户单：${it.customerOrderNo}）`
                                : ""}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {it.spec ?? "—"} · {it.unit} · 单价 {formatYuanMills(it.unitPriceMills)} ·{" "}
                            计划 {it.qty} · 已发 {it.shipped} · 退 {it.returned} · 废 {it.defective}
                            {it.deliveryNoteQty > 0
                              ? ` · 已开送货单 ${it.deliveryNoteQty}`
                              : ""}{" "}
                            · 剩余{" "}
                            <span className="font-medium">{it.available}</span>
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={it.available}
                          step={1}
                          className="w-24"
                          value={line?.qty ?? ""}
                          disabled
                        />
                      </div>
                    );
                  });
                })()}
              </div>
            )}
            {checked.length > 0 && (
              <p className="text-right text-sm">
                已选 {checked.length} 行 · 共 {totalQty} 件 · 金额{" "}
                <span className="font-semibold">{formatYuan(totalCents)}</span> 元
              </p>
            )}
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter>
          <SubmitButton disabled={checked.length === 0} />
        </CardFooter>
      </form>
    </Card>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "生成中…" : "生成送货单"}
    </Button>
  );
}
