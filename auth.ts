import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loadAccount, verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 局域网多设备用 IP 访问：信任请求 host（否则 callbackUrl 被重写为 localhost，登录后跳错地址）
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");

        // 运行时密码文件优先（data/password.json），其次 .env 初始密码
        const account = loadAccount();
        if (!account) return null;
        const ok =
          username === account.username &&
          verifyPassword(password, account.passwordHash);

        if (!ok) return null;
        return { id: "1", name: username };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      // 登录页与认证 API 允许匿名访问
      if (pathname === "/login" || pathname.startsWith("/api/auth")) {
        return true;
      }
      return isLoggedIn;
    },
    // 局域网多设备用 IP 访问：dev 下 req.url 的 baseUrl 被规范化为 localhost，
    // 且设备可能残留指向 localhost 的 callback-url cookie。
    // 一律返回相对路径，让浏览器/fetch 基于当前访问的 origin 解析，杜绝跨源跳转。
    redirect({ url }) {
      if (url.startsWith("/")) return url;
      try {
        const u = new URL(url);
        const host = u.hostname;
        const isLocal =
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "::1" ||
          /^(\d{1,3}\.){3}\d{1,3}$/.test(host); // 局域网 IP（内部系统，信任 IP 目标）
        if (isLocal) return `${u.pathname}${u.search}`;
      } catch {
        // 忽略非法 URL
      }
      return "/";
    },
  },
});
