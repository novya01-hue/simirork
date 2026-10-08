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

type LogoStatus =
  | 'generated'
  | 'selected'
  | 'edited'
  | 'official'
  | 'archived';

type LogoSourceType =
  | 'ai'
  | 'manual_edit'
  | 'ai_edit'
  | 'imported';

type LogoPayload = {
  imageData?: unknown;
  status?: unknown;
  sourceType?: unknown;
  model?: unknown;
  generationPrompt?: unknown;
  editPrompt?: unknown;
  editData?: unknown;
  parentLogoId?: unknown;
  imageWidth?: unknown;
  imageHeight?: unknown;
};

const ALLOWED_IMAGE_MIME_TYPES =
  new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);

const ALLOWED_STATUSES =
  new Set<LogoStatus>([
    'generated',
    'selected',
    'edited',
    'official',
    'archived',
  ]);

const ALLOWED_SOURCE_TYPES =
  new Set<LogoSourceType>([
    'ai',
    'manual_edit',
    'ai_edit',
    'imported',
  ]);

/*
 * 8 Mo maximum pour le fichier image réel.
 *
 * Le texte base64 est plus volumineux,
 * donc on contrôle la taille après décodage.
 */
const MAX_IMAGE_SIZE_BYTES =
  8 * 1024 * 1024;

function cleanOptionalString(
  value: unknown
): string | null {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed
    ? trimmed
    : null;
}

function cleanPositiveInteger(
  value: unknown
): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}

function parseImageDataUrl(
  value: unknown
):
  | {
      imageData: string;
      mimeType: string;
      buffer: Buffer;
      fileSizeBytes: number;
      sha256: string;
    }
  | null {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null;
  }

  const imageData =
    value.trim();

  const match =
    imageData.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/
    );

  if (!match) {
    return null;
  }

  const mimeType =
    match[1].toLowerCase();

  if (
    !ALLOWED_IMAGE_MIME_TYPES.has(
      mimeType
    )
  ) {
    return null;
  }

  try {
    const base64 =
      match[2].replace(
        /\s+/g,
        ''
      );

    const buffer =
      Buffer.from(
        base64,
        'base64'
      );

    if (
      !buffer.length ||
      buffer.length >
        MAX_IMAGE_SIZE_BYTES
    ) {
      return null;
    }

    const sha256 =
      createHash('sha256')
        .update(buffer)
        .digest('hex');

    return {
      imageData,
      mimeType,
      buffer,
      fileSizeBytes:
        buffer.length,
      sha256,
    };
  } catch {
    return null;
  }
}

function normalizeLogoRow(
  row: any
) {
  return {
    id:
      String(row.id),

    projectId:
      String(
        row.project_id
      ),

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
 * GET
 *
 * Retourne tout l'historique
 * des logos du projet.
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
          project_id = ${projectId}
        ORDER BY
          version_number DESC,
          created_at DESC
      `;

    const logos =
      Array.from(rows || [])
        .map(
          normalizeLogoRow
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
      }
    );
  } catch (error) {
    console.error(
      'Erreur lecture logos:',
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
 * POST
 *
 * Enregistre une nouvelle version
 * du logo sans supprimer les anciennes.
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

    const body =
      (await request.json()) as
        LogoPayload;

    const parsedImage =
      parseImageDataUrl(
        body.imageData
      );

    if (!parsedImage) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Image du logo invalide. Formats acceptés : PNG, JPEG ou WebP, maximum 8 Mo.',
        },
        {
          status: 400,
        }
      );
    }

    const requestedStatus =
      cleanOptionalString(
        body.status
      ) ||
      'generated';

    if (
      !ALLOWED_STATUSES.has(
        requestedStatus as LogoStatus
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Statut de logo invalide.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * La déclaration officielle sera
     * gérée par une route séparée.
     *
     * Cela évite qu'un simple POST
     * transforme accidentellement un logo
     * en identité officielle.
     */
    if (
      requestedStatus ===
      'official'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Utilisez la route dédiée pour définir un logo comme identité officielle.',
        },
        {
          status: 400,
        }
      );
    }

    const requestedSourceType =
      cleanOptionalString(
        body.sourceType
      ) ||
      'ai';

    if (
      !ALLOWED_SOURCE_TYPES.has(
        requestedSourceType as LogoSourceType
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Type de source du logo invalide.',
        },
        {
          status: 400,
        }
      );
    }

    const parentLogoId =
      cleanOptionalString(
        body.parentLogoId
      );

    /*
     * Si cette version provient
     * d'une autre version,
     * on vérifie que le parent appartient
     * au même projet.
     */
    if (parentLogoId) {
      const parentRows =
        await sql`
          SELECT id
          FROM simirork_project_logos
          WHERE
            id = ${parentLogoId}::uuid
            AND project_id = ${projectId}
          LIMIT 1
        `;

      if (
        !parentRows?.[0]
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Le logo parent est introuvable pour ce projet.',
          },
          {
            status: 400,
          }
        );
      }
    }

    const model =
      cleanOptionalString(
        body.model
      );

    const generationPrompt =
      cleanOptionalString(
        body.generationPrompt
      );

    const editPrompt =
      cleanOptionalString(
        body.editPrompt
      );

    const imageWidth =
      cleanPositiveInteger(
        body.imageWidth
      );

    const imageHeight =
      cleanPositiveInteger(
        body.imageHeight
      );

    const editData =
      body.editData &&
      typeof body.editData ===
        'object' &&
      !Array.isArray(
        body.editData
      )
        ? body.editData
        : {};

    const editDataJson =
      JSON.stringify(
        editData
      );

    /*
     * Si exactement la même image
     * existe déjà pour ce projet,
     * on évite de créer une copie inutile.
     */
    const duplicateRows =
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
          project_id = ${projectId}
          AND sha256 = ${parsedImage.sha256}
        ORDER BY version_number DESC
        LIMIT 1
      `;

    if (
      duplicateRows?.[0]
    ) {
      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          message:
            'Cette version du logo existe déjà.',
          logo:
            normalizeLogoRow(
              duplicateRows[0]
            ),
        }
      );
    }

    /*
     * Recherche du prochain numéro
     * de version du projet.
     */
    const versionRows =
      await sql`
        SELECT
          COALESCE(
            MAX(version_number),
            0
          ) + 1 AS next_version
        FROM simirork_project_logos
        WHERE
          project_id = ${projectId}
      `;

    const versionNumber =
      Number(
        versionRows?.[0]
          ?.next_version ||
          1
      );

    /*
     * Si la nouvelle version doit devenir
     * "selected", l'ancienne sélection
     * repasse en "archived".
     *
     * L'ancien logo_json reste pour
     * compatibilité avec SimiRork actuel.
     */
    if (
      requestedStatus ===
      'selected'
    ) {
      await sql`
        UPDATE simirork_project_logos
        SET status = 'archived'
        WHERE
          project_id = ${projectId}
          AND status = 'selected'
      `;
    }

    const selectedAt =
      requestedStatus ===
      'selected'
        ? new Date()
        : null;

    const insertedRows =
      await sql`
        INSERT INTO simirork_project_logos (
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
        VALUES (
          ${projectId},
          ${
            parentLogoId
              ? parentLogoId
              : null
          }::uuid,
          ${versionNumber},
          ${requestedStatus},
          ${parsedImage.imageData},
          ${parsedImage.mimeType},
          ${imageWidth},
          ${imageHeight},
          ${parsedImage.fileSizeBytes},
          ${requestedSourceType},
          ${model},
          ${generationPrompt},
          ${editPrompt},
          ${editDataJson}::jsonb,
          ${parsedImage.sha256},
          ${selectedAt}
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

    const row =
      insertedRows?.[0];

    if (!row) {
      throw new Error(
        "La nouvelle version du logo n'a pas pu être enregistrée."
      );
    }

    return NextResponse.json(
      {
        success: true,
        message:
          `Logo version ${versionNumber} enregistré.`,
        logo:
          normalizeLogoRow(
            row
          ),
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      'Erreur enregistrement logo:',
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