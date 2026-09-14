import fs from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';

export function findSchemaSqlPath(): string {
  const candidates = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../../backend/db/schema.sql'),
    path.resolve(process.cwd(), 'backend/db/schema.sql'),
    path.resolve(process.cwd(), 'dist/db/schema.sql')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `schema.sql not found in any expected location: ${candidates.join(', ')}`
  );
}

export function getSchemaSql(): string {
  const filePath = findSchemaSqlPath();
  return fs.readFileSync(filePath, 'utf8');
}

export async function applySchema(db: Pool | PoolClient): Promise<void> {
  const rawSql = getSchemaSql();

  // 1. Try extension creation separately with error suppression for hosted DBs
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  } catch (err: any) {
    // Non-fatal: unprivileged PostgreSQL instances may not permit extension creation
    // All tables use explicit VARCHAR(64) IDs so uuid-ossp is not strictly mandatory
    console.warn('[Database] Optional uuid-ossp extension skipped:', err.message);
  }

  // 2. Filter out the extension statement and execute tables & indexes
  const cleanSql = rawSql
    .split('\n')
    .filter((line) => !line.trim().toUpperCase().startsWith('CREATE EXTENSION'))
    .join('\n');

  await db.query(cleanSql);
}
