import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseStatementTemplateFile } from "@/lib/services/statement-template";

// POST /api/templates/parse —— 解析客户对账单 Excel 模板（鉴权）
// form: file → { title, terms, columns, unmatchedHeaders, headerRow }
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择 .xlsx 文件" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseStatementTemplateFile(buffer);
  if (!parsed) {
    return NextResponse.json(
      { error: "解析失败：未在表格前 20 行内识别到表头（需包含 订单号/品名/数量/金额 等关键词）" },
      { status: 400 },
    );
  }
  return NextResponse.json(parsed);
}
