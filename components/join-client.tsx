"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinClient() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/room/${code}`);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
      <h1 className="text-3xl font-semibold text-white">Join a room</h1>
      <p className="mt-2 text-sm text-slate-300">Enter the 6-digit room code from the host device.</p>
      <div className="mt-4 flex gap-3">
        <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} required placeholder="000000" className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 tracking-[0.4em] text-white outline-none" />
        <button className="rounded-2xl bg-sky-400 px-4 py-3 font-medium text-slate-950">Join</button>
      </div>
    </form>
  );
}
