import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { config } from "../config.js";
import type { DB } from "./types.js";

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 }),
  }),
});
