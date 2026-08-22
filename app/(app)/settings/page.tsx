import Link from "next/link";
import { FileText, KeyRound } from "lucide-react";
import { loadAccount } from "@/lib/password";
import { AccountForm } from "@/components/account-form";

export default function SettingsPage() {
  const account = loadAccount();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">设置</h1>

      {/* 对账单预设入口 */}
      <div className="rounded-md border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">对账单预设</p>
              <p className="text-sm text-muted-foreground">
                不同客户使用不同对账单格式：标题、条款、列配置，支持导入客户模板
              </p>
            </div>
          </div>
          <Link href="/templates">
            <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              管理
            </button>
          </Link>
        </div>
      </div>

      {/* 账号与密码 */}
      <div className="rounded-md border bg-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">账号与密码</p>
            <p className="text-sm text-muted-foreground">
              当前账号：{account?.username ?? "admin"}
            </p>
          </div>
        </div>
        <AccountForm username={account?.username ?? "admin"} />
      </div>
    </div>
  );
}
