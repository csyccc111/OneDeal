import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { auth } from "@/auth";
import { parseWorkbook } from "@/lib/import/parser";

const TMP_ROOT = path.join(process.cwd(), "data", "import-tmp");

function colLetter(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// POST /api/import/upload —— 上传历史表格（多文件），返回表头与预览行
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "请选择文件" }, { status: 400 });
  }

  const sessionId = crypto.randomUUID();
  const dir = path.join(TMP_ROOT, sessionId);
  await mkdir(dir, { recursive: true });

  const results: {
    fileId: string;
    fileName: string;
    headers: string[];
    rows: string[][];
    rowCount: number;
  }[] = [];

  for (const file of files) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      return NextResponse.json(
        { error: `「${file.name}」不是 Excel/CSV 文件` },
        { status: 400 },
      );
    }
    const fileId = crypto.randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, `${fileId}.bin`), buffer);

    const rows = parseWorkbook(buffer);
    results.push({
      fileId,
      fileName: file.name,
      headers: (rows[0] ?? []).map(
        (h, i) => `${colLetter(i)} · ${h || "（空表头）"}`,
      ),
      rows,
      rowCount: Math.max(0, rows.length - 1),
    });
  }

  return NextResponse.json({ sessionId, files: results });
}
