import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const {
      data: sessionData,
    } = await auth.getSession();

    const user = sessionData?.user;

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
        created_at,
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
      FROM simirork_generation_usage
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 200
    `;

    const history = rows.map(
      (row) => ({
        id: String(row.id),
        createdAt: row.created_at,
        projectId:
          row.project_id
            ? String(row.project_id)
            : '',
        projectName:
          String(
            row.project_name
          ),
        model: String(
          row.model
        ),
        promptWords:
          Number(
            row.prompt_words
          ),
        promptChars:
          Number(
            row.prompt_chars
          ),
        promptTokens:
          Number(
            row.prompt_tokens
          ),
        completionTokens:
          Number(
            row.completion_tokens
          ),
        totalTokens:
          Number(
            row.total_tokens
          ),
        cost:
          Number(
            row.cost_usd
          ),
        creditsUsed:
          Number(
            row.credits_used
          ),
        creditValueUsd:
          row.credit_value_usd !==
          null
            ? Number(
                row.credit_value_usd
              )
            : undefined,
        creditsExact:
          row.credits_exact !==
          null
            ? Number(
                row.credits_exact
              )
            : undefined,
        billingMethod:
          row.billing_method
            ? String(
                row.billing_method
              )
            : undefined,
        billingVersion:
          row.billing_version
            ? String(
                row.billing_version
              )
            : undefined,
        balanceAfter:
          row.balance_after !==
          null
            ? Number(
                row.balance_after
              )
            : undefined,
      })
    );

    return NextResponse.json(
      {
        success: true,
        history,
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
      'Erreur API historique :',
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