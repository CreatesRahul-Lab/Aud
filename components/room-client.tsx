"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RoomState } from "@/types";

export function RoomClient({ code, initialState, userId, userName, role, tracks }: { code: string; initialState: RoomState | null; userId: string; userName: string; role: "host" | "listener"; tracks: Array<{ assetId: string; title: string }>; }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const clientIdRef = useRef(crypto.randomUUID());
  const joinedRef = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<RoomState | null>(initialState);
  const [volume, setVolume] = useState(initialState?.playback.volume ?? 1);

  const post = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    if (joinedRef.current) await joinedRef.current;
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, clientId: clientIdRef.current }),
    });
  }, []);

  useEffect(() => {
    const clientId = clientIdRef.current;
    const source = new EventSource(`/api/sse/${code}?clientId=${clientId}`);

    source.addEventListener("open", () => {
      joinedRef.current = fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, userId, name: userName, role, clientId }),
      }).then(() => {});
    });

    source.addEventListener("room:state", (e) => {
      const nextState: RoomState = JSON.parse(e.data);
      setState(nextState);
      setVolume(nextState.playback.volume);
    });

    source.addEventListener("room:play", (e) => {
      const playback = JSON.parse(e.data);
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
      playPromiseRef.current = audio.play();
    });

    source.addEventListener("room:pause", (e) => {
      const playback = JSON.parse(e.data);
      const audio = audioRef.current;
      if (!audio) return;
      const settle = playPromiseRef.current ?? Promise.resolve();
      settle.then(() => {
        audio.currentTime = playback.currentTime;
        audio.pause();
      }).catch(() => {});
    });

    source.addEventListener("room:seek", (e) => {
      const playback = JSON.parse(e.data);
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
    });

    return () => {
      source.close();
    };
  }, [code, role, userId, userName]);

  function emitPlay() {
    const audio = audioRef.current;
    if (!audio) return;
    post("/api/room/play", { code, currentTime: audio.currentTime, trackId: state?.playback.trackId ?? null });
  }

  function emitPause() {
    const audio = audioRef.current;
    if (!audio) return;
    post("/api/room/pause", { code, currentTime: audio.currentTime });
  }

  function emitSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number(event.target.value);
    if (!audio) return;
    audio.currentTime = value;
    post("/api/room/seek", { code, currentTime: value });
  }

  function emitTrack(trackId: string | null) {
    post("/api/room/track", { code, trackId });
  }

  function emitVolume(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const nextVolume = Number(event.target.value);
    if (!audio) return;
    audio.volume = nextVolume;
    setVolume(nextVolume);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-sky-300/80">Room {code}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{role === "host" ? "Host dashboard" : "Listener view"}</h1>
        <p className="mt-2 text-sm text-slate-300">Connected as {userName}. Playback is synchronized in real time via SSE.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          {role === "host" ? (
            <label className="mb-4 block space-y-2 text-sm text-slate-300">
              <span>Active track</span>
              <select
                value={state?.playback.trackId ?? ""}
                onChange={(event) => emitTrack(event.target.value || null)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
              >
                <option value="">Select a track</option>
                {tracks.map((track) => (
                  <option key={track.assetId} value={track.assetId}>
                    {track.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <audio ref={audioRef} controls className="w-full" src={state?.playback.trackId ? `/api/audio/${state.playback.trackId}` : undefined} />
          {role === "host" ? (
            <>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={emitPlay} className="rounded-2xl bg-sky-400 px-4 py-3 font-medium text-slate-950">Play</button>
                <button onClick={emitPause} className="rounded-2xl bg-white px-4 py-3 font-medium text-slate-950">Pause</button>
              </div>
              <label className="mt-6 block space-y-2 text-sm text-slate-300">
                <span>Seek</span>
                <input type="range" min="0" max="3600" defaultValue={0} onChange={emitSeek} className="w-full" />
              </label>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-400">Playback controls are host-only. Your device follows the room state in real time.</p>
          )}
          <label className="mt-4 block space-y-2 text-sm text-slate-300">
            <span>Volume: {Math.round(volume * 100)}%</span>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={emitVolume} className="w-full" />
          </label>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          <h2 className="text-xl font-medium text-white">Participants</h2>
          <div className="mt-4 space-y-3">
            {state?.participants.map((participant) => (
              <div key={participant.clientId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                {participant.name} - {participant.role} {participant.connected ? "online" : "offline"}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
