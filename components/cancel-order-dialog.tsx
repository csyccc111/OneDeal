"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelOrderAction } from "@/lib/actions/order";

export function CancelOrderDialog({
  orderId,
  orderNo,
}: {
  orderId: number;
  orderNo: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(cancelOrderAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" className="text-base">
            <Ban className="h-4 w-4" />
            作废订单
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>作废订单 {orderNo}</DialogTitle>
          <DialogDescription>
            作废后订单从台账隐藏，数据留痕保留。此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">
              作废原因 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              name="reason"
              placeholder="如：客户取消订单、下错单、改单重做…"
              required
            />
          </div>
          {state.error && (
            <p className="mt-3 text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter className="mt-4">
            <CancelSubmit />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "提交中…" : "确认作废"}
    </Button>
  );
}
