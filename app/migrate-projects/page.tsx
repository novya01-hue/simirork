'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY =
  'simirork_projects';

type LegacyProject = {
  id?: string;
  name?: string;
  description?: string;
  prompt?: string;
  code?: string;
  createdAt?: string;
  updatedAt?: string;
  apkStatus?:
    | 'none'
    | 'building'
    | 'ready'
    | 'error';
  apkRunId?: string | null;
  apkError?: string;
};

export default function MigrateProjectsPage() {
  const [status, setStatus] =
    useState(
      'Préparation de la migration...'
    );

  const [details, setDetails] =
    useState<string[]>([]);

  const [done, setDone] =
    useState(false);

  useEffect(() => {
    const migrate =
      async () => {
        try {
          const saved =
            localStorage.getItem(
              STORAGE_KEY
            );

          if (!saved) {
            setStatus(
              'Aucun projet local trouvé.'
            );
            setDone(true);
            return;
          }

          let projects: LegacyProject[];

          try {
            const parsed =
              JSON.parse(
                saved
              );

            if (
              !Array.isArray(
                parsed
              )
            ) {
              throw new Error(
                'Les données locales ne sont pas une liste de projets.'
              );
            }

            projects =
              parsed;
          } catch (error) {
            throw new Error(
              error instanceof
              Error
                ? error.message
                : 'Impossible de lire les projets locaux.'
            );
          }

          setStatus(
            `${projects.length} projet(s) local(aux) trouvé(s).`
          );

          if (
            projects.length ===
            0
          ) {
            setDone(true);
            return;
          }

          let imported = 0;
          let skipped = 0;
          let failed = 0;

          for (
            let index = 0;
            index <
            projects.length;
            index++
          ) {
            const project =
              projects[index];

            if (
              !project ||
              typeof project.name !==
                'string' ||
              !project.name.trim()
            ) {
              failed++;

              setDetails(
                (previous) => [
                  ...previous,
                  `❌ Projet ${
                    index + 1
                  } : nom invalide.`,
                ]
              );

              continue;
            }

            setStatus(
              `Migration du projet ${
                index + 1
              }/${projects.length} : ${project.name}`
            );

            const response =
              await fetch(
                '/api/projects',
                {
                  method:
                    'POST',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  credentials:
                    'same-origin',
                  body: JSON.stringify(
                    {
                      id:
                        project.id ||
                        crypto.randomUUID(),

                      name:
                        project.name,

                      description:
                        project.description ||
                        '',

                      prompt:
                        project.prompt ||
                        '',

                      code:
                        project.code ||
                        '',

                      apkStatus:
                        project.apkStatus ||
                        'none',

                      apkRunId:
                        project.apkRunId ||
                        null,

                      apkError:
                        project.apkError ||
                        '',

                      createdAt:
                        project.createdAt,

                      updatedAt:
                        project.updatedAt,
                    }
                  ),
                }
              );

            const data =
              await response.json();

            if (
              response.ok &&
              data.success
            ) {
              imported++;

              setDetails(
                (previous) => [
                  ...previous,
                  `✅ Importé : ${project.name}`,
                ]
              );
            } else if (
              response.status ===
                409
            ) {
              skipped++;

              setDetails(
                (previous) => [
                  ...previous,
                  `↪ Déjà présent : ${project.name}`,
                ]
              );
            } else {
              failed++;

              setDetails(
                (previous) => [
                  ...previous,
                  `❌ Échec : ${project.name} — ${
                    data?.error ||
                    'Erreur inconnue.'
                  }`,
                ]
              );
            }
          }

          setStatus(
            'Migration terminée.'
          );

          setDetails(
            (previous) => [
              ...previous,
              '',
              `📦 Projets trouvés : ${projects.length}`,
              `✅ Importés : ${imported}`,
              `↪ Déjà présents : ${skipped}`,
              `❌ Échecs : ${failed}`,
            ]
          );

          /*
           * IMPORTANT :
           * On ne supprime PAS encore le localStorage.
           *
           * Nous allons vérifier d'abord que tous
           * les projets sont bien présents dans
           * PostgreSQL.
           */
          if (
            failed === 0
          ) {
            setDone(true);
          }
        } catch (error) {
          console.error(
            'Erreur migration projets :',
            error
          );

          setStatus(
            'La migration a échoué.'
          );

          setDetails(
            (previous) => [
              ...previous,
              error instanceof
              Error
                ? error.message
                : 'Erreur inconnue.',
            ]
          );
        }
      };

    void migrate();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold">
            S
          </div>

          <div>
            <h1 className="text-lg font-bold">
              SimiRork
            </h1>

            <p className="text-xs text-gray-500">
              Migration des projets
            </p>
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            done
              ? 'border-green-900 bg-green-950/30'
              : 'border-blue-900 bg-blue-950/20'
          }`}
        >
          <p className="text-sm font-semibold">
            {status}
          </p>

          {details.length >
            0 && (
            <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-6 text-gray-400">
              {details.join(
                '\n'
              )}
            </pre>
          )}
        </div>

        {done && (
          <div className="mt-5 rounded-xl border border-yellow-900 bg-yellow-950/20 p-4">
            <p className="text-sm font-semibold text-yellow-300">
              Vérification nécessaire
            </p>

            <p className="mt-2 text-xs leading-5 text-yellow-400/70">
              Les projets locaux n'ont pas encore été
              supprimés. Nous allons d'abord vérifier
              leur présence dans PostgreSQL.
            </p>
          </div>
        )}

        {!done && (
          <p className="mt-5 text-xs text-gray-600">
            Ne ferme pas cette page pendant la migration.
          </p>
        )}
      </div>
    </main>
  );
}