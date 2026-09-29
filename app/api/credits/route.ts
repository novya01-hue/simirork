import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: sessionData } = await auth.getSession();

    const user = sessionData?.user;

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Utilisateur non authentifié.',
        },
        { status: 401 }
      );
    }

    const result = await sql`
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
        consumed,
        created_at,
        updated_at
    `;

    const account = result[0];

    if (!account) {
      throw new Error(
        'Impossible de récupérer le compte de crédits.'
      );
    }

    return NextResponse.json(
      {
        success: true,
        account: {
          userId: String(account.user_id),
          balance: Number(account.balance),
          consumed: Number(account.consumed),
          createdAt: account.created_at,
          updatedAt: account.updated_at,
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
      'Erreur API crédits :',
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