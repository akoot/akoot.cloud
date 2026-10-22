import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { newToken, sha256Hex } from "../auth/crypto.js";
import { requireAdmin } from "../auth/guards.js";
import { db } from "../db/index.js";

const createBody = z.object({
  expires_in_days: z.number().int().min(1).max(30).default(7),
});

export async function inviteRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: requireAdmin }, async (req, reply) => {
    const { expires_in_days } = createBody.parse(req.body ?? {});
    const code = newToken(16);
    const expiresAt = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000);

    await db
      .insertInto("invites")
      .values({ code_hash: sha256Hex(code), created_by: req.user!.id, expires_at: expiresAt })
      .execute();

    // The plaintext code is shown exactly once; only its hash is stored.
    return reply.code(201).send({ code, expires_at: expiresAt });
  });
}
