import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const SESSION_COOKIE = "volum_session";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: { userId: string; email: string; name: string }) {
  return jwt.sign({ email: payload.email, name: payload.name }, getSecret(), {
    subject: payload.userId,
    expiresIn: "7d",
  });
}

export async function readSessionToken(token: string) {
  const verified = jwt.verify(token, getSecret()) as jwt.JwtPayload;
  return {
    userId: String(verified.sub ?? ""),
    email: String(verified.email ?? ""),
    name: String(verified.name ?? ""),
  };
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    return await readSessionToken(token);
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
