"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackupButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBackup() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/backup", { method: "GET" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "备份失败");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const filename = m ? decodeURIComponent(m[1]) : "onedeal-backup.zip";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("备份失败，请重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleBackup} disabled={pending}>
        <Download className="h-4 w-4" />
        {pending ? "打包中…" : "一键备份下载"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
