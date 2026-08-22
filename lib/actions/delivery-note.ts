"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createDeliveryNote,
  deleteDeliveryNote,
  incrementPrintedCount,
  DeliveryNoteServiceError,
  type CreateDeliveryNoteInput,
} from "@/lib/services/delivery-note";

export type DeliveryNoteFormState = {
  error?: string;
};

export async function createDeliveryNoteAction(
  _prev: DeliveryNoteFormState,
  formData: FormData,
): Promise<DeliveryNoteFormState> {
  const customerId = Number(formData.get("customerId"));
  const noteDateStr = String(formData.get("noteDate") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const remark = String(formData.get("remark") ?? "").trim() || null;

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { error: "请选择客户" };
  }
  const noteDate = noteDateStr ? new Date(noteDateStr) : new Date();
  if (Number.isNaN(noteDate.getTime())) return { error: "送货日期格式无效" };

  const lines: CreateDeliveryNoteInput["lines"] = [];
  for (let i = 0; i < 100; i++) {
    const orderItemId = Number(formData.get(`lines_${i}_orderItemId`) ?? 0);
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) break;
    const qty = Number(formData.get(`lines_${i}_qty`) ?? 0);
    if (!Number.isInteger(qty) || qty < 1) {
      return { error: `第 ${i + 1} 行送货数量必须是 ≥1 的整数` };
    }
    lines.push({ orderItemId, qty });
  }
  if (lines.length === 0) {
    return { error: "请至少勾选一个订单行" };
  }

  let noteId: number;
  try {
    const note = await createDeliveryNote({ customerId, noteDate, contact, address, remark, lines });
    noteId = note.id;
  } catch (e) {
    return {
      error: e instanceof DeliveryNoteServiceError ? e.message : "生成送货单失败，请重试",
    };
  }
  // redirect 必须在 try 外
  revalidatePath("/delivery-notes");
  redirect(`/delivery-notes/${noteId}`);
}

export async function recordPrintAction(formData: FormData): Promise<{
  error?: string;
}> {
  const noteId = Number(formData.get("id"));
  if (!Number.isInteger(noteId) || noteId <= 0) return { error: "送货单 ID 无效" };
  try {
    await incrementPrintedCount(noteId);
  } catch {
    return { error: "记录打印次数失败" };
  }
  revalidatePath("/delivery-notes");
  return {};
}

// 删除送货单（2026-08-19 用户要求）
export async function deleteDeliveryNoteAction(formData: FormData): Promise<{
  error?: string;
}> {
  const noteId = Number(formData.get("id"));
  if (!Number.isInteger(noteId) || noteId <= 0) return { error: "送货单 ID 无效" };
  const res = await deleteDeliveryNote(noteId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/delivery-notes");
  return {};
}
