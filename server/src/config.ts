import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("127.0.0.1"),
  STORAGE_DIR: z.string().min(1),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(2 * 1024 ** 3), // 2 GiB
});

// Fails fast at startup with a readable error if anything is missing or malformed.
export const config = schema.parse(process.env);
