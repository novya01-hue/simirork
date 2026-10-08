import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type LogoBody = {
  imageData?: unknown;
  status?: unknown;
  sourceType?: unknown;
  parentLogoId?: unknown;

  model?: unknown;
  generationPrompt?: unknown;
  editPrompt?: unknown;
  editData?: unknown;

  imageWidth?: unknown;
  imageHeight?: unknown;
};

const ALLOWED_STATUSES = new Set([
  'generated',
  'selected',
  'edited',
  'archived',
]);

const ALLOWED_SOURCE_TYPES = new Set([
  'ai',
  'manual_edit',
  'ai_edit',
  'imported',
]);

function normalizeMetadataRow(
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

    /*
     * IMPORTANT :
     * l'historique GET ne transporte
     * plus les énormes images Base64.
     */
    imageData: '',

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

function normalizeFullRow(
  row: any
) {
  return {
    ...normalizeMetadataRow(
      row
    ),

    imageData:
      String(
        row.image_data ||
          ''
      ),
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

function parseImageDataUrl(
  value: string
): {
  mimeType: string;
  base64: string;
  buffer: Buffer;
} {
  const match =
    value.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/
    );

  if (!match) {
    throw new Error(
      "Le format de l'image est invalide."
    );
  }

  const mimeType =
    match[1].toLowerCase();

  const allowedMimeTypes =
    new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ]);

  if (
    !allowedMimeTypes.has(
      mimeType
    )
  ) {
    throw new Error(
      `Format d'image non pris en charge : ${mimeType}.`
    );
  }

  const base64 =
    match[2].replace(
      /\s/g,
      ''
    );

  const buffer =
    Buffer.from(
      base64,
      'base64'
    );

  if (!buffer.length) {
    throw new Error(
      "L'image est vide."
    );
  }

  return {
    mimeType,
    base64,
    buffer,
  };
}

/*
 * ============================================================
 * GET
 * ============================================================
 *
 * Charge uniquement les MÉTADONNÉES de l'historique.
 *
 * Avant :
 * chaque version renvoyait image_data complet.
 *
 * Après plusieurs logos IA, cela pouvait représenter
 * plusieurs dizaines de Mo et provoquer :
 *
 *     {"success":false,"error":"terminated"}
 *
 * Désormais aucune image Base64 n'est chargée
 * dans cette requête.
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
     * IMPORTANT :
     * image_data n'est volontairement
     * PAS présent dans ce SELECT.
     */
    const rows =
      await sql`
        SELECT
          id,
          project_id,
          parent_logo_id,
          version_number,
          status,
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
          project_id =
            ${projectId}
        ORDER BY
          version_number DESC
      `;

    const logos =
      rows.map(
        normalizeMetadataRow
      );

    const selectedLogo =
      logos.find(
        (logo) =>
          logo.status ===
          'selected'
      ) || null;

    const officialLogo =
      logos.find(
        (logo) =>
          logo.status ===
          'official'
      ) || null;

    return NextResponse.json(
      {
        success: true,

        projectId,

        logos,

        selectedLogo,

        officialLogo,

        /*
         * Permettra à l'interface
         * de savoir que les images
         * doivent être chargées
         * séparément à l'avenir.
         */
        imagesDeferred: true,
      }
    );
  } catch (error) {
    console.error(
      'Erreur GET historique logos:',
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

/*
 * ============================================================
 * POST
 * ============================================================
 *
 * Enregistre une nouvelle version de logo.
 *
 * Ici nous conservons image_data car cette requête
 * ne traite qu'UNE seule nouvelle image.
 */
export async function POST(
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
        {
          status: 401,
        }
      );
    }

    const {
      id: projectId,
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

    let body:
      | LogoBody
      | null = null;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            'Requête JSON invalide.',
        },
        {
          status: 400,
        }
      );
    }

    const imageData =
      typeof body?.imageData ===
      'string'
        ? body.imageData.trim()
        : '';

    if (!imageData) {
      return NextResponse.json(
        {
          success: false,
          error:
            "L'image du logo est obligatoire.",
        },
        {
          status: 400,
        }
      );
    }

    const status =
      typeof body?.status ===
      'string'
        ? body.status.trim()
        : 'generated';

    /*
     * Le statut official est réservé
     * à la route /official.
     */
    if (
      status === 'official'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Utilisez la route d'officialisation pour rendre un logo officiel.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !ALLOWED_STATUSES.has(
        status
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Statut de logo invalide : ${status}.`,
        },
        {
          status: 400,
        }
      );
    }

    const sourceType =
      typeof body?.sourceType ===
      'string'
        ? body.sourceType.trim()
        : 'imported';

    if (
      !ALLOWED_SOURCE_TYPES.has(
        sourceType
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Type de source invalide : ${sourceType}.`,
        },
        {
          status: 400,
        }
      );
    }

    const parsedImage =
      parseImageDataUrl(
        imageData
      );

    const maxBytes =
      8 * 1024 * 1024;

    if (
      parsedImage.buffer.length >
      maxBytes
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Le logo dépasse la taille maximale de 8 Mo.',
        },
        {
          status: 413,
        }
      );
    }

    const sha256 =
      createHash(
        'sha256'
      )
        .update(
          parsedImage.buffer
        )
        .digest(
          'hex'
        );

    /*
     * Vérification du doublon.
     */
    const duplicateRows =
      await sql`
        SELECT
          id,
          version_number,
          status
        FROM simirork_project_logos
        WHERE
          project_id =
            ${projectId}
          AND sha256 =
            ${sha256}
        LIMIT 1
      `;

    if (
      duplicateRows?.[0]
    ) {
      const duplicate =
        duplicateRows[0];

      return NextResponse.json(
        {
          success: true,

          duplicate: true,

          message:
            `Ce logo existe déjà en version ${Number(
              duplicate.version_number
            )}.`,

          logoId:
            String(
              duplicate.id
            ),

          versionNumber:
            Number(
              duplicate
                .version_number
            ),

          status:
            String(
              duplicate.status
            ),
        }
      );
    }

    /*
     * Logo parent éventuel.
     */
    const parentLogoId =
      typeof body
        ?.parentLogoId ===
        'string' &&
      body.parentLogoId.trim()
        ? body.parentLogoId.trim()
        : null;

    if (parentLogoId) {
      const parentRows =
        await sql`
          SELECT id
          FROM simirork_project_logos
          WHERE
            id =
              ${parentLogoId}::uuid
            AND project_id =
              ${projectId}
          LIMIT 1
        `;

      if (!parentRows?.[0]) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Le logo parent est introuvable dans ce projet.',
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * Version suivante.
     */
    const versionRows =
      await sql`
        SELECT
          COALESCE(
            MAX(version_number),
            0
          ) + 1
            AS next_version
        FROM simirork_project_logos
        WHERE
          project_id =
            ${projectId}
      `;

    const nextVersion =
      Number(
        versionRows?.[0]
          ?.next_version ||
          1
      );

    /*
     * Une seule version peut être
     * selected.
     *
     * Le logo official n'est jamais
     * modifié ici.
     */
    if (
      status === 'selected'
    ) {
      await sql`
        UPDATE simirork_project_logos
        SET
          status =
            'archived'
        WHERE
          project_id =
            ${projectId}
          AND status =
            'selected'
      `;
    }

    const model =
      typeof body?.model ===
      'string'
        ? body.model
        : null;

    const generationPrompt =
      typeof body
        ?.generationPrompt ===
        'string'
        ? body.generationPrompt
        : null;

    const editPrompt =
      typeof body
        ?.editPrompt ===
        'string'
        ? body.editPrompt
        : null;

    const editData =
      body?.editData &&
      typeof body.editData ===
        'object'
        ? JSON.stringify(
            body.editData
          )
        : '{}';

    const imageWidth =
      Number.isFinite(
        Number(
          body?.imageWidth
        )
      )
        ? Number(
            body?.imageWidth
          )
        : null;

    const imageHeight =
      Number.isFinite(
        Number(
          body?.imageHeight
        )
      )
        ? Number(
            body?.imageHeight
          )
        : null;

    const insertedRows =
      await sql`
        INSERT INTO
          simirork_project_logos
        (
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
          selected_at
        )
        VALUES
        (
          ${projectId},

          ${
            parentLogoId
          }::uuid,

          ${nextVersion},

          ${status},

          ${imageData},

          ${parsedImage.mimeType},

          ${imageWidth},

          ${imageHeight},

          ${
            parsedImage
              .buffer.length
          },

          ${sourceType},

          ${model},

          ${generationPrompt},

          ${editPrompt},

          ${editData}::jsonb,

          ${sha256},

          ${
            status ===
            'selected'
              ? sql`NOW()`
              : null
          }
        )
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

    const insertedLogo =
      insertedRows?.[0];

    if (!insertedLogo) {
      throw new Error(
        "Le logo n'a pas pu être enregistré."
      );
    }

    return NextResponse.json(
      {
        success: true,

        message:
          `Logo version ${nextVersion} enregistré.`,

        logo:
          normalizeFullRow(
            insertedLogo
          ),
      }
    );
  } catch (error) {
    console.error(
      'Erreur POST version logo:',
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