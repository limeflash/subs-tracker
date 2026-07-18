import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Header } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="flex min-h-screen w-full bg-app-gradient">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header email={session.user.email ?? ""} />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-6 md:pb-6 lg:p-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}