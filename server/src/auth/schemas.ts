import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,32}$/, "3-32 characters: letters, numbers, _ and -");
// Upper bound stops absurdly long inputs from being fed to the hasher.
export const passwordSchema = z.string().min(10).max(128);
