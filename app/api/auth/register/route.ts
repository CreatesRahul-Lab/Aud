import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb/client";
import { createSessionToken, hashPassword, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db.collection("users").findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    const now = new Date();
    const passwordHash = await hashPassword(password);
    const result = await db.collection("users").insertOne({
      email: email.toLowerCase(),
      name,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const token = await createSessionToken({ userId: result.insertedId.toString(), email, name });
    const response = NextResponse.json({ ok: true, user: { id: result.insertedId.toString(), email, name } });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Register error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
