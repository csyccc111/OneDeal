import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { auth } from "@/auth";

const DATA_FILE = path.join(process.cwd(), "data", "onedeal.db");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// GET /api/backup —— 一键备份：打包 data/ + uploads/ 为 zip 下载
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const zip = new AdmZip();

  // 数据库
  try {
    zip.addLocalFile(DATA_FILE, "data");
  } catch {
    return NextResponse.json({ error: "数据库文件不存在" }, { status: 500 });
  }

  // 附件目录（递归）
  try {
    zip.addLocalFolder(UPLOADS_DIR, "uploads");
  } catch {
    // uploads 目录不存在则跳过
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `onedeal-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;

  const buffer = zip.toBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
