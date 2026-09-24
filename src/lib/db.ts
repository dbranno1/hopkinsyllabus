import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPool } from "@vercel/postgres";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT,
  instructor  TEXT,
  term        TEXT,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS syllabus_files (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  file_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  text        TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  due_time    TEXT,
  notes       TEXT,
  confidence  REAL NOT NULL DEFAULT 1,
  source      TEXT NOT NULL DEFAULT 'manual',
  completed   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_course_date ON events (course_id, due_date);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (due_date);
CREATE INDEX IF NOT EXISTS idx_syllabus_course ON syllabus_files (course_id, uploaded_at DESC);

-- Parsed uploads waiting for the user to confirm them in the review step.
CREATE TABLE IF NOT EXISTS pending_uploads (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  file_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
`;

export function databasePath(): string {
  const dir =
    process.env.HOPSYLLABUS_DATA_DIR ??
    path.join(process.cwd(), ".data");
  return path.join(dir, "hopsyllabus.db");
}

function connectSqlite(): DatabaseSync {
  const file = databasePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

type Row = Record<string, unknown>;
type SqliteValue = string | number | bigint | null | Uint8Array;
export type QueryFn = <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

const globalForDb = globalThis as typeof globalThis & {
  __hopsyllabusDb?: DatabaseSync;
  __hopsyllabusPool?: ReturnType<typeof createPool>;
  __hopsyllabusReady?: Promise<void>;
};

const POSTGRES_ENV_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
] as const;

function postgresUrl(): string | null {
  for (const key of POSTGRES_ENV_KEYS) {
    const value = process.env[key];
    if (value) return value;
  }
  return null;
}

function hasPostgres(): boolean {
  return postgresUrl() !== null;
}

function toPostgresQuery(sql: string): string {
  let parameter = 0;
  return sql.replace(/\?/g, () => `$${++parameter}`);
}

function isReadQuery(sql: string): boolean {
  return /^\s*(SELECT|WITH|PRAGMA)/i.test(sql);
}

function getDb(): DatabaseSync {
  if (!globalForDb.__hopsyllabusDb) globalForDb.__hopsyllabusDb = connectSqlite();
  return globalForDb.__hopsyllabusDb;
}

function getPool() {
  if (!globalForDb.__hopsyllabusPool) {
    globalForDb.__hopsyllabusPool = createPool({
      connectionString: postgresUrl() ?? undefined,
    });
  }
  return globalForDb.__hopsyllabusPool;
}

async function ensureReady(): Promise<void> {
  if (!hasPostgres()) {
    if (process.env.VERCEL === "1") {
      throw new Error(
        "Persistent storage is not configured. Add a Vercel Postgres or Neon integration and redeploy.",
      );
    }
    return;
  }
  if (!globalForDb.__hopsyllabusReady) {
    globalForDb.__hopsyllabusReady = (async () => {
      const statements = SCHEMA.split(";").map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) await getPool().query(statement);
    })();
  }
  await globalForDb.__hopsyllabusReady;
}

export async function query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureReady();
  if (hasPostgres()) {
    const result = await getPool().query(toPostgresQuery(sql), params);
    return result.rows as T[];
  }
  return getDb().prepare(sql).all(...params as SqliteValue[]) as unknown as T[];
}

export async function run(sql: string, params: unknown[] = []): Promise<number> {
  await ensureReady();
  if (hasPostgres()) return (await getPool().query(toPostgresQuery(sql), params)).rowCount ?? 0;
  return Number(getDb().prepare(sql).run(...params as SqliteValue[]).changes);
}

export async function transaction<T>(fn: (transactionQuery: QueryFn) => Promise<T>): Promise<T> {
  await ensureReady();
  if (!hasPostgres()) {
    const db = getDb();
    db.exec("BEGIN");
    const transactionQuery: QueryFn = async <R extends Row = Row>(sql: string, params: unknown[] = []) => {
      const statement = db.prepare(sql);
      if (isReadQuery(sql)) return statement.all(...params as SqliteValue[]) as unknown as R[];
      statement.run(...params as SqliteValue[]);
      return [];
    };
    try {
      const result = await fn(transactionQuery);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const client = await getPool().connect();
  await client.sql`BEGIN`;
  const transactionQuery: QueryFn = async <R extends Row = Row>(sql: string, params: unknown[] = []) =>
    (await client.query(toPostgresQuery(sql), params)).rows as R[];
  try {
    const result = await fn(transactionQuery);
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}
