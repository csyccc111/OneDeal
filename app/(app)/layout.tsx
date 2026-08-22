import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav />
      {/* 打印时内容区去内边距、不受导航挤压 */}
      <main className="flex-1 p-4 print:p-0 md:p-6">{children}</main>
    </div>
  );
}
