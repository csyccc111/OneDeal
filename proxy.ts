// Next.js 16 起 middleware 改名为 proxy（见 node_modules/next/dist/docs 的 proxy 文档）
// 未登录访问受保护页面时重定向到 /login
// 注意：request.nextUrl 的 host 在 Next.js 内部被规范化为 localhost（局域网 IP 访问也一样），
// 因此 callbackUrl 一律用相对路径，让浏览器基于当前访问的 origin 解析，避免跳错到 localhost。
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // 登录页与认证 API 允许匿名访问
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return;
  }
  if (!isLoggedIn) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("callbackUrl", pathname || "/");
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|sw.js|manifest.webmanifest).*)",
  ],
};
