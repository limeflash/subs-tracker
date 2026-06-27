import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Header } from "@/components/app-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <Header email={session.user.email ?? ""} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}