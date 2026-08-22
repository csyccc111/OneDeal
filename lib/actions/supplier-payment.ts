"use server";

import { revalidatePath } from "next/cache";
import { yuanToCents } from "@/lib/money";
import { createSupplierPayment } from "@/lib/services/supplier-payment";
import { PurchaseServiceError } from "@/lib/services/purchase";

export type SupplierPaymentFormState = {
  error?: string;
  ok?: boolean;
};

export async function createSupplierPaymentAction(
  _prev: SupplierPaymentFormState,
  formData: FormData,
): Promise<SupplierPaymentFormState> {
  const supplierId = Number(formData.get("supplierId"));
  const method = String(formData.get("method") ?? "现金");
  const paidAtStr = String(formData.get("paidAt") ?? "").trim();
  const remark = String(formData.get("remark") ?? "").trim() || null;

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return { error: "请选择供应商" };
  }
  const amountCents = yuanToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null || amountCents <= 0) {
    return { error: "付款金额无效（最多两位小数）" };
  }
  const paidAt = paidAtStr ? new Date(paidAtStr) : new Date();
  if (Number.isNaN(paidAt.getTime())) return { error: "日期格式无效" };

  const allocations: { poId: number; amountCents: number }[] = [];
  for (let i = 0; i < 100; i++) {
    const poId = Number(formData.get(`allocations_${i}_poId`) ?? 0);
    if (!Number.isInteger(poId) || poId <= 0) break;
    const cents = yuanToCents(
      String(formData.get(`allocations_${i}_amount`) ?? ""),
    );
    if (cents === null) {
      return { error: `第 ${i + 1} 笔分配金额无效` };
    }
    allocations.push({ poId, amountCents: cents });
  }
  if (allocations.length === 0) {
    return { error: "请至少分配一个采购单" };
  }

  try {
    await createSupplierPayment({
      supplierId,
      amountCents,
      method,
      paidAt,
      remark,
      allocations,
    });
    revalidatePath("/supplier-payments");
    revalidatePath("/suppliers");
    revalidatePath("/purchases");
    return { ok: true };
  } catch (e) {
    return {
      error:
        e instanceof PurchaseServiceError ? e.message : "保存付款失败，请重试",
    };
  }
}
