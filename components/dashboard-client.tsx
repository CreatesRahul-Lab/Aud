"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

export function DashboardClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  async function parseResponse(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async function createRoom() {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/rooms", { method: "POST" });
    const data = await parseResponse(response);
    setPending(false);
    if (!response.ok) {
      setMessage({ text: typeof data.error === "string" ? data.error : "Unable to create room", ok: false });
      return;
    }
    const room = data.room as { code?: string } | undefined;
    if (!room?.code) {
      setMessage({ text: "Invalid room response", ok: false });
      return;
    }
    router.push(`/room/${room.code}`);
  }

  async function uploadAudio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const titleInput = form.elements.namedItem("title") as HTMLInputElement;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (!file) {
      setMessage({ text: "Please choose an audio file.", ok: false });
      return;
    }

    setPending(true);
    setMessage(null);
    setUploadProgress(0);

    try {
      // ── Step 1: Upload directly from browser to Cloudinary ──────────────
      const cloudForm = new FormData();
      cloudForm.append("file", file);
      cloudForm.append("upload_preset", UPLOAD_PRESET);
      cloudForm.append("resource_type", "video"); // Cloudinary uses "video" for audio too

      const cloudRes = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
        );
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener("load", () => {
          try {
            resolve(JSON.parse(xhr.responseText) as Record<string, unknown>);
          } catch {
            reject(new Error("Bad Cloudinary response"));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.send(cloudForm);
      });

      if (typeof cloudRes.secure_url !== "string") {
        throw new Error((cloudRes.error as { message?: string })?.message ?? "Cloudinary upload failed");
      }

      const cloudinaryUrl = cloudRes.secure_url as string;
      const cloudinaryPublicId = cloudRes.public_id as string;

      // ── Step 2: Save metadata to our API (no file bytes) ────────────────
      const metaRes = await fetch("/api/audio/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleInput.value.trim() || file.name,
          cloudinaryUrl,
          cloudinaryPublicId,
          fileName: file.name,
          contentType: file.type || "audio/mpeg",
        }),
      });

      const metaData = await parseResponse(metaRes);
      if (!metaRes.ok) {
        throw new Error(typeof metaData.error === "string" ? metaData.error : "Failed to save track metadata");
      }

      setMessage({ text: `✓ "${titleInput.value.trim() || file.name}" uploaded successfully!`, ok: true });
      form.reset();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Upload failed", ok: false });
    } finally {
      setPending(false);
      setUploadProgress(null);
    }
  }

  async function handleJoin() {
    if (!roomCode) return;
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
            <input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} maxLength={6} placeholder="123456" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 tracking-[0.4em] text-white outline-none" />
            <button onClick={handleJoin} className="rounded-2xl bg-white px-4 py-3 font-medium text-slate-950">Join</button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
        <h2 className="text-xl font-medium text-white">Upload Audio</h2>
        <p className="mt-1 text-sm text-slate-400">Files are uploaded directly to Cloudinary — no size limit.</p>
        <form onSubmit={uploadAudio} className="mt-4 space-y-4">
          <input name="title" placeholder="Track title" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none" />
          <input name="file" type="file" accept="audio/*" required className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white file:mr-4 file:rounded-full file:border-0 file:bg-sky-400 file:px-4 file:py-2 file:font-medium file:text-slate-950" />

          {/* Progress bar */}
          {uploadProgress !== null && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          <button disabled={pending} className="rounded-2xl bg-amber-400 px-4 py-3 font-medium text-slate-950 disabled:opacity-60">
            {pending ? (uploadProgress !== null ? `Uploading… ${uploadProgress}%` : "Saving…") : "Upload Track"}
          </button>
        </form>
        {message ? (
          <p className={`mt-4 text-sm ${message.ok ? "text-emerald-400" : "text-red-400"}`}>{message.text}</p>
        ) : null}
      </section>
    </div>
  );
}
