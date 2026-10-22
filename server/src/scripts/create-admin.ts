import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { hashPassword } from "../auth/crypto.js";
import { emailSchema, passwordSchema, usernameSchema } from "../auth/schemas.js";
import { db } from "../db/index.js";
import { uniqueViolation } from "../db/errors.js";

// Readline whose echo can be switched off, so the password isn't shown.
let muted = false;
const out = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk);
    cb();
  },
});
const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });

async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const answer = await rl.question("");
  muted = false;
  if (hidden) process.stdout.write("\n");
  return answer.trim();
}

try {
  const email = emailSchema.parse(await ask("Email: "));
  const username = usernameSchema.parse(await ask("Username: "));
  const password = passwordSchema.parse(await ask("Password (min 10 chars): ", true));

  await db
    .insertInto("users")
    .values({
      email,
      username,
      password_hash: await hashPassword(password),
      role: "admin",
      quota_bytes: 10 * 1024 ** 3, // 10 GiB
    })
    .execute();
  console.log(`Admin "${username}" created.`);
} catch (err) {
  if (uniqueViolation(err)) console.error("That email or username already exists.");
  else console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  rl.close();
  await db.destroy();
}
