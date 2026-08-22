"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type CustomerOption = {
  id: number;
  name: string;
  contact: string | null;
  settleMode: string;
};

export function CustomerSelect({
  value,
  onChange,
  customers,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  customers: CustomerOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = customers.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.includes(q) ||
        (c.contact ?? "").includes(q) ||
        (c.settleMode ?? "").includes(q),
    );
  }, [customers, query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span>
                {selected.name}
                {selected.contact ? `（${selected.contact}）` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">选择客户</span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择客户</DialogTitle>
          <DialogDescription>搜索名称、联系人或结算方式</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入关键词搜索"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              没有匹配的客户
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted",
                c.id === value && "bg-muted",
              )}
            >
              <span>
                {c.name}
                {c.contact ? `（${c.contact}）` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {c.settleMode}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
