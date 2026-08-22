"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { yuanToMills, percentToBp } from "@/lib/money";
import {
  createOrder,
  updateOrderWithItems,
  transitionOrderStatus,
  cancelOrder,
  OrderServiceError,
  type OrderInput,
} from "@/lib/services/order";

export type OrderFormState = {
  error?: string;
  ok?: boolean;
};

function parseOrderForm(formData: FormData): OrderInput {
  const customerId = Number(formData.get("customerId"));
  const customerOrderNo =
    String(formData.get("customerOrderNo") ?? "").trim() || null;
  const taxType = String(formData.get("taxType") ?? "无");
  const taxRateStr = String(formData.get("taxRate") ?? "").trim();
  const dueDateStr = String(formData.get("dueDate") ?? "").trim();
  const remark = String(formData.get("remark") ?? "").trim() || null;

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new OrderServiceError("请选择客户");
  }
  if (!["含税", "不含税", "无"].includes(taxType)) {
    throw new OrderServiceError("含税类型无效");
  }
  // 税率：仅"含税"时可填，可空；万分比存储
  let taxRateBp: number | null = null;
  if (taxRateStr) {
    const bp = percentToBp(taxRateStr);
    if (bp === null) {
      throw new OrderServiceError("税率格式无效（最多两位小数）");
    }
    if (bp > 10000) {
      throw new OrderServiceError("税率不能超过 100%");
    }
    taxRateBp = bp;
  }
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    throw new OrderServiceError("交期格式无效");
  }

  const items: OrderInput["items"] = [];
  for (let i = 0; i < 100; i++) {
    const product = String(formData.get(`items_${i}_product`) ?? "").trim();
    if (product === "") {
      // 空行：若其他字段有值则报错，否则视为末尾空行结束
      const hasValue = [
        `items_${i}_spec`,
        `items_${i}_unit`,
        `items_${i}_qty`,
        `items_${i}_unitPrice`,
      ].some((k) => String(formData.get(k) ?? "").trim() !== "");
      if (hasValue) throw new OrderServiceError(`第 ${i + 1} 行品名为空`);
      break;
    }
    const qty = Number(formData.get(`items_${i}_qty`) ?? 0);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new OrderServiceError(`第 ${i + 1} 行数量必须是 ≥1 的整数`);
    }
    const unitPriceMills = (() => {
      const raw = String(formData.get(`items_${i}_unitPrice`) ?? "").trim();
      // 单价允许为空（新建时可不填，后续修改）
      if (raw === "") return 0;
      const mills = yuanToMills(raw);
      if (mills === null) {
        throw new OrderServiceError(
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
      itemCode: String(formData.get(`items_${i}_itemCode`) ?? "").trim() || null,
    });
  }
  if (items.length === 0) {
    throw new OrderServiceError("请至少添加一个订单行");
  }
  return { customerId, customerOrderNo, taxType, taxRateBp, dueDate, remark, items };
}

export async function createOrderAction(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  let input: OrderInput;
  try {
    input = parseOrderForm(formData);
  } catch (e) {
    return { error: e instanceof OrderServiceError ? e.message : "表单数据无效" };
  }
  let orderId: number;
  try {
    const order = await createOrder(input);
    orderId = order.id;
  } catch (e) {
    return {
      error:
        e instanceof OrderServiceError ? e.message : "保存订单失败，请重试",
    };
  }
  // 注意：redirect 必须在 try 外（其 NEXT_REDIRECT 错误交给框架处理，不能被 catch 吞掉）
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function updateOrderAction(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "订单 ID 无效" };
  }
  // 支持编辑订单号（2026-08-19 用户要求）
  const orderNo = String(formData.get("orderNo") ?? "").trim();
  let input: OrderInput;
  try {
    input = parseOrderForm(formData);
  } catch (e) {
    return { error: e instanceof OrderServiceError ? e.message : "表单数据无效" };
  }
  try {
    await updateOrderWithItems(orderId, input, orderNo || undefined);
  } catch (e) {
    return {
      error:
        e instanceof OrderServiceError ? e.message : "保存订单失败，请重试",
    };
  }
  // redirect 在 try 外（NEXT_REDIRECT 交给框架处理）
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function transitionOrderAction(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const orderId = Number(formData.get("orderId"));
  const toStatus = String(formData.get("toStatus") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "订单 ID 无效" };
  }
  try {
    await transitionOrderStatus(orderId, toStatus, note);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    return { ok: true };
  } catch (e) {
    return {
      error:
        e instanceof OrderServiceError ? e.message : "状态流转失败，请重试",
    };
  }
}

export async function cancelOrderAction(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const orderId = Number(formData.get("orderId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { error: "订单 ID 无效" };
  }
  if (!reason) {
    return { error: "作废原因必填" };
  }
  try {
    await cancelOrder(orderId, reason);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    return { ok: true };
  } catch (e) {
    return {
      error:
        e instanceof OrderServiceError ? e.message : "作废失败，请重试",
    };
  }
}
