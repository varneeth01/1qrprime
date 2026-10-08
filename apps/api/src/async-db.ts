import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";

export type DbResult<T extends QueryResultRow = QueryResultRow> = {
  rows: T[];
  rowCount: number;
};

export interface DbTransaction {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbResult<T>>;
  get<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
}

export interface AsyncDatabase extends DbTransaction {
  transaction<T>(work: (tx: DbTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createSqliteDatabase(raw: any): AsyncDatabase {
  const sqliteParams = (params: unknown[]) =>
    params.map((value) => (typeof value === "boolean" ? (value ? 1 : 0) : value));
  const tx: DbTransaction = {
    async query(sql, params = []) {
      const statement = raw.prepare(sql);
      const rows = statement.all(...sqliteParams(params));
      return { rows, rowCount: rows.length };
    },
    async get(sql, params = []) {
      return raw.prepare(sql).get(...sqliteParams(params));
    },
    async all(sql, params = []) {
      return raw.prepare(sql).all(...sqliteParams(params));
    },
    async run(sql, params = []) {
      const result = raw.prepare(sql).run(...sqliteParams(params));
      return { rowCount: result.changes ?? 0 };
    },
  };
  return {
    ...tx,
    async transaction(work) {
      raw.exec("BEGIN");
      try {
        const value = await work(tx);
        raw.exec("COMMIT");
        return value;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      raw.close();
    },
  };
}

function postgresPlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`)
    .replace(/date\('now'\)/gi, "CURRENT_DATE")
    .replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
}

class PostgresTransaction implements DbTransaction {
  constructor(private readonly client: PoolClient) {}

  query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.client.query<T>(postgresPlaceholders(sql), params).then((result) => ({
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    }));
  }

  async get<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    const result = await this.query<T>(sql, params);
    return result.rows[0];
  }

  async all<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    return (await this.query<T>(sql, params)).rows;
  }

  async run(sql: string, params: unknown[] = []) {
    const result = await this.query(sql, params);
    return { rowCount: result.rowCount ?? 0 };
  }
}

export class PostgresDatabase implements AsyncDatabase {
  constructor(readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.pool.query<T>(postgresPlaceholders(sql), params).then((result) => ({
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    }));
  }

  async get<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    const result = await this.query<T>(sql, params);
    return result.rows[0];
  }

  async all<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    return (await this.query<T>(sql, params)).rows;
  }

  async run(sql: string, params: unknown[] = []) {
    const result = await this.query(sql, params);
    return { rowCount: result.rowCount ?? 0 };
  }

  async transaction<T>(work: (tx: DbTransaction) => Promise<T>) {
    const client = await this.pool.connect();
    const tx = new PostgresTransaction(client);
    try {
      await client.query("BEGIN");
      const value = await work(tx);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

let sharedPool: Pool | undefined;

export function createPostgresDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL");
  sharedPool ??= new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // Only attach lifecycle hooks inside Vercel. A long-running VPS process keeps
  // the PostgreSQL pool alive normally.
  if (process.env.VERCEL) attachDatabasePool(sharedPool);
  return new PostgresDatabase(sharedPool);
}

export function resetPostgresPoolForTests() {
  sharedPool = undefined;
}
