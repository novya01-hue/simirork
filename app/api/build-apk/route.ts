import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OWNER = 'novya01-hue';
const REPO = 'simirork';
const WORKFLOW_EVENT = 'build_apk';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const code = body?.code;
    const appName = body?.appName || 'SimiRork App';

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Aucun code d’application à compiler.',
        },
        { status: 400 }
      );
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'GITHUB_TOKEN est absente de Vercel.',
        },
        { status: 500 }
      );
    }

    const htmlBase64 = Buffer.from(code, 'utf8').toString('base64');
    const startedAt = Date.now();

    const dispatchResponse = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: WORKFLOW_EVENT,
          client_payload: {
            html_base64: htmlBase64,
            app_name: appName,
          },
        }),
      }
    );

    if (!dispatchResponse.ok) {
      const errorText = await dispatchResponse.text();

      return NextResponse.json(
        {
          success: false,
          error: `GitHub a refusé le lancement du build : ${errorText}`,
        },
        { status: dispatchResponse.status }
      );
    }

    let runId: number | null = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const runsResponse = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?event=repository_dispatch&branch=main&per_page=10`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2026-03-10',
          },
          cache: 'no-store',
        }
      );

      if (!runsResponse.ok) {
        continue;
      }

      const runsData = await runsResponse.json();

      const run = runsData?.workflow_runs?.find((item: any) => {
        const created = new Date(item.created_at).getTime();
        return created >= startedAt - 10000;
      });

      if (run?.id) {
        runId = run.id;
        break;
      }
    }

    if (!runId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Le build GitHub a été lancé, mais son identifiant n’a pas encore été trouvé.',
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Construction APK lancée.',
      runId,
      appName,
    });
  } catch (error) {
    console.error('Erreur lancement APK:', error);

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