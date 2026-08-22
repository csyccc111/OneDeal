"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CustomerSelect, type CustomerOption } from "@/components/customer-select";
import { FieldSuggest } from "@/components/field-suggest";
import { UNITS, TAX_TYPES } from "@/lib/constants";
import { formatYuan, formatYuanMills, formatTaxRateBp, lineAmountCents } from "@/lib/money";
import { createOrderAction, updateOrderAction } from "@/lib/actions/order";

type OrderItemForm = {
  key: number;
  id?: number;
  product: string;
  spec: string;
  unit: string;
  qty: string;
  unitPrice: string;
  itemCode: string;
  note: string;
};

type OrderFormProps = {
  customers: CustomerOption[];
  order?: {
    id: number;
    orderNo: string;
    customerId: number;
    customerOrderNo: string | null;
    taxType: string;
    taxRateBp: number | null;
    dueDate: string | null;
    remark: string | null;
    items: {
      id: number;
      product: string;
      spec: string | null;
      unit: string;
      qty: number;
      unitPriceMills: number;
      note: string | null;
      itemCode: string | null;
    }[];
    status: string;
  };
};

function yuanFromMills(mills: number): string {
  return formatYuanMills(mills);
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function OrderForm({ customers, order }: OrderFormProps) {
  const action = order ? updateOrderAction : createOrderAction;
  const [state, formAction] = useActionState(action, {});
  const nextKey = useRef(1000);
  const [customerId, setCustomerId] = useState<number | null>(
    order?.customerId ?? null,
  );
  const [taxType, setTaxType] = useState<string>(order?.taxType ?? "无");
  const [taxRate, setTaxRate] = useState<string>(
    order?.taxRateBp != null ? formatTaxRateBp(order.taxRateBp) : "",
  );
  const [items, setItems] = useState<OrderItemForm[]>(
    order
      ? order.items.map((it) => ({
          key: nextKey.current++,
          id: it.id,
          product: it.product,
          spec: it.spec ?? "",
          unit: it.unit,
          qty: String(it.qty),
          unitPrice: yuanFromMills(it.unitPriceMills),
          itemCode: it.itemCode ?? "",
          note: it.note ?? "",
        }))
      : [{ key: nextKey.current++, product: "", spec: "", unit: "件", qty: "1", unitPrice: "", itemCode: "", note: "" }],
  );

  // 已结算锁定；已发货也可编辑（2026-08-19 用户要求）
  const locked = order?.status === "已结算";

  function updateItem(key: number, patch: Partial<OrderItemForm>) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        product: "",
        spec: "",
        unit: "件",
        qty: "1",
        unitPrice: "",
        itemCode: "",
        note: "",
      },
    ]);
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle>{order ? `编辑订单 ${order.id}` : "新建订单"}</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-5">
          {order && (
            <input type="hidden" name="orderId" value={order.id} />
          )}
          <input type="hidden" name="customerId" value={customerId ?? ""} />

          <div className="space-y-2">
            <Label>
              客户 <span className="text-destructive">*</span>
            </Label>
            <CustomerSelect
              value={customerId}
              onChange={setCustomerId}
              customers={customers}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="taxType">含税类型</Label>
              <Select
                value={taxType}
                onValueChange={(v) => setTaxType(v ?? "无")}
              >
                <SelectTrigger id="taxType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="taxType" value={taxType} />
            </div>
            {taxType === "含税" && (
              <div className="space-y-2">
                <Label htmlFor="taxRate">税率（%）</Label>
                <Input
                  id="taxRate"
                  name="taxRate"
                  inputMode="decimal"
                  placeholder="如 13.5（可空）"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="dueDate">交期</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={order?.dueDate ?? ""}
                placeholder="可空，后改"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">状态</Label>
              <Input
                id="status"
                value={order?.status ?? "待确认"}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orderNo">订单号</Label>
              <Input
                id="orderNo"
                name="orderNo"
                defaultValue={order?.orderNo ?? ""}
                placeholder={order ? "可修改（唯一）" : "自动生成"}
                disabled={!order}
              />
              {order && (
                <p className="text-xs text-muted-foreground">
                  修改后订单列表/对账单按新单号显示；送货单快照不受影响
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerOrderNo">客户订单号</Label>
              <Input
                id="customerOrderNo"
                name="customerOrderNo"
                defaultValue={order?.customerOrderNo ?? ""}
                placeholder="客户侧单号（对账单显示，可选）"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remark">备注</Label>
            <Textarea
              id="remark"
              name="remark"
              defaultValue={order?.remark ?? ""}
              placeholder="订单备注（可选）"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>订单行</Label>
              {!locked && (
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4" />
                  添加行
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => {
                const subtotal =
                  Number(it.qty) * Number(it.unitPrice || 0) || 0;
                return (
                  <div
                    key={it.key}
                    className="space-y-2 rounded-md border p-3"
                  >
                    {it.id != null && (
                      <input
                        type="hidden"
                        name={`items_${idx}_id`}
                        value={it.id}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">品名 *</Label>
                        <FieldSuggest
                          field="product"
                          name={`items_${idx}_product`}
                          value={it.product}
                          onChange={(v) => updateItem(it.key, { product: v })}
                          placeholder="品名"
                          disabled={locked}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">规格/图号</Label>
                        <FieldSuggest
                          field="spec"
                          name={`items_${idx}_spec`}
                          value={it.spec}
                          onChange={(v) => updateItem(it.key, { spec: v })}
                          placeholder="如 DN50"
                          disabled={locked}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">单位</Label>
                        <Select
                          name={`items_${idx}_unit`}
                          value={it.unit}
                          onValueChange={(v) =>
                            updateItem(it.key, { unit: v ?? "件" })
                          }
                          disabled={locked}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">数量</Label>
                        <Input
                          name={`items_${idx}_qty`}
                          type="number"
                          min={1}
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(it.key, { qty: e.target.value })
                          }
                          disabled={locked}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
                      <div className="space-y-1">
                        <Label className="text-xs">单价（元）</Label>
                        <Input
                          name={`items_${idx}_unitPrice`}
                          type="number"
                          step="0.001"
                          min="0"
                          value={it.unitPrice}
                          onChange={(e) =>
                            updateItem(it.key, { unitPrice: e.target.value })
                          }
                          placeholder="可为空"
                          disabled={locked}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">小计（元）</Label>
                        <Input
                          value={subtotal.toFixed(2)}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">物料编号</Label>
                        <FieldSuggest
                          field="itemCode"
                          name={`items_${idx}_itemCode`}
                          value={it.itemCode}
                          onChange={(v) => updateItem(it.key, { itemCode: v })}
                          placeholder="可选"
                          disabled={locked}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-1">
                        <Label className="text-xs">行备注</Label>
                        <Input
                          name={`items_${idx}_note`}
                          value={it.note}
                          onChange={(e) =>
                            updateItem(it.key, { note: e.target.value })
                          }
                          placeholder="可选"
                          disabled={locked}
                        />
                      </div>
                      <div className="flex justify-end">
                        {!locked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="删除该行"
                            disabled={items.length <= 1}
                            onClick={() => removeItem(it.key)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-right text-sm text-muted-foreground">
              合计：
              <span className="text-base font-semibold text-foreground">
                {formatYuan(
                  items.reduce((s, it) => {
                    const qty = Number(it.qty);
                    const mills = Math.round(Number(it.unitPrice || 0) * 1000);
                    return s + (Number.isFinite(qty) && qty > 0 ? lineAmountCents(qty, mills) : 0);
                  }, 0),
                )}
              </span>
              元
            </p>
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <SubmitButton label={locked ? "保存备注等" : "保存订单"} />          <Button type="button" variant="ghost" onClick={() => history.back()}>
            返回
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : label}
    </Button>
  );
}
