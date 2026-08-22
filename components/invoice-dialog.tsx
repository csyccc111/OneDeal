"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createInvoiceAction } from "@/lib/actions/payment";

function todayInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function InvoiceDialog({
  orderId,
  orderNo,
  remainCents,
}: {
  orderId: number;
  orderNo: string;
  remainCents: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createInvoiceAction, {});
  const router = useRouter();
  // 受控金额：避免非受控 defaultValue 变化告警；打开时重置
  const [amount, setAmount] = useState((remainCents / 100).toFixed(2));

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  useEffect(() => {
    if (open) setAmount((remainCents / 100).toFixed(2));
  }, [open, remainCents]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FilePlus className="h-4 w-4" />
            新增开票
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增开票记录</DialogTitle>
          <DialogDescription>
            {orderNo} · 剩余可开金额{" "}
            {(remainCents / 100).toFixed(2)} 元
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-no">票号 *</Label>
              <Input
                id="invoice-no"
                name="invoiceNo"
                placeholder="如 FP-2026-001"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoice-amount">金额（元）*</Label>
                <Input
                  id="invoice-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-date">开票日期</Label>
                <Input
                  id="invoice-date"
                  name="invoiceDate"
                  type="date"
                  defaultValue={todayInputValue()}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-remark">备注（可选）</Label>
              <Input id="invoice-remark" name="remark" placeholder="可选" />
            </div>
          </div>
          {state.error && (
            <p className="mt-3 text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter className="mt-4">
            <InvoiceSubmit />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认"}
    </Button>
  );
}
