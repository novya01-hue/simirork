import AdmZip from 'adm-zip';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const OWNER = 'novya01-hue';
const REPO = 'simirork';

function createSafeFileName(appName: string): string {
  const normalized = appName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const words = normalized.match(/[a-z0-9]+/g) || [];

  const slug = words.join('-');

  return `${slug || 'simirork-app'}.apk`;
}

export async function GET(request: Request) {
  try {
    const token = process.env.GITHUB_TOKEN;

    const { searchParams } = new URL(request.url);

    const runId = searchParams.get('runId');
    const appName =
      searchParams.get('appName') || 'SimiRork App';

    if (!token || !runId) {
      return new NextResponse(
        'Paramètres manquants.',
        { status: 400 }
      );
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

    if (!artifactsResponse.ok) {
      return new NextResponse(
        artifactsData?.message ||
          'Impossible de récupérer l’artefact GitHub.',
        {
          status: artifactsResponse.status,
        }
      );
    }

    const artifact = artifactsData?.artifacts?.[0];

    if (!artifact) {
      return new NextResponse(
        'APK non disponible.',
        { status: 404 }
      );
    }

    const zipResponse = await fetch(
      artifact.archive_download_url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
        cache: 'no-store',
      }
    );

    if (!zipResponse.ok) {
      return new NextResponse(
        'Impossible de télécharger l’artefact GitHub.',
        {
          status: zipResponse.status,
        }
      );
    }

    const zipBuffer = Buffer.from(
      await zipResponse.arrayBuffer()
    );

    const zip = new AdmZip(zipBuffer);

    const apkEntry = zip
      .getEntries()
      .find(
        (entry) =>
          !entry.isDirectory &&
          entry.entryName
            .toLowerCase()
            .endsWith('.apk')
      );

    if (!apkEntry) {
      return new NextResponse(
        'Aucun APK trouvé dans l’artefact.',
        { status: 404 }
      );
    }

    const apkBuffer = apkEntry.getData();

    const fileName = createSafeFileName(appName);

    return new NextResponse(
      new Uint8Array(apkBuffer),
      {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.android.package-archive',

          'Content-Disposition':
            `attachment; filename="${fileName}"`,

          'Content-Length':
            apkBuffer.length.toString(),

          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error(
      'Erreur téléchargement APK:',
      error
    );

    return new NextResponse(
      'Erreur téléchargement APK.',
      { status: 500 }
    );
  }
}