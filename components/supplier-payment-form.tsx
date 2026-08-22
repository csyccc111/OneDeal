"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  SupplierSelect,
  type SupplierOption,
} from "@/components/supplier-select";
import { PAYMENT_METHODS } from "@/lib/constants";
import { formatYuan } from "@/lib/money";
import { createSupplierPaymentAction } from "@/lib/actions/supplier-payment";

type UnpaidPo = {
  id: number;
  poNo: string;
  poDate: string;
  payable: number;
  paid: number;
  balance: number;
};

type Alloc = {
  poId: number;
  checked: boolean;
  amount: string;
};

function todayInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(s: string): string {
  return s ? s.slice(0, 10) : "";
}

export function SupplierPaymentForm({
  suppliers,
}: {
  suppliers: SupplierOption[];
}) {
  const [state, formAction] = useActionState(createSupplierPaymentAction, {});
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [pos, setPos] = useState<UnpaidPo[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const fetchSeq = useRef(0);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setPos([]);
      setAllocs([]);
      setAmount("");
    }
  }, [state.ok, router]);

  // 选择供应商 → 拉取未结清采购单
  useEffect(() => {
    if (!supplierId) {
      setPos([]);
      setAllocs([]);
      return;
    }
    const seq = ++fetchSeq.current;
    setLoading(true);
    fetch(`/api/purchases/unpaid?supplierId=${supplierId}`)
      .then((r) => r.json())
      .then((data: { orders?: UnpaidPo[] }) => {
        if (seq !== fetchSeq.current) return;
        const list = data.orders ?? [];
        setPos(list);
        setAllocs(
          list.map((o) => ({
            poId: o.id,
            checked: false,
            amount: "",
          })),
        );
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  }, [supplierId]);

  function updateAlloc(poId: number, patch: Partial<Alloc>) {
    setAllocs((prev) =>
      prev.map((a) => (a.poId === poId ? { ...a, ...patch } : a)),
    );
  }

  // 自动分配：按余额顺序填满付款金额
  function autoAllocate() {
    const total = Math.round(Number(amount || 0) * 100);
    if (!Number.isFinite(total) || total <= 0) return;
    let remain = total;
    setAllocs((prev) =>
      prev.map((a) => {
        if (remain <= 0) return { ...a, checked: false, amount: "" };
        const po = pos.find((o) => o.id === a.poId);
        if (!po) return a;
        const take = Math.min(po.balance, remain);
        remain -= take;
        return {
          ...a,
          checked: take > 0,
          amount: (take / 100).toFixed(2),
        };
      }),
    );
  }

  const checkedAllocs = allocs.filter((a) => a.checked);
  const allocTotal = checkedAllocs.reduce(
    (s, a) => s + Math.round(Number(a.amount || 0) * 100),
    0,
  );
  const amountCents = Math.round(Number(amount || 0) * 100);
  const diff = allocTotal - (Number.isFinite(amountCents) ? amountCents : 0);
  const canSubmit = Number.isFinite(amountCents) && amountCents > 0 && diff === 0;

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle>新建供应商付款</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <Label htmlFor="amount">付款金额（元）*</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidAt">付款日期</Label>
              <Input
                id="paidAt"
                name="paidAt"
                type="date"
                defaultValue={todayInputValue()}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="method">付款方式</Label>
              <Select name="method" defaultValue="现金">
                <SelectTrigger id="method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="remark">备注</Label>
              <Input id="remark" name="remark" placeholder="可选" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>冲抵采购单（勾选 + 填金额）</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={autoAllocate}
              >
                <Wand2 className="h-4 w-4" />
                自动分配
              </Button>
            </div>
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                加载中…
              </p>
            ) : !supplierId ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                请先选择供应商
              </p>
            ) : pos.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                该供应商没有未结清采购单 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {pos.map((po) => {
                  const alloc = allocs.find((a) => a.poId === po.id);
                  return (
                    <div
                      key={po.id}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      <Checkbox
                        checked={alloc?.checked ?? false}
                        onCheckedChange={(checked) =>
                          updateAlloc(po.id, {
                            checked: checked === true,
                            amount: checked === true ? alloc?.amount || "" : "",
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {po.poNo}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {fmtDate(po.poDate)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          应付 {formatYuan(po.payable)} · 已付 {formatYuan(po.paid)} ·{" "}
                          余额 <span className="font-medium">{formatYuan(po.balance)}</span>
                        </p>
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-28"
                        value={alloc?.amount ?? ""}
                        disabled={!alloc?.checked}
                        placeholder="分配金额"
                        onChange={(e) =>
                          updateAlloc(po.id, { amount: e.target.value })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {pos.length > 0 && (
              <p className="text-right text-sm">
                已分配：
                <span className="font-semibold">{formatYuan(allocTotal)}</span> /{" "}
                {formatYuan(amountCents)} 元
                {diff !== 0 && (
                  <span className="ml-2 text-destructive">
                    差额 {formatYuan(diff)}（须为 0 才能提交）
                  </span>
                )}
              </p>
            )}
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          {/* 分配明细隐藏字段（勾选且金额>0 的项，连续编号；修复"请至少分配一个采购单"误报） */}
          {checkedAllocs
            .filter((a) => Math.round(Number(a.amount || 0) * 100) > 0)
            .map((a, i) => (
              <div key={a.poId} className="hidden">
                <input type="hidden" name={`allocations_${i}_poId`} value={a.poId} />
                <input
                  type="hidden"
                  name={`allocations_${i}_amount`}
                  value={a.amount}
                />
              </div>
            ))}
        </CardContent>
        <CardFooter>
          <SubmitButton disabled={!canSubmit} />
        </CardFooter>
      </form>
    </Card>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "提交中…" : "保存付款"}
    </Button>
  );
}
