import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProjectPayload = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  prompt?: unknown;
  code?: unknown;
  logo?: unknown;
  apkStatus?: unknown;
  apkRunId?: unknown;
  apkError?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function cleanString(
  value: unknown,
  fallback = ''
): string {
  return typeof value === 'string'
    ? value
    : fallback;
}

function normalizeApkStatus(
  value: unknown
): 'none' | 'building' | 'ready' | 'error' {
  if (
    value === 'building' ||
    value === 'ready' ||
    value === 'error'
  ) {
    return value;
  }

  return 'none';
}

function normalizeDate(
  value: unknown
): Date | null {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null;
  }

  const date = new Date(
    value
  );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

async function getAuthenticatedUser() {
  const {
    data: sessionData,
  } = await auth.getSession();

  return sessionData?.user || null;
}

// ============================================================
// GET — RÉCUPÉRER LES PROJETS
// ============================================================

export async function GET() {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Utilisateur non authentifié.',
        },
        { status: 401 }
      );
    }

    const rows = await sql`
      SELECT
        id,
        name,
        description,
        prompt,
        code,
        logo_json,
        apk_status,
        apk_run_id,
        apk_error,
        created_at,
        updated_at
      FROM simirork_projects
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC
    `;

    const projects =
      rows.map(
        (row) => ({
          id: String(
            row.id
          ),
          name: String(
            row.name
          ),
          description:
            String(
              row.description ||
                ''
            ),
          prompt:
            String(
              row.prompt || ''
            ),
          code:
            String(
              row.code || ''
            ),
          logo:
            typeof row.logo_json === 'string' &&
            row.logo_json.trim()
              ? row.logo_json
              : null,
          apkStatus:
            normalizeApkStatus(
              row.apk_status
            ),
          apkRunId:
            row.apk_run_id
              ? String(
                  row.apk_run_id
                )
              : null,
          apkError:
            String(
              row.apk_error || ''
            ),
          createdAt:
            row.created_at,
          updatedAt:
            row.updated_at,
        })
      );

    return NextResponse.json(
      {
        success: true,
        projects,
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Erreur récupération projets :',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue.',
      },
      { status: 500 }
    );
  }
}

// ============================================================
// POST — CRÉER UN PROJET
// ============================================================

export async function POST(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Utilisateur non authentifié.',
        },
        { status: 401 }
      );
    }

    const body =
      (await request.json()) as ProjectPayload;

    const requestedId =
      cleanString(
        body.id
      ).trim();

    const id =
      requestedId ||
      crypto.randomUUID();

    const name =
      cleanString(
        body.name
      ).trim();

    const description =
      cleanString(
        body.description
      );

    const prompt =
      cleanString(
        body.prompt
      );

    const code =
      cleanString(
        body.code
      );

    const logo =
      body.logo === null ||
      body.logo === undefined
        ? null
        : cleanString(
            body.logo
          );

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le nom de l'application est obligatoire.",
        },
        { status: 400 }
      );
    }

    const apkStatus =
      normalizeApkStatus(
        body.apkStatus
      );

    const apkRunId =
      body.apkRunId ===
        null ||
      body.apkRunId ===
        undefined ||
      body.apkRunId === ''
        ? null
        : cleanString(
            body.apkRunId
          );

    const apkError =
      cleanString(
        body.apkError
      );

    const createdAt =
      normalizeDate(
        body.createdAt
      );

    const updatedAt =
      normalizeDate(
        body.updatedAt
      );

    const existing =
      await sql`
        SELECT id
        FROM simirork_projects
        WHERE
          id = ${id}
          AND user_id = ${user.id}
        LIMIT 1
      `;

    if (
      existing.length > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Ce projet existe déjà.',
        },
        { status: 409 }
      );
    }

    const rows =
      createdAt &&
      updatedAt
        ? await sql`
            INSERT INTO simirork_projects (
              id,
              user_id,
              name,
              description,
              prompt,
              code,
              logo_json,
              apk_status,
              apk_run_id,
              apk_error,
              created_at,
              updated_at
            )
            VALUES (
              ${id},
              ${user.id},
              ${name},
              ${description},
              ${prompt},
              ${code},
              ${logo},
              ${apkStatus},
              ${apkRunId},
              ${apkError},
              ${createdAt},
              ${updatedAt}
            )
            RETURNING
              id,
              name,
              description,
              prompt,
              code,
              logo_json,
              apk_status,
              apk_run_id,
              apk_error,
              created_at,
              updated_at
          `
        : await sql`
            INSERT INTO simirork_projects (
              id,
              user_id,
              name,
              description,
              prompt,
              code,
              logo_json,
              apk_status,
              apk_run_id,
              apk_error
            )
            VALUES (
              ${id},
              ${user.id},
              ${name},
              ${description},
              ${prompt},
              ${code},
              ${logo},
              ${apkStatus},
              ${apkRunId},
              ${apkError}
            )
            RETURNING
              id,
              name,
              description,
              prompt,
              code,
              logo_json,
              apk_status,
              apk_run_id,
              apk_error,
              created_at,
              updated_at
          `;

    const row =
      rows[0];

    if (!row) {
      throw new Error(
        'Impossible de créer le projet.'
      );
    }

    return NextResponse.json(
      {
        success: true,
        project: {
          id: String(
            row.id
          ),
          name: String(
            row.name
          ),
          description:
            String(
              row.description ||
                ''
            ),
          prompt:
            String(
              row.prompt || ''
            ),
          code:
            String(
              row.code || ''
            ),
          logo:
            typeof row.logo_json === 'string' &&
            row.logo_json.trim()
              ? row.logo_json
              : null,
          apkStatus:
            normalizeApkStatus(
              row.apk_status
            ),
          apkRunId:
            row.apk_run_id
              ? String(
                  row.apk_run_id
                )
              : null,
          apkError:
            String(
              row.apk_error || ''
            ),
          createdAt:
            row.created_at,
          updatedAt:
            row.updated_at,
        },
      },
      {
        status: 201,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Erreur création projet :',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue.',
      },
      { status: 500 }
    );
  }
}

