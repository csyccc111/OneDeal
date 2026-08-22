import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listStatementTemplates } from "@/lib/services/statement-template";

// 对账单预设：P16 调整后所有客户统一使用默认预设，这里用于调整默认预设的标题/条款/列配置
export default async function TemplatesPage() {
  const templates = await listStatementTemplates();
  const def = templates.find((t) => t.isDefault) ?? templates[0];

  if (!def) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">对账单格式</h1>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          未找到默认对账单格式，请联系管理员
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">对账单格式</h1>
        <Link href={`/templates/${def.id}/edit`}>
          <Button>
            <FileText className="h-4 w-4" />
            编辑默认格式
          </Button>
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        所有客户统一使用同一种对账单格式。可调整单据标题、底部条款与列配置
        （列序、列名、显隐）。调整后立即生效于导出 Excel 与打印预览。
      </p>

      <div className="space-y-2">
        <div
          key={def.id}
          className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3"
        >
          <div className="min-w-40 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">{def.name}</span>
              <Badge variant="secondary">默认</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              标题：{def.title}
              {def.terms ? ` · 条款：${def.terms.slice(0, 24)}${def.terms.length > 24 ? "…" : ""}` : ""}
              {" · "}
              列：{def.columns.map((c) => c.label).join("、")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
