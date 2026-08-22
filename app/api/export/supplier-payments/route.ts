import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSupplierPaymentsExportData,
  supplierPaymentsToExcel,
} from "@/lib/services/export";

// POST /api/export/supplier-payments —— 导出供应商货款记录 xlsx（form 提交触发下载）
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const supplierId = Number(form.get("supplierId") ?? 0) || undefined;
  const from = String(form.get("from") ?? "").trim() || undefined;
  const to = String(form.get("to") ?? "").trim() || undefined;

  const data = await getSupplierPaymentsExportData({ supplierId, from, to });
  if (!data) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const buffer = supplierPaymentsToExcel(data);
  const suffix = `${data.from === "全部" ? "全部" : data.from.replaceAll("-", "")}-${data.to === "至今" ? "至今" : data.to.replaceAll("-", "")}`;
  const fileName = `供应商货款_${data.supplier ? data.supplier.name : "全部"}_${suffix}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
