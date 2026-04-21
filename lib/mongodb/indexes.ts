import { getDb } from "./client";

export async function ensureIndexes() {
  const db = await getDb();

  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("rooms").createIndex({ code: 1 }, { unique: true }),
    db.collection("rooms").createIndex({ hostUserId: 1 }),
    db.collection("audioAssets").createIndex({ ownerId: 1 }),
    db.collection("roomEvents").createIndex({ roomCode: 1, createdAt: -1 }),
  ]);
}
