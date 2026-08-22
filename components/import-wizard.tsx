"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileUp, ArrowRight, ArrowLeft, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { normalizeName } from "@/lib/import/parser";
import type { ImportField } from "@/lib/import/parser";
import type { ImportResult } from "@/lib/import/runner";

const FIELDS: { value: ImportField | ""; label: string }[] = [
  { value: "", label: "忽略此列" },
  { value: "customer", label: "客户名称 *" },
  { value: "customerOrderNo", label: "客户订单号" },
  { value: "date", label: "订单日期" },
  { value: "product", label: "品名 *" },
  { value: "code", label: "物料编号" },
  { value: "spec", label: "规格/图号" },
  { value: "qty", label: "数量 *" },
  { value: "unit", label: "单位" },
  { value: "price", label: "单价(元)" },
  { value: "paid", label: "已收金额(元)" },
  { value: "remark", label: "备注" },
];

const FIELD_KEYWORDS: [ImportField, RegExp][] = [
  ["customerOrderNo", /客户订单|客户单号|对方单号/],
  ["customer", /客户|单位|公司/],
  ["date", /日期|时间/],
  ["product", /品名|名称|产品|物料|货名/],
  ["code", /物料编号|编码|编号/],
  ["spec", /规格|图号|型号/],
  ["qty", /数量|个数/],
  ["unit", /单位/],
  ["price", /单价|价格/],
  ["paid", /已收|收款|回款/],
  ["remark", /备注|说明/],
];

// 根据表头文字自动猜测列映射
function guessMapping(headers: string[]): Record<number, ImportField> {
  const used = new Set<ImportField>();
  const mapping: Record<number, ImportField> = {};
  headers.forEach((h, i) => {
    const plain = h.replace(/^[A-Z]+ · /, "");
    for (const [field, re] of FIELD_KEYWORDS) {
      if (!used.has(field) && re.test(plain)) {
        mapping[i] = field;
        used.add(field);
        break;
      }
    }
  });
  return mapping;
}

type FileState = {
  fileId: string;
  fileName: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  mapping: Record<number, ImportField>;
};

export function ImportWizard({ customers }: { customers: { name: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [mergeByDate, setMergeByDate] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const existingNames = useMemo(
    () => new Set(customers.map((c) => normalizeName(c.name))),
    [customers],
  );

  // 确认步骤：待新建客户列表
  const toCreateCustomers = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      const col = Object.entries(f.mapping).find(([, v]) => v === "customer")?.[0];
      if (col == null) continue;
      const idx = Number(col);
      for (let i = 1; i < f.rows.length; i++) {
        const name = normalizeName(f.rows[i][idx] ?? "");
        if (name) set.add(name);
      }
    }
    return [...set].filter((n) => !existingNames.has(n)).sort();
  }, [files, existingNames]);

  const mappingComplete = files.every(
    (f) =>
      Object.values(f.mapping).includes("customer") &&
      Object.values(f.mapping).includes("product"),
  );

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    for (const file of Array.from(fileList)) fd.append("files", file);
    try {
      const res = await fetch("/api/import/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "上传失败");
        return;
      }
      setSessionId(data.sessionId);
      setFiles(
        (data.files ?? []).map((f: { fileId: string; fileName: string; headers: string[]; rows: string[][]; rowCount: number }) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          headers: f.headers,
          rows: f.rows,
          rowCount: f.rowCount,
          mapping: guessMapping(f.headers),
        })),
      );
      setStep(2);
    } catch {
      setError("上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  function updateMapping(fileId: string, colIndex: number, field: ImportField | "") {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.fileId !== fileId) return f;
        const mapping = { ...f.mapping };
        if (field) mapping[colIndex] = field;
        else delete mapping[colIndex];
        return { ...f, mapping };
      }),
    );
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/import/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          mergeByDate,
          files: files.map((f) => ({
            fileId: f.fileId,
            fileName: f.fileName,
            mapping: f.mapping,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "导入失败");
        return;
      }
      setResult(data);
      setStep(4);
      router.refresh();
    } catch {
      setError("导入失败，请重试");
    } finally {
      setRunning(false);
    }
  }

  function downloadFailed() {
    if (!result) return;
    const csv =
      "\ufeff文件,行号,原因\n" +
      result.failed
        .map((f) => `"${f.fileName}",${f.excelRow},"${f.reason}"`)
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "导入失败清单.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">历史数据导入</h1>

      {/* 步骤指示 */}
      <div className="flex gap-2 text-sm text-muted-foreground">
        {["上传文件", "列映射", "确认", "结果"].map((s, i) => (
          <span key={s} className={i + 1 === step ? "font-semibold text-foreground" : ""}>
            {i > 0 && " → "}
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 步骤 1：上传 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">选择历史表格（支持多文件）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-muted-foreground hover:bg-muted/40">
              <Upload className="h-8 w-8" />
              <span className="text-sm">
                {uploading ? "解析中…" : "点击选择 .xlsx / .xls / .csv 文件"}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                multiple
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              每行一条明细；同一客户+同一天的多行会自动合并为一个订单的多行。列映射在下一步配置。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 步骤 2：列映射 */}
      {step === 2 && (
        <div className="space-y-4">
          {files.map((f) => (
            <Card key={f.fileId}>
              <CardHeader>
                <CardTitle className="text-base">
                  {f.fileName}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {f.rowCount} 行数据
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  表头：{f.headers.join(" | ")}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {f.headers.map((h, colIndex) => (
                    <div key={colIndex} className="space-y-1">
                      <Label className="text-xs">{h}</Label>
                      <Select
                        value={f.mapping[colIndex] ?? ""}
                        onValueChange={(v) =>
                          updateMapping(
                            f.fileId,
                            colIndex,
                            (v ?? "") as ImportField | "",
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELDS.map((field) => (
                            <SelectItem key={field.value || "none"} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
            <Button onClick={() => setStep(3)} disabled={!mappingComplete}>
              下一步：确认
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {!mappingComplete && (
            <p className="text-sm text-destructive">
              每个文件都需要映射「客户名称」和「品名」列
            </p>
          )}
        </div>
      )}

      {/* 步骤 3：确认 */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">确认导入</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>合并方式（同一客户/日期多行如何合并）</Label>
              <Select value={mergeByDate ? "customer_date" : "customer"} onValueChange={(v) => setMergeByDate(v === "customer_date")}>
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_date">按客户 + 订单日期合并</SelectItem>
                  <SelectItem value="customer">仅按客户合并（全部行一个订单）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <p>
                将导入 <span className="font-semibold">{files.reduce((s, f) => s + f.rowCount, 0)}</span> 行明细。
                未收金额 &gt; 0 的订单置为「已发货」，已收齐的置为「已结算」；已收金额自动生成收款记录。
              </p>
              <p className="mt-1">
                待新建客户：
                {toCreateCustomers.length === 0 ? (
                  <span className="text-muted-foreground"> 无（全部匹配已有客户）</span>
                ) : (
                  <span className="font-medium">{toCreateCustomers.join("、")}</span>
                )}
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" />
                返回
              </Button>
              <Button onClick={handleRun} disabled={running}>
                {running ? "导入中…" : "开始导入"}
                <FileUp className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 步骤 4：结果 */}
      {step === 4 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-4 w-4 text-green-600" />
              导入完成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">新建订单</p>
                <p className="text-lg font-semibold">{result.orderCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">明细行数</p>
                <p className="text-lg font-semibold">{result.itemCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">新建客户</p>
                <p className="text-lg font-semibold">{result.customerCreated}</p>
              </div>
            </div>

            {result.failed.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-destructive">
                    失败 {result.failed.length} 行：
                  </p>
                  <Button variant="outline" size="sm" onClick={downloadFailed}>
                    <Download className="h-4 w-4" />
                    下载失败清单
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">文件</th>
                        <th className="px-3 py-2 text-left font-medium">行号</th>
                        <th className="px-3 py-2 text-left font-medium">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed.map((f, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5">{f.fileName}</td>
                          <td className="px-3 py-1.5">{f.excelRow}</td>
                          <td className="px-3 py-1.5">{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-700">全部行导入成功 🎉</p>
            )}

            <div className="flex gap-2">
              <Button onClick={() => { setStep(1); setResult(null); setFiles([]); setSessionId(null); }}>
                继续导入
              </Button>
              <Button variant="outline" onClick={() => router.push("/orders")}>
                查看订单
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
