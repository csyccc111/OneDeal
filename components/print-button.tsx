"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// 打印 / 另存 PDF 按钮（预览页专用，打印时隐藏）
export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      打印 / 存为 PDF
    </Button>
  );
}
