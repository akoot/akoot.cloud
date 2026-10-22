import type { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_COOKIE, findSessionUser, type AuthUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

/** preHandler: rejects with 401 unless the request has a valid session. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  const user = token ? await findSessionUser(token) : null;
  if (!user) return reply.code(401).send({ error: "unauthorized" });
  req.user = user;
}

/** preHandler: like requireAuth, but also requires the admin role. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const denied = await requireAuth(req, reply);
  if (denied) return denied;
  if (req.user?.role !== "admin") return reply.code(403).send({ error: "forbidden" });
}
