import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OWNER = 'novya01-hue';
const REPO = 'simirork';
const WORKFLOW_EVENT = 'build_apk';

function extractLogoBase64(
  value: unknown
): string | null {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  const match =
    trimmed.match(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/
    );

  if (!match) {
    return null;
  }

  const base64 =
    match[1]?.trim();

  return base64 || null;
}

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const code =
      body?.code;

    const appName =
      typeof body?.appName === 'string' &&
      body.appName.trim()
        ? body.appName.trim()
        : 'SimiRork App';

    const projectId =
      typeof body?.projectId === 'string'
        ? body.projectId.trim()
        : '';

    const logoBase64 =
      extractLogoBase64(
        body?.logo
      );

    if (
      !code ||
      typeof code !== 'string'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Aucun code d’application à compiler.',
        },
        {
          status: 400,
        }
      );
    }

    if (!projectId) {
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

    const token =
      process.env.GITHUB_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error:
            'GITHUB_TOKEN est absente de Vercel.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Identifiant unique de CETTE demande APK.
     *
     * C'est lui qui permet de retrouver exactement
     * le bon workflow GitHub et d'éviter de prendre
     * une ancienne exécution.
     */
    const buildRequestId =
      randomUUID();

    const htmlBase64 =
      Buffer.from(
        code,
        'utf8'
      ).toString(
        'base64'
      );

    const startedAt =
      Date.now();

    const dispatchResponse =
      await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/dispatches`,
        {
          method: 'POST',

          headers: {
            Accept:
              'application/vnd.github+json',

            Authorization:
              `Bearer ${token}`,

            'X-GitHub-Api-Version':
              '2026-03-10',

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              event_type:
                WORKFLOW_EVENT,

              client_payload: {
                html_base64:
                  htmlBase64,

                app_name:
                  appName,

                project_id:
                  projectId,

                build_request_id:
                  buildRequestId,

                logo_base64:
                  logoBase64,
              },
            }),
        }
      );

    if (
      !dispatchResponse.ok
    ) {
      const errorText =
        await dispatchResponse.text();

      return NextResponse.json(
        {
          success: false,
          error:
            `GitHub a refusé le lancement du build : ${errorText}`,
        },
        {
          status:
            dispatchResponse.status,
        }
      );
    }

    let runId:
      | number
      | null =
      null;

    /*
     * On recherche maintenant le workflow portant
     * exactement buildRequestId.
     *
     * Plus de confusion possible avec un ancien run.
     */
    for (
      let attempt = 0;
      attempt < 15;
      attempt++
    ) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            2000
          )
      );

      const runsResponse =
        await fetch(
          `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?event=repository_dispatch&branch=main&per_page=20`,
          {
            headers: {
              Accept:
                'application/vnd.github+json',

              Authorization:
                `Bearer ${token}`,

              'X-GitHub-Api-Version':
                '2026-03-10',
            },

            cache:
              'no-store',
          }
        );

      if (
        !runsResponse.ok
      ) {
        continue;
      }

      const runsData =
        await runsResponse.json();

      const workflowRuns =
        Array.isArray(
          runsData?.workflow_runs
        )
          ? runsData.workflow_runs
          : [];

      const run =
        workflowRuns.find(
          (
            item: any
          ) => {
            const createdAt =
              new Date(
                item?.created_at ||
                  0
              ).getTime();

            const displayTitle =
              typeof item?.display_title ===
              'string'
                ? item.display_title
                : '';

            /*
             * Le run-name du workflow contient
             * buildRequestId.
             */
            const correctBuild =
              displayTitle.includes(
                buildRequestId
              );

            const recentEnough =
              createdAt >=
              startedAt -
                5000;

            return (
              correctBuild &&
              recentEnough
            );
          }
        );

      if (
        run?.id
      ) {
        runId =
          Number(
            run.id
          );

        break;
      }
    }

    if (!runId) {
      return NextResponse.json(
        {
          success: false,

          error:
            'Le build GitHub a été lancé, mais SimiRork n’a pas encore retrouvé son exécution exacte.',

          buildRequestId,
        },
        {
          status: 202,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,

        message:
          'Construction APK lancée.',

        runId,

        appName,

        projectId,

        buildRequestId,

        logoProvided:
          Boolean(
            logoBase64
          ),
      }
    );
  } catch (error) {
    console.error(
      'Erreur lancement APK:',
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