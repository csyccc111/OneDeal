// xlsx 工具：单元格自动换行（列宽不够时换行显示，配合 !cols 列宽）
import type * as XLSX from "xlsx-js-style";

// 遍历工作表所有单元格设置 wrapText + 顶端对齐（不覆盖已有 alignment 的其他属性）
export function applyCellWrap(ws: XLSX.WorkSheet): XLSX.WorkSheet {
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue; // 跳过 !cols / !merges 等元数据
    const cell = ws[key] as XLSX.CellObject | undefined;
    if (!cell || typeof cell !== "object" || cell.t === undefined) continue;
    cell.s = {
      ...(cell.s ?? {}),
      alignment: {
        ...(cell.s?.alignment ?? {}),
        wrapText: true,
        vertical: "top",
      },
    };
  }
  return ws;
}
