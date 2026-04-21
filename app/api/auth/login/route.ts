import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb/client";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE_NAME, verifyPassword } from "@/lib/auth/session";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ email: email.toLowerCase() });
  if (!user || typeof user.passwordHash !== "string") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
  });

  const response = NextResponse.json({ ok: true, user: { id: user._id.toString(), email: user.email, name: user.name } });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
