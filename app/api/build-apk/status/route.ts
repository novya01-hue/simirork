import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const OWNER = 'novya01-hue';
const REPO = 'simirork';

export async function GET(request: Request) {
  try {
    const token = process.env.GITHUB_TOKEN;
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'GITHUB_TOKEN est absente.',
        },
        { status: 500 }
      );
    }

    if (!runId) {
      return NextResponse.json(
        {
          success: false,
          error: 'runId obligatoire.',
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
        cache: 'no-store',
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data?.message || 'Impossible de lire le build GitHub.',
        },
        { status: response.status }
      );
    }

    if (data.status !== 'completed') {
      return NextResponse.json({
        success: true,
        status: data.status,
        conclusion: null,
      });
    }

    if (data.conclusion !== 'success') {
      return NextResponse.json({
        success: true,
        status: 'completed',
        conclusion: data.conclusion,
        error: `Le build Android a échoué (${data.conclusion}).`,
      });
    }

    const artifactsResponse = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts?name=simirork-apk`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
        cache: 'no-store',
      }
    );

    const artifactsData = await artifactsResponse.json();

    const artifact = artifactsData?.artifacts?.[0];

    if (!artifact) {
      return NextResponse.json({
        success: true,
        status: 'completed',
        conclusion: 'success',
        artifactReady: false,
      });
    }

    return NextResponse.json({
      success: true,
      status: 'completed',
      conclusion: 'success',
      artifactReady: true,
      downloadUrl: `/api/build-apk/download?runId=${runId}`,
    });
  } catch (error) {
    console.error('Erreur statut APK:', error);

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