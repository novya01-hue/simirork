import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

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

type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const MODEL_PRICING: Record<
  string,
  ModelPricing
> = {
  'google/gemini-3.6-flash': {
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
  },

  'google/gemini-3.5-flash-lite': {
    inputPerMillion: 0.3,
    outputPerMillion: 2.5,
  },

  'google/gemini-2.5-flash-lite': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
  },

  'openai/gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
};

/*
 * Nombre maximal de crédits qu'une génération
 * peut réserver.
 *
 * Cela évite qu'un seul prompt consomme
 * tout le compte utilisateur.
 */
const MAX_GENERATION_CREDITS = Math.max(
  1,
  Number(
    process.env.SIMIRORK_MAX_GENERATION_CREDITS
  ) || 20
);

/*
 * Limite de sortie absolue.
 *
 * Elle protège également contre une réponse
 * extrêmement longue de l'IA.
 */
const ABSOLUTE_MAX_OUTPUT_TOKENS = 12000;

function countWords(text: string): number {
  const trimmed = text.trim();

  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

/*
 * Estimation volontairement prudente.
 *
 * On utilise environ 3 caractères par token,
 * puis une marge fixe pour le SYSTEM_INSTRUCTION
 * et les éventuels overheads du modèle.
 */
function estimatePromptTokens(
  prompt: string
): number {
  const promptEstimate =
    Math.ceil(prompt.length / 3);

  const systemOverhead = 1000;

  return promptEstimate + systemOverhead;
}

async function refundReservation(
  userId: string,
  reservedCredits: number
) {
  if (reservedCredits <= 0) {
    return;
  }

  await sql`
    UPDATE simirork_credit_accounts
    SET
      balance = balance + ${reservedCredits},
      updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

export async function POST(
  request: Request
) {
  let reservationActive = false;
  let reservedCredits = 0;
  let authenticatedUserId = '';

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

    authenticatedUserId =
      user.id;

    const body =
      await request.json();

    const prompt =
      body?.prompt;

    const modelVersion =
      body?.modelVersion ||
      'openai/gpt-4o-mini';

    const projectId =
      typeof body?.projectId ===
      'string'
        ? body.projectId
        : null;

    const projectName =
      typeof body?.projectName ===
        'string' &&
      body.projectName.trim()
        ? body.projectName.trim()
        : 'Application sans nom';

    if (
      !prompt ||
      typeof prompt !== 'string'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Le prompt est obligatoire.',
        },
        { status: 400 }
      );
    }

    /*
     * Le serveur refuse tout modèle
     * qui ne fait pas partie de la
     * liste autorisée.
     */
    const modelPricing =
      MODEL_PRICING[
        modelVersion
      ];

    if (!modelPricing) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Modèle IA non autorisé.',
        },
        { status: 400 }
      );
    }

    const apiKey =
      process.env
        .OPENROUTER_API_KEY;

    console.log(
      'DEBUG OPENROUTER:',
      Boolean(apiKey),
      'ENV:',
      process.env.VERCEL_ENV ||
        'local'
    );

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'OPENROUTER_API_KEY est absente.',
          debug: {
            vercelEnv:
              process.env.VERCEL_ENV ||
              'local',
            nodeEnv:
              process.env.NODE_ENV ||
              'unknown',
          },
        },
        { status: 500 }
      );
    }

    const creditValueUsd =
      Number(
        process.env
          .SIMIRORK_CREDIT_VALUE_USD
      ) || 0.005;

    if (
      creditValueUsd <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'SIMIRORK_CREDIT_VALUE_USD doit être supérieur à 0.',
        },
        { status: 500 }
      );
    }

    /*
     * ----------------------------------------------------------
     * 1. GARANTIR L'EXISTENCE DU COMPTE
     * ----------------------------------------------------------
     */

    const accountResult =
      await sql`
        INSERT INTO simirork_credit_accounts (
          user_id,
          balance,
          consumed
        )
        VALUES (
          ${user.id},
          100,
          0
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          updated_at = NOW()
        RETURNING
          user_id,
          balance,
          consumed
      `;

    const account =
      accountResult[0];

    if (!account) {
      throw new Error(
        'Impossible de récupérer le compte de crédits.'
      );
    }

    const currentBalance =
      Number(account.balance);

    if (
      !Number.isFinite(
        currentBalance
      ) ||
      currentBalance <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Solde de crédits insuffisant.',
          balance:
            currentBalance,
        },
        { status: 402 }
      );
    }

    /*
     * ----------------------------------------------------------
     * 2. RÉSERVATION ATOMIQUE
     * ----------------------------------------------------------
     *
     * On réserve au maximum 20 crédits
     * ou tout le solde restant.
     *
     * Deux générations simultanées ne peuvent
     * donc pas dépenser le même solde.
     */

    reservedCredits =
      Math.min(
        currentBalance,
        MAX_GENERATION_CREDITS
      );

    const reservationResult =
      await sql`
        UPDATE simirork_credit_accounts
        SET
          balance =
            balance - ${reservedCredits},
          updated_at = NOW()
        WHERE
          user_id = ${user.id}
          AND balance >= ${reservedCredits}
        RETURNING
          balance,
          consumed
      `;

    const reservation =
      reservationResult[0];

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Solde de crédits insuffisant pour démarrer cette génération.',
        },
        { status: 402 }
      );
    }

    reservationActive = true;

    const balanceAfterReservation =
      Number(
        reservation.balance
      );

    /*
     * ----------------------------------------------------------
     * 3. CALCUL DU BUDGET MAXIMUM
     * ----------------------------------------------------------
     */

    const estimatedPromptTokens =
      estimatePromptTokens(
        prompt
      );

    const estimatedInputCost =
      (
        estimatedPromptTokens *
        modelPricing.inputPerMillion
      ) /
      1_000_000;

    const reservedBudgetUsd =
      reservedCredits *
      creditValueUsd;

    const remainingOutputBudget =
      reservedBudgetUsd -
      estimatedInputCost;

    if (
      remainingOutputBudget <=
      0
    ) {
      await refundReservation(
        user.id,
        reservedCredits
      );

      reservationActive = false;

      return NextResponse.json(
        {
          success: false,
          error:
            'Votre solde est insuffisant pour ce prompt avec le modèle sélectionné.',
          balance:
            balanceAfterReservation +
            reservedCredits,
        },
        { status: 402 }
      );
    }

    const calculatedMaxOutputTokens =
      Math.floor(
        (
          remainingOutputBudget *
          1_000_000
        ) /
          modelPricing.outputPerMillion
      );

    const maxOutputTokens =
      Math.min(
        ABSOLUTE_MAX_OUTPUT_TOKENS,
        calculatedMaxOutputTokens
      );

    if (
      !Number.isFinite(
        maxOutputTokens
      ) ||
      maxOutputTokens < 1
    ) {
      await refundReservation(
        user.id,
        reservedCredits
      );

      reservationActive = false;

      return NextResponse.json(
        {
          success: false,
          error:
            'Le budget disponible est trop faible pour générer cette application.',
          balance:
            balanceAfterReservation +
            reservedCredits,
        },
        { status: 402 }
      );
    }

    console.log(
      'BUDGET GÉNÉRATION SIMIRORK:',
      {
        userId: user.id,
        model: modelVersion,
        currentBalance,
        reservedCredits,
        reservedBudgetUsd,
        estimatedPromptTokens,
        estimatedInputCost,
        remainingOutputBudget,
        maxOutputTokens,
      }
    );

    /*
     * ----------------------------------------------------------
     * 4. APPEL OPENROUTER
     * ----------------------------------------------------------
     */

    const response =
      await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type':
              'application/json',
            'HTTP-Referer':
              'https://simirork.vercel.app',
            'X-Title':
              'SimiRork',
          },

          body: JSON.stringify({
            model: modelVersion,

            messages: [
              {
                role: 'system',
                content:
                  SYSTEM_INSTRUCTION,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],

            temperature: 0.2,

            max_tokens:
              maxOutputTokens,

            usage: {
              include: true,
            },
          }),

          cache: 'no-store',
        }
      );

    const data =
      await response.json();

    /*
     * ----------------------------------------------------------
     * 5. ERREUR OPENROUTER
     * ----------------------------------------------------------
     */

    if (!response.ok) {
      console.error(
        'Erreur OpenRouter:',
        {
          status:
            response.status,
          message:
            data?.error?.message ||
            'Erreur inconnue',
        }
      );

      await refundReservation(
        user.id,
        reservedCredits
      );

      reservationActive = false;

      return NextResponse.json(
        {
          success: false,
          error:
            data?.error?.message ||
            'Erreur lors de la génération avec OpenRouter.',
        },
        {
          status:
            response.status,
        }
      );
    }

    /*
     * ----------------------------------------------------------
     * 6. CODE GÉNÉRÉ
     * ----------------------------------------------------------
     */

    const content =
      data?.choices?.[0]
        ?.message?.content;

    if (
      !content ||
      typeof content !==
        'string'
    ) {
      await refundReservation(
        user.id,
        reservedCredits
      );

      reservationActive = false;

      return NextResponse.json(
        {
          success: false,
          error:
            'Aucun code HTML généré.',
        },
        { status: 500 }
      );
    }

    let generatedCode =
      content.trim();

    generatedCode =
      generatedCode
        .replace(
          /^```html\s*/i,
          ''
        )
        .replace(
          /^```\s*/i,
          ''
        )
        .replace(
          /\s*```$/i,
          ''
        )
        .trim();

    /*
     * ----------------------------------------------------------
     * 7. COÛT RÉEL OPENROUTER
     * ----------------------------------------------------------
     */

    const usage =
      data?.usage || {};

    const promptTokens =
      Number(
        usage?.prompt_tokens
      ) || 0;

    const completionTokens =
      Number(
        usage?.completion_tokens
      ) || 0;

    const totalTokens =
      Number(
        usage?.total_tokens
      ) ||
      promptTokens +
        completionTokens;

    const rawCost =
      usage?.cost;

    const cost =
      typeof rawCost ===
      'number'
        ? rawCost
        : Number(rawCost) ||
          0;

    /*
     * Le coût réel doit être disponible.
     */
    if (cost <= 0) {
      await refundReservation(
        user.id,
        reservedCredits
      );

      reservationActive = false;

      console.error(
        'Coût OpenRouter invalide ou absent.',
        {
          model:
            modelVersion,
          usage,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Le coût réel OpenRouter est indisponible. La génération n’a pas été facturée.',
        },
        { status: 502 }
      );
    }

    const creditsExact =
      cost /
      creditValueUsd;

    const creditsUsed =
      Math.max(
        1,
        Math.ceil(
          creditsExact
        )
      );

    /*
     * La limite max_tokens doit normalement
     * garantir que cette situation n'arrive pas.
     *
     * On conserve néanmoins un contrôle serveur.
     */
    if (
      creditsUsed >
      reservedCredits
    ) {
      console.error(
        'Dépassement inattendu de la réservation.',
        {
          userId:
            user.id,
          reservedCredits,
          creditsUsed,
          cost,
          creditValueUsd,
          model:
            modelVersion,
        }
      );

      /*
       * On tente de prendre la différence
       * sur le solde encore disponible.
       */
      const additionalCredits =
        creditsUsed -
        reservedCredits;

      const extraResult =
        await sql`
          UPDATE simirork_credit_accounts
          SET
            balance =
              balance - ${additionalCredits},
            updated_at = NOW()
          WHERE
            user_id = ${user.id}
            AND balance >= ${additionalCredits}
          RETURNING
            balance,
            consumed
        `;

      if (
        !extraResult[0]
      ) {
        /*
         * Nous ne pouvons pas couvrir
         * le coût réel avec le solde disponible.
         *
         * La réservation reste en place
         * pour éviter de laisser croire
         * que les crédits sont disponibles.
         */
        return NextResponse.json(
          {
            success: false,
            error:
              'Le coût réel de cette génération dépasse le budget de crédits disponible.',
            requiredCredits:
              creditsUsed,
            reservedCredits,
          },
          { status: 402 }
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * 8. FACTURATION FINALE
     * ----------------------------------------------------------
     *
     * Si nous avions réservé 20 crédits
     * et que la génération coûte 6 :
     *
     * réservation : -20
     * remboursement : +14
     * consommation : +6
     *
     * Résultat net : -6.
     */

    const refundCredits =
      Math.max(
        0,
        reservedCredits -
          creditsUsed
      );

    const promptWords =
      countWords(prompt);

    const promptChars =
      prompt.length;

    const billingResult =
      await sql`
        UPDATE simirork_credit_accounts
        SET
          balance =
            balance + ${refundCredits},
          consumed =
            consumed + ${creditsUsed},
          updated_at = NOW()
        WHERE
          user_id = ${user.id}
        RETURNING
          user_id,
          balance,
          consumed
      `;

    const billingAccount =
      billingResult[0];

    if (!billingAccount) {
      throw new Error(
        'Impossible de finaliser la facturation.'
      );
    }

    /*
     * La réservation n'est plus active :
     * le solde a maintenant été finalisé.
     */
    reservationActive = false;

    const balanceAfter =
      Number(
        billingAccount.balance
      );

    const consumedAfter =
      Number(
        billingAccount.consumed
      );

    /*
     * ----------------------------------------------------------
     * 9. HISTORIQUE POSTGRESQL
     * ----------------------------------------------------------
     */

    const usageInsert =
      await sql`
        INSERT INTO simirork_generation_usage (
          user_id,
          project_id,
          project_name,
          model,
          prompt_words,
          prompt_chars,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          cost_usd,
          credit_value_usd,
          credits_exact,
          credits_used,
          balance_after,
          billing_method,
          billing_version
        )
        VALUES (
          ${user.id},
          ${projectId},
          ${projectName},
          ${modelVersion},
          ${promptWords},
          ${promptChars},
          ${promptTokens},
          ${completionTokens},
          ${totalTokens},
          ${cost},
          ${creditValueUsd},
          ${creditsExact},
          ${creditsUsed},
          ${balanceAfter},
          'openrouter_cost',
          'cost-v2-reservation'
        )
        RETURNING id
      `;

    const usageRecord =
      usageInsert[0];

    if (!usageRecord) {
      console.error(
        'Facturation enregistrée mais historique PostgreSQL absent.'
      );
    }

    console.log(
      'CONSOMMATION SIMIRORK:',
      {
        userId:
          user.id,
        model:
          modelVersion,
        projectId,
        projectName,
        promptWords,
        promptChars,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        creditValueUsd,
        creditsExact,
        creditsUsed,
        reservedCredits,
        refundCredits,
        balanceAfter,
        consumedAfter,
        billingMethod:
          'openrouter_cost',
        billingVersion:
          'cost-v2-reservation',
      }
    );

    /*
     * ----------------------------------------------------------
     * 10. RÉPONSE
     * ----------------------------------------------------------
     */

    return NextResponse.json(
      {
        success: true,

        code: generatedCode,

        model:
          modelVersion,

        usage: {
          promptWords,
          promptChars,
          promptTokens,
          completionTokens,
          totalTokens,
          cost,
          creditValueUsd,
          creditsExact,
          creditsUsed,
          reservedCredits,
          refundCredits,
          balanceAfter,
          consumedAfter,
          billingMethod:
            'openrouter_cost',
          billingVersion:
            'cost-v2-reservation',
          maxOutputTokens,
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
      'Erreur génération:',
      error
    );

    /*
     * Toute erreur survenue avant la finalisation
     * restitue la réservation.
     */
    if (
      reservationActive &&
      authenticatedUserId &&
      reservedCredits > 0
    ) {
      try {
        await refundReservation(
          authenticatedUserId,
          reservedCredits
        );
      } catch (
        refundError
      ) {
        console.error(
          'Erreur restitution réservation crédits:',
          refundError
        );
      }
    }

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