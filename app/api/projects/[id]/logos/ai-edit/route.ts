import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const IMAGE_MODEL =
  'bytedance-seed/seedream-4.5';

const MAX_INSTRUCTION_LENGTH = 1500;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AiSelectionPayload = {
  active?: unknown;
  mode?: unknown;
  bounds?: unknown;
  isolatedCropImageData?: unknown;
  contextCropImageData?: unknown;
  maskImageData?: unknown;
};

type AiEditBody = {
  logoId?: unknown;
  instruction?: unknown;
  selection?: unknown;
};

type OpenRouterImageResponse = {
  data?: Array<{
    b64_json?: string;
    media_type?: string;
  }>;
  usage?: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type ParsedDataUrl = {
  mimeType: string;
  base64: string;
  buffer: Buffer;
};

type OpenRouterEditResult = {
  imageData: string;
  parsedImage: ParsedDataUrl;
  usage: {
    model: string;
    cost: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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
        ? String(
            row.model
          )
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

function parseDataUrl(
  value: string,
  label = 'Le logo source'
): ParsedDataUrl {
  const match =
    value.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/
    );

  if (!match) {
    throw new Error(
      `${label} est invalide.`
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
      `${label} est vide.`
    );
  }

  if (
    buffer.length >
    MAX_IMAGE_BYTES
  ) {
    throw new Error(
      `${label} dépasse la taille maximale de 8 Mo.`
    );
  }

  return {
    mimeType,
    base64,
    buffer,
  };
}

function normalizeSelectionBounds(
  value: unknown
): SelectionBounds | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }

  const candidate =
    value as Record<
      string,
      unknown
    >;

  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const width =
    Number(candidate.width);
  const height =
    Number(candidate.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
  };
}

function buildEditPrompt(
  projectName: string,
  instruction: string
): string {
  return [
    `Edit the provided logo for the application "${projectName}".`,
    '',
    'IMPORTANT RULES:',
    '- Use the supplied image as the source logo.',
    '- Preserve every element that the user did not explicitly ask to change.',
    '- Do not redesign the whole logo unless explicitly requested.',
    '- Keep the same square logo composition whenever possible.',
    '- Keep existing text unchanged unless the user asks to modify or remove it.',
    '- Keep shapes, proportions, spacing, colors and visual identity unchanged unless they are part of the requested edit.',
    '- Do not add new objects, text, borders, shadows or decorations unless requested.',
    '- Produce a clean app-logo image with no mockup, phone, wall, paper, frame or presentation background.',
    '',
    'USER EDIT INSTRUCTION:',
    instruction,
  ].join('\n');
}

function buildSelectionEditPrompt(
  projectName: string,
  instruction: string
): string {
  return [
    `Perform a LOCAL edit inside a selected region of the logo for the application "${projectName}".`,
    '',
    'REFERENCE IMAGES:',
    '- Reference 1 is the exact rectangular crop from the original logo. This is the main image to edit.',
    '- Reference 2 isolates the selected pixels and makes everything else transparent.',
    '- Reference 3 is a black/white-style mask indicating the selected pixels.',
    '',
    'STRICT LOCAL-EDIT RULES:',
    '- Edit ONLY the requested object or pixels inside this supplied crop.',
    '- Do not make any changes outside the requested object.',
    '- Do not redesign neighboring elements.',
    '- Preserve the crop composition, proportions, lighting, colors and background except where the instruction requires a local change.',
    '- If the user asks to remove one line, remove only that one line and reconstruct the background behind it.',
    '- Do not remove visually similar objects unless the instruction explicitly refers to them.',
    '- Do not add text, symbols, borders, shadows, decorations or new objects unless explicitly requested.',
    '- Return only the edited crop. Do not create a phone mockup, frame, canvas presentation or other surrounding scene.',
    '- The edited crop must fill the image and remain aligned to the same local composition as Reference 1.',
    '',
    'USER EDIT INSTRUCTION:',
    instruction,
  ].join('\n');
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

async function callOpenRouterImageEdit({
  apiKey,
  prompt,
  references,
}: {
  apiKey: string;
  prompt: string;
  references: string[];
}): Promise<OpenRouterEditResult> {
  for (
    let index = 0;
    index < references.length;
    index++
  ) {
    parseDataUrl(
      references[index],
      `L'image de référence ${index + 1}`
    );
  }

  const openRouterResponse =
    await fetch(
      'https://openrouter.ai/api/v1/images',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          'Content-Type':
            'application/json',

          'HTTP-Referer':
            process.env
              .NEXT_PUBLIC_APP_URL ||
            'https://simirork.vercel.app',

          'X-Title':
            'SimiRork',
        },

        body:
          JSON.stringify({
            model:
              IMAGE_MODEL,

            prompt,

            aspect_ratio:
              '1:1',

            n: 1,

            input_references:
              references.map(
                (imageData) => ({
                  type:
                    'image_url',

                  image_url: {
                    url:
                      imageData,
                  },
                })
              ),
          }),
      }
    );

  const rawResponse =
    await openRouterResponse.text();

  let openRouterData:
    | OpenRouterImageResponse
    | null = null;

  try {
    openRouterData =
      JSON.parse(
        rawResponse
      );
  } catch {
    openRouterData = null;
  }

  if (
    !openRouterResponse.ok
  ) {
    console.error(
      'Erreur OpenRouter AI edit:',
      {
        status:
          openRouterResponse.status,
        response:
          rawResponse.slice(
            0,
            2000
          ),
      }
    );

    const apiMessage =
      openRouterData?.error
        ?.message;

    throw new Error(
      apiMessage ||
        `OpenRouter a refusé la modification du logo (${openRouterResponse.status}).`
    );
  }

  const generated =
    openRouterData
      ?.data?.[0];

  const generatedBase64 =
    generated?.b64_json;

  if (
    !generatedBase64 ||
    typeof generatedBase64 !==
      'string'
  ) {
    throw new Error(
      "OpenRouter n'a retourné aucune image modifiée."
    );
  }

  const generatedMimeType =
    typeof generated
      .media_type ===
      'string' &&
    generated.media_type
      .startsWith(
        'image/'
      )
      ? generated.media_type
      : 'image/png';

  const generatedImageData =
    `data:${generatedMimeType};base64,${generatedBase64}`;

  const parsedGenerated =
    parseDataUrl(
      generatedImageData,
      "L'image générée"
    );

  return {
    imageData:
      generatedImageData,

    parsedImage:
      parsedGenerated,

    usage: {
      model:
        IMAGE_MODEL,

      cost:
        Number(
          openRouterData
            ?.usage?.cost ||
            0
        ),

      promptTokens:
        Number(
          openRouterData
            ?.usage
            ?.prompt_tokens ||
            0
        ),

      completionTokens:
        Number(
          openRouterData
            ?.usage
            ?.completion_tokens ||
            0
        ),

      totalTokens:
        Number(
          openRouterData
            ?.usage
            ?.total_tokens ||
            0
        ),
    },
  };
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    /*
     * 1. Authentification
     */
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

    /*
     * 2. Projet
     */
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
     * 3. Lecture du body
     */
    let body:
      | AiEditBody
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

    const logoId =
      typeof body?.logoId ===
      'string'
        ? body.logoId.trim()
        : '';

    const instruction =
      typeof body?.instruction ===
      'string'
        ? body.instruction.trim()
        : '';

    if (!logoId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Le logo à modifier est obligatoire.',
        },
        {
          status: 400,
        }
      );
    }

    if (!instruction) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Décrivez la modification à effectuer.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      instruction.length >
      MAX_INSTRUCTION_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `L'instruction est trop longue. Maximum : ${MAX_INSTRUCTION_LENGTH} caractères.`,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * 4. Informations du projet
     */
    const projectRows =
      await sql`
        SELECT
          id,
          name,
          prompt
        FROM simirork_projects
        WHERE
          id = ${projectId}
          AND user_id = ${user.id}
        LIMIT 1
      `;

    const project =
      projectRows?.[0];

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Projet introuvable.',
        },
        {
          status: 404,
        }
      );
    }

    /*
     * 5. Logo source
     */
    const sourceRows =
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

    const sourceLogo =
      sourceRows?.[0];

    if (!sourceLogo) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Logo source introuvable pour ce projet.',
        },
        {
          status: 404,
        }
      );
    }

    const sourceImageData =
      String(
        sourceLogo.image_data ||
        ''
      );

    parseDataUrl(
      sourceImageData
    );

    /*
     * 6. Clé OpenRouter
     */
    const apiKey =
      process.env
        .OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY est absente du serveur.'
      );
    }

    /*
     * 7. Détection d'une édition limitée
     *    à une sélection du Logo Editor.
     */
    const rawSelection =
      body?.selection &&
      typeof body.selection ===
        'object'
        ? body.selection as AiSelectionPayload
        : null;

    const selectionActive =
      rawSelection?.active ===
      true;

    if (selectionActive) {
      const bounds =
        normalizeSelectionBounds(
          rawSelection?.bounds
        );

      const isolatedCropImageData =
        typeof rawSelection
          ?.isolatedCropImageData ===
          'string'
          ? rawSelection
              .isolatedCropImageData
          : '';

      const contextCropImageData =
        typeof rawSelection
          ?.contextCropImageData ===
          'string'
          ? rawSelection
              .contextCropImageData
          : '';

      const maskImageData =
        typeof rawSelection
          ?.maskImageData ===
          'string'
          ? rawSelection
              .maskImageData
          : '';

      if (
        !bounds ||
        !isolatedCropImageData ||
        !contextCropImageData ||
        !maskImageData
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'La zone sélectionnée est incomplète ou invalide.',
          },
          {
            status: 400,
          }
        );
      }

      parseDataUrl(
        isolatedCropImageData,
        'La zone isolée'
      );

      parseDataUrl(
        contextCropImageData,
        'Le contexte de la zone'
      );

      parseDataUrl(
        maskImageData,
        'Le masque de sélection'
      );

      const selectionPrompt =
        buildSelectionEditPrompt(
          String(
            project.name ||
              'SimiRork'
          ),
          instruction
        );

      /*
       * IMPORTANT : cette branche ne touche
       * volontairement PAS à la base de données.
       * Elle retourne seulement le crop modifié.
       * Le navigateur le recolle ensuite dans
       * l'image complète et enregistre la version
       * finale via POST /logos.
       */
      const selectionResult =
        await callOpenRouterImageEdit({
          apiKey,
          prompt:
            selectionPrompt,
          references: [
            contextCropImageData,
            isolatedCropImageData,
            maskImageData,
          ],
        });

      return NextResponse.json({
        success: true,
        mode:
          'selection',

        message:
          'Zone sélectionnée modifiée par IA. Le reste du logo sera conservé à l’identique.',

        editedSelectionImageData:
          selectionResult.imageData,

        selection: {
          mode:
            typeof rawSelection
              ?.mode ===
              'string'
              ? rawSelection.mode
              : 'unknown',
          bounds,
        },

        sourceLogo: {
          id:
            String(
              sourceLogo.id
            ),

          versionNumber:
            Number(
              sourceLogo
                .version_number
            ),

          status:
            String(
              sourceLogo.status
            ),
        },

        usage:
          selectionResult.usage,
      });
    }

    /*
     * 8. Mode global historique :
     *    comportement existant conservé.
     */
    const aiPrompt =
      buildEditPrompt(
        String(
          project.name ||
            'SimiRork'
        ),
        instruction
      );

    const globalResult =
      await callOpenRouterImageEdit({
        apiKey,
        prompt:
          aiPrompt,
        references: [
          sourceImageData,
        ],
      });

    const generatedImageData =
      globalResult.imageData;

    const parsedGenerated =
      globalResult.parsedImage;

    /*
     * 9. Empreinte SHA-256
     */
    const sha256 =
      createHash(
        'sha256'
      )
        .update(
          parsedGenerated.buffer
        )
        .digest(
          'hex'
        );

    /*
     * 10. Détection d'un éventuel doublon
     */
    const duplicateRows =
      await sql`
        SELECT
          id,
          version_number,
          status
        FROM simirork_project_logos
        WHERE
          project_id = ${projectId}
          AND sha256 = ${sha256}
        LIMIT 1
      `;

    if (
      duplicateRows?.[0]
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'La modification IA a produit une image identique à une version déjà enregistrée.',
          duplicateLogoId:
            String(
              duplicateRows[0]
                .id
            ),
          duplicateVersion:
            Number(
              duplicateRows[0]
                .version_number
            ),
        },
        {
          status: 409,
        }
      );
    }

    /*
     * 11. Numéro de version suivant
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
     * 12. L'ancien selected devient archived.
     *     Le logo official reste protégé.
     */
    await sql`
      UPDATE simirork_project_logos
      SET
        status = 'archived'
      WHERE
        project_id =
          ${projectId}
        AND status =
          'selected'
    `;

    /*
     * 13. Métadonnées de l'édition globale
     */
    const editData =
      JSON.stringify({
        editorVersion:
          'ai-v2.6',

        provider:
          'openrouter',

        mode:
          'full',

        model:
          IMAGE_MODEL,

        sourceLogoId:
          String(
            sourceLogo.id
          ),

        sourceVersion:
          Number(
            sourceLogo
              .version_number
          ),

        sourceStatus:
          String(
            sourceLogo.status
          ),

        instruction,

        cost:
          globalResult
            .usage.cost,

        promptTokens:
          globalResult
            .usage.promptTokens,

        completionTokens:
          globalResult
            .usage.completionTokens,

        totalTokens:
          globalResult
            .usage.totalTokens,
      });

    /*
     * 14. Enregistrement de la
     *     nouvelle version globale.
     */
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
          ${logoId}::uuid,
          ${nextVersion},
          'selected',
          ${generatedImageData},
          ${parsedGenerated.mimeType},
          ${sourceLogo.image_width},
          ${sourceLogo.image_height},
          ${parsedGenerated.buffer.length},
          'ai_edit',
          ${IMAGE_MODEL},
          ${sourceLogo.generation_prompt},
          ${instruction},
          ${editData}::jsonb,
          ${sha256},
          NOW()
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

    const newLogo =
      insertedRows?.[0];

    if (!newLogo) {
      throw new Error(
        "La nouvelle version du logo n'a pas pu être enregistrée."
      );
    }

    /*
     * 15. Compatibilité avec l'interface actuelle.
     */
    const legacyLogoJson =
      JSON.stringify({
        id:
          nextVersion,

        image:
          generatedImageData,

        mediaType:
          parsedGenerated
            .mimeType,

        model:
          IMAGE_MODEL,

        selectedAt:
          newLogo.selected_at,

        sha256,

        logoVersionId:
          String(
            newLogo.id
          ),

        status:
          'selected',

        sourceType:
          'ai_edit',
      });

    await sql`
      UPDATE simirork_projects
      SET
        logo_json =
          ${legacyLogoJson},
        updated_at =
          NOW()
      WHERE
        id =
          ${projectId}
        AND user_id =
          ${user.id}
    `;

    /*
     * 16. Réponse globale
     */
    return NextResponse.json(
      {
        success: true,

        mode:
          'full',

        message:
          `Logo modifié par IA et enregistré comme version ${nextVersion}.`,

        logo:
          normalizeLogoRow(
            newLogo
          ),

        sourceLogo: {
          id:
            String(
              sourceLogo.id
            ),

          versionNumber:
            Number(
              sourceLogo
                .version_number
            ),

          status:
            String(
              sourceLogo.status
            ),
        },

        usage:
          globalResult.usage,
      }
    );
  } catch (error) {
    console.error(
      'Erreur modification IA du logo:',
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue pendant la modification IA du logo.',
      },
      {
        status: 500,
      }
    );
  }
}
