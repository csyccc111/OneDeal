import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderForm } from "@/components/order-form";

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const [order, customers] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, contact: true, settleMode: true },
    }),
  ]);
  if (!order) notFound();

  return (
    <OrderForm
      customers={customers}
      order={{
        id: order.id,
        orderNo: order.orderNo,
        customerId: order.customerId,
        customerOrderNo: order.customerOrderNo,
        taxType: order.taxType,
        taxRateBp: order.taxRateBp,
        dueDate: order.dueDate ? toDateInputValue(order.dueDate) : null,
        remark: order.remark,
        status: order.status,
        items: order.items.map((it) => ({
          id: it.id,
          product: it.product,
          spec: it.spec,
          unit: it.unit,
          qty: it.qty,
          unitPriceMills: it.unitPriceMills,
          note: it.note,
          itemCode: it.itemCode,
        })),
      }}
    />
  );
}
