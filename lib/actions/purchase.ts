"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { yuanToMills } from "@/lib/money";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  PurchaseServiceError,
  type PurchaseInput,
} from "@/lib/services/purchase";

export type PurchaseFormState = {
  error?: string;
  ok?: boolean;
};

function parsePurchaseForm(formData: FormData): PurchaseInput {
  const supplierId = Number(formData.get("supplierId"));
  const poDateStr = String(formData.get("poDate") ?? "").trim();
  const remark = String(formData.get("remark") ?? "").trim() || null;

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw new PurchaseServiceError("请选择供应商");
  }
  const poDate = poDateStr ? new Date(poDateStr) : new Date();
  if (Number.isNaN(poDate.getTime())) {
    throw new PurchaseServiceError("采购日期格式无效");
  }

  const items: PurchaseInput["items"] = [];
  for (let i = 0; i < 100; i++) {
    const product = String(formData.get(`items_${i}_product`) ?? "").trim();
    if (product === "") {
      const hasValue = [
        `items_${i}_spec`,
        `items_${i}_unit`,
        `items_${i}_qty`,
        `items_${i}_unitPrice`,
      ].some((k) => String(formData.get(k) ?? "").trim() !== "");
      if (hasValue) throw new PurchaseServiceError(`第 ${i + 1} 行品名为空`);
      break;
    }
    const qty = Number(formData.get(`items_${i}_qty`) ?? 0);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new PurchaseServiceError(`第 ${i + 1} 行数量必须是 ≥1 的整数`);
    }
    const unitPriceMills = (() => {
      const raw = String(formData.get(`items_${i}_unitPrice`) ?? "").trim();
      // 单价允许为空（后续可补）
      if (raw === "") return 0;
      const mills = yuanToMills(raw);
      if (mills === null) {
        throw new PurchaseServiceError(
          `第 ${i + 1} 行单价格式无效（最多三位小数）`,
        );
      }
      return mills;
    })();
    const idRaw = formData.get(`items_${i}_id`);
    const id = idRaw ? Number(idRaw) : undefined;
    items.push({
      ...(Number.isInteger(id) && id! > 0 ? { id } : {}),
      product,
      spec: String(formData.get(`items_${i}_spec`) ?? "").trim() || null,
      unit: String(formData.get(`items_${i}_unit`) ?? "件").trim() || "件",
      qty,
      unitPriceMills,
      note: String(formData.get(`items_${i}_note`) ?? "").trim() || null,
    });
  }
  if (items.length === 0) {
    throw new PurchaseServiceError("请至少添加一个采购行");
  }
  return { supplierId, poDate, remark, items };
}

export async function createPurchaseAction(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  let input: PurchaseInput;
  try {
    input = parsePurchaseForm(formData);
  } catch (e) {
    return {
      error: e instanceof PurchaseServiceError ? e.message : "表单数据无效",
    };
  }
  let poId: number;
  try {
    const po = await createPurchaseOrder(input);
    poId = po.id;
  } catch (e) {
    return {
      error:
        e instanceof PurchaseServiceError ? e.message : "保存采购单失败，请重试",
    };
  }
  // redirect 必须在 try 外
  revalidatePath("/purchases");
  redirect(`/purchases/${poId}`);
}

export async function updatePurchaseAction(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const poId = Number(formData.get("poId"));
  if (!Number.isInteger(poId) || poId <= 0) {
    return { error: "采购单 ID 无效" };
  }
  let input: PurchaseInput;
  try {
    input = parsePurchaseForm(formData);
  } catch (e) {
    return {
      error: e instanceof PurchaseServiceError ? e.message : "表单数据无效",
    };
  }
  try {
    await updatePurchaseOrder(poId, input);
  } catch (e) {
    return {
      error:
        e instanceof PurchaseServiceError ? e.message : "保存采购单失败，请重试",
    };
  }
  revalidatePath("/purchases");
  redirect(`/purchases/${poId}`);
}

export async function deletePurchaseAction(formData: FormData): Promise<{
  error?: string;
}> {
  const poId = Number(formData.get("id"));
  if (!Number.isInteger(poId) || poId <= 0) return { error: "采购单 ID 无效" };
  try {
    await deletePurchaseOrder(poId);
  } catch (e) {
    return {
      error: e instanceof PurchaseServiceError ? e.message : "删除失败，请重试",
    };
  }
  revalidatePath("/purchases");
  return {};
}
