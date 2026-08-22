// 对账单预设服务（P16）：模板 CRUD、客户对账单模板解析、单据网格构建
// 与 Next.js 解耦可单测；Excel 生成与打印预览共用同一网格构建逻辑
// 列配置类型/常量见 lib/statement-columns.ts（纯函数，client 可安全引用）
import * as XLSX from "xlsx-js-style";
import { prisma } from "@/lib/prisma";
import { formatYuan, formatYuanMills } from "@/lib/money";
import { fmtDate, type StatementData } from "@/lib/services/export";
import {
  DEFAULT_COLUMNS,
  DEFAULT_COLUMNS_JSON,
  parseColumns,
  COLUMN_DEFAULT_WIDTHS,
  type StatementColumn,
  type StatementColumnKey,
} from "@/lib/statement-columns";

export {
  parseColumns,
  DEFAULT_COLUMNS,
  DEFAULT_COLUMNS_JSON,
  COLUMN_DEFAULT_WIDTHS,
  type StatementColumn,
  type StatementColumnKey,
} from "@/lib/statement-columns";

// ==================== 数据库操作 ====================

export type StatementTemplateRow = {
  id: number;
  name: string;
  title: string;
  terms: string | null;
  columns: StatementColumn[];
  isDefault: boolean;
  customerCount: number;
};

// 默认预设（无则兜底创建）
export async function getDefaultTemplate(): Promise<{
  id: number;
  name: string;
  title: string;
  terms: string | null;
  columns: StatementColumn[];
  isDefault: boolean;
}> {
  const found = await prisma.statementTemplate.findFirst({
    where: { isDefault: true },
  });
  if (found) {
    return {
      id: found.id,
      name: found.name,
      title: found.title,
      terms: found.terms,
      columns: parseColumns(found.columns) ?? DEFAULT_COLUMNS,
      isDefault: true,
    };
  }
  // 兜底创建（例如旧库升级后默认预设被误删）
  const created = await prisma.statementTemplate.create({
    data: {
      name: "默认预设",
      title: "对账单",
      terms: null,
      columns: DEFAULT_COLUMNS_JSON,
      isDefault: true,
    },
  });
  return {
    id: created.id,
    name: created.name,
    title: created.title,
    terms: created.terms,
    columns: DEFAULT_COLUMNS,
    isDefault: true,
  };
}

// 客户生效模板（P16 调整后：已取消客户绑定，所有客户统一使用默认预设）
// 此函数已废弃，保留 getDefaultTemplate 供预览/导出使用

// 预设列表（含绑定客户数）
export async function listStatementTemplates(): Promise<
  StatementTemplateRow[]
> {
  const rows = await prisma.statementTemplate.findMany({
    include: { _count: { select: { customers: true } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    title: r.title,
    terms: r.terms,
    columns: parseColumns(r.columns) ?? DEFAULT_COLUMNS,
    isDefault: r.isDefault,
    customerCount: r._count.customers,
  }));
}

export type StatementTemplateInput = {
  name: string;
  title: string;
  terms: string | null;
  columns: StatementColumn[];
};

export async function createStatementTemplate(
  input: StatementTemplateInput,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "预设名称不能为空" };
  if (name.length > 30) return { ok: false, error: "预设名称过长（≤30 字）" };
  const title = input.title.trim() || "对账单";
  const columns = parseColumns(JSON.stringify(input.columns));
  if (!columns) return { ok: false, error: "列配置无效：至少 1 列、字段不重复、列名非空" };
  try {
    const t = await prisma.statementTemplate.create({
      data: {
        name,
        title,
        terms: input.terms?.trim() || null,
        columns: JSON.stringify(columns),
        isDefault: false,
      },
    });
    return { ok: true, id: t.id };
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "P2002") {
      return { ok: false, error: "预设名称已存在" };
    }
    return { ok: false, error: "保存失败，请重试" };
  }
}

export async function updateStatementTemplate(
  id: number,
  input: StatementTemplateInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await prisma.statementTemplate.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "预设不存在" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "预设名称不能为空" };
  if (name.length > 30) return { ok: false, error: "预设名称过长（≤30 字）" };
  const title = input.title.trim() || "对账单";
  const columns = parseColumns(JSON.stringify(input.columns));
  if (!columns) return { ok: false, error: "列配置无效：至少 1 列、字段不重复、列名非空" };
  try {
    await prisma.statementTemplate.update({
      where: { id },
      data: {
        name,
        title,
        terms: input.terms?.trim() || null,
        columns: JSON.stringify(columns),
      },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "P2002") {
      return { ok: false, error: "预设名称已存在" };
    }
    return { ok: false, error: "保存失败，请重试" };
  }
}

// 删除：默认预设禁删；有客户绑定需先解绑
export async function deleteStatementTemplate(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await prisma.statementTemplate.findUnique({
    where: { id },
    include: { _count: { select: { customers: true } } },
  });
  if (!t) return { ok: false, error: "预设不存在" };
  if (t.isDefault) return { ok: false, error: "默认预设不允许删除" };
  if (t._count.customers > 0) {
    return {
      ok: false,
      error: `有 ${t._count.customers} 个客户正在使用该预设，请先在客户编辑页解除绑定`,
    };
  }
  await prisma.statementTemplate.delete({ where: { id } });
  return { ok: true };
}

// ==================== 客户对账单模板文件解析 ====================

// 表头关键词 → 标准字段（规则同 P7 导入器风格）
const HEADER_KEYWORD_RULES: { key: StatementColumnKey; keywords: string[] }[] = [
  { key: "seq", keywords: ["序号", "序號", "行号", "no."] },
  { key: "customerOrderNo", keywords: ["客户订单号", "客户单号", "对方单号", "客户订单"] },
  { key: "orderNo", keywords: ["订单号", "单号", "销售单号", "出货单号"] },
  { key: "deliveryNoteNo", keywords: ["送货单号", "发货单号", "出库单号", "送货单"] },
  { key: "orderDate", keywords: ["订单日期", "日期", "下单日期", "开单日期", "送货日期"] },
  { key: "product", keywords: ["品名", "产品名称", "产品", "名称", "货物名称", "货名", "物料名称"] },
  { key: "spec", keywords: ["规格", "型号", "规格型号", "物料规格"] },
  { key: "itemCode", keywords: ["物料编号", "物料编码", "物料代码", "编码", "代码", "图号", "料号"] },
  { key: "qty", keywords: ["数量", "订货数量"] },
  { key: "unit", keywords: ["单位"] },
  { key: "unitPrice", keywords: ["单价", "价格", "含税单价"] },
  { key: "amount", keywords: ["金额", "合计", "总价", "货款", "价税合计"] },
  { key: "note", keywords: ["备注", "说明"] },
];

// 去掉空格/换行后归一化表头文本
function normHeaderText(s: string): string {
  return s.replace(/\s+/g, "").replace(/[（(].*?[)）]/g, "").toLowerCase();
}

export type ParsedTemplateFile = {
  title: string;
  terms: string;
  columns: StatementColumn[]; // 按模板列顺序（全部 visible），label 取模板表头
  unmatchedHeaders: string[]; // 未匹配的表头（可忽略）
  headerRow: number; // 表头所在行号（1 起）
};

// 解析客户提供的对账单 Excel：定位表头行 → 列映射 → 提取标题/条款
export function parseStatementTemplateFile(
  buffer: ArrayBuffer | Uint8Array,
): ParsedTemplateFile | null {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return null;
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  if (rows.length === 0) return null;
  const grid: string[][] = rows.map((r) =>
    r.map((cell) => {
      if (cell instanceof Date) return fmtDate(cell);
      return String(cell ?? "").trim();
    }),
  );

  // 1) 前 20 行内找表头行：含"订单号/品名/数量/金额"等关键词密度最高的一行
  const scanEnd = Math.min(grid.length, 20);
  let headerRow = -1;
  let bestScore = 0;
  for (let i = 0; i < scanEnd; i++) {
    const row = grid[i];
    const cells = row.filter((c) => c !== "");
    if (cells.length < 2) continue;
    let score = 0;
    for (const cell of cells) {
      const t = normHeaderText(cell);
      for (const rule of HEADER_KEYWORD_RULES) {
        if (rule.keywords.some((k) => t.includes(k.toLowerCase()))) {
          score += rule.key === "orderNo" ? 2 : 1;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      headerRow = i;
    }
  }
  if (headerRow < 0) return null;

  // 2) 列映射：每列按关键词匹配标准字段
  const headerCells = grid[headerRow];
  const columns: StatementColumn[] = [];
  const unmatchedHeaders: string[] = [];
  const used = new Set<StatementColumnKey>();
  for (let ci = 0; ci < headerCells.length; ci++) {
    const raw = headerCells[ci];
    if (!raw) continue;
    const t = normHeaderText(raw);
    let matched: StatementColumnKey | null = null;
    for (const rule of HEADER_KEYWORD_RULES) {
      if (used.has(rule.key)) continue;
      if (rule.keywords.some((k) => t.includes(k.toLowerCase()))) {
        matched = rule.key;
        break;
      }
    }
    if (matched) {
      used.add(matched);
      columns.push({
        key: matched,
        label: raw,
        visible: true,
        width: COLUMN_DEFAULT_WIDTHS[matched],
      });
    } else {
      unmatchedHeaders.push(raw);
    }
  }
  if (columns.length === 0) return null;

  // 3) 标题：表头行上方最近的非空首单元格文本（跳过联系人/电话/传真/邮箱等联系信息行）
  let title = "对账单";
  const CONTACT_RE = /联系人|电话|传真|邮箱|地址|账号|开户|银行|邮编/;
  for (let i = headerRow - 1; i >= 0; i--) {
    const first = grid[i].find((c) => c !== "");
    if (!first) continue;
    if (CONTACT_RE.test(first)) continue; // 联系信息行跳过
    title = first.length > 30 ? first.slice(0, 30) : first;
    break;
  }

  // 4) 条款：表头行之后含 注/说明/约定/备注 关键词的行文本
  let terms = "";
  for (let i = headerRow + 1; i < grid.length; i++) {
    const text = grid[i].join(" ").trim();
    if (!text) continue;
    if (/注|说明|约定|条款|备注/.test(text) && text.length < 200) {
      terms = text;
      break;
    }
    if (terms === "" && text.length > 0) {
      // 记录首个非空行兜底？——不，只有关键词行才作为条款
    }
  }

  return { title, terms, columns, unmatchedHeaders, headerRow: headerRow + 1 };
}

// ==================== 单据网格构建（预览与 Excel 共用） ====================

export type GridCell = {
  v: string | number;
  bold?: boolean;
};

export type StatementGrid = {
  headers: string[];
  rows: GridCell[][]; // 订单行明细（展开）
  summaryRows: GridCell[][]; // 订单合计 / 收款合计 / 差额
  amountIndex: number; // 金额列索引（列配置中无 amount 时为 -1）
};

// 单元格取值（按标准字段 key；seq 由 buildStatementGrid 填充行号）
export function getCellValue(
  order: StatementData["orders"][number],
  item: StatementData["orders"][number]["items"][number],
  key: StatementColumnKey,
): string | number {
  switch (key) {
    case "seq":
      return ""; // 占位，buildStatementGrid 中填充
    case "orderNo":
      return order.orderNo;
    case "customerOrderNo":
      return order.customerOrderNo ?? "";
    case "deliveryNoteNo":
      return item.deliveryNoteNos.join("、");
    case "orderDate":
      return fmtDate(order.createdAt);
    case "product":
      return item.product;
    case "spec":
      return item.spec ?? "";
    case "itemCode":
      return item.itemCode ?? "";
    case "qty":
      return item.qty;
    case "unit":
      return item.unit;
    case "unitPrice":
      return Number(formatYuanMills(item.priceMills)) || 0;
    case "amount":
      return Number(formatYuan(item.amountCents));
    case "note":
      return item.note ?? "";
  }
}

// 按列配置构建对账单网格（订单行展开 + 表尾合计）
export function buildStatementGrid(
  data: StatementData,
  columns: StatementColumn[],
): StatementGrid {
  const visible = columns.filter((c) => c.visible);
  const headers = visible.map((c) => c.label);
  const amountIndex = visible.findIndex((c) => c.key === "amount");

  const rows: GridCell[][] = [];
  let seq = 0;
  for (const o of data.orders) {
    for (const it of o.items) {
      seq++;
      rows.push(
        visible.map((c) => ({
          v: c.key === "seq" ? seq : getCellValue(o, it, c.key),
          bold: c.key === "orderNo",
        })),
      );
    }
  }

  const summaryRows: GridCell[][] = [];
  const mkSummary = (label: string, amountCents: number): GridCell[] => {
    const row: GridCell[] = visible.map(() => ({ v: "" }));
    if (row.length > 0) row[0] = { v: label, bold: true };
    if (amountIndex >= 0) {
      row[amountIndex] = { v: Number(formatYuan(amountCents)), bold: true };
    }
    return row;
  };
  summaryRows.push(mkSummary("订单金额合计", data.orderTotalCents));
  summaryRows.push(mkSummary("收款合计", data.payTotalCents));
  summaryRows.push(mkSummary("差额（未收结转）", data.orderTotalCents - data.payTotalCents));

  return { headers, rows, summaryRows, amountIndex };
}
