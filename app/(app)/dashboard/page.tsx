import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard-client";
import { getSessionUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <DashboardClient userName={user.name} />
    </main>
  );
}
