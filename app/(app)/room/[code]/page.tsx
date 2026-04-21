import { redirect } from "next/navigation";
import { RoomClient } from "@/components/room-client";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/mongodb/client";

type RoomPageProps = {
  params: Promise<{ code: string }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const { code } = await params;
  const db = await getDb();
  const room = await db.collection("rooms").findOne({ code });
  const tracks = await db.collection("audioAssets").find({ ownerId: user.userId }).sort({ createdAt: -1 }).toArray();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <RoomClient
        code={code}
        initialState={room ? { code: room.code, hostUserId: room.hostUserId, participants: [], playback: room.playback } : null}
        userId={user.userId}
        userName={user.name}
        role={room?.hostUserId === user.userId ? "host" : "listener"}
        tracks={tracks.map((track) => ({ assetId: track.assetId, title: track.title }))}
      />
    </main>
  );
}
