"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DashboardClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createRoom() {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/rooms", { method: "POST" });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage(data.error ?? "Unable to create room");
      return;
    }

    router.push(`/room/${data.room.code}`);
  }

  async function uploadAudio(formData: FormData) {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/audio/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage(data.error ?? "Upload failed");
      return;
    }

    setMessage(`Uploaded track ${data.assetId}`);
  }

  async function handleJoin() {
    if (!roomCode) {
      return;
    }
    router.push(`/room/${roomCode}`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-sky-300/80">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Welcome, {userName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Create a room as host, upload a real audio file, or join an existing room by code.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          <h2 className="text-xl font-medium text-white">Connect Devices</h2>
          <p className="mt-2 text-sm text-slate-300">Generate a new room and become the host.</p>
          <button onClick={createRoom} disabled={pending} className="mt-4 rounded-2xl bg-sky-400 px-4 py-3 font-medium text-slate-950 disabled:opacity-60">
            {pending ? "Creating..." : "Create Room"}
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          <h2 className="text-xl font-medium text-white">Join Device</h2>
          <p className="mt-2 text-sm text-slate-300">Enter a 6-digit room code to join a host session.</p>
          <div className="mt-4 flex gap-3">
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} maxLength={6} placeholder="123456" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 tracking-[0.4em] text-white outline-none" />
            <button onClick={handleJoin} className="rounded-2xl bg-white px-4 py-3 font-medium text-slate-950">Join</button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
        <h2 className="text-xl font-medium text-white">Upload Audio</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void uploadAudio(new FormData(event.currentTarget));
          }}
          className="mt-4 space-y-4"
        >
          <input name="title" placeholder="Track title" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none" />
          <input name="file" type="file" accept="audio/*" required className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white file:mr-4 file:rounded-full file:border-0 file:bg-sky-400 file:px-4 file:py-2 file:font-medium file:text-slate-950" />
          <button disabled={pending} className="rounded-2xl bg-amber-400 px-4 py-3 font-medium text-slate-950 disabled:opacity-60">{pending ? "Uploading..." : "Upload Track"}</button>
        </form>
        {message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}
      </section>
    </div>
  );
}
