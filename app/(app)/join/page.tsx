import { redirect } from "next/navigation";
import { JoinClient } from "@/components/join-client";
import { getSessionUser } from "@/lib/auth/session";

export default async function JoinPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12">
      <JoinClient />
    </main>
  );
}
