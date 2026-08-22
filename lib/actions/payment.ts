"use server";

import { revalidatePath } from "next/cache";
import { yuanToCents } from "@/lib/money";
import { createPayment, createInvoice } from "@/lib/services/payment";
import { OrderServiceError } from "@/lib/services/order";

export type SettlementFormState = {
  error?: string;
  ok?: boolean;
};

export async function createPaymentAction(
  _prev: SettlementFormState,
  formData: FormData,
): Promise<SettlementFormState> {
  const customerId = Number(formData.get("customerId"));
  const method = String(formData.get("method") ?? "现金");
  const paidAtStr = String(formData.get("paidAt") ?? "").trim();
  const remark = String(formData.get("remark") ?? "").trim() || null;

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { error: "请选择客户" };
  }
  const amountCents = yuanToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null || amountCents <= 0) {
    return { error: "收款金额无效（最多两位小数）" };
  }
  const paidAt = paidAtStr ? new Date(paidAtStr) : new Date();
  if (Number.isNaN(paidAt.getTime())) return { error: "日期格式无效" };

  const allocations: { orderId: number; amountCents: number }[] = [];
  for (let i = 0; i < 100; i++) {
    const orderId = Number(formData.get(`allocations_${i}_orderId`) ?? 0);
    if (!Number.isInteger(orderId) || orderId <= 0) break;
    const cents = yuanToCents(
      String(formData.get(`allocations_${i}_amount`) ?? ""),
    );
    if (cents === null) {
      return { error: `第 ${i + 1} 笔分配金额无效` };
    }
    allocations.push({ orderId, amountCents: cents });
  }
  if (allocations.length === 0) {
    return { error: "请至少分配一个订单" };
  }

  try {
    await createPayment({
      customerId,
      amountCents,
      method,
      paidAt,
      remark,
      allocations,
    });
    revalidatePath("/settlements");
    revalidatePath("/customers");
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof OrderServiceError ? e.message : "保存收款失败，请重试",
    };
  }
}

export async function createInvoiceAction(
  _prev: SettlementFormState,
  formData: FormData,
): Promise<SettlementFormState> {
  const orderId = Number(formData.get("orderId"));
  const invoiceNo = String(formData.get("invoiceNo") ?? "").trim();
  const invoiceDateStr = String(formData.get("invoiceDate") ?? "").trim();
  const remark = String(formData.get("remark") ?? "").trim() || null;

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "订单 ID 无效" };
  }
  const amountCents = yuanToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null || amountCents <= 0) {
    return { error: "开票金额无效（最多两位小数）" };
  }
  const invoiceDate = invoiceDateStr ? new Date(invoiceDateStr) : new Date();
  if (Number.isNaN(invoiceDate.getTime())) return { error: "日期格式无效" };

  try {
    await createInvoice({
      orderId,
      invoiceNo,
      amountCents,
      invoiceDate,
      remark,
    });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof OrderServiceError ? e.message : "保存开票失败，请重试",
    };
  }
}
