import { NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

function contentTypeFor(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

// GET /api/attachments/[id] —— 预览（inline）或 ?download=1 下载
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId)) {
    return NextResponse.json({ error: "附件 ID 无效" }, { status: 400 });
  }

  const att = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!att) {
    return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  }

  // 路径安全：只允许 uploads/ 下的相对路径
  const rel = att.filePath.replace(/\\/g, "/");
  if (!rel.startsWith("uploads/") || rel.includes("..")) {
    return NextResponse.json({ error: "路径无效" }, { status: 400 });
  }
  const abs = path.join(process.cwd(), rel);
  if (!abs.startsWith(UPLOAD_ROOT)) {
    return NextResponse.json({ error: "路径无效" }, { status: 400 });
  }

  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const ext = rel.split(".").pop() ?? "";
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`
    : "inline";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentTypeFor(ext),
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// DELETE /api/attachments/[id] —— 删除附件（磁盘 + 库记录）
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId)) {
    return NextResponse.json({ error: "附件 ID 无效" }, { status: 400 });
  }

  const att = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!att) {
    return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  }

  const rel = att.filePath.replace(/\\/g, "/");
  if (rel.startsWith("uploads/") && !rel.includes("..")) {
    try {
      await unlink(path.join(process.cwd(), rel));
    } catch {
      // 磁盘文件已不存在也继续删记录
    }
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/orders/${att.orderId}`);
  return NextResponse.json({ ok: true });
}
