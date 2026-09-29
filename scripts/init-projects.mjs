import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL est absente de la configuration.'
  );
}

const sql = neon(databaseUrl);

console.log('Connexion PostgreSQL détectée.');

await sql`
  CREATE TABLE IF NOT EXISTS simirork_projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',

    apk_status TEXT NOT NULL DEFAULT 'none'
      CHECK (
        apk_status IN (
          'none',
          'building',
          'ready',
          'error'
        )
      ),

    apk_run_id TEXT,
    apk_error TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_simirork_projects_user_id
  ON simirork_projects(user_id)
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_simirork_projects_updated_at
  ON simirork_projects(updated_at DESC)
`;

console.log(
  '✅ Table simirork_projects créée/vérifiée.'
);

console.log(
  '✅ Index des projets créés/vérifiés.'
);

console.log(
  '✅ Structure PostgreSQL des projets prête.'
);