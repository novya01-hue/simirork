import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const LOGO_MODEL =
  process.env.SIMIRORK_LOGO_MODEL ||
  'bytedance-seed/seedream-4.5';

type LogoRequestBody = {
  projectId?: unknown;
  projectName?: unknown;
  description?: unknown;
  prompt?: unknown;
};

type OpenRouterImage = {
  b64_json?: unknown;
  media_type?: unknown;
};

type OpenRouterImageResponse = {
  data?: OpenRouterImage[];
  usage?: {
    cost?: unknown;
  };
  error?: {
    message?: unknown;
  };
};

type GeneratedLogo = {
  id: number;
  mediaType: string;
  base64: string;
  image: string;
};

const LOGO_VARIANTS = [
  'Concept 1 : crée un logo principal, clair, moderne, très lisible, avec un symbole fort et simple.',
  'Concept 2 : crée une proposition alternative avec une approche plus créative, plus géométrique ou plus abstraite.',
  'Concept 3 : crée une proposition premium et dynamique, pensée pour une icône d’application mobile mémorable.',
] as const;

function cleanString(
  value: unknown
): string {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function createLogoPrompt({
  projectName,
  description,
  appPrompt,
  variantInstruction,
}: {
  projectName: string;
  description: string;
  appPrompt: string;
  variantInstruction: string;
}) {
  const descriptionPart =
    description ||
    'Application numérique moderne';

  const promptPart =
    appPrompt ||
    'Aucune information supplémentaire.';

  return `
Crée un seul logo professionnel pour une application.

Nom de l'application :
"${projectName}"

Description :
"${descriptionPart}"

Contexte de création de l'application :
"${promptPart}"

Variante demandée :
${variantInstruction}

OBJECTIF :
Créer un logo professionnel qui représente clairement le rôle et l'identité de cette application.

RÈGLES IMPORTANTES :
- Ne te contente pas d'utiliser la première lettre du nom.
- Évite les logos génériques.
- Le symbole doit être compréhensible même sans texte.
- Le logo doit fonctionner comme icône d'application Android.
- Composition centrée.
- Format carré.
- Fond propre.
- Design lisible en petite taille.
- Pas de mockup de téléphone.
- Pas de téléphone dessiné autour du logo.
- Pas de capture d'écran.
- Pas de texte descriptif autour du logo.
- Pas de watermark.
- Pas de cadre décoratif inutile.
- Pas de photographie réaliste.
- Pas de personnage sauf si l'application l'exige clairement.
- Le résultat doit ressembler à une vraie icône d'application publiée sur un store.

STYLE :
moderne, professionnel, propre, identifiable, mémorable.

IMPORTANT :
Retourne une image unique correspondant à cette variante.
`.trim();
}

async function generateSingleLogo({
  apiKey,
  prompt,
  logoId,
}: {
  apiKey: string;
  prompt: string;
  logoId: number;
}): Promise<{
  logo: GeneratedLogo;
  cost: number;
}> {
  const response =
    await fetch(
      'https://openrouter.ai/api/v1/images',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            'https://simirork.vercel.app',
          'X-Title': 'SimiRork',
        },
        body: JSON.stringify({
          model: LOGO_MODEL,
          prompt,
          n: 1,
          aspect_ratio: '1:1',
          usage: {
            include: true,
          },
        }),
        cache: 'no-store',
      }
    );

  const rawText =
    await response.text();

  let data:
    | OpenRouterImageResponse
    | null = null;

  try {
    data =
      rawText
        ? (JSON.parse(
            rawText
          ) as OpenRouterImageResponse)
        : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      typeof data?.error?.message ===
        'string' &&
        data.error.message.trim()
        ? data.error.message
        : `Erreur OpenRouter (${response.status}).`
    );
  }

  const firstImage =
    Array.isArray(data?.data) &&
    data.data.length > 0
      ? data.data[0]
      : null;

  const base64 =
    typeof firstImage?.b64_json ===
    'string'
      ? firstImage.b64_json
      : '';

  if (!base64) {
    throw new Error(
      `Aucune image reçue pour le logo ${logoId}.`
    );
  }

  const mediaType =
    typeof firstImage?.media_type ===
      'string' &&
    firstImage.media_type.startsWith(
      'image/'
    )
      ? firstImage.media_type
      : 'image/png';

  const rawCost =
    data?.usage?.cost;

  const cost =
    typeof rawCost === 'number'
      ? rawCost
      : Number(rawCost) || 0;

  return {
    logo: {
      id: logoId,
      mediaType,
      base64,
      image: `data:${mediaType};base64,${base64}`,
    },
    cost,
  };
}

export async function POST(
  request: Request
) {
  try {
    const {
      data: sessionData,
    } = await auth.getSession();

    const user =
      sessionData?.user;

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
      (await request.json()) as LogoRequestBody;

    const projectId =
      cleanString(
        body.projectId
      );

    let projectName =
      cleanString(
        body.projectName
      );

    let description =
      cleanString(
        body.description
      );

    let appPrompt =
      cleanString(
        body.prompt
      );

    if (projectId) {
      const result =
        await sql`
          SELECT
            id,
            name,
            description,
            prompt
          FROM simirork_projects
          WHERE
            id = ${projectId}
            AND user_id = ${user.id}
          LIMIT 1
        `;

      const project =
        result[0];

      if (!project) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Projet introuvable ou inaccessible.',
          },
          { status: 404 }
        );
      }

      projectName =
        String(
          project.name || ''
        ).trim();

      description =
        String(
          project.description || ''
        ).trim();

      appPrompt =
        String(
          project.prompt || ''
        ).trim();
    }

    if (!projectName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le nom de l'application est obligatoire.",
        },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'OPENROUTER_API_KEY est absente.',
        },
        { status: 500 }
      );
    }

    const prompts =
      LOGO_VARIANTS.map(
        (variantInstruction) =>
          createLogoPrompt({
            projectName,
            description,
            appPrompt,
            variantInstruction,
          })
      );

    const generationResults =
      await Promise.all(
        prompts.map(
          (
            prompt,
            index
          ) =>
            generateSingleLogo({
              apiKey,
              prompt,
              logoId: index + 1,
            })
        )
      );

    const logos =
      generationResults.map(
        (result) => result.logo
      );

    const totalCost =
      generationResults.reduce(
        (sum, result) =>
          sum + result.cost,
        0
      );

    console.log(
      'GÉNÉRATION LOGOS SIMIRORK:',
      {
        userId: user.id,
        projectId:
          projectId || null,
        projectName,
        model: LOGO_MODEL,
        logosGenerated:
          logos.length,
        cost: totalCost,
      }
    );

    return NextResponse.json(
      {
        success: true,
        projectId:
          projectId || null,
        projectName,
        model: LOGO_MODEL,
        logos,
        usage: {
          cost: totalCost,
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
      'Erreur génération logos:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue pendant la génération des logos.',
      },
      { status: 500 }
    );
  }
}