import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const projectRoot = process.cwd();

    const apkPath = path.join(
      projectRoot,
      'android',
      'app',
      'build',
      'outputs',
      'apk',
      'debug',
      'app-debug.apk'
    );

    const apk = await fs.readFile(apkPath);

    return new Response(apk, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="simirork-app.apk"',
        'Content-Length': apk.length.toString(),
      },
    });
  } catch (error) {
    console.error('Erreur téléchargement APK:', error);

    return new Response('APK non disponible.', {
      status: 404,
    });
  }
}