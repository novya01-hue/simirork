import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
    logoId: string;
  }>;
};

function normalizeLogoRow(
  row: any
) {
  return {
    id: String(row.id),

    projectId:
      String(row.project_id),

    parentLogoId:
      row.parent_logo_id
        ? String(row.parent_logo_id)
        : null,

    versionNumber:
      Number(row.version_number),

    status:
      String(row.status),

    imageData:
      String(row.image_data || ''),

    imageMimeType:
      row.image_mime_type
        ? String(row.image_mime_type)
        : null,

    imageWidth:
      row.image_width === null ||
      row.image_width === undefined
        ? null
        : Number(row.image_width),

    imageHeight:
      row.image_height === null ||
      row.image_height === undefined
        ? null
        : Number(row.image_height),

    fileSizeBytes:
      row.file_size_bytes === null ||
      row.file_size_bytes === undefined
        ? null
        : Number(row.file_size_bytes),

    sourceType:
      String(row.source_type),

    model:
      row.model
        ? String(row.model)
        : null,

    generationPrompt:
      row.generation_prompt
        ? String(row.generation_prompt)
        : null,

    editPrompt:
      row.edit_prompt
        ? String(row.edit_prompt)
        : null,

    editData:
      row.edit_data &&
      typeof row.edit_data === 'object'
        ? row.edit_data
        : {},

    sha256:
      String(row.sha256),

    createdAt:
      row.created_at,

    selectedAt:
      row.selected_at,

    officialAt:
      row.official_at,
  };
}

async function getAuthenticatedUser() {
  const {
    data: sessionData,
  } =
    await auth.getSession();

  return sessionData?.user || null;
}

async function userOwnsProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  const rows =
    await sql`
      SELECT id
      FROM simirork_projects
      WHERE
        id = ${projectId}
        AND user_id = ${userId}
      LIMIT 1
    `;

  return Boolean(rows?.[0]);
}

/*
 * ============================================================
 * GET
 * ============================================================
 *
 * Charge UNE seule version complète avec son image.
 */
export async function GET(
  _request: Request,
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
        {
          status: 401,
        }
      );
    }

    const {
      id: projectId,
      logoId,
    } =
      await context.params;

    if (
      !projectId?.trim() ||
      !logoId?.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Identifiant du projet ou du logo manquant.',
        },
        {
          status: 400,
        }
      );
    }

    const ownsProject =
      await userOwnsProject(
        projectId,
        user.id
      );

    if (!ownsProject) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Projet introuvable ou accès refusé.',
        },
        {
          status: 404,
        }
      );
    }

    const rows =
      await sql`
        SELECT
          id,
          project_id,
          parent_logo_id,
          version_number,
          status,
          image_data,
          image_mime_type,
          image_width,
          image_height,
          file_size_bytes,
          source_type,
          model,
          generation_prompt,
          edit_prompt,
          edit_data,
          sha256,
          created_at,
          selected_at,
          official_at
        FROM simirork_project_logos
        WHERE
          id = ${logoId}::uuid
          AND project_id = ${projectId}
        LIMIT 1
      `;

    const logo =
      rows?.[0];

    if (!logo) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Version de logo introuvable.',
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      logo:
        normalizeLogoRow(
          logo
        ),
    });
  } catch (error) {
    console.error(
      'Erreur GET version logo:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue pendant le chargement du logo.',
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * ============================================================
 * DELETE
 * ============================================================
 *
 * Supprime une ancienne version.
 *
 * PROTECTIONS :
 * - impossible de supprimer le logo officiel ;
 * - impossible de supprimer le logo sélectionné ;
 * - les éventuelles versions enfants sont rattachées
 *   automatiquement au parent du logo supprimé.
 */
export async function DELETE(
  _request: Request,
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
        {
          status: 401,
        }
      );
    }

    const {
      id: projectId,
      logoId,
    } =
      await context.params;

    if (
      !projectId?.trim() ||
      !logoId?.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Identifiant du projet ou du logo manquant.',
        },
        {
          status: 400,
        }
      );
    }

    const ownsProject =
      await userOwnsProject(
        projectId,
        user.id
      );

    if (!ownsProject) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Projet introuvable ou accès refusé.',
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Lecture de la version avant suppression.
     */
    const targetRows =
      await sql`
        SELECT
          id,
          project_id,
          parent_logo_id,
          version_number,
          status,
          file_size_bytes
        FROM simirork_project_logos
        WHERE
          id = ${logoId}::uuid
          AND project_id = ${projectId}
        LIMIT 1
      `;

    const target =
      targetRows?.[0];

    if (!target) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Version de logo introuvable.',
        },
        {
          status: 404,
        }
      );
    }

    const targetStatus =
      String(target.status);

    /*
     * Le logo officiel ne doit jamais
     * être supprimé directement.
     */
    if (
      targetStatus === 'official'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le logo officiel est protégé. Définissez d'abord une autre version comme logo officiel.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * La version actuellement sélectionnée
     * est également protégée.
     */
    if (
      targetStatus === 'selected'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le logo actuellement sélectionné est protégé. Sélectionnez d'abord une autre version.",
        },
        {
          status: 409,
        }
      );
    }

    const parentLogoId =
      target.parent_logo_id
        ? String(
            target.parent_logo_id
          )
        : null;

    /*
     * Si la version supprimée possède des descendants,
     * on ne casse pas l'arbre des versions :
     *
     *     V4 -> V5 -> V6
     *
     * si V5 est supprimée :
     *
     *     V4 -> V6
     */
    if (parentLogoId) {
      await sql`
        UPDATE simirork_project_logos
        SET
          parent_logo_id =
            ${parentLogoId}::uuid
        WHERE
          project_id =
            ${projectId}
          AND parent_logo_id =
            ${logoId}::uuid
      `;
    } else {
      await sql`
        UPDATE simirork_project_logos
        SET
          parent_logo_id =
            NULL
        WHERE
          project_id =
            ${projectId}
          AND parent_logo_id =
            ${logoId}::uuid
      `;
    }

    /*
     * Suppression réelle.
     */
    const deletedRows =
      await sql`
        DELETE FROM
          simirork_project_logos
        WHERE
          id = ${logoId}::uuid
          AND project_id =
            ${projectId}
          AND status NOT IN (
            'official',
            'selected'
          )
        RETURNING
          id,
          version_number,
          status,
          file_size_bytes
      `;

    const deleted =
      deletedRows?.[0];

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La version n'a pas pu être supprimée.",
        },
        {
          status: 409,
        }
      );
    }

    return NextResponse.json({
      success: true,

      message:
        `Version ${Number(
          deleted.version_number
        )} supprimée.`,

      deletedLogo: {
        id:
          String(
            deleted.id
          ),

        versionNumber:
          Number(
            deleted.version_number
          ),

        status:
          String(
            deleted.status
          ),

        freedBytes:
          deleted.file_size_bytes ===
            null ||
          deleted.file_size_bytes ===
            undefined
            ? 0
            : Number(
                deleted.file_size_bytes
              ),
      },
    });
  } catch (error) {
    console.error(
      'Erreur DELETE version logo:',
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue pendant la suppression du logo.',
      },
      {
        status: 500,
      }
    );
  }
}