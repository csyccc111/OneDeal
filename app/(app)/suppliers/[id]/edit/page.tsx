import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SupplierForm } from "@/components/supplier-form";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId)) notFound();

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) notFound();

  return <SupplierForm supplier={supplier} />;
}
