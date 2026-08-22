import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getPaymentsExportData,
  paymentsToExcel,
} from "@/lib/services/export";

// POST /api/export/payments —— 导出收货款记录 xlsx（form 提交触发下载）
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const customerIdRaw = String(form.get("customerId") ?? "");
  const customerId = customerIdRaw ? Number(customerIdRaw) : undefined;
  const from = String(form.get("from") ?? "").trim() || undefined;
  const to = String(form.get("to") ?? "").trim() || undefined;

  const data = await getPaymentsExportData({ customerId, from, to });
  if (!data) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const buffer = paymentsToExcel(data);
  const who = data.customer ? data.customer.name : "全部客户";
  const range = from && to ? `${from}至${to}` : "全部日期";
  const fileName = `收货款记录_${who}_${range}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
