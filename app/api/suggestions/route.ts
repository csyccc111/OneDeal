import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

// P19 填写记忆：品名/规格/物料编号联想（OrderItem + PurchaseItem 聚合，无新表）
// GET /api/suggestions?field=product|spec|itemCode&q=xx
const FIELDS = ["product", "spec", "itemCode"] as const;
type Field = (typeof FIELDS)[number];

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const field = url.searchParams.get("field") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();

  // field 白名单（防注入：仅三个枚举值可拼接进 SQL）
  if (!(FIELDS as readonly string[]).includes(field)) {
    return NextResponse.json({ error: "field 无效" }, { status: 400 });
  }
  if (q.length > 50) {
    return NextResponse.json({ error: "q 过长" }, { status: 400 });
  }
  const f = field as Field;

  const col = Prisma.raw(`"${f}"`);
  const qFilter = q
    ? Prisma.sql`AND ${col} LIKE '%' || ${q} || '%'`
    : Prisma.empty;
  const limit = q ? 20 : 10;

  // itemCode 仅订单表有（采购单行无该字段）
  const second = Prisma.sql`
    UNION ALL
    SELECT ${col} AS v, COUNT(*) AS cnt, MAX("PurchaseOrder"."updatedAt") AS last
      FROM "PurchaseItem"
      JOIN "PurchaseOrder" ON "PurchaseOrder"."id" = "PurchaseItem"."poId"
      WHERE ${col} IS NOT NULL AND ${col} != '' ${qFilter}
      GROUP BY ${col}
  `;

  const rows = await prisma.$queryRaw<{ v: string }[]>(Prisma.sql`
    SELECT v FROM (
      SELECT ${col} AS v, COUNT(*) AS cnt, MAX("Order"."updatedAt") AS last
        FROM "OrderItem"
        JOIN "Order" ON "Order"."id" = "OrderItem"."orderId"
        WHERE ${col} IS NOT NULL AND ${col} != '' ${qFilter}
        GROUP BY ${col}
      ${f === "itemCode" ? Prisma.empty : second}
    )
    GROUP BY v
    ORDER BY SUM(cnt) DESC, MAX(last) DESC, v ASC
    LIMIT ${limit}
  `);

  return NextResponse.json({ items: rows.map((r) => r.v) });
}
