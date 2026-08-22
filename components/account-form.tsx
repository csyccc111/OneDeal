"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { changePasswordAction } from "@/lib/actions/account";

export function AccountForm({ username }: { username: string }) {
  const [state, formAction] = useActionState(changePasswordAction, {});

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">账号信息</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            当前账号：<span className="font-semibold">{username}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            密码修改即时生效（保存在 data/password.json，无需重启服务）。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">修改密码</CardTitle>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oldPassword">当前密码</Label>
              <Input
                id="oldPassword"
                name="oldPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码（至少 6 位）</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">确认新密码</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            {state.ok && (
              <p className="text-sm text-green-700">
                密码已修改 ✅ 下次登录请使用新密码
              </p>
            )}
          </CardContent>
          <CardFooter>
            <SubmitButton />
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />
            手机端安装
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>安卓 Chrome / 电脑 Edge：地址栏或菜单选「添加到主屏幕 / 安装应用」。</p>
          <p>苹果 Safari：「分享」→「添加到主屏幕」。</p>
          <p>
            安装后可从主屏幕图标直接打开，像 App 一样全屏使用（离线时显示缓存界面壳）。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : "修改密码"}
    </Button>
  );
}
