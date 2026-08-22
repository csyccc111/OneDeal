import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { newOrdersSince } from "@/lib/services/notification";

// GET /api/notifications/new-orders?since=<ISO> —— since 之后的新订单（通知轮询用）
// since 缺失时服务端兜底返回最近 60 分钟
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const sinceStr = searchParams.get("since");
  let since: Date;
  if (sinceStr) {
    const t = Date.parse(sinceStr);
    if (Number.isNaN(t)) {
      return NextResponse.json({ error: "since 无效" }, { status: 400 });
    }
    since = new Date(t);
  } else {
    since = new Date(Date.now() - 60 * 60 * 1000);
  }

  const orders = await newOrdersSince(since);
  return NextResponse.json({ orders });
}
