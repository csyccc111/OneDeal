// 业务枚举常量（SQLite 不支持 Prisma enum，统一在此定义取值，类型约束用 satisfies）

export const ORDER_STATUSES = [
  "待确认",
  "排产",
  "生产中",
  "已发货",
  "已结算",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
  待确认: "排产",
  排产: "生产中",
  生产中: "已发货",
  已发货: "已结算",
  已结算: null,
};

export const TAX_TYPES = ["含税", "不含税", "无"] as const;
export type TaxType = (typeof TAX_TYPES)[number];

export const SETTLE_MODES = ["现金", "月结"] as const;
export type SettleMode = (typeof SETTLE_MODES)[number];

export const PAYMENT_METHODS = ["现金", "转账", "承兑"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPMENT_TYPES = ["发货", "退货"] as const;
export type ShipmentType = (typeof SHIPMENT_TYPES)[number];

export const ATTACHMENT_TYPES = ["截图", "图纸", "其他"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export const UNITS = ["件", "套", "公斤", "米", "个", "其他"] as const;
export type Unit = (typeof UNITS)[number];

// 送货单抬头（公司信息，可改；打印模板复刻）
export const DELIVERY_NOTE_COMPANY = {
  name: "MK 东莞市明科电子有限公司",
  address: "地址：广东省东莞市石碣镇樱桃路13号",
  contactLine: "传真：0769-86375867 电话：0769-86375867",
} as const;

// 送货单质量条款（模板原文）
export const DELIVERY_NOTE_TERMS =
  "注：以上货品请核对数量，如有质量问题，请在收货后三个工作日内通知本公司，逾期恕不负责。";
