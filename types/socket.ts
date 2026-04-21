export type RoomJoinPayload = {
  code: string;
  userId: string;
  name: string;
  role: "host" | "listener";
};

export type PlaybackCommandPayload = {
  code: string;
  currentTime: number;
  trackId?: string | null;
};

export type VolumePayload = {
  code: string;
  volume: number;
};
