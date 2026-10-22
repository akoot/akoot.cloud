import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { sql } from "kysely";
import { ZodError } from "zod";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { authRoutes } from "./routes/auth.js";
import { inviteRoutes } from "./routes/invites.js";

const app = Fastify({ logger: true, trustProxy: config.TRUST_PROXY });

await app.register(cookie);
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
app.decorateRequest("user", null);

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "validation_error", issues: err.issues });
  }
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status < 500) {
    return reply.code(status).send({ error: err instanceof Error ? err.message : "error" });
  }
  req.log.error(err);
  return reply.code(500).send({ error: "internal_error" });
});

app.get("/health", async () => {
  await sql`select 1`.execute(db);
  return { status: "ok" };
});

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(inviteRoutes, { prefix: "/api/invites" });

const shutdown = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
