import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL est absente de la configuration.'
  );
}

export const sql = neon(databaseUrl);