// 金额换算：整数分 ↔ 元显示。整数运算避免浮点误差（方案约定：字符串解析思路，这里用纯整数运算）。

export function formatYuan(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  return `${sign}${yuan}.${String(fen).padStart(2, "0")}`;
}

export function yuanToCents(yuanInput: string): number | null {
  const s = yuanInput.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [intPart, decPart = ""] = s.split(".");
  const cents =
    Number(intPart) * 100 + Number(decPart.padEnd(2, "0").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

// —— 单价（厘/毫元）换算：1 元 = 1000 厘，支持 3 位小数单价（如 0.105 元）——

// 厘 → 元显示字符串（105 → "0.105"，130 → "0.13"，8 → "0.008"，0 → "0"）
export function formatYuanMills(mills: number): string {
  const sign = mills < 0 ? "-" : "";
  const abs = Math.abs(mills);
  const yuan = Math.floor(abs / 1000);
  const rem = abs % 1000;
  if (rem === 0) return `${sign}${yuan}`;
  const dec = String(rem).padStart(3, "0").replace(/0+$/, "");
  return `${sign}${yuan}.${dec}`;
}

// 元字符串 → 厘（"0.105" → 105，最多 3 位小数）；非法返回 null
export function yuanToMills(yuanInput: string): number | null {
  const s = yuanInput.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const [intPart, decPart = ""] = s.split(".");
  const mills =
    Number(intPart) * 1000 + Number(decPart.padEnd(3, "0").slice(0, 3));
  return Number.isSafeInteger(mills) ? mills : null;
}

// 行小计（分）= round(数量 × 单价厘 ÷ 10)；0.105元×1500个 = 157.50元
export function lineAmountCents(qty: number, unitPriceMills: number): number {
  return Math.round((qty * unitPriceMills) / 10);
}

// 税率显示：万分比 → 百分比字符串（1350 → "13.5"，1300 → "13"）
export function formatTaxRateBp(bp: number): string {
  const yuan = Math.floor(bp / 100);
  const remainder = bp % 100;
  if (remainder === 0) return String(yuan);
  const dec = String(remainder).padStart(2, "0").replace(/0$/, "");
  return `${yuan}.${dec}`;
}

// 百分比字符串 → 万分比（"13.5" → 1350）；非法返回 null
export function percentToBp(percentInput: string): number | null {
  const s = percentInput.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return Number.isSafeInteger(bp) ? bp : null;
}
