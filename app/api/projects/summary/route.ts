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

    const rows = await sql`
      SELECT
        id,
        name,
        description,
        created_at,
        updated_at
      FROM simirork_projects
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC
    `;

    return NextResponse.json(
      {
        success: true,
        count: rows.length,
        projects: rows.map(
          (row, index) => ({
            number: index + 1,
            id: String(row.id),
            name: String(row.name),
            description:
              String(
                row.description || ''
              ),
            createdAt:
              row.created_at,
            updatedAt:
              row.updated_at,
          })
        ),
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
      'Erreur vérification projets :',
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