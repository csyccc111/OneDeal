"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createStatementTemplate,
  updateStatementTemplate,
  deleteStatementTemplate,
  parseColumns,
  type StatementColumn,
} from "@/lib/services/statement-template";

export type TemplateFormState = { error?: string };

// 从 FormData 解析列配置：columns_0_key/columns_0_label/columns_0_visible 系列
function parseColumnsFromForm(formData: FormData): StatementColumn[] {
  const cols: StatementColumn[] = [];
  const keys = new Set<string>();
  for (let i = 0; ; i++) {
    const key = String(formData.get(`columns_${i}_key`) ?? "");
    if (!key) break; // 行号不连续即结束
    if (key === "IGNORE") continue; // 导入时未映射的列忽略
    if (keys.has(key)) continue; // 重复 key 跳过（提交前已提示）
    keys.add(key);
    const label = String(formData.get(`columns_${i}_label`) ?? "").trim();
    const visible = formData.get(`columns_${i}_visible`) === "1";
    cols.push({ key: key as StatementColumn["key"], label, visible });
  }
  return cols;
}

export async function createTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const input = {
    name: String(formData.get("name") ?? ""),
    title: String(formData.get("title") ?? ""),
    terms: String(formData.get("terms") ?? "") || null,
    columns: parseColumnsFromForm(formData),
  };
  const res = await createStatementTemplate(input);
  if (!res.ok) return { error: res.error };
  revalidatePath("/templates");
  redirect("/templates");
}

export async function updateTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "模板 ID 无效" };
  const input = {
    name: String(formData.get("name") ?? ""),
    title: String(formData.get("title") ?? ""),
    terms: String(formData.get("terms") ?? "") || null,
    columns: parseColumnsFromForm(formData),
  };
  const res = await updateStatementTemplate(id, input);
  if (!res.ok) return { error: res.error };
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplateAction(formData: FormData): Promise<{
  error?: string;
}> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "模板 ID 无效" };
  const res = await deleteStatementTemplate(id);
  if (!res.ok) return { error: res.error };
  revalidatePath("/templates");
  return {};
}

// 校验列配置（供 client 编辑器保存前校验）
export async function validateColumnsAction(
  columns: StatementColumn[],
): Promise<{ ok: boolean; error?: string }> {
  const parsed = parseColumns(JSON.stringify(columns));
  if (!parsed) {
    return { ok: false, error: "列配置无效：至少 1 列、字段不重复、列名非空" };
  }
  return { ok: true };
}
