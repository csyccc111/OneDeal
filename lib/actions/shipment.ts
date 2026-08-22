"use server";

import { revalidatePath } from "next/cache";
import { recordShipment, setDefectiveQty } from "@/lib/services/shipment";
import { OrderServiceError } from "@/lib/services/order";

export type ShipmentFormState = {
  error?: string;
  ok?: boolean;
};

export async function recordShipmentAction(
  _prev: ShipmentFormState,
  formData: FormData,
): Promise<ShipmentFormState> {
  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  const type = String(formData.get("type") ?? "");
  const qty = Number(formData.get("qty") ?? 0);
  const shippedAtStr = String(formData.get("shippedAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!Number.isInteger(orderId) || orderId <= 0) return { error: "订单 ID 无效" };
  if (!Number.isInteger(itemId) || itemId <= 0) return { error: "订单行 ID 无效" };
  if (type !== "发货" && type !== "退货") return { error: "类型无效" };
  const shippedAt = shippedAtStr ? new Date(shippedAtStr) : new Date();
  if (Number.isNaN(shippedAt.getTime())) return { error: "日期格式无效" };

  try {
    await recordShipment({ orderId, itemId, type, qty, shippedAt, note });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof OrderServiceError ? e.message : "保存失败，请重试",
    };
  }
}

export async function setDefectiveQtyAction(
  _prev: ShipmentFormState,
  formData: FormData,
): Promise<ShipmentFormState> {
  const orderId = Number(formData.get("orderId"));
  const itemId = Number(formData.get("itemId"));
  const defectiveQty = Number(formData.get("defectiveQty") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!Number.isInteger(orderId) || orderId <= 0) return { error: "订单 ID 无效" };
  if (!Number.isInteger(itemId) || itemId <= 0) return { error: "订单行 ID 无效" };

  try {
    await setDefectiveQty({ orderId, itemId, defectiveQty, note });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof OrderServiceError ? e.message : "保存失败，请重试",
    };
  }
}
