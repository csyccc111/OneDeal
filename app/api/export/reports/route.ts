import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getReportExportData,
  reportToExcel,
} from "@/lib/services/report-export";

// POST /api/export/reports —— 导出统计报表 xlsx（三 Sheet：月度趋势/欠款排行/客户年累计）
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const yearRaw = String(form.get("year") ?? "").trim();
  if (!/^\d{4}$/.test(yearRaw)) {
    return NextResponse.json({ error: "年份无效" }, { status: 400 });
  }
  const year = Number(yearRaw);

  const data = await getReportExportData(year);
  const buffer = reportToExcel(data);
  const fileName = `onedeal-报表-${year}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
