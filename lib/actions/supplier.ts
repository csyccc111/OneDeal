"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export type SupplierFormState = {
  error?: string;
};

function parseForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const settleMode = String(formData.get("settleMode") ?? "现金");
  const creditDays = Number(formData.get("creditDays") ?? 0);
  const remark = String(formData.get("remark") ?? "").trim() || null;
  return { name, contact, phone, settleMode, creditDays, remark };
}

function validate(input: ReturnType<typeof parseForm>): string | null {
  if (!input.name) return "供应商名不能为空";
  if (!["现金", "月结"].includes(input.settleMode)) return "结算方式无效";
  if (!Number.isInteger(input.creditDays) || input.creditDays < 0) {
    return "账期天数必须是 ≥ 0 的整数";
  }
  return null;
}

export async function createSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const input = parseForm(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid };

  try {
    await prisma.supplier.create({ data: input });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "P2002") {
      return { error: "供应商名已存在" };
    }
    return { error: "保存失败，请重试" };
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "供应商 ID 无效" };

  const input = parseForm(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid };

  try {
    await prisma.supplier.update({ where: { id }, data: input });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "P2002") {
      return { error: "供应商名已存在" };
    }
    return { error: "保存失败，请重试" };
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function deleteSupplier(formData: FormData): Promise<{
  error?: string;
}> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "供应商 ID 无效" };

  const poCount = await prisma.purchaseOrder.count({
    where: { supplierId: id },
  });
  if (poCount > 0) {
    return { error: `该供应商有 ${poCount} 个采购单，请先处理后再删除` };
  }
  const paymentCount = await prisma.supplierPayment.count({
    where: { supplierId: id },
  });
  if (paymentCount > 0) {
    return { error: "该供应商有付款记录，禁止删除" };
  }

  try {
    await prisma.supplier.delete({ where: { id } });
  } catch {
    return { error: "删除失败，请重试" };
  }
  revalidatePath("/suppliers");
  return {};
}
