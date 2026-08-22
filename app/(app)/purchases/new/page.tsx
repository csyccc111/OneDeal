import { prisma } from "@/lib/prisma";
import { PurchaseForm } from "@/components/purchase-form";

export default async function NewPurchasePage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, contact: true, settleMode: true },
  });
  return <PurchaseForm suppliers={suppliers} />;
}
