"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export type CustomerFormState = {
  error?: string;
};

function parseForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const wechatRemark =
    String(formData.get("wechatRemark") ?? "").trim() || null;
  const settleMode = String(formData.get("settleMode") ?? "现金");
  const creditDays = Number(formData.get("creditDays") ?? 0);

  return { name, contact, phone, wechatRemark, settleMode, creditDays };
}

function validate(input: ReturnType<typeof parseForm>): string | null {
  if (!input.name) return "客户名不能为空";
  if (!["现金", "月结"].includes(input.settleMode)) return "结算方式无效";
  if (!Number.isInteger(input.creditDays) || input.creditDays < 0) {
    return "账期天数必须是 ≥ 0 的整数";
  }
  return null;
}

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const input = parseForm(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid };

  try {
    await prisma.customer.create({ data: input });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "P2002") {
      return { error: "客户名已存在" };
    }
    return { error: "保存失败，请重试" };
  }
  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "客户 ID 无效" };

  const input = parseForm(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid };

  try {
    await prisma.customer.update({ where: { id }, data: input });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "P2002") {
      return { error: "客户名已存在" };
    }
    return { error: "保存失败，请重试" };
  }
  revalidatePath("/customers");
  redirect("/customers");
}

export async function deleteCustomer(formData: FormData): Promise<{
  error?: string;
}> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "客户 ID 无效" };

  const orderCount = await prisma.order.count({ where: { customerId: id } });
  if (orderCount > 0) {
    return { error: `该客户有 ${orderCount} 个订单，请先处理订单后再删除` };
  }
  const paymentCount = await prisma.payment.count({
    where: { customerId: id },
  });
  if (paymentCount > 0) {
    return { error: "该客户有收款记录，禁止删除" };
  }

  try {
    await prisma.customer.delete({ where: { id } });
  } catch {
    return { error: "删除失败，请重试" };
  }
  revalidatePath("/customers");
  return {};
}
