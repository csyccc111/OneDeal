"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteDeliveryNoteAction } from "@/lib/actions/delivery-note";

// 送货单删除按钮（确认后删除；快照数据，不影响订单/发货记录）—— 2026-08-19
export function DeleteDeliveryNoteButton({
  noteId,
  noteNo,
  printedCount,
}: {
  noteId: number;
  noteNo: string;
  printedCount: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    const printedTip =
      printedCount > 0 ? `（已打印 ${printedCount} 次）` : "";
    if (
      !confirm(
        `确定删除送货单 ${noteNo}${printedTip}？\n删除后不可恢复，订单与发货记录不受影响。`,
      )
    ) {
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("id", String(noteId));
    const res = await deleteDeliveryNoteAction(fd);
    setBusy(false);
    if (res.error) setError(res.error);
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button variant="outline" size="sm" onClick={handle} disabled={busy}>
        <Trash2 className="h-4 w-4" />
        删除
      </Button>
    </div>
  );
}
