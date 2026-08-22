"use client";

// 新订单通知：60 秒轮询 → 顶部横幅 + 导航铃铛红点 + 提示音
// 结构：OrderNotifierProvider（轮询/横幅/声音，context 提供状态） + NotificationBell（铃铛 UI）
// 说明：不做个人已读（单账号两人共用）；多标签页会重复提醒（可接受，不做去重）

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { formatYuan } from "@/lib/money";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface NewOrder {
  id: number;
  orderNo: string;
  customerName: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

interface NotifierCtx {
  unread: number;
  recent: NewOrder[];
  clearUnread: () => void;
}
const Ctx = createContext<NotifierCtx>({ unread: 0, recent: [], clearUnread: () => {} });
export const useNotifier = () => useContext(Ctx);

const POLL_MS = 60_000; // 轮询间隔
const BANNER_MS = 8000; // 横幅停留
const MAX_BANNERS = 3; // 同时最多横幅数
const MAX_RECENT = 10; // 铃铛列表上限

export function OrderNotifierProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<NewOrder[]>([]);
  const [banners, setBanners] = useState<NewOrder[]>([]);
  const lastSeenRef = useRef<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  // 提示音：浏览器要求用户交互后才能出声（自动播放策略）
  // 首次 pointerdown 后 resume；未交互过则静默降级（只弹横幅不出声）
  useEffect(() => {
    const ctx = new AudioContext();
    audioRef.current = ctx;
    const resume = () => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", resume, { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", resume, { capture: true });
      ctx.close().catch(() => {});
    };
  }, []);

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== "running") return; // 未交互过：静默
    try {
      const play = (freq: number, at: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + dur);
      };
      play(880, 0, 0.12); // 叮
      play(660, 0.18, 0.18); // 咚
    } catch {
      /* 静默 */
    }
  }, []);

  // 轮询：挂载时拉一次只记录 lastSeen（不弹横幅，避免刷新轰炸）；之后每 60s 对比
  useEffect(() => {
    let alive = true;
    const fetchNew = async () => {
      try {
        const since =
          lastSeenRef.current ??
          new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const res = await fetch(
          `/api/notifications/new-orders?since=${encodeURIComponent(since)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const orders: NewOrder[] = Array.isArray(data.orders) ? data.orders : [];
        if (!alive) return;

        // 铃铛列表：合并去重，保留最近 10 条
        setRecent((prev) => {
          const seen = new Set<number>();
          return [...orders, ...prev].filter((o) =>
            seen.has(o.id) ? false : (seen.add(o.id), true),
          ).slice(0, MAX_RECENT);
        });

        // 首次挂载只记录游标；后续轮询发现新订单才提醒
        if (lastSeenRef.current) {
          const last = lastSeenRef.current;
          const news = orders.filter((o) => o.createdAt > last);
          if (news.length > 0) {
            setUnread((u) => u + news.length);
            setBanners((b) => [...b, ...news].slice(-MAX_BANNERS));
            beep();
          }
        }
        if (orders.length > 0) {
          lastSeenRef.current = orders[orders.length - 1].createdAt;
        }
      } catch {
        /* 轮询失败静默 */
      }
    };
    fetchNew();
    const timer = setInterval(fetchNew, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [beep]);

  // 横幅自动消失（逐条）
  useEffect(() => {
    if (banners.length === 0) return;
    const t = setTimeout(() => setBanners((b) => b.slice(1)), BANNER_MS);
    return () => clearTimeout(t);
  }, [banners]);

  const clearUnread = useCallback(() => setUnread(0), []);
  const dismissBanner = useCallback((id: number) => {
    setBanners((b) => b.filter((x) => x.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ unread, recent, clearUnread }}>
      {children}
      {/* 顶部横幅（fixed 居中，点击直达订单） */}
      <div className="pointer-events-none fixed top-3 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {banners.map((o) => (
          <div
            key={o.id}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg"
            role="alert"
          >
            <button
              className="flex flex-1 items-center gap-2 text-left"
              onClick={() => {
                router.push(`/orders/${o.id}`);
                dismissBanner(o.id);
              }}
            >
              <span className="text-base">🔔</span>
              <span className="text-sm leading-snug">
                <b>新订单</b> {o.orderNo} · {o.customerName} · ¥
                {formatYuan(o.amountCents)}
              </span>
            </button>
            <button
              aria-label="关闭通知"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
              onClick={() => dismissBanner(o.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** 导航铃铛：红点计数 + 最近新订单下拉列表；打开下拉即清红点 */
export function NotificationBell() {
  const { unread, recent, clearUnread } = useNotifier();
  return (
    <DropdownMenu onOpenChange={(open) => open && clearUnread()}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="通知" className="relative" />
        }
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {recent.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            暂无新订单
          </div>
        ) : (
          recent.map((o) => (
            <DropdownMenuItem key={o.id} render={<Link href={`/orders/${o.id}`} />}>
              <span className="flex w-full flex-col">
                <span className="text-sm">
                  <b>{o.orderNo}</b> · {o.customerName}
                </span>
                <span className="text-xs text-muted-foreground">
                  ¥{formatYuan(o.amountCents)} · {o.status}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
