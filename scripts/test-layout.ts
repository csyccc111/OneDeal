// 送货单自动列宽算法单测（临时脚本，测完清理）
import {
  computeDnColumnWidths,
  textWidth,
  type DnLayoutItem,
} from "../lib/delivery-note-layout";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

const sum = (w: object) => Object.values(w as Record<string, number>).reduce((a, b) => a + b, 0);
const all = (w: object) =>
  Object.values(w as Record<string, number>).every((v) => Number.isFinite(v) && v >= 0);

console.log("== 1. textWidth 宽度估算 ==");
check("中文=2单位", textWidth("不锈钢") === 6, `got ${textWidth("不锈钢")}`);
check("英文数字=1单位", textWidth("MF-001") === 6, `got ${textWidth("MF-001")}`);
check("混排", textWidth("304不锈钢 φ8×50") === 16, `got ${textWidth("304不锈钢 φ8×50")}`); // ×(U+00D7) 为 Latin-1 字符按半角估算，误差可接受
check("空串=0", textWidth("") === 0);

console.log("== 2. 空数组：按表头宽度分配 ==");
const w1 = computeDnColumnWidths([]);
check("总和=100", Math.abs(sum(w1) - 100) < 0.001, `sum=${sum(w1)}`);
check("无 NaN/负数", all(w1));
check("固定列不变", w1.seq === 5 && w1.unit === 5 && w1.qty === 7 && w1.price === 8 && w1.amount === 9);
check("客户订单号列最宽（表头10单位）", w1.order > w1.product && w1.order > w1.code, JSON.stringify(w1));

console.log("== 3. 全短内容：弹性列接近均分 ==");
const short: DnLayoutItem[] = [
  { product: "螺丝", spec: "M3", unit: "件", customerOrderNo: "A1", itemCode: "L1", note: "急" },
  { product: "垫片", spec: "M3", unit: "件", customerOrderNo: "A2", itemCode: "L2" },
];
const w2 = computeDnColumnWidths(short);
check("总和=100", Math.abs(sum(w2) - 100) < 0.001, `sum=${sum(w2)}`);
check("按表头宽度分配：客户订单号列最宽", w2.order > w2.product && w2.product === w2.code && w2.spec === w2.note, JSON.stringify(w2));
check("各列 ≥ 10%（表头完整显示）", (["order", "code", "product", "spec", "note"] as const).every((k) => w2[k] >= 10), JSON.stringify(w2));

console.log("== 4. 单列超长：品名 30 汉字 ==");
const long: DnLayoutItem[] = [
  { product: "耐高温聚酰亚胺绝缘套管 300度耐压1000V 黑色 定制加长款", spec: "φ8×50", unit: "件", note: "" },
  { product: "螺丝", spec: "M3", unit: "件" },
];
const w3 = computeDnColumnWidths(long);
check("总和=100", Math.abs(sum(w3) - 100) < 0.001, `sum=${sum(w3)}`);
check("品名列占比最大", w3.product > w3.spec && w3.product > w3.note && w3.product > w3.order, JSON.stringify(w3));
check("品名列 ≥ 25%", w3.product >= 25, `product=${w3.product}`);

console.log("== 5. 某列全空：取表头宽度不为 0 ==");
const w4 = computeDnColumnWidths([{ product: "螺丝" }]);
check("总和=100", Math.abs(sum(w4) - 100) < 0.001, `sum=${sum(w4)}`);
check("全空列仍 >0（表头兜底）", w4.order > 0 && w4.code > 0 && w4.spec > 0 && w4.note > 0, JSON.stringify(w4));

console.log("== 6. 极端长度差异：短列 ≥ 6% ==");
const extreme: DnLayoutItem[] = [
  { product: "X", customerOrderNo: "A".repeat(80), note: "Y".repeat(60) },
  { product: "Z", spec: "S" },
];
const w5 = computeDnColumnWidths(extreme);
check("总和=100", Math.abs(sum(w5) - 100) < 0.001, `sum=${sum(w5)}`);
check("短列 ≥ 6%", w5.code >= 6 && w5.spec >= 6 && w5.product >= 6, JSON.stringify(w5));

console.log("== 7. 多行多页数据（8 行满） ==");
const full: DnLayoutItem[] = Array.from({ length: 8 }, (_, i) => ({
  product: `温度保险丝 TF${i + 1} 250V 10A`,
  spec: "陶瓷 引线式",
  unit: "件",
  customerOrderNo: `2026082${i}HXM-${i + 1}`,
  itemCode: `MF-00${i + 1}`,
  note: i % 2 ? "加急" : "",
}));
const w6 = computeDnColumnWidths(full);
check("总和=100", Math.abs(sum(w6) - 100) < 0.001, `sum=${sum(w6)}`);
check("无 NaN/负数", all(w6));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
