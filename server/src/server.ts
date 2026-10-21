import Fastify from "fastify";
import { sql } from "kysely";
import { config } from "./config.js";
import { db } from "./db/index.js";

const app = Fastify({ logger: true });

app.get("/check", async () => {
  await sql`select 1`.execute(db);
  return { status: "ok" };
});

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
