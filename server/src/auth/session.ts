import type { FastifyReply } from "fastify";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { newToken, sha256Hex } from "./crypto.js";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // update last_seen_at at most hourly

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  quota_bytes: number;
  used_bytes: number;
};

export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = newToken();
  await db
    .insertInto("sessions")
    .values({
      token_hash: sha256Hex(token),
      user_id: userId,
      user_agent: userAgent?.slice(0, 255) ?? null,
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    })
    .execute();
  return token;
}

export async function findSessionUser(token: string): Promise<AuthUser | null> {
  const tokenHash = sha256Hex(token);
  const row = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .select([
      "users.id",
      "users.email",
      "users.username",
      "users.role",
      "users.quota_bytes",
      "users.used_bytes",
      "sessions.last_seen_at",
    ])
    .where("sessions.token_hash", "=", tokenHash)
    .where("sessions.expires_at", ">", new Date())
    .where("users.is_active", "=", true)
    .executeTakeFirst();
  if (!row) return null;

  if (Date.now() - row.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .updateTable("sessions")
      .set({ last_seen_at: new Date() })
      .where("token_hash", "=", tokenHash)
      .execute();
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role === "admin" ? "admin" : "user",
    // bigint columns arrive as strings; safe to convert up to ~9 PB
    quota_bytes: Number(row.quota_bytes),
    used_bytes: Number(row.used_bytes),
  };
}

export async function deleteSession(token: string): Promise<void> {
  await db.deleteFrom("sessions").where("token_hash", "=", sha256Hex(token)).execute();
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, // not readable from JavaScript
    sameSite: "lax", // not sent on cross-site POSTs (CSRF protection)
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}
