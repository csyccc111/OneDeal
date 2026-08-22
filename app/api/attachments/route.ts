import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

// 从原始文件名取扩展名（白名单，防路径穿越）
function safeExt(fileName: string): string | null {
  const m = /\.([a-zA-Z0-9]{1,10})$/.exec(fileName);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (!/^(png|jpe?g|gif|webp|bmp|pdf|dwg|dxf)$/.test(ext)) return null;
  return ext;
}

// POST /api/attachments —— 上传附件（multipart: file, orderId, fileType）
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const orderId = Number(formData.get("orderId"));
  const fileType = String(formData.get("fileType") ?? "其他");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "未找到文件" }, { status: 400 });
  }
  if (!["截图", "图纸", "其他"].includes(fileType)) {
    return NextResponse.json({ error: "文件类型无效" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "文件为空" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "文件不能超过 20MB" }, { status: 400 });
  }
  const ext = safeExt(file.name);
  const isImage = /^image\//.test(file.type);
  const isPdf = file.type === "application/pdf";
  if (!ext || (!isImage && !isPdf && !["dwg", "dxf"].includes(ext))) {
    return NextResponse.json(
      { error: "仅支持图片、PDF、DWG/DXF 图纸" },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNo: true },
  });
  if (!order) {
    return NextResponse.json({ error: "订单不存在" }, { status: 400 });
  }

  const dir = path.join(UPLOAD_ROOT, order.orderNo);
  await mkdir(dir, { recursive: true });
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const relativePath = `uploads/${order.orderNo}/${storedName}`;

  await writeFile(path.join(dir, storedName), Buffer.from(await file.arrayBuffer()));

  await prisma.attachment.create({
    data: {
      orderId: order.id,
      fileName: file.name,
      filePath: relativePath,
      fileType,
    },
  });

  return NextResponse.json({ ok: true });
}
