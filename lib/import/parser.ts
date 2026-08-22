// Excel 批量导入核心逻辑（解析/归一化/校验/合并），与 Next.js 解耦可单测
import * as XLSX from "xlsx-js-style";
import { yuanToCents, yuanToMills, lineAmountCents } from "@/lib/money";

export type ImportField =
  | "customer"
  | "date"
  | "product"
  | "code"
  | "spec"
  | "qty"
  | "unit"
  | "price"
  | "paid"
  | "remark"
  | "customerOrderNo";

// colIndex → 字段（未映射的列忽略）
export type ColumnMapping = Record<number, ImportField>;

export type FailedRow = { excelRow: number; reason: string };

export type ParsedRow = {
  excelRow: number; // Excel 行号（1 起，含表头）
  customerNorm: string;
  date: Date;
  product: string;
  code: string | null; // 物料编号（可空）
  spec: string | null;
  qty: number;
  unit: string;
  priceMills: number; // 单价（厘，1元=1000厘，支持3位小数）
  amountCents: number;
  paidCents: number;
  remark: string | null;
  customerOrderNo: string | null; // 客户订单号（可空）
};

// 名称归一化：去首尾空格、全角→半角
export function normalizeName(s: string): string {
  return s
    .replace(/\u3000/g, " ")
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .trim();
}

// 解析 Excel/CSV buffer → 二维字符串数组（首行为表头）
export function parseWorkbook(
  buffer: ArrayBuffer | Uint8Array,
): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  return rows.map((r) =>
    r.map((cell) => {
      if (cell instanceof Date) {
        const y = cell.getFullYear();
        const m = String(cell.getMonth() + 1).padStart(2, "0");
        const d = String(cell.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return String(cell ?? "").trim();
    }),
  );
}

export function parseDate(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(
    /^(\d{4})[\\/年\\.-](\d{1,2})[\\/月\\.-](\d{1,2})日?$/,
  );
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 按映射解析所有数据行（跳过表头），返回有效行与失败行
export function parseImportRows(
  rows: string[][],
  mapping: ColumnMapping,
): { items: ParsedRow[]; failed: FailedRow[] } {
  const items: ParsedRow[] = [];
  const failed: FailedRow[] = [];

  // colIndex → 字段
  const colToField = new Map<number, ImportField>();
  for (const [idx, field] of Object.entries(mapping)) {
    colToField.set(Number(idx), field);
  }

  const get = (row: string[], field: ImportField): string => {
    for (const [idx, f] of colToField) {
      if (f === field) return row[idx] ?? "";
    }
    return "";
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = i + 1;
    const isEmpty = row.every((c) => !String(c).trim());
    if (isEmpty) continue;

    const customerRaw = get(row, "customer");
    const product = get(row, "product");
    if (!customerRaw) {
      failed.push({ excelRow, reason: "客户名称为空" });
      continue;
    }
    if (!product) {
      failed.push({ excelRow, reason: "品名为空" });
      continue;
    }

    const date = parseDate(get(row, "date"));
    if (get(row, "date") && !date) {
      failed.push({ excelRow, reason: `订单日期无效：${get(row, "date")}` });
      continue;
    }

    const qtyRaw = get(row, "qty");
    const qty = Number(qtyRaw);
    if (!qtyRaw || !Number.isInteger(qty) || qty < 1) {
      failed.push({ excelRow, reason: `数量无效：${qtyRaw || "（空）"}` });
      continue;
    }

    const priceMills = (() => {
      const raw = get(row, "price");
      if (!raw) return 0;
      const m = yuanToMills(raw);
      if (m === null) {
        failed.push({ excelRow, reason: `单价无效：${raw}` });
        return null;
      }
      return m;
    })();
    if (priceMills === null) continue;

    const paidCents = (() => {
      const raw = get(row, "paid");
      if (!raw) return 0;
      const c = yuanToCents(raw);
      if (c === null || c < 0) {
        failed.push({ excelRow, reason: `已收金额无效：${raw}` });
        return null;
      }
      return c;
    })();
    if (paidCents === null) continue;

    items.push({
      excelRow,
      customerNorm: normalizeName(customerRaw),
      date: date ?? new Date(),
      product,
      code: get(row, "code") || null,
      spec: get(row, "spec") || null,
      qty,
      unit: get(row, "unit") || "件",
      priceMills,
      amountCents: lineAmountCents(qty, priceMills),
      paidCents,
      remark: get(row, "remark") || null,
      customerOrderNo: get(row, "customerOrderNo") || null,
    });
  }
  return { items, failed };
}

export type OrderDraft = {
  customerNorm: string;
  date: Date;
  totalCents: number;
  paidCents: number;
  customerOrderNo: string | null;
  items: {
    product: string;
    code: string | null;
    spec: string | null;
    unit: string;
    qty: number;
    priceMills: number;
    amountCents: number;
    remark: string | null;
  }[];
};

// 同客户（+同日期）行合并为订单；已收汇总到订单，差额成为未收
export function groupIntoOrders(
  items: ParsedRow[],
  mergeByDate: boolean,
): OrderDraft[] {
  const groups = new Map<string, OrderDraft>();
  for (const it of items) {
    const key = mergeByDate
      ? `${it.customerNorm}|${it.date.toISOString()}`
      : it.customerNorm;
    const g = groups.get(key) ?? {
      customerNorm: it.customerNorm,
      date: it.date,
      totalCents: 0,
      paidCents: 0,
      customerOrderNo: it.customerOrderNo,
      items: [],
    };
    // 组内取第一个非空客户订单号
    if (!g.customerOrderNo && it.customerOrderNo) {
      g.customerOrderNo = it.customerOrderNo;
    }
    g.items.push({
      product: it.product,
      code: it.code,
      spec: it.spec,
      unit: it.unit,
      qty: it.qty,
      priceMills: it.priceMills,
      amountCents: it.amountCents,
      remark: it.remark,
    });
    g.totalCents += it.amountCents;
    g.paidCents += it.paidCents;
    groups.set(key, g);
  }
  return [...groups.values()];
}
