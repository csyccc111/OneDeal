import { prisma } from "@/lib/prisma";
import { ImportWizard } from "@/components/import-wizard";

export default async function ImportPage() {
  const customers = await prisma.customer.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return <ImportWizard customers={customers} />;
}
