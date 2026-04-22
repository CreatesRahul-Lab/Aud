import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/mongodb/client";

/**
 * Verifies that the currently logged-in user is the host of the given room.
 * Uses the JWT cookie + MongoDB so it works across all Vercel serverless instances
 * (no reliance on in-memory state).
 *
 * Returns the userId if verified, or null if unauthorized.
 */
export async function verifyHost(code: string): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const db = await getDb();
  const room = await db.collection("rooms").findOne({ code });
  if (!room) return null;

  if (room.hostUserId !== user.userId) return null;

  return user.userId;
}
