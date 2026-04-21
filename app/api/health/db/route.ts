import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, db: "reachable" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    console.error("DB health check failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
