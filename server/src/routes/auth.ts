import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import { DUMMY_HASH, hashPassword, sha256Hex, verifyPassword } from "../auth/crypto.js";
import { requireAuth } from "../auth/guards.js";
import { emailSchema, passwordSchema, usernameSchema } from "../auth/schemas.js";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
} from "../auth/session.js";
import { db } from "../db/index.js";
import { uniqueViolation } from "../db/errors.js";

const registerBody = z.object({
  invite_code: z.string().min(1).max(200),
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
});

const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const strictLimit = { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } };

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", strictLimit, async (req, reply) => {
    const body = registerBody.parse(req.body);
    // Hash before opening the transaction so the slow hash never holds a row lock.
    const passwordHash = await hashPassword(body.password);

    let userId: string | null;
    try {
      userId = await db.transaction().execute(async (trx) => {
        // FOR UPDATE: two simultaneous signups can't both consume one invite.
        const invite = await trx
          .selectFrom("invites")
          .select("id")
          .where("code_hash", "=", sha256Hex(body.invite_code))
          .where("used_at", "is", null)
          .where("expires_at", ">", new Date())
          .forUpdate()
          .executeTakeFirst();
        if (!invite) return null;

        const user = await trx
          .insertInto("users")
          .values({ email: body.email, username: body.username, password_hash: passwordHash })
          .returning("id")
          .executeTakeFirstOrThrow();

        await trx
          .updateTable("invites")
          .set({ used_by: user.id, used_at: new Date() })
          .where("id", "=", invite.id)
          .execute();
        return user.id;
      });
    } catch (err) {
      const constraint = uniqueViolation(err);
      if (constraint === "users_email_unique") return reply.code(409).send({ error: "email_taken" });
      if (constraint === "users_username_unique")
        return reply.code(409).send({ error: "username_taken" });
      throw err;
    }

    if (!userId) return reply.code(400).send({ error: "invalid_invite" });

    const token = await createSession(userId, req.headers["user-agent"]);
    setSessionCookie(reply, token);
    return reply.code(201).send({ id: userId });
  });

  app.post("/login", strictLimit, async (req, reply) => {
    const body = loginBody.parse(req.body);

    const user = await db
      .selectFrom("users")
      .select(["id", "password_hash", "is_active"])
      .where(sql<string>`lower(email)`, "=", body.email)
      .executeTakeFirst();

    // Always run one argon2 verification, whether or not the user exists.
    const ok = await verifyPassword(user?.password_hash ?? DUMMY_HASH, body.password);
    if (!user || !ok || !user.is_active) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const token = await createSession(user.id, req.headers["user-agent"]);
    setSessionCookie(reply, token);
    return { id: user.id };
  });

  app.post("/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(token);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: requireAuth }, async (req) => req.user);
}
