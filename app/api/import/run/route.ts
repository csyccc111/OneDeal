import { NextResponse } from "next/server";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { runImport } from "@/lib/import/runner";
import type { ColumnMapping } from "@/lib/import/parser";

const TMP_ROOT = path.join(process.cwd(), "data", "import-tmp");

// POST /api/import/run —— 按列映射执行导入，完成后清理临时文件
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: {
    sessionId?: string;
    mergeByDate?: boolean;
    files?: { fileId: string; fileName: string; mapping: ColumnMapping }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const sessionId = body.sessionId ?? "";
  const files = body.files ?? [];
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) {
    return NextResponse.json({ error: "会话无效" }, { status: 400 });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "没有可导入的文件" }, { status: 400 });
  }

  const dir = path.join(TMP_ROOT, sessionId);
  const inputs: { fileName: string; buffer: Buffer; mapping: ColumnMapping }[] =
    [];
  for (const f of files) {
    if (!/^[0-9a-f-]{36}$/.test(f.fileId)) {
      return NextResponse.json({ error: "文件标识无效" }, { status: 400 });
    }
    try {
      const buffer = await readFile(path.join(dir, `${f.fileId}.bin`));
      inputs.push({ fileName: f.fileName, buffer, mapping: f.mapping });
    } catch {
      return NextResponse.json(
        { error: `文件 ${f.fileName} 已失效，请重新上传` },
        { status: 400 },
      );
    }
  }

  try {
    const result = await runImport({
      files: inputs,
      mergeByDate: body.mergeByDate !== false,
    });
    return NextResponse.json(result);
  } finally {
    // 无论成败都清理临时目录
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
