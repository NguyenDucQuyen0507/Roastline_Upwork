import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

// Same relative path from src/db (tsx) and dist/db (compiled).
const dir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

/**
 * Applies db/migrations/*.sql in name order, each in its own transaction,
 * and records them in schema_migrations. Safe to run on every start: an
 * advisory lock stops two instances from migrating at the same time.
 */
export async function migrate(pool: pg.Pool, log: (msg: string) => void = () => {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['roastline:migrate']);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files.filter((f) => !done.has(f))) {
      const sql = await readFile(dir + file, 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`Applied migration ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['roastline:migrate']).catch(() => {});
    client.release();
  }
}
