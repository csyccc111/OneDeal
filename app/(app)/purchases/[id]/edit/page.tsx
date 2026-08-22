import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PurchaseForm } from "@/components/purchase-form";

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const poId = Number(id);
  if (!Number.isInteger(poId)) notFound();

  const [purchase, suppliers] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        items: true,
        allocations: { select: { id: true } },
      },
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, contact: true, settleMode: true },
    }),
  ]);
  if (!purchase) notFound();

  return (
    <PurchaseForm
      suppliers={suppliers}
      purchase={{
        id: purchase.id,
        poNo: purchase.poNo,
        supplierId: purchase.supplierId,
        poDate: purchase.poDate.toISOString().slice(0, 10),
        remark: purchase.remark,
        locked: purchase.allocations.length > 0,
        items: purchase.items.map((it) => ({
          id: it.id,
          product: it.product,
          spec: it.spec,
          unit: it.unit,
          qty: it.qty,
          unitPriceMills: it.unitPriceMills,
          note: it.note,
        })),
      }}
    />
  );
}
