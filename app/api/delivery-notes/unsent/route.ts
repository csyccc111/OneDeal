import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { unsentOrderItems } from "@/lib/services/delivery-note";

// GET /api/delivery-notes/unsent?customerId=N —— 该客户未发完的订单行（供新建送货单勾选）
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const customerId = Number(url.searchParams.get("customerId") ?? 0);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const items = await unsentOrderItems(customerId);
  return NextResponse.json({ items });
}
