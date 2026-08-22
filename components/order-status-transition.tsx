"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
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
import { transitionOrderAction } from "@/lib/actions/order";

export function OrderStatusTransition({
  orderId,
  currentStatus,
  nextStatus,
}: {
  orderId: number;
  currentStatus: string;
  nextStatus: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(transitionOrderAction, {});
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
          <Button>
            <ArrowRight className="h-4 w-4" />
            流转到「{nextStatus}」
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>状态流转</DialogTitle>
          <DialogDescription>
            「{currentStatus}」→「{nextStatus}」，确认后不可回退
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="toStatus" value={nextStatus} />
          <div className="space-y-2">
            <Label htmlFor="transition-note">备注（可选）</Label>
            <Input
              id="transition-note"
              name="note"
              placeholder="如：已排产、客户要求加急…"
            />
          </div>
          {state.error && (
            <p className="mt-3 text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter className="mt-4">
            <TransitionSubmitButton />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransitionSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认流转"}
    </Button>
  );
}
