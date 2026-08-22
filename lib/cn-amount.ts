// 中文大写金额：1234.50 → "壹仟贰佰叁拾肆圆伍角整"（送货单/对账单金额合计用）
const CN_NUM = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const CN_SMALL = ["", "拾", "佰", "仟"];
const CN_BIG = ["", "万", "亿", "万亿"];

// 组内 4 位转大写（0 < g < 10000）
function cnGroup(g: number): string {
  let s = "";
  let zero = false;
  for (let j = 3; j >= 0; j--) {
    const d = Math.floor(g / 10 ** j) % 10;
    if (d === 0) {
      if (s !== "") zero = true;
    } else {
      if (zero) s += "零";
      zero = false;
      s += CN_NUM[d] + CN_SMALL[j];
    }
  }
  return s;
}

// 整数部分（n > 0），四位分组 + 组间补零
function cnInteger(n: number): string {
  const groups: number[] = [];
  let x = n;
  while (x > 0) {
    groups.push(x % 10000);
    x = Math.floor(x / 10000);
  }
  let result = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    // 组间零：低组不足千且前面已有输出 → 补"零"（如 10005 → 壹万零伍）
    if (result !== "" && g < 1000) result += "零";
    result += cnGroup(g) + CN_BIG[i];
  }
  return result;
}

// 分 → 中文大写金额字符串
export function cnAmount(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("金额必须是整数分");
  const sign = cents < 0 ? "负" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  if (yuan === 0 && fen === 0) return "零元整";

  const jiao = Math.floor(fen / 10);
  const fenDigit = fen % 10;
  let s = "";
  if (yuan > 0) s += cnInteger(yuan) + "圆";

  if (jiao > 0) {
    s += CN_NUM[jiao] + "角";
    if (fenDigit > 0) s += CN_NUM[fenDigit] + "分";
    else s += "整";
  } else if (fenDigit > 0) {
    if (yuan > 0) s += "零";
    s += CN_NUM[fenDigit] + "分";
  } else {
    s += "整";
  }
  return sign + s;
}
