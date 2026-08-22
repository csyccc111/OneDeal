"use client";

import { useEffect } from "react";

// 注册 Service Worker（仅生产环境，避免开发期缓存干扰调试）
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 注册失败不阻塞页面（如不支持的环境）
    });
  }, []);
  return null;
}
