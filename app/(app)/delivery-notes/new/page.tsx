import { prisma } from "@/lib/prisma";
import { DeliveryNoteForm } from "@/components/delivery-note-form";

export default async function NewDeliveryNotePage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, contact: true, settleMode: true },
  });
  return <DeliveryNoteForm customers={customers} />;
}
