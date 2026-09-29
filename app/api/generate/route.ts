import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_INSTRUCTION = `Tu es SimiRork AI, un assistant expert en création d'applications web interactives.

Lorsque l'utilisateur demande de créer une application ou une page web, génère uniquement un fichier HTML complet et autonome contenant :

1. Tailwind CSS via CDN
2. Tout le JavaScript nécessaire dans une balise <script>
3. Une interface moderne, responsive et mobile-first
4. Aucun texte explicatif avant ou après le code
5. Le résultat doit être directement exécutable dans un navigateur
6. Utilise localStorage lorsque des données doivent être conservées localement
7. L'application doit être fonctionnelle et interactive
8. N'utilise pas de framework nécessitant une compilation externe

Le HTML doit commencer directement par <!DOCTYPE html>.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const prompt = body?.prompt;
    const modelVersion =
      body?.modelVersion || 'openai/gpt-4o-mini';

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Le prompt est obligatoire.',
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    console.log(
      'DEBUG OPENROUTER:',
      Boolean(apiKey),
      'ENV:',
      process.env.VERCEL_ENV || 'local'
    );

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'OPENROUTER_API_KEY est absente.',
          debug: {
            vercelEnv: process.env.VERCEL_ENV || 'local',
            nodeEnv: process.env.NODE_ENV || 'unknown',
          },
        },
        { status: 500 }
      );
    }

    /*
     * ==========================================================
     * TARIFICATION SIMIRORK
     * ==========================================================
     *
     * 1 crédit SimiRork = valeur configurable en USD.
     *
     * Exemple :
     * SIMIRORK_CREDIT_VALUE_USD=0.005
     *
     * Cette valeur peut être modifiée sans modifier le code.
     */
    const creditValueUsd =
      Number(process.env.SIMIRORK_CREDIT_VALUE_USD) || 0.005;

    if (creditValueUsd <= 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'SIMIRORK_CREDIT_VALUE_USD doit être supérieur à 0.',
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
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
          model: modelVersion,
          messages: [
            {
              role: 'system',
              content: SYSTEM_INSTRUCTION,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          usage: {
            include: true,
          },
        }),
        cache: 'no-store',
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Erreur OpenRouter:', {
        status: response.status,
        message:
          data?.error?.message ||
          'Erreur inconnue',
      });

      return NextResponse.json(
        {
          success: false,
          error:
            data?.error?.message ||
            'Erreur lors de la génération avec OpenRouter.',
        },
        { status: response.status }
      );
    }

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Aucun code HTML généré.',
        },
        { status: 500 }
      );
    }

    let generatedCode = content.trim();

    generatedCode = generatedCode
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // ==========================================================
    // CONSOMMATION OPENROUTER
    // ==========================================================

    const usage = data?.usage || {};

    const promptTokens =
      Number(usage?.prompt_tokens) || 0;

    const completionTokens =
      Number(usage?.completion_tokens) || 0;

    const totalTokens =
      Number(usage?.total_tokens) ||
      promptTokens + completionTokens;

    /*
     * OpenRouter peut retourner le coût sous forme numérique.
     * On accepte également une éventuelle valeur textuelle.
     */
    const rawCost = usage?.cost;

    const cost =
      typeof rawCost === 'number'
        ? rawCost
        : Number(rawCost) || 0;

    /*
     * ==========================================================
     * CONVERSION COÛT RÉEL → CRÉDITS SIMIRORK
     * ==========================================================
     *
     * Exemple :
     *
     * coût OpenRouter = $0.039595
     * valeur crédit   = $0.005
     *
     * 0.039595 / 0.005 = 7.919
     *
     * Arrondi supérieur :
     * 8 crédits
     */

    const creditsExact =
      cost / creditValueUsd;

    const creditsUsed =
      cost > 0
        ? Math.max(1, Math.ceil(creditsExact))
        : 0;

    console.log(
      'CONSOMMATION SIMIRORK:',
      {
        model: modelVersion,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        creditValueUsd,
        creditsExact,
        creditsUsed,
        billingMethod: 'openrouter_cost',
        billingVersion: 'cost-v1',
      }
    );

    return NextResponse.json(
      {
        success: true,
        code: generatedCode,
        model: modelVersion,

        usage: {
          promptTokens,
          completionTokens,
          totalTokens,

          // Coût réel retourné par OpenRouter
          cost,

          // Valeur interne d'un crédit SimiRork
          creditValueUsd,

          // Nombre exact avant arrondi
          creditsExact,

          // Nombre de crédits effectivement consommés
          creditsUsed,

          // Traçabilité de la règle appliquée
          billingMethod: 'openrouter_cost',
          billingVersion: 'cost-v1',
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Erreur génération:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue pendant la génération.',
      },
      { status: 500 }
    );
  }
}