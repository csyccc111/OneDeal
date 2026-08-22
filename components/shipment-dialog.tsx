"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { PackagePlus, PackageMinus } from "lucide-react";
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
import { recordShipmentAction } from "@/lib/actions/shipment";

function todayInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ShipmentDialog({
  orderId,
  itemId,
  itemName,
  type,
  defaultQty,
}: {
  orderId: number;
  itemId: number;
  itemName: string;
  type: "发货" | "退货";
  defaultQty: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(recordShipmentAction, {});
  const router = useRouter();
  // 受控数量：避免非受控 Input 的 defaultValue 变化告警；打开时重置为当前可发量
  const [qty, setQty] = useState(String(defaultQty));

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  useEffect(() => {
    if (open) setQty(String(defaultQty));
  }, [open, defaultQty]);

  const isShip = type === "发货";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={isShip ? "default" : "destructive"}
            size="sm"
          >
            {isShip ? (
              <PackagePlus className="h-4 w-4" />
            ) : (
              <PackageMinus className="h-4 w-4" />
            )}
            {type}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>记录{type}</DialogTitle>
          <DialogDescription>
            「{itemName}」 · 最多可{type} {defaultQty} 件
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="type" value={type} />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`qty-${itemId}-${type}`}>数量</Label>
              <Input
                id={`qty-${itemId}-${type}`}
                name="qty"
                type="number"
                min={1}
                max={defaultQty}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`date-${itemId}-${type}`}>
                {type === "发货" ? "发货日期" : "退货日期"}
              </Label>
              <Input
                id={`date-${itemId}-${type}`}
                name="shippedAt"
                type="date"
                defaultValue={todayInputValue()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`note-${itemId}-${type}`}>备注（可选）</Label>
              <Input
                id={`note-${itemId}-${type}`}
                name="note"
                placeholder="如：物流单号、退货原因…"
              />
            </div>
          </div>
          {state.error && (
            <p className="mt-3 text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter className="mt-4">
            <ShipmentSubmit />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShipmentSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认"}
    </Button>
  );
}

