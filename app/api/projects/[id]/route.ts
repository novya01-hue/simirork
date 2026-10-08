import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProjectPayload = {
  name?: unknown;
  description?: unknown;
  prompt?: unknown;
  code?: unknown;
  logo?: unknown;
  apkStatus?: unknown;
  apkRunId?: unknown;
  apkError?: unknown;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
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

async function getAuthenticatedUser() {
  const {
    data: sessionData,
  } = await auth.getSession();

  return sessionData?.user || null;
}

// ============================================================
// GET — RÉCUPÉRER UN PROJET
// ============================================================

export async function GET(
  request: Request,
  context: RouteContext
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

    const {
      id,
    } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Identifiant de projet manquant.',
        },
        { status: 400 }
      );
    }

    const rows =
      await sql`
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
        WHERE
          id = ${id}
          AND user_id = ${user.id}
        LIMIT 1
      `;

    const row =
      rows[0];

    if (!row) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Projet introuvable ou accès refusé.',
        },
        { status: 404 }
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
              row.description || ''
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
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Erreur récupération projet :',
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
// PATCH — MODIFIER UN PROJET
// ============================================================

export async function PATCH(
  request: Request,
  context: RouteContext
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

    const {
      id,
    } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Identifiant de projet manquant.',
        },
        { status: 400 }
      );
    }

    const body =
      (await request.json()) as ProjectPayload;

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

    const hasLogo =
      Object.prototype.hasOwnProperty.call(
        body,
        'logo'
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
      body.apkRunId === null ||
      body.apkRunId === undefined ||
      body.apkRunId === ''
        ? null
        : cleanString(
            body.apkRunId
          );

    const apkError =
      cleanString(
        body.apkError
      );

    const rows =
      await sql`
        UPDATE simirork_projects
        SET
          name = ${name},
          description = ${description},
          prompt = ${prompt},
          code = ${code},
          apk_status = ${apkStatus},
          apk_run_id = ${apkRunId},
          apk_error = ${apkError},
          logo_json = CASE
            WHEN ${hasLogo} THEN ${logo}
            ELSE logo_json
          END,
          updated_at = NOW()
        WHERE
          id = ${id}
          AND user_id = ${user.id}
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
      return NextResponse.json(
        {
          success: false,
          error:
            'Projet introuvable ou accès refusé.',
        },
        { status: 404 }
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
              row.description || ''
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
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Erreur modification projet :',
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
// DELETE — SUPPRIMER UN PROJET
// ============================================================

export async function DELETE(
  request: Request,
  context: RouteContext
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

    const {
      id,
    } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Identifiant de projet manquant.',
        },
        { status: 400 }
      );
    }

    const rows =
      await sql`
        DELETE FROM simirork_projects
        WHERE
          id = ${id}
          AND user_id = ${user.id}
        RETURNING id
      `;

    if (
      rows.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Projet introuvable ou accès refusé.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        deletedId:
          String(
            rows[0].id
          ),
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
      'Erreur suppression projet :',
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
