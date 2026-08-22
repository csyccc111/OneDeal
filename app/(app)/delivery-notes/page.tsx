import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { DeleteDeliveryNoteButton } from "@/components/delete-delivery-note-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 15;

export default async function DeliveryNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const query = q.trim();
  const pageNum = Math.max(1, Number(page) || 1);

  const where = query
    ? {
        OR: [
          { noteNo: { contains: query } },
          { customer: { name: { contains: query } } },
        ],
      }
    : {};

  const [total, notes] = await Promise.all([
    prisma.deliveryNote.count({ where }),
    prisma.deliveryNote.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        items: { select: { qty: true, amountCents: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryString = query ? `&q=${encodeURIComponent(query)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">送货单</h1>
        <Link href="/delivery-notes/new">
          <Button>
            <Plus className="h-4 w-4" />
            新建送货单
          </Button>
        </Link>
      </div>

      <form method="get" className="flex max-w-sm gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="搜索单号/客户"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        />
        <Button type="submit" variant="secondary">
          搜索
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>单号</TableHead>
              <TableHead>客户</TableHead>
              <TableHead>送货日期</TableHead>
              <TableHead className="text-right">行数</TableHead>
              <TableHead className="text-right">数量</TableHead>
              <TableHead className="text-right">金额(元)</TableHead>
              <TableHead className="text-right">打印次数</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  还没有送货单，点右上角新建
                </TableCell>
              </TableRow>
            )}
            {notes.map((n) => {
              const qty = n.items.reduce((s, i) => s + i.qty, 0);
              const amount = n.items.reduce((s, i) => s + i.amountCents, 0);
              return (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">
                    <Link href={`/delivery-notes/${n.id}`} className="hover:underline">
                      {n.noteNo}
                    </Link>
                  </TableCell>
                  <TableCell>{n.customer.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {n.noteDate.toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n.items.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{qty}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(amount / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n.printedCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/delivery-notes/${n.id}`}>
                        <Button variant="outline" size="sm">
                          <Printer className="h-4 w-4" />
                          查看/打印
                        </Button>
                      </Link>
                      <DeleteDeliveryNoteButton
                        noteId={n.id}
                        noteNo={n.noteNo}
                        printedCount={n.printedCount}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 张送货单 · 第 {pageNum}/{totalPages} 页
        </span>
        <div className="flex gap-2">
          {pageNum > 1 && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/delivery-notes?page=${pageNum - 1}${queryString}`} />}>
              上一页
            </Button>
          )}
          {pageNum < totalPages && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/delivery-notes?page=${pageNum + 1}${queryString}`} />}>
              下一页
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
