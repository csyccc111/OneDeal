"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { PackageX } from "lucide-react";
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
import { setDefectiveQtyAction } from "@/lib/actions/shipment";

export function DefectiveDialog({
  orderId,
  itemId,
  itemName,
  current,
}: {
  orderId: number;
  itemId: number;
  itemName: string;
  current: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(setDefectiveQtyAction, {});
  const router = useRouter();
  // 受控数量：避免非受控 defaultValue 变化告警；打开时重置
  const [qty, setQty] = useState(String(current));

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  useEffect(() => {
    if (open) setQty(String(current));
  }, [open, current]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
          >
            <PackageX className="h-4 w-4" />
            废品
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改废品数</DialogTitle>
          <DialogDescription>
            「{itemName}」 · 当前废品 {current} 件（记录报废，写变更日志）
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="itemId" value={itemId} />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`defective-${itemId}`}>废品数</Label>
              <Input
                id={`defective-${itemId}`}
                name="defectiveQty"
                type="number"
                min={0}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`defective-note-${itemId}`}>备注（可选）</Label>
              <Input
                id={`defective-note-${itemId}`}
                name="note"
                placeholder="如：加工报废、客户退回坏件…"
              />
            </div>
          </div>
          {state.error && (
            <p className="mt-3 text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter className="mt-4">
            <DefectiveSubmit />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DefectiveSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认"}
    </Button>
  );
}
