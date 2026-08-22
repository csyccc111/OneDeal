"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// 打印按钮：先异步记录打印次数，再调起浏览器打印
export function PrintButton({ noteId }: { noteId: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const printedRef = useRef(false);

  async function handlePrint() {
    if (busy) return;
    setBusy(true);
    try {
      if (!printedRef.current) {
        printedRef.current = true;
        await fetch(`/api/delivery-notes/${noteId}/print`, { method: "POST" }).catch(() => {});
        router.refresh();
      }
    } finally {
      setBusy(false);
      window.print();
    }
  }

  return (
    <Button type="button" onClick={handlePrint} disabled={busy}>
      <Printer className="h-4 w-4" />
      {busy ? "准备中…" : "打印"}
    </Button>
  );
}
