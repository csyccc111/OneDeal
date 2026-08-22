// 对账单预设（P16）：列配置类型与纯函数（无服务端依赖，可被 client 组件安全引用）

export const STATEMENT_COLUMN_KEYS = [
  "seq",
  "orderNo",
  "customerOrderNo",
  "deliveryNoteNo",
  "orderDate",
  "product",
  "spec",
  "itemCode",
  "qty",
  "unit",
  "unitPrice",
  "amount",
  "note",
] as const;
export type StatementColumnKey = (typeof STATEMENT_COLUMN_KEYS)[number];

export type StatementColumn = {
  key: StatementColumnKey;
  label: string; // 列名（可自定义）
  visible: boolean; // 是否显示
  width?: number; // 列宽（Excel 字符宽，可空=自动估算）
};

// 各标准字段的默认列名
export const COLUMN_DEFAULT_LABELS: Record<StatementColumnKey, string> = {
  seq: "序号",
  orderNo: "订单号",
  customerOrderNo: "客户订单号",
  deliveryNoteNo: "送货单号",
  orderDate: "订单日期",
  product: "品名",
  spec: "规格",
  itemCode: "物料编号",
  qty: "数量",
  unit: "单位",
  unitPrice: "单价(元)",
  amount: "金额(元)",
  note: "备注",
};

// 列宽估算基准（字符宽）
export const COLUMN_DEFAULT_WIDTHS: Record<StatementColumnKey, number> = {
  seq: 6,
  orderNo: 16,
  customerOrderNo: 18,
  deliveryNoteNo: 16,
  orderDate: 12,
  product: 24,
  spec: 16,
  itemCode: 14,
  qty: 8,
  unit: 8,
  unitPrice: 10,
  amount: 12,
  note: 20,
};

// 默认预设列配置（全部标准列，可见）
export const DEFAULT_COLUMNS: StatementColumn[] = STATEMENT_COLUMN_KEYS.map(
  (key) => ({
    key,
    label: COLUMN_DEFAULT_LABELS[key],
    visible: true,
    width: COLUMN_DEFAULT_WIDTHS[key],
  }),
);

export const DEFAULT_COLUMNS_JSON = JSON.stringify(DEFAULT_COLUMNS);

// 解析并校验 columns JSON；非法返回 null
export function parseColumns(json: string): StatementColumn[] | null {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const seen = new Set<StatementColumnKey>();
    const cols: StatementColumn[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") return null;
      const key = item.key as unknown;
      if (!STATEMENT_COLUMN_KEYS.includes(key as StatementColumnKey)) return null;
      const colKey = key as StatementColumnKey;
      if (seen.has(colKey)) return null; // 列 key 不允许重复
      seen.add(colKey);
      const label = String(item.label ?? COLUMN_DEFAULT_LABELS[colKey]).trim();
      if (!label) return null;
      cols.push({
        key: colKey,
        label,
        visible: item.visible !== false,
        width:
          typeof item.width === "number" && item.width > 0
            ? item.width
            : COLUMN_DEFAULT_WIDTHS[colKey],
      });
    }
    return cols;
  } catch {
    return null;
  }
}
