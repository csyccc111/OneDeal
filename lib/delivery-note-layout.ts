// 送货单打印列宽自动计算（方案B）：窄列固定 + 弹性列按内容自动分配
// 纯函数模块（无服务端依赖、无 prisma/xlsx import），可单测
// 背景：10 列宽度写死时长内容换行多；本模块按当单实际内容估算字符宽度，
//       把弹性列宽度按比例分配，内容长的列自动变宽，减少换行。

export interface DnLayoutItem {
  customerOrderNo?: string | null;
  itemCode?: string | null;
  product: string;
  spec?: string | null;
  unit?: string | null;
  note?: string | null;
}

export interface DnColumnWidths {
  seq: number;
  order: number;
  code: number;
  product: number;
  spec: number;
  unit: number;
  qty: number;
  price: number;
  amount: number;
  note: number;
}

/** 估算字符串显示宽度：中文/全角字符 = 2 单位，ASCII/半角 = 1 单位 */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[^\x00-\xff]/.test(ch) ? 2 : 1;
  }
  return w;
}

// 固定列（内容短、对齐稳定，不参与分配）：序号/单位/数量/单价/金额
const FIXED_WIDTHS = { seq: 5, unit: 5, qty: 7, price: 8, amount: 9 } as const;
const ELASTIC_TOTAL = 66; // 弹性列合计百分比（100 - 固定列 34）
const MIN_PCT = 6; // 弹性列最小百分比（防止塌成一条缝）
const MIN_UNITS = 6; // 弹性列需求宽度下限（单位，≈3 个汉字）

// 表头文本宽度（列需求宽度取 max(表头, 内容)）
const HEADER_UNITS = {
  order: textWidth("客户订单号"),
  code: textWidth("物料编号"),
  product: textWidth("产品名称"),
  spec: textWidth("规格"),
  note: textWidth("备注"),
} as const;

type ElasticKey = keyof typeof HEADER_UNITS;

export function computeDnColumnWidths(items: DnLayoutItem[]): DnColumnWidths {
  // 1. 各弹性列需求宽度 = max(表头宽度, 所有行内容最大宽度, 下限)
  const needs: Record<ElasticKey, number> = { ...HEADER_UNITS };
  for (const it of items) {
    if (it.customerOrderNo) needs.order = Math.max(needs.order, textWidth(it.customerOrderNo));
    if (it.itemCode) needs.code = Math.max(needs.code, textWidth(it.itemCode));
    needs.product = Math.max(needs.product, textWidth(it.product));
    if (it.spec) needs.spec = Math.max(needs.spec, textWidth(it.spec));
    if (it.note) needs.note = Math.max(needs.note, textWidth(it.note));
  }
  const keys: ElasticKey[] = ["order", "code", "product", "spec", "note"];
  for (const k of keys) needs[k] = Math.max(needs[k], MIN_UNITS);

  // 2. 按需求宽度比例分配弹性宽度
  const total = keys.reduce((s, k) => s + needs[k], 0);
  const raw = {} as Record<ElasticKey, number>;
  for (const k of keys) raw[k] = (ELASTIC_TOTAL * needs[k]) / total;

  // 3. 最小百分比保护：低于 6% 的列提到 6%，差额按比例从其余列扣回（最多一轮）
  let under = 0;
  for (const k of keys) {
    if (raw[k] < MIN_PCT) {
      under += MIN_PCT - raw[k];
      raw[k] = MIN_PCT;
    }
  }
  if (under > 0) {
    const pool = keys.reduce((s, k) => s + (raw[k] > MIN_PCT ? raw[k] : 0), 0);
    if (pool > 0) {
      for (const k of keys) {
        if (raw[k] > MIN_PCT) raw[k] -= under * (raw[k] / pool);
      }
    }
  }

  // 4. 取整（保留 1 位小数），note 吸收舍入误差，保证弹性列总和恰为 66
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const order = round1(raw.order);
  const code = round1(raw.code);
  const product = round1(raw.product);
  const spec = round1(raw.spec);
  let note = round1(ELASTIC_TOTAL - order - code - product - spec);

  // 极端场景兜底：note 被舍入成负/过小（其他列需求极大时），钳制 0.5 并从最大列扣回
  if (note < 0.5) {
    const deficit = 0.5 - note;
    note = 0.5;
    const big: Record<ElasticKey, number> = { order, code, product, spec, note };
    const bigKey = (keys as ElasticKey[]).reduce((a, b) => (big[a] >= big[b] ? a : b));
    const fix = Math.max(0, round1(big[bigKey] - deficit));
    if (bigKey === "order") return { ...FIXED_WIDTHS, order: fix, code, product, spec, note };
    if (bigKey === "code") return { ...FIXED_WIDTHS, order, code: fix, product, spec, note };
    if (bigKey === "product") return { ...FIXED_WIDTHS, order, code, product: fix, spec, note };
    if (bigKey === "spec") return { ...FIXED_WIDTHS, order, code, product, spec: fix, note };
  }

  return { ...FIXED_WIDTHS, order, code, product, spec, note };
}
