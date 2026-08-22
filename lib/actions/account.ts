"use server";

import { revalidatePath } from "next/cache";
import {
  loadAccount,
  saveAccount,
  hashPassword,
  verifyPassword,
} from "@/lib/password";

export type AccountFormState = {
  error?: string;
  ok?: boolean;
};

// 修改密码：验证旧密码 → 新密码写入 data/password.json（即时生效，无需重启）
export async function changePasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const oldPassword = String(formData.get("oldPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!oldPassword) return { error: "请输入当前密码" };
  if (newPassword.length < 6) {
    return { error: "新密码至少 6 位" };
  }
  if (newPassword.length > 64) {
    return { error: "新密码不能超过 64 位" };
  }
  if (newPassword !== confirm) {
    return { error: "两次输入的新密码不一致" };
  }

  const account = loadAccount();
  if (!account) return { error: "账号配置缺失，请联系管理员" };
  if (!verifyPassword(oldPassword, account.passwordHash)) {
    return { error: "当前密码不正确" };
  }

  try {
    saveAccount({
      username: account.username,
      passwordHash: hashPassword(newPassword),
    });
  } catch {
    return { error: "保存失败，请检查 data 目录写入权限" };
  }
  revalidatePath("/settings");
  return { ok: true };
}
