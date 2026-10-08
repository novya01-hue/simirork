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
        ? String(
            row.parent_logo_id
          )
        : null,

    versionNumber:
      Number(
        row.version_number
      ),

    status:
      String(row.status),

    imageData:
      String(
        row.image_data
      ),

    imageMimeType:
      row.image_mime_type
        ? String(
            row.image_mime_type
          )
        : null,

    imageWidth:
      row.image_width ===
        null ||
      row.image_width ===
        undefined
        ? null
        : Number(
            row.image_width
          ),

    imageHeight:
      row.image_height ===
        null ||
      row.image_height ===
        undefined
        ? null
        : Number(
            row.image_height
          ),

    fileSizeBytes:
      row.file_size_bytes ===
        null ||
      row.file_size_bytes ===
        undefined
        ? null
        : Number(
            row.file_size_bytes
          ),

    sourceType:
      String(
        row.source_type
      ),

    model:
      row.model
        ? String(row.model)
        : null,

    generationPrompt:
      row.generation_prompt
        ? String(
            row.generation_prompt
          )
        : null,

    editPrompt:
      row.edit_prompt
        ? String(
            row.edit_prompt
          )
        : null,

    editData:
      row.edit_data &&
      typeof row.edit_data ===
        'object'
        ? row.edit_data
        : {},

    sha256:
      String(
        row.sha256
      ),

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

  return (
    sessionData?.user ||
    null
  );
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

  return Boolean(
    rows?.[0]
  );
}

/*
 * POST
 *
 * Définit une version de logo
 * comme identité officielle du projet.
 */
export async function POST(
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
      !projectId ||
      !projectId.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Identifiant du projet manquant.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      !logoId ||
      !logoId.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Identifiant du logo manquant.',
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
     * Vérifie que le logo existe
     * bien dans ce projet.
     */
    const logoRows =
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
      logoRows?.[0];

    if (!logo) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Logo introuvable pour ce projet.',
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Si ce logo est déjà officiel,
     * on ne recrée rien.
     */
    if (
      logo.status ===
      'official'
    ) {
      return NextResponse.json(
        {
          success: true,
          alreadyOfficial: true,
          message:
            'Ce logo est déjà l’identité officielle du projet.',
          logo:
            normalizeLogoRow(
              logo
            ),
        }
      );
    }

    /*
     * L'ancien logo officiel,
     * s'il existe, devient archived.
     */
    await sql`
      UPDATE simirork_project_logos
      SET
        status = 'archived'
      WHERE
        project_id = ${projectId}
        AND status = 'official'
        AND id <> ${logoId}::uuid
    `;

    /*
     * Si un autre logo était seulement
     * selected, on l'archive aussi
     * pour garder une seule identité active.
     */
    await sql`
      UPDATE simirork_project_logos
      SET
        status = 'archived'
      WHERE
        project_id = ${projectId}
        AND status = 'selected'
        AND id <> ${logoId}::uuid
    `;

    /*
     * Le logo choisi devient officiel.
     */
    const updatedRows =
      await sql`
        UPDATE simirork_project_logos
        SET
          status = 'official',
          selected_at =
            COALESCE(
              selected_at,
              NOW()
            ),
          official_at = NOW()
        WHERE
          id = ${logoId}::uuid
          AND project_id = ${projectId}
        RETURNING
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
      `;

    const updatedLogo =
      updatedRows?.[0];

    if (!updatedLogo) {
      throw new Error(
        "Le logo n'a pas pu être défini comme identité officielle."
      );
    }

    /*
     * Compatibilité avec le système actuel.
     *
     * On conserve logo_json dans
     * simirork_projects pour que
     * l'interface et le build APK
     * continuent de fonctionner
     * sans attendre la migration complète.
     */
    const legacyLogoJson =
      JSON.stringify({
        id:
          updatedLogo.version_number,

        image:
          updatedLogo.image_data,

        mediaType:
          updatedLogo.image_mime_type,

        model:
          updatedLogo.model,

        selectedAt:
          updatedLogo.selected_at,

        officialAt:
          updatedLogo.official_at,

        sha256:
          updatedLogo.sha256,

        logoVersionId:
          String(
            updatedLogo.id
          ),

        status:
          'official',
      });

    await sql`
      UPDATE simirork_projects
      SET
        logo_json =
          ${legacyLogoJson},
        updated_at =
          NOW()
      WHERE
        id = ${projectId}
        AND user_id = ${user.id}
    `;

    return NextResponse.json(
      {
        success: true,
        message:
          'Logo défini comme identité officielle.',
        logo:
          normalizeLogoRow(
            updatedLogo
          ),
      }
    );
  } catch (error) {
    console.error(
      'Erreur logo officiel:',
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
      {
        status: 500,
      }
    );
  }
}