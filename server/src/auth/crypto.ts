import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id });

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Verified against when an email doesn't exist, so "unknown user" and
// "wrong password" take about the same time.
export const DUMMY_HASH = await hashPassword("not-a-real-password");

/** URL-safe random token (256 bits). Used for session cookies and invite codes. */
export const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Tokens are stored hashed, so a leaked database can't be used to log in. */
export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");
