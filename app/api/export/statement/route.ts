import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getStatementData,
  statementToExcel,
} from "@/lib/services/export";
import { getDefaultTemplate } from "@/lib/services/statement-template";

// POST /api/export/statement —— 导出对账单 xlsx（form 提交触发下载，统一默认预设）
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const customerId = Number(form.get("customerId") ?? 0);
  const month = String(form.get("month") ?? "");
  const basis = String(form.get("basis") ?? "created");

  if (!Number.isInteger(customerId) || customerId <= 0 || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const data = await getStatementData({ customerId, month, basis });
  if (!data) {
    return NextResponse.json({ error: "客户或月份无效" }, { status: 400 });
  }

  const template = await getDefaultTemplate();
  const buffer = statementToExcel(data, template.columns, template);
  const fileName = `${template.title}_${data.customer.name}_${month}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
