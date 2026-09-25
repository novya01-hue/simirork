import AdmZip from 'adm-zip';

export const runtime = 'nodejs';

const OWNER = 'novya01-hue';
const REPO = 'simirork';

export async function GET(request: Request) {
  try {
    const token = process.env.GITHUB_TOKEN;
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (!token || !runId) {
      return new Response('Paramètres manquants.', {
        status: 400,
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
      return new Response('APK non disponible.', {
        status: 404,
      });
    }

    const zipResponse = await fetch(artifact.archive_download_url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
      },
      cache: 'no-store',
    });

    if (!zipResponse.ok) {
      return new Response('Impossible de télécharger l’artefact GitHub.', {
        status: zipResponse.status,
      });
    }

    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
    const zip = new AdmZip(zipBuffer);

    const apkEntry = zip
      .getEntries()
      .find((entry) => entry.entryName.toLowerCase().endsWith('.apk'));

    if (!apkEntry) {
      return new Response('Aucun APK trouvé dans l’artefact.', {
        status: 404,
      });
    }

    const apkBuffer = apkEntry.getData();

    return new Response(new Uint8Array(apkBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition':
          'attachment; filename="simirork-app.apk"',
        'Content-Length': apkBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Erreur téléchargement APK:', error);

    return new Response('Erreur téléchargement APK.', {
      status: 500,
    });
  }
}