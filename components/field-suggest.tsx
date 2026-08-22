"use client";

// P19 填写记忆：品名/规格/物料编号输入联想（防抖 200ms / 最近常用 / 键盘上下+回车 / Esc / 点选）
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SuggestField = "product" | "spec" | "itemCode";

type Props = {
  field: SuggestField;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
};

export function FieldSuggest({
  field,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  name,
  className,
}: Props) {
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // 请求联想（q 空 = 最近常用）
  const fetchSuggestions = (q: string) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    fetch(`/api/suggestions?field=${field}&q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => {
        if (seq !== reqSeq.current) return; // 丢弃过期响应
        setItems(Array.isArray(j.items) ? j.items : []);
        setActive(-1);
        setOpen(true);
      })
      .catch(() => {
        if (seq !== reqSeq.current) return;
        setItems([]);
        setOpen(false);
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false);
      });
  };

  // 防抖输入
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!open) return;
    timerRef.current = setTimeout(() => fetchSuggestions(value.trim()), 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // 聚焦：显示最近常用
  const handleFocus = () => {
    fetchSuggestions("");
  };

  const close = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpen(false);
    setActive(-1);
  };

  const pick = (v: string) => {
    onChange(v);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (active >= 0 && items[active]) {
        e.preventDefault();
        pick(items[active]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // 点击外部关闭
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={() => {
          // 延迟关闭，允许点击下拉选项
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          closeTimerRef.current = setTimeout(() => {
            setOpen(false);
            setActive(-1);
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-md">
          {loading && items.length === 0 && (
            <li className="px-3 py-1.5 text-muted-foreground">加载中…</li>
          )}
          {!loading && items.length === 0 && (
            <li className="px-3 py-1.5 text-muted-foreground">
              {value.trim() ? "无匹配记录" : "暂无历史记录"}
            </li>
          )}
          {items.map((it, i) => (
            <li
              key={`${it}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault(); // 防止 input 失焦先关闭
                pick(it);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer truncate px-3 py-1.5",
                i === active ? "bg-accent text-accent-foreground" : "",
              )}
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
