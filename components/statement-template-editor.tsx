"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createTemplateAction,
  updateTemplateAction,
} from "@/lib/actions/statement-template";
import {
  COLUMN_DEFAULT_LABELS,
  STATEMENT_COLUMN_KEYS,
  type StatementColumn,
} from "@/lib/statement-columns";

type ColRow = {
  id: string; // 本地唯一
  key: StatementColumn["key"] | ""; // "" = 忽略该列（导入时未映射）
  label: string;
  visible: boolean;
  sourceLabel?: string; // 导入来源表头（展示用）
};

type EditorProps = {
  initial?: {
    id: number;
    name: string;
    title: string;
    terms: string | null;
    columns: StatementColumn[];
  };
};

let rowSeq = 0;
function nextRowId() {
  return `c${++rowSeq}-${Date.now()}`;
}

type ParseState = {
  busy: boolean;
  error?: string;
  info?: string;
  headerRow?: number;
  unmatched?: string[];
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : "保存预设"}
    </Button>
  );
}

export function StatementTemplateEditor({ initial }: EditorProps) {
  const action = initial ? updateTemplateAction : createTemplateAction;
  const [state, formAction] = useActionState(action, {});

  const [name, setName] = useState(initial?.name ?? "");
  const [title, setTitle] = useState(initial?.title ?? "对账单");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [cols, setCols] = useState<ColRow[]>(
    initial?.columns.map((c) => ({ id: nextRowId(), ...c })) ?? [],
  );
  const [parseState, setParseState] = useState<ParseState>({ busy: false });

  // 当前已用的 key（排除自身行，用于下拉禁用）
  const usedKeys = new Set(cols.filter((c) => c.key).map((c) => c.key));
  const firstFreeKey = STATEMENT_COLUMN_KEYS.find((k) => !usedKeys.has(k));

  const updateRow = (id: string, patch: Partial<ColRow>) =>
    setCols((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const moveRow = (index: number, dir: -1 | 1) =>
    setCols((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const addRow = () => {
    if (!firstFreeKey) return;
    const key = firstFreeKey;
    setCols((prev) => [
      ...prev,
      {
        id: nextRowId(),
        key,
        label: COLUMN_DEFAULT_LABELS[key],
        visible: true,
      },
    ]);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParseState({ busy: true });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/templates/parse", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        setParseState({
          busy: false,
          error: json?.error ?? "解析失败，请检查文件格式",
        });
        return;
      }
      // 应用解析结果：列按模板顺序（key 已自动匹配），未匹配列以空 key 列出
      const parsedCols: ColRow[] = [
        ...(json.columns ?? []).map((c: StatementColumn) => ({
          id: nextRowId(),
          key: c.key,
          label: c.label,
          visible: true,
          sourceLabel: c.label,
        })),
        ...((json.unmatchedHeaders ?? []) as string[]).map((h) => ({
          id: nextRowId(),
          key: "" as const,
          label: h,
          visible: false,
          sourceLabel: h,
        })),
      ];
      setCols(parsedCols);
      if (json.title) setTitle(json.title);
      if (json.terms) setTerms(json.terms);
      setParseState({
        busy: false,
        info: `已识别表头（第 ${json.headerRow} 行）：${parsedCols.length} 列`,
        headerRow: json.headerRow,
        unmatched: json.unmatchedHeaders ?? [],
      });
    } catch {
      setParseState({ busy: false, error: "解析失败，请重试" });
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{initial ? "编辑对账单预设" : "新建对账单预设"}</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-5">
          {initial && <input type="hidden" name="id" value={initial.id} />}

          {/* 基础信息 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">
                预设名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="如：兆力对账单格式"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">单据标题</Label>
              <Input
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="对账单"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="terms">条款 / 备注（显示在单据底部）</Label>
            <textarea
              id="terms"
              name="terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={2}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              placeholder="如：本单按月结算，账期 30 天。"
            />
          </div>

          {/* 导入模板 */}
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label className="text-sm">
              <Upload className="mr-1 inline h-4 w-4" />
              从客户提供的 Excel 模板生成列（.xlsx，自动识别表头并匹配字段）
            </Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {parseState.busy && (
              <p className="text-xs text-muted-foreground">正在解析…</p>
            )}
            {parseState.info && (
              <p className="text-xs text-emerald-600">{parseState.info}</p>
            )}
            {parseState.unmatched && parseState.unmatched.length > 0 && (
              <p className="text-xs text-muted-foreground">
                未匹配列（可保留为"忽略"或手动指定字段）：{parseState.unmatched.join("、")}
              </p>
            )}
            {parseState.error && (
              <p className="text-xs text-destructive">{parseState.error}</p>
            )}
          </div>

          {/* 列配置 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>列配置（顺序即单据列序）</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                disabled={!firstFreeKey}
              >
                <Plus className="h-4 w-4" />
                添加列
              </Button>
            </div>
            {cols.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                还没有列。点"添加列"手工配置，或上传客户模板自动生成。
              </p>
            )}
            <div className="space-y-2">
              {cols.map((row, i) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveRow(i, -1)}
                      disabled={i === 0}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label="上移"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(i, 1)}
                      disabled={i === cols.length - 1}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label="下移"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <select
                    value={row.key}
                    onChange={(e) => {
                      const key = e.target.value as ColRow["key"];
                      updateRow(row.id, {
                        key,
                        label:
                          key && !row.label.trim()
                            ? COLUMN_DEFAULT_LABELS[key]
                            : row.label,
                      });
                    }}
                    className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                    aria-label="字段"
                  >
                    <option value="">忽略</option>
                    {STATEMENT_COLUMN_KEYS.map((k) => (
                      <option
                        key={k}
                        value={k}
                        disabled={usedKeys.has(k) && row.key !== k}
                      >
                        {COLUMN_DEFAULT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateRow(row.id, { label: e.target.value })}
                    placeholder="列名"
                    className="h-9 min-w-32 flex-1 rounded-md border bg-transparent px-3 text-sm"
                  />
                  {row.sourceLabel && (
                    <span className="text-xs text-muted-foreground">
                      模板列：{row.sourceLabel}
                    </span>
                  )}
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={row.visible}
                      onChange={(e) =>
                        updateRow(row.id, { visible: e.target.checked })
                      }
                    />
                    显示
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCols((prev) => prev.filter((r) => r.id !== row.id))
                    }
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="删除列"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              隐藏的列不会出现在 Excel 与打印预览中；"忽略"列（仅导入时有）不保存。
            </p>
          </div>

          {/* 隐藏字段：随表单提交列配置 */}
          {cols.map((row, i) => (
            <div key={row.id} className="hidden">
              <input type="hidden" name={`columns_${i}_key`} value={row.key} />
              <input type="hidden" name={`columns_${i}_label`} value={row.label} />
              <input
                type="hidden"
                name={`columns_${i}_visible`}
                value={row.visible ? "1" : "0"}
              />
            </div>
          ))}

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <SubmitButton />
          <Button type="button" variant="ghost" onClick={() => history.back()}>
            返回
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
