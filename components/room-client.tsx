"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RoomState } from "@/types";

export function RoomClient({
  code,
  initialState,
  userId,
  userName,
  role,
  tracks,
}: {
  code: string;
  initialState: RoomState | null;
  userId: string;
  userName: string;
  role: "host" | "listener";
  tracks: Array<{ assetId: string; title: string }>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const clientIdRef = useRef(crypto.randomUUID());
  const joinedRef = useRef<Promise<void> | null>(null);

  const [state, setState] = useState<RoomState | null>(initialState);
  const [volume, setVolume] = useState(initialState?.playback.volume ?? 1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const post = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    if (joinedRef.current) await joinedRef.current;
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, clientId: clientIdRef.current }),
    });
  }, []);

  // SSE connection
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
      const v = nextState.playback.volume;
      setVolume(v);
      if (audioRef.current) audioRef.current.volume = v;
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
      settle
        .then(() => {
          audio.currentTime = playback.currentTime;
          audio.pause();
        })
        .catch(() => {});
    });

    source.addEventListener("room:seek", (e) => {
      const playback = JSON.parse(e.data);
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
    });

    // Host-pushed volume — applies to ALL clients (including host's own audio)
    source.addEventListener("room:volume", (e) => {
      const { volume: v } = JSON.parse(e.data);
      setVolume(v);
      if (audioRef.current) audioRef.current.volume = v;
    });

    return () => source.close();
  }, [code, role, userId, userName]);

  // Keep seek bar in sync while playing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
    };
  });

  function emitPlay() {
    const audio = audioRef.current;
    if (!audio) return;
    post("/api/room/play", {
      code,
      currentTime: audio.currentTime,
      trackId: state?.playback.trackId ?? null,
    });
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
    setCurrentTime(value);
    post("/api/room/seek", { code, currentTime: value });
  }

  function emitTrack(trackId: string | null) {
    post("/api/room/track", { code, trackId });
  }

  // Host changes volume → broadcast to all listeners
  function emitVolume(event: React.ChangeEvent<HTMLInputElement>) {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    if (audioRef.current) audioRef.current.volume = nextVolume;
    post("/api/room/volume", { code, volume: nextVolume });
  }

  function formatTime(s: number) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-sky-300/80">Room {code}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          {role === "host" ? "Host dashboard" : "Listener view"}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Connected as {userName}. Playback is synchronized in real time via SSE.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          {role === "host" ? (
            <label className="mb-4 block space-y-2 text-sm text-slate-300">
              <span>Active track</span>
              <select
                value={state?.playback.trackId ?? ""}
                onChange={(e) => emitTrack(e.target.value || null)}
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

          {/* Hidden audio element — listeners are driven by SSE events */}
          <audio
            ref={audioRef}
            src={
              state?.playback.trackId
                ? `/api/audio/${state.playback.trackId}`
                : undefined
            }
          />

          {role === "host" ? (
            <>
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  onClick={emitPlay}
                  className="rounded-2xl bg-sky-400 px-5 py-3 font-medium text-slate-950 hover:bg-sky-300 transition-colors"
                >
                  Play
                </button>
                <button
                  onClick={emitPause}
                  className="rounded-2xl bg-white px-5 py-3 font-medium text-slate-950 hover:bg-slate-100 transition-colors"
                >
                  Pause
                </button>
              </div>

              <label className="mt-6 block space-y-2 text-sm text-slate-300">
                <span>
                  Seek — {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={duration || 1}
                  step="0.1"
                  value={currentTime}
                  onChange={emitSeek}
                  className="w-full accent-sky-400"
                />
              </label>

              <label className="mt-4 block space-y-2 text-sm text-slate-300">
                <span>Volume (all devices): {Math.round(volume * 100)}%</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={emitVolume}
                  className="w-full accent-violet-400"
                />
              </label>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-400">
                Playback is controlled by the host. Your device follows the room in real time.
              </p>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <span className="text-slate-400">Volume set by host:</span>{" "}
                <span className="font-medium text-white">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          <h2 className="text-xl font-medium text-white">Participants</h2>
          <div className="mt-4 space-y-3">
            {state?.participants.map((participant) => (
              <div
                key={participant.clientId}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              >
                <span className="font-medium">{participant.name}</span>
                <span className="mx-2 text-slate-500">·</span>
                <span className="text-slate-400">{participant.role}</span>
                <span className="mx-2 text-slate-500">·</span>
                <span className={participant.connected ? "text-emerald-400" : "text-rose-400"}>
                  {participant.connected ? "online" : "offline"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
