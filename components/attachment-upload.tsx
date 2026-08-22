"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ATTACHMENT_TYPES } from "@/lib/constants";

const MAX_SIZE = 20 * 1024 * 1024;

export function AttachmentUpload({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState("截图");

  async function uploadFile(file: File) {
    if (file.size > MAX_SIZE) {
      setError("文件不能超过 20MB");
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("orderId", String(orderId));
    fd.append("fileType", fileType);
    try {
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "上传失败，请重试");
        return;
      }
      router.refresh();
    } catch {
      setError("上传失败，请重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={fileType} onValueChange={(v) => setFileType(v ?? "截图")}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATTACHMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          nativeButton={false}
          render={
            <label className="cursor-pointer">
              <Upload className="mr-1 inline h-4 w-4" />
              {pending ? "上传中…" : "选择文件"}
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.dwg,.dxf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          }
        />

        {/* 手机拍照/相册直传 */}
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          nativeButton={false}
          render={
            <label className="cursor-pointer">
              <Camera className="mr-1 inline h-4 w-4" />
              拍照/相册
              <input
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          }
        />
      </div>

      {/* 拖拽上传区 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) uploadFile(f);
        }}
        className="flex cursor-pointer items-center justify-center rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/40"
      >
        或将文件拖到此处（≤ 20MB，图片/PDF/图纸）
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
