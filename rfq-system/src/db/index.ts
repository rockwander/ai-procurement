import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

type DB = NeonHttpDatabase<typeof schema>;

let _db: DB | null = null;

function getDb(): DB {
  if (_db) return _db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Point it at a Postgres connection string ' +
        '(e.g. a Neon database URL).'
    );
  }

  _db = drizzle(neon(databaseUrl), { schema });
  return _db;
}

// Lazy proxy: the connection is only created on first property access (i.e. the
// first query), so importing this module during `next build` never throws even
// when DATABASE_URL is absent at build time.
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

export * from './schema';
