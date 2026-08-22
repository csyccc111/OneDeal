import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭开发模式左下角的 Next.js 调试浮层（英文提示，老板用不到）
  devIndicators: false,
  // standalone 输出：减小部署体积（生产部署用 .next/standalone/server.js）
  output: "standalone",
};

export default nextConfig;
