import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** Resolve the single owner row or redirect to login. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { displayCurrency: true },
  });
  if (!user) redirect("/login");
  return user;
}