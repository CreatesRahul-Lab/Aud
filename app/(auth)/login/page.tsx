import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-12">
      <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-glow backdrop-blur">
          <p className="text-sm uppercase tracking-[0.35em] text-amber-300/80">Realtime audio sync</p>
          <h2 className="mt-4 text-5xl font-semibold leading-tight text-white">Connect devices, host playback, and keep every listener in sync.</h2>
          <p className="mt-4 max-w-xl text-slate-300">A real Next.js and MongoDB prototype with SSE-synchronized rooms, local audio playback, and persistent auth.</p>
          <Link href="/register" className="mt-6 inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">Create account</Link>
        </section>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
