"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, LogOut, Package, Users, Wallet, FileUp, FileDown, Home, Truck, BarChart3, Settings, FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OrderNotifierProvider,
  NotificationBell,
} from "@/components/order-notifier";

const NAV_ITEMS = [
  { href: "/dashboard", label: "首页", icon: Home },
  { href: "/orders", label: "订单", icon: Package },
  { href: "/delivery-notes", label: "送货单", icon: FileText },
  { href: "/customers", label: "客户", icon: Users },
  { href: "/settlements", label: "结算", icon: Wallet },
  { href: "/suppliers", label: "供应商", icon: Truck },
  { href: "/export", label: "导出", icon: FileDown },
  { href: "/reports", label: "报表", icon: BarChart3 },
  { href: "/import", label: "导入", icon: FileUp },
  { href: "/settings", label: "设置", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-base transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOutButton() {
  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-3 text-base"
      onClick={() => signOut({ redirectTo: "/login" })}
    >
      <LogOut className="h-5 w-5" />
      退出登录
    </Button>
  );
}

export function AppNav() {
  const [open, setOpen] = useState(false);

  return (
    <OrderNotifierProvider>
      {/* 桌面端侧边栏（打印时隐藏） */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card p-4 print:hidden md:flex">
        <div className="mb-6 flex items-center justify-between px-3">
          <div className="text-lg font-semibold">订单追踪系统</div>
          <NotificationBell />
        </div>
        <div className="flex flex-1 flex-col justify-between">
          <NavLinks />
          <SignOutButton />
        </div>
      </aside>

      {/* 移动端顶栏 + 抽屉（打印时隐藏） */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-3 print:hidden md:hidden">
        <div className="text-lg font-semibold">订单追踪系统</div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="打开菜单" />
              }
            >
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle>订单追踪系统</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-4">
                <NavLinks onNavigate={() => setOpen(false)} />
                <SignOutButton />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </OrderNotifierProvider>
  );
}
