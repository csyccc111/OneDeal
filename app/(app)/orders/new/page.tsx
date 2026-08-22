import { prisma } from "@/lib/prisma";
import { OrderForm } from "@/components/order-form";

export default async function NewOrderPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, contact: true, settleMode: true },
  });
  return <OrderForm customers={customers} />;
}
