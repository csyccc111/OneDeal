import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { incrementPrintedCount } from "@/lib/services/delivery-note";

// POST /api/delivery-notes/[id]/print —— 打印计数 +1
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isInteger(noteId) || noteId <= 0) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  try {
    await incrementPrintedCount(noteId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "记录失败" }, { status: 500 });
  }
}
