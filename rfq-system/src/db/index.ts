import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePostgres } from 'drizzle-orm/vercel-postgres';
import Database from 'better-sqlite3';
import { sql as vercelSql } from '@vercel/postgres';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';

// Determine which database to use based on environment
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

let db: ReturnType<typeof drizzleSQLite> | ReturnType<typeof drizzlePostgres>;

if (isProduction && databaseUrl?.startsWith('postgres')) {
  // Use Vercel Postgres in production
  db = drizzlePostgres(vercelSql, { schema });
  console.log('📊 Using Vercel Postgres');
} else {
  // Use SQLite for local development
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/local.db';
  const dbDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL'); // Better concurrency
  db = drizzleSQLite(sqlite, { schema });
  console.log(`📊 Using SQLite: ${dbPath}`);
}

export { db };
export * from './schema';
