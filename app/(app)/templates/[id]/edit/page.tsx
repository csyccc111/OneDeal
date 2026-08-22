import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatementTemplateEditor } from "@/components/statement-template-editor";
import { parseColumns } from "@/lib/services/statement-template";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) notFound();

  const template = await prisma.statementTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) notFound();

  return (
    <StatementTemplateEditor
      initial={{
        id: template.id,
        name: template.name,
        title: template.title,
        terms: template.terms,
        columns: parseColumns(template.columns) ?? [],
      }}
    />
  );
}
