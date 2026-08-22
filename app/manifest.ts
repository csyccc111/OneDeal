import type { MetadataRoute } from "next";

// PWA manifest：手机可"添加到主屏幕"，standalone 全屏使用
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "订单追踪系统",
    short_name: "订单追踪",
    description: "微型机械加工厂订单追踪与结算系统",
    lang: "zh-CN",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#09090b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
