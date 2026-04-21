"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
    };

    const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Authentication failed");
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
      <div>
        <p className="text-sm uppercase tracking-[0.35em] text-sky-300/80">Volum</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="mt-2 text-sm text-slate-300">Real auth backed by MongoDB.</p>
      </div>

      {mode === "register" && (
        <label className="block space-y-2 text-sm">
          <span className="text-slate-300">Name</span>
          <input name="name" required className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-sky-400" />
        </label>
      )}

      <label className="block space-y-2 text-sm">
        <span className="text-slate-300">Email</span>
        <input name="email" type="email" required className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-sky-400" />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="text-slate-300">Password</span>
        <input name="password" type="password" required minLength={8} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-sky-400" />
      </label>

      {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

      <button disabled={pending} className="w-full rounded-2xl bg-gradient-to-r from-sky-400 to-amber-400 px-4 py-3 font-medium text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
