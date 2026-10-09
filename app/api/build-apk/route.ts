import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OWNER = 'novya01-hue';
const REPO = 'simirork';
const WORKFLOW_EVENT = 'build_apk';

const GITHUB_API =
  `https://api.github.com/repos/${OWNER}/${REPO}`;

type BuildApkBody = {
  projectId?: unknown;
  appName?: unknown;

  /*
   * Anciens champs.
   *
   * Ils peuvent encore être envoyés temporairement
   * par app/page.tsx, mais cette route ne les transmet
   * PLUS à GitHub.
   */
  code?: unknown;
  logo?: unknown;
};

function cleanString(
  value: unknown
): string {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

async function getAuthenticatedUser() {
  const {
    data: sessionData,
  } = await auth.getSession();

  return (
    sessionData?.user ||
    null
  );
}

function sleep(
  milliseconds: number
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

/*
 * ============================================================
 * GET
 *
 * Utilisé UNIQUEMENT par GitHub Actions.
 *
 * GitHub fournit :
 *
 * Authorization: Bearer SIMIRORK_BUILD_SECRET
 *
 * puis :
 *
 * /api/build-apk?projectId=...
 *
 * Cette route récupère le HTML et le logo directement
 * dans Neon.
 * ============================================================
 */

export async function GET(
  request: Request
) {
  try {
    const buildSecret =
      process.env
        .SIMIRORK_BUILD_SECRET
        ?.trim();

    if (!buildSecret) {
      return NextResponse.json(
        {
          success: false,
          error:
            'SIMIRORK_BUILD_SECRET n’est pas configuré sur le serveur.',
        },
        {
          status: 500,
        }
      );
    }

    const authorization =
      request.headers.get(
        'authorization'
      ) || '';

    const expectedAuthorization =
      `Bearer ${buildSecret}`;

    if (
      authorization !==
      expectedAuthorization
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Accès refusé.',
        },
        {
          status: 401,
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    const projectId =
      (
        url.searchParams.get(
          'projectId'
        ) || ''
      ).trim();

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'projectId est obligatoire.',
        },
        {
          status: 400,
        }
      );
    }

    const rows =
      await sql`
        SELECT
          id,
          name,
          code,
          logo_json
        FROM simirork_projects
        WHERE id = ${projectId}
        LIMIT 1
      `;

    const row =
      rows?.[0];

    if (!row) {
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

    const code =
      String(
        row.code || ''
      );

    if (!code.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Le projet ne contient aucun HTML.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Le logo historique de SimiRork est stocké
     * dans logo_json sous la forme :
     *
     * {
     *   "image": "data:image/png;base64,..."
     * }
     */

    let logo:
      string | null = null;

    if (
      typeof row.logo_json ===
        'string' &&
      row.logo_json.trim()
    ) {
      try {
        const parsed =
          JSON.parse(
            row.logo_json
          );

        if (
          parsed &&
          typeof parsed ===
            'object' &&
          typeof parsed.image ===
            'string' &&
          parsed.image.startsWith(
            'data:image/'
          )
        ) {
          logo =
            parsed.image;
        }
      } catch {
        /*
         * Un logo invalide ne doit pas empêcher
         * la construction de l'APK.
         *
         * Le workflow générera alors
         * l'icône de secours.
         */
        logo = null;
      }
    }

    return NextResponse.json(
      {
        success: true,

        project: {
          id:
            String(
              row.id
            ),

          name:
            String(
              row.name ||
                'SimiRork App'
            ),

          code,

          logo,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error(
      'Erreur récupération source APK :',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Impossible de récupérer les données du projet.',
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * ============================================================
 * POST
 *
 * Appelé depuis SimiRork lorsqu'on clique :
 *
 * Générer APK
 *
 * IMPORTANT :
 *
 * Nous n'envoyons PLUS :
 *
 * - code
 * - html_base64
 * - logo
 * - logo_base64
 *
 * dans client_payload GitHub.
 *
 * GitHub reçoit uniquement de petites informations.
 * ============================================================
 */

export async function POST(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Vous devez être connecté.',
        },
        {
          status: 401,
        }
      );
    }

    const githubToken =
      process.env
        .GITHUB_TOKEN
        ?.trim();

    if (!githubToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            'GITHUB_TOKEN n’est pas configuré.',
        },
        {
          status: 500,
        }
      );
    }

    const body =
      await request.json() as
        BuildApkBody;

    const projectId =
      cleanString(
        body.projectId
      );

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'projectId est obligatoire pour construire l’APK.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Sécurité :
     *
     * on vérifie que le projet appartient
     * bien à l'utilisateur connecté.
     */

    const projectRows =
      await sql`
        SELECT
          id,
          name,
          code
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
            'Projet introuvable ou accès refusé.',
        },
        {
          status: 404,
        }
      );
    }

    const projectCode =
      String(
        project.code || ''
      );

    if (!projectCode.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Ce projet ne contient aucun HTML à construire.',
        },
        {
          status: 400,
        }
      );
    }

    const appName =
      String(
        project.name ||
          cleanString(
            body.appName
          ) ||
          'SimiRork App'
      ).trim();

    const buildRequestId =
      randomUUID();

    const dispatchStartedAt =
      Date.now();

    /*
     * NOUVEAU PAYLOAD LÉGER.
     *
     * Même si le futur projet fait plusieurs Mo,
     * client_payload restera minuscule.
     */

    const dispatchPayload = {
      event_type:
        WORKFLOW_EVENT,

      client_payload: {
        build_request_id:
          buildRequestId,

        project_id:
          projectId,

        app_name:
          appName,
      },
    };

    const dispatchResponse =
      await fetch(
        `${GITHUB_API}/dispatches`,
        {
          method: 'POST',

          headers: {
            Accept:
              'application/vnd.github+json',

            Authorization:
              `Bearer ${githubToken}`,

            'X-GitHub-Api-Version':
              '2022-11-28',

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify(
              dispatchPayload
            ),

          cache: 'no-store',
        }
      );

    if (
      !dispatchResponse.ok
    ) {
      const errorText =
        await dispatchResponse.text();

      console.error(
        'Erreur repository_dispatch GitHub :',
        dispatchResponse.status,
        errorText
      );

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

    /*
     * repository_dispatch ne renvoie pas directement
     * le Run ID.
     *
     * On cherche donc le workflow nouvellement créé.
     *
     * Le run-name contient buildRequestId,
     * ce qui permet de retrouver précisément
     * le bon build.
     */

    let runId:
      number | null = null;

    let runUrl:
      string | null = null;

    for (
      let attempt = 0;
      attempt < 20;
      attempt += 1
    ) {
      /*
       * Le workflow peut prendre quelques secondes
       * avant d'apparaître dans l'API GitHub.
       */

      await sleep(
        attempt === 0
          ? 800
          : 1000
      );

      const runsResponse =
        await fetch(
          `${GITHUB_API}/actions/runs?event=repository_dispatch&branch=main&per_page=30`,
          {
            headers: {
              Accept:
                'application/vnd.github+json',

              Authorization:
                `Bearer ${githubToken}`,

              'X-GitHub-Api-Version':
                '2022-11-28',
            },

            cache: 'no-store',
          }
        );

      if (
        !runsResponse.ok
      ) {
        continue;
      }

      const runsData =
        await runsResponse.json() as {
          workflow_runs?: Array<{
            id?: number;
            name?: string;
            display_title?: string;
            created_at?: string;
            html_url?: string;
          }>;
        };

      const runs =
        Array.isArray(
          runsData.workflow_runs
        )
          ? runsData.workflow_runs
          : [];

      const matchingRun =
        runs.find(
          (run) => {
            const displayTitle =
              String(
                run.display_title ||
                  ''
              );

            if (
              displayTitle.includes(
                buildRequestId
              )
            ) {
              return true;
            }

            /*
             * Sécurité supplémentaire :
             * on ignore les vieux runs.
             */

            const createdAt =
              run.created_at
                ? new Date(
                    run.created_at
                  ).getTime()
                : 0;

            return (
              displayTitle.includes(
                appName
              ) &&
              createdAt >=
                dispatchStartedAt -
                  5000
            );
          }
        );

      if (
        matchingRun?.id
      ) {
        runId =
          Number(
            matchingRun.id
          );

        runUrl =
          matchingRun.html_url
            ? String(
                matchingRun.html_url
              )
            : null;

        break;
      }
    }

    if (!runId) {
      return NextResponse.json(
        {
          success: false,

          error:
            'Le workflow GitHub a été déclenché, mais son Run ID n’a pas encore pu être retrouvé. Vérifiez GitHub Actions.',
        },
        {
          status: 504,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,

        runId:
          String(
            runId
          ),

        runUrl,

        buildRequestId,

        projectId,

        appName,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      'Erreur lancement APK :',
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erreur pendant le lancement de la construction APK.',
      },
      {
        status: 500,
      }
    );
  }
}