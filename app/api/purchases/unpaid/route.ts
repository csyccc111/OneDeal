import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { unpaidPurchaseOrders } from "@/lib/services/purchase";

// GET /api/purchases/unpaid?supplierId=N —— 未结清采购单（供新建付款表单）
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const supplierId = Number(url.searchParams.get("supplierId") ?? 0);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const orders = await unpaidPurchaseOrders(supplierId);
  return NextResponse.json({ orders });
}
