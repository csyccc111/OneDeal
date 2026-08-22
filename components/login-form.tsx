"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      // 1) 取 CSRF token（Auth.js 要求与 cookie 配对）
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
      const { csrfToken } = await csrfRes.json().catch(() => ({}));
      if (!csrfToken) throw new Error("csrf 获取失败");

      // 2) 登录（手动 fetch 而非 next-auth/react 的 signIn：
      //    该库 new URL(data.url) 无法解析相对路径 url 会抛错，导致"登录成功却显示红字、刷新才能进"）
      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken,
          username,
          password,
          redirect: "false",
          // 注意：不要传 callbackUrl=当前登录页（Auth.js 会原样返回 /login 导致"登录后不跳转"）；
          // 不传则返回默认 "/"（服务端重定向到 /orders）
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.url) {
        // url 可能是相对路径（成功）或 localhost 绝对地址（失败），统一解析后取 path+query
        const target = new URL(data.url, window.location.origin);
        if (target.searchParams.get("error")) {
          setError("用户名或密码错误");
          setPending(false);
          return;
        }
        const path = `${target.pathname}${target.search}`;
        router.push(path.startsWith("/") ? path : "/orders");
        router.refresh();
        return;
      }
      setError("用户名或密码错误");
      setPending(false);
    } catch (err) {
      console.error("登录失败", err);
      setError("登录失败，请重试（查看浏览器控制台）");
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">订单追踪系统</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
