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
import { SupplierSelect, type SupplierOption } from "@/components/supplier-select";
import { FieldSuggest } from "@/components/field-suggest";
import { UNITS } from "@/lib/constants";
import { formatYuan, formatYuanMills, lineAmountCents } from "@/lib/money";
import { createPurchaseAction, updatePurchaseAction } from "@/lib/actions/purchase";

type PurchaseItemForm = {
  key: number;
  id?: number;
  product: string;
  spec: string;
  unit: string;
  qty: string;
  unitPrice: string;
  note: string;
};

type PurchaseFormProps = {
  suppliers: SupplierOption[];
  purchase?: {
    id: number;
    poNo: string;
    supplierId: number;
    poDate: string;
    remark: string | null;
    locked: boolean; // 有付款冲抵：行锁定
    items: {
      id: number;
      product: string;
      spec: string | null;
      unit: string;
      qty: number;
      unitPriceMills: number;
      note: string | null;
    }[];
  };
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PurchaseForm({ suppliers, purchase }: PurchaseFormProps) {
  const action = purchase ? updatePurchaseAction : createPurchaseAction;
  const [state, formAction] = useActionState(action, {});
  const nextKey = useRef(1000);
  const [supplierId, setSupplierId] = useState<number | null>(
    purchase?.supplierId ?? null,
  );
  const [items, setItems] = useState<PurchaseItemForm[]>(
    purchase
      ? purchase.items.map((it) => ({
          key: nextKey.current++,
          id: it.id,
          product: it.product,
          spec: it.spec ?? "",
          unit: it.unit,
          qty: String(it.qty),
          unitPrice: formatYuanMills(it.unitPriceMills),
          note: it.note ?? "",
        }))
      : [{ key: nextKey.current++, product: "", spec: "", unit: "件", qty: "1", unitPrice: "", note: "" }],
  );

  function updateItem(key: number, patch: Partial<PurchaseItemForm>) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: nextKey.current++, product: "", spec: "", unit: "件", qty: "1", unitPrice: "", note: "" },
    ]);
  }

  function removeItem(key: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  const locked = purchase?.locked ?? false;
  const totalCents = items.reduce((s, it) => {
    const qty = Number(it.qty);
    const mills = Math.round(Number(it.unitPrice || 0) * 1000);
    return s + (Number.isFinite(qty) && qty > 0 ? lineAmountCents(qty, mills) : 0);
  }, 0);

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle>
          {purchase ? `编辑采购单 ${purchase.poNo}` : "新建采购单"}
        </CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {purchase && <input type="hidden" name="poId" value={purchase.id} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                供应商 <span className="text-destructive">*</span>
              </Label>
              <SupplierSelect
                value={supplierId}
                onChange={setSupplierId}
                suppliers={suppliers}
              />
              <input type="hidden" name="supplierId" value={supplierId ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="poDate">采购日期</Label>
              <Input
                id="poDate"
                name="poDate"
                type="date"
                defaultValue={purchase?.poDate ?? toDateInputValue(new Date())}
              />
            </div>
          </div>

          <div className="space-y-3">
            {items.map((it, idx) => (
              <div key={it.key} className="rounded-md border p-3">
                {it.id != null && (
                  <input type="hidden" name={`items_${idx}_id`} value={it.id} />
                )}
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">品名 *</Label>
                    <FieldSuggest
                      field="product"
                      name={`items_${idx}_product`}
                      value={it.product}
                      onChange={(v) => updateItem(it.key, { product: v })}
                      placeholder="如：铜线"
                      disabled={locked}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">规格</Label>
                    <FieldSuggest
                      field="spec"
                      name={`items_${idx}_spec`}
                      value={it.spec}
                      onChange={(v) => updateItem(it.key, { spec: v })}
                      placeholder="可选"
                      disabled={locked}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">单位</Label>
                    <Select
                      value={it.unit}
                      onValueChange={(v) => updateItem(it.key, { unit: v ?? "件" })}
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
                    <Label className="text-xs">数量 *</Label>
                    <Input
                      name={`items_${idx}_qty`}
                      type="number"
                      min={1}
                      step={1}
                      value={it.qty}
                      onChange={(e) => updateItem(it.key, { qty: e.target.value })}
                      disabled={locked}
                    />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">单价（元）</Label>
                    <Input
                      name={`items_${idx}_unitPrice`}
                      type="number"
                      step="0.001"
                      min="0"
                      value={it.unitPrice}
                      onChange={(e) => updateItem(it.key, { unitPrice: e.target.value })}
                      placeholder="可为空"
                      disabled={locked}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">备注</Label>
                    <Input
                      name={`items_${idx}_note`}
                      value={it.note}
                      onChange={(e) => updateItem(it.key, { note: e.target.value })}
                      placeholder="可选"
                      disabled={locked}
                    />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={items.length <= 1 || locked}
                      onClick={() => removeItem(it.key)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!locked && (
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" />
              添加一行
            </Button>
          )}

          <p className="text-right text-sm text-muted-foreground">
            合计：
            <span className="text-base font-semibold text-foreground">
              {formatYuan(totalCents)}
            </span>
            元
          </p>

          <div className="space-y-2">
            <Label htmlFor="remark">采购单备注</Label>
            <Textarea
              id="remark"
              name="remark"
              defaultValue={purchase?.remark ?? ""}
              rows={2}
              placeholder="可选"
            />
          </div>

          {locked && (
            <p className="text-xs text-muted-foreground">
              该采购单已有付款冲抵，采购行与供应商已锁定（仅可改日期/备注）。
            </p>
          )}
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <SubmitButton />
          <Button type="button" variant="ghost" onClick={() => history.back()}>
            返回
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : "保存"}
    </Button>
  );
}
