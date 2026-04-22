export type Role = "host" | "listener";

export type RoomPlaybackState = {
  trackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  updatedAt: string;
};

export type RoomState = {
  code: string;
  hostUserId: string;
  participants: Array<{
    userId: string;
    clientId: string;
    name: string;
    role: Role;
    connected: boolean;
  }>;
  playback: RoomPlaybackState;
};
