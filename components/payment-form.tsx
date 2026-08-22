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
  CustomerSelect,
  type CustomerOption,
} from "@/components/customer-select";
import { PAYMENT_METHODS } from "@/lib/constants";
import { formatYuan } from "@/lib/money";
import { createPaymentAction } from "@/lib/actions/payment";

type UnpaidOrder = {
  id: number;
  orderNo: string;
  status: string;
  receivable: number;
  paid: number;
  unpaid: number;
};

type Alloc = {
  orderId: number;
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

export function PaymentForm({ customers }: { customers: CustomerOption[] }) {
  const [state, formAction] = useActionState(createPaymentAction, {});
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [orders, setOrders] = useState<UnpaidOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const fetchSeq = useRef(0);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setOrders([]);
      setAllocs([]);
      setAmount("");
    }
  }, [state.ok, router]);

  // 选择客户 → 拉取未收订单
  useEffect(() => {
    if (!customerId) {
      setOrders([]);
      setAllocs([]);
      return;
    }
    const seq = ++fetchSeq.current;
    setLoading(true);
    fetch(`/api/orders/unpaid?customerId=${customerId}`)
      .then((r) => r.json())
      .then((data: { orders?: UnpaidOrder[] }) => {
        if (seq !== fetchSeq.current) return;
        const list = data.orders ?? [];
        setOrders(list);
        setAllocs(
          list.map((o) => ({
            orderId: o.id,
            checked: false,
            amount: "",
          })),
        );
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  }, [customerId]);

  function updateAlloc(orderId: number, patch: Partial<Alloc>) {
    setAllocs((prev) =>
      prev.map((a) => (a.orderId === orderId ? { ...a, ...patch } : a)),
    );
  }

  // 自动分配：按未收顺序填满收款金额
  function autoAllocate() {
    const total = Math.round(Number(amount || 0) * 100);
    if (!Number.isFinite(total) || total <= 0) return;
    let remain = total;
    setAllocs((prev) =>
      prev.map((a) => {
        if (remain <= 0) return { ...a, checked: false, amount: "" };
        const order = orders.find((o) => o.id === a.orderId);
        if (!order) return a;
        const take = Math.min(order.unpaid, remain);
        remain -= take;
        return {
          ...a,
          checked: true,
          amount: take > 0 ? (take / 100).toFixed(2) : "",
        };
      }),
    );
  }

  const allocTotalCents = allocs.reduce(
    (s, a) => s + Math.round(Number(a.amount || 0) * 100),
    0,
  );
  const amountCents = Math.round(Number(amount || 0) * 100);
  const balanced = amountCents > 0 && allocTotalCents === amountCents;
  const checkedCount = allocs.filter((a) => a.checked).length;

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle>新建收款</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-5">
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
              <Label htmlFor="pay-amount">
                收款金额（元）<span className="text-destructive">*</span>
              </Label>
              <Input
                id="pay-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-method">收款方式</Label>
              <Select name="method" defaultValue="现金">
                <SelectTrigger id="pay-method" className="w-full">
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
              <Label htmlFor="pay-date">收款日期</Label>
              <Input
                id="pay-date"
                name="paidAt"
                type="date"
                defaultValue={todayInputValue()}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-remark">备注（可选）</Label>
            <Input id="pay-remark" name="remark" placeholder="可选" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>
                分配订单（勾选后填金额）{" "}
                {orders.length > 0 && `· 共 ${orders.length} 单未收`}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={autoAllocate}
                disabled={!amount || orders.length === 0}
              >
                <Wand2 className="h-4 w-4" />
                自动分配
              </Button>
            </div>

            {!customerId && (
              <p className="text-sm text-muted-foreground">
                请先选择客户，加载其未收订单
              </p>
            )}
            {customerId && loading && (
              <p className="text-sm text-muted-foreground">加载中…</p>
            )}
            {customerId && !loading && orders.length === 0 && (
              <p className="text-sm text-muted-foreground">
                该客户没有未收订单
              </p>
            )}

            {orders.map((o) => {
              const alloc = allocs.find((a) => a.orderId === o.id);
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                >
                  <Checkbox
                    id={`alloc-${o.id}`}
                    checked={alloc?.checked ?? false}
                    onCheckedChange={(v) =>
                      updateAlloc(o.id, {
                        checked: v === true,
                        amount: v === true ? (o.unpaid / 100).toFixed(2) : "",
                      })
                    }
                  />
                  <label
                    htmlFor={`alloc-${o.id}`}
                    className="flex-1 cursor-pointer text-sm"
                  >
                    <span className="font-medium">{o.orderNo}</span>
                    <span className="ml-2 text-muted-foreground">
                      {o.status} · 未收 {formatYuan(o.unpaid)} 元
                    </span>
                  </label>
                  <Input
                    name={`allocations_${orders.indexOf(o)}_orderId`}
                    type="hidden"
                    value={alloc?.checked ? o.id : ""}
                  />
                  <Input
                    name={`allocations_${orders.indexOf(o)}_amount`}
                    className="w-36"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(o.unpaid / 100).toFixed(2)}
                    placeholder="分配金额"
                    value={alloc?.amount ?? ""}
                    onChange={(e) =>
                      updateAlloc(o.id, {
                        checked: e.target.value !== "",
                        amount: e.target.value,
                      })
                    }
                    disabled={!alloc?.checked}
                  />
                </div>
              );
            })}
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span>收款金额</span>
              <span className="tabular-nums">
                {formatYuan(amountCents || 0)} 元
              </span>
            </div>
            <div className="flex justify-between">
              <span>已分配（{checkedCount} 单）</span>
              <span className="tabular-nums">
                {formatYuan(allocTotalCents)} 元
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span>差额</span>
              <span
                className={`tabular-nums ${
                  balanced ? "text-green-600" : "text-destructive"
                }`}
              >
                {formatYuan(amountCents - allocTotalCents)} 元
                {balanced ? "（已平衡）" : ""}
              </span>
            </div>
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter>
          <SubmitButton disabled={!balanced} />
        </CardFooter>
      </form>
    </Card>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "保存中…" : "保存收款"}
    </Button>
  );
}
