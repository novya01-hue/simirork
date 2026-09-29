import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalIndex = line.indexOf('=');

    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (
      value.length >= 2 &&
      value.startsWith('"') &&
      value.endsWith('"')
    ) {
      value = value.slice(1, -1);
    }

    if (
      value.length >= 2 &&
      value.startsWith("'") &&
      value.endsWith("'")
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function resolveValue(value, env, depth = 0) {
  if (!value || depth > 10) {
    return value;
  }

  return value.replace(
    /\$\{([A-Z0-9_]+)\}/g,
    (_, key) => {
      const replacement = env[key];

      if (replacement === undefined) {
        return '';
      }

      return resolveValue(
        replacement,
        env,
        depth + 1
      );
    }
  );
}

async function main() {
  const envPath = '.env.local';

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `${envPath} est introuvable.`
    );
  }

  const env = loadEnvFile(envPath);

  let databaseUrl =
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    env.POSTGRES_PRISMA_URL;

  if (!databaseUrl) {
    throw new Error(
      'Aucune URL PostgreSQL trouvée dans .env.local.'
    );
  }

  databaseUrl = resolveValue(
    databaseUrl,
    env
  );

  databaseUrl = databaseUrl
    .trim()
    .replace(/^['"]|['"]$/g, '');

  let database;

  try {
    const parsed =
      new URL(databaseUrl);

    if (
      parsed.protocol !==
        'postgres:' &&
      parsed.protocol !==
        'postgresql:'
    ) {
      throw new Error(
        'Le protocole n’est pas PostgreSQL.'
      );
    }

    database = neon(databaseUrl);
  } catch (error) {
    throw new Error(
      `DATABASE_URL invalide ou non résolue : ${
        error instanceof Error
          ? error.message
          : 'erreur inconnue'
      }`
    );
  }

  console.log(
    'Connexion PostgreSQL détectée.'
  );

  await database`
    CREATE TABLE IF NOT EXISTS simirork_credit_accounts (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 100 CHECK (balance >= 0),
      consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await database`
    CREATE TABLE IF NOT EXISTS simirork_generation_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      user_id TEXT NOT NULL,

      project_id TEXT,
      project_name TEXT NOT NULL,

      model TEXT NOT NULL,

      prompt_words INTEGER NOT NULL DEFAULT 0,
      prompt_chars INTEGER NOT NULL DEFAULT 0,

      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,

      cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0,
      credit_value_usd NUMERIC(18, 8),

      credits_exact NUMERIC(18, 8),
      credits_used INTEGER NOT NULL DEFAULT 0,

      balance_after INTEGER,

      billing_method TEXT,
      billing_version TEXT,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await database`
    CREATE INDEX IF NOT EXISTS idx_simirork_generation_usage_user_id
    ON simirork_generation_usage(user_id)
  `;

  await database`
    CREATE INDEX IF NOT EXISTS idx_simirork_generation_usage_created_at
    ON simirork_generation_usage(created_at DESC)
  `;

  console.log('');
  console.log(
    '✅ Table simirork_credit_accounts créée/vérifiée.'
  );

  console.log(
    '✅ Table simirork_generation_usage créée/vérifiée.'
  );

  console.log(
    '✅ Index de recherche créés/vérifiés.'
  );

  console.log('');
  console.log(
    '✅ Structure PostgreSQL SimiRork prête.'
  );
}

main().catch((error) => {
  console.error('');
  console.error(
    '❌ Initialisation PostgreSQL échouée.'
  );
  console.error(
    error instanceof Error
      ? error.message
      : error
  );
  process.exit(1);
});