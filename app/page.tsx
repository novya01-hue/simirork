'use client';

import { useEffect, useRef, useState } from 'react';

type ApkStatus =
  | 'none'
  | 'building'
  | 'ready'
  | 'error';

type LogoProposal = {
  id: number;
  mediaType: string;
  base64: string;
  image: string;
};

type SavedLogo = {
  id: number;
  image: string;
  mediaType?: string;
  model?: string;
  selectedAt?: string;
};

type Project = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  apkStatus?: ApkStatus;
  apkRunId?: string | null;
  apkError?: string;
  logo?: string | null;
};

type CreditState = {
  balance: number;
  consumed: number;
};

type GenerationUsage = {
  id: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  model: string;
  promptWords: number;
  promptChars: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  creditsUsed: number;
  creditValueUsd?: number;
  creditsExact?: number;
  billingMethod?: string;
  billingVersion?: string;
  balanceAfter?: number;
  consumedAfter?: number;
};

const STORAGE_KEY = 'simirork_projects';

function normalizeProject(project: Project): Project {
  return {
    ...project,
    apkStatus:
      project.apkStatus ||
      (project.apkRunId ? 'ready' : 'none'),
    apkRunId: project.apkRunId || null,
    apkError: project.apkError || '',
  };
}


function parseSavedLogo(
  value?: string | null
): SavedLogo | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.image !== 'string' ||
      !parsed.image.startsWith('data:image/')
    ) {
      return null;
    }

    return {
      id:
        Number(parsed.id) || 1,
      image:
        parsed.image,
      mediaType:
        typeof parsed.mediaType === 'string'
          ? parsed.mediaType
          : undefined,
      model:
        typeof parsed.model === 'string'
          ? parsed.model
          : undefined,
      selectedAt:
        typeof parsed.selectedAt === 'string'
          ? parsed.selectedAt
          : undefined,
    };
  } catch {
    return null;
  }
}

function getProjectLogoImage(
  project?: Project | null
): string {
  return parseSavedLogo(
    project?.logo
  )?.image || '';
}


const MAX_APK_LOGO_DATA_URL_LENGTH = 12000;

async function prepareLogoForApk(
  source: string
): Promise<string> {
  if (!source.startsWith('data:image/')) {
    throw new Error(
      'Le logo sélectionné est invalide.'
    );
  }

  const image =
    await new Promise<HTMLImageElement>(
      (resolve, reject) => {
        const element =
          new Image();

        element.onload = () =>
          resolve(element);

        element.onerror = () =>
          reject(
            new Error(
              'Impossible de charger le logo sélectionné.'
            )
          );

        element.src = source;
      }
    );

  const dimensions = [
    256,
    192,
    160,
    128,
  ];

  const qualities = [
    0.82,
    0.72,
    0.62,
    0.52,
    0.42,
  ];

  let smallestResult = '';

  for (const size of dimensions) {
    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width = size;
    canvas.height = size;

    const context =
      canvas.getContext('2d');

    if (!context) {
      throw new Error(
        'Impossible de préparer le logo pour Android.'
      );
    }

    context.clearRect(
      0,
      0,
      size,
      size
    );

    const scale = Math.min(
      size / image.naturalWidth,
      size / image.naturalHeight
    );

    const width =
      image.naturalWidth * scale;

    const height =
      image.naturalHeight * scale;

    const x =
      (size - width) / 2;

    const y =
      (size - height) / 2;

    context.drawImage(
      image,
      x,
      y,
      width,
      height
    );

    for (const quality of qualities) {
      const webp =
        canvas.toDataURL(
          'image/webp',
          quality
        );

      const candidate =
        webp.startsWith(
          'data:image/webp'
        )
          ? webp
          : canvas.toDataURL(
              'image/png'
            );

      if (
        !smallestResult ||
        candidate.length <
          smallestResult.length
      ) {
        smallestResult =
          candidate;
      }

      if (
        candidate.length <=
        MAX_APK_LOGO_DATA_URL_LENGTH
      ) {
        return candidate;
      }
    }
  }

  if (!smallestResult) {
    throw new Error(
      'Impossible de compresser le logo.'
    );
  }

  return smallestResult;
}

function createSafeFileBaseName(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  const words =
    normalized.match(/[a-zA-Z0-9]+/g) || [];

  return words.join('-') || 'simirork-app';
}

function countWords(text: string): number {
  const trimmed = text.trim();

  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function formatCost(cost: number): string {
  if (
    !Number.isFinite(cost) ||
    cost <= 0
  ) {
    return 'Non communiqué';
  }

  return `$${cost.toFixed(6)}`;
}

function formatCreditValue(value?: number): string {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return '—';
  }

  return `$${value.toFixed(6)}`;
}

function formatCreditsExact(value?: number): string {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return '—';
  }

  return value.toFixed(4);
}

function formatModel(model: string): string {
  const names: Record<string, string> = {
    'google/gemini-3.6-flash':
      'Gemini 3.6 Flash',
    'google/gemini-3.5-flash-lite':
      'Gemini 3.5 Flash Lite',
    'google/gemini-2.5-flash-lite':
      'Gemini 2.5 Flash Lite',
    'openai/gpt-4o-mini':
      'GPT-4o Mini',
  };

  return names[model] || model;
}

export default function Home() {
  const [projects, setProjects] =
    useState<Project[]>([]);

  const [currentProject, setCurrentProject] =
    useState<Project | null>(null);

  const [storageLoaded, setStorageLoaded] =
    useState(false);

  const [creditsLoaded, setCreditsLoaded] =
    useState(false);

  const [usageLoaded, setUsageLoaded] =
    useState(false);

  const [creditError, setCreditError] =
    useState('');

  const [usageError, setUsageError] =
    useState('');

  const [projectError, setProjectError] =
    useState('');

  const [creditState, setCreditState] =
    useState<CreditState>({
      balance: 0,
      consumed: 0,
    });

  const [usageHistory, setUsageHistory] =
    useState<GenerationUsage[]>([]);

  const [showHistory, setShowHistory] =
    useState(false);

  const [lastUsage, setLastUsage] =
    useState<GenerationUsage | null>(null);

  const [showNewProject, setShowNewProject] =
    useState(false);

  const [newName, setNewName] =
    useState('');

  const [newDescription, setNewDescription] =
    useState('');

  const [prompt, setPrompt] =
    useState('');

  const [generatedCode, setGeneratedCode] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [logoLoading, setLogoLoading] =
    useState(false);

  const [logoProposals, setLogoProposals] =
    useState<LogoProposal[]>([]);

  const [logoError, setLogoError] =
    useState('');

  const [lastLogoCost, setLastLogoCost] =
    useState<number | null>(null);

  const [modelVersion, setModelVersion] =
    useState(
      'google/gemini-3.6-flash'
    );

  const [activeTab, setActiveTab] =
    useState<'prompt' | 'preview'>(
      'prompt'
    );

  const activeApkPolls =
    useRef<Set<string>>(new Set());

  const refreshCredits =
    async (): Promise<CreditState | null> => {
      try {
        setCreditError('');

        const response =
          await fetch('/api/credits', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          });

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !data.account
        ) {
          throw new Error(
            data?.error ||
              'Impossible de récupérer le solde de crédits.'
          );
        }

        const balance =
          Number(data.account.balance);

        const consumed =
          Number(data.account.consumed);

        if (
          !Number.isFinite(balance) ||
          balance < 0 ||
          !Number.isFinite(consumed) ||
          consumed < 0
        ) {
          throw new Error(
            'Les données de crédits retournées par le serveur sont invalides.'
          );
        }

        const nextCreditState = {
          balance,
          consumed,
        };

        setCreditState(nextCreditState);
        setCreditsLoaded(true);

        return nextCreditState;
      } catch (error) {
        console.error(
          'Erreur récupération crédits :',
          error
        );

        setCreditsLoaded(false);

        setCreditError(
          error instanceof Error
            ? error.message
            : 'Impossible de récupérer le solde.'
        );

        return null;
      }
    };

  const refreshUsageHistory =
    async (): Promise<
      GenerationUsage[] | null
    > => {
      try {
        setUsageError('');

        const response =
          await fetch('/api/usage', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          });

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !Array.isArray(data.history)
        ) {
          throw new Error(
            data?.error ||
              "Impossible de récupérer l'historique."
          );
        }

        const history =
          data.history.map(
            (
              usage: GenerationUsage
            ) => ({
              id: String(
                usage.id
              ),
              createdAt:
                usage.createdAt,
              projectId:
                String(
                  usage.projectId || ''
                ),
              projectName:
                String(
                  usage.projectName ||
                    'Application sans nom'
                ),
              model:
                String(
                  usage.model || ''
                ),
              promptWords:
                Number(
                  usage.promptWords
                ) || 0,
              promptChars:
                Number(
                  usage.promptChars
                ) || 0,
              promptTokens:
                Number(
                  usage.promptTokens
                ) || 0,
              completionTokens:
                Number(
                  usage.completionTokens
                ) || 0,
              totalTokens:
                Number(
                  usage.totalTokens
                ) || 0,
              cost:
                Number(
                  usage.cost
                ) || 0,
              creditsUsed:
                Number(
                  usage.creditsUsed
                ) || 0,
              creditValueUsd:
                usage.creditValueUsd !==
                  undefined &&
                usage.creditValueUsd !==
                  null
                  ? Number(
                      usage.creditValueUsd
                    )
                  : undefined,
              creditsExact:
                usage.creditsExact !==
                  undefined &&
                usage.creditsExact !==
                  null
                  ? Number(
                      usage.creditsExact
                    )
                  : undefined,
              billingMethod:
                usage.billingMethod
                  ? String(
                      usage.billingMethod
                    )
                  : undefined,
              billingVersion:
                usage.billingVersion
                  ? String(
                      usage.billingVersion
                    )
                  : undefined,
              balanceAfter:
                usage.balanceAfter !==
                  undefined &&
                usage.balanceAfter !==
                  null
                  ? Number(
                      usage.balanceAfter
                    )
                  : undefined,
              consumedAfter:
                usage.consumedAfter !==
                  undefined &&
                usage.consumedAfter !==
                  null
                  ? Number(
                      usage.consumedAfter
                    )
                  : undefined,
            })
          );

        setUsageHistory(history);
        setUsageLoaded(true);

        return history;
      } catch (error) {
        console.error(
          'Erreur récupération historique :',
          error
        );

        setUsageLoaded(false);

        setUsageError(
          error instanceof Error
            ? error.message
            : "Impossible de récupérer l'historique."
        );

        return null;
      }
    };

  const fetchProjects =
    async (): Promise<Project[] | null> => {
      try {
        setProjectError('');

        const response =
          await fetch('/api/projects', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          });

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !Array.isArray(
            data.projects
          )
        ) {
          throw new Error(
            data?.error ||
              'Impossible de récupérer les applications.'
          );
        }

        const serverProjects =
          data.projects.map(
            (project: Project) =>
              normalizeProject(project)
          );

        setProjects(serverProjects);

        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(
              serverProjects
            )
          );
        } catch (storageError) {
          console.error(
            'Impossible de mettre à jour la sauvegarde locale :',
            storageError
          );
        }

        return serverProjects;
      } catch (error) {
        console.error(
          'Erreur récupération projets serveur :',
          error
        );

        setProjectError(
          error instanceof Error
            ? error.message
            : 'Impossible de récupérer les applications.'
        );

        return null;
      }
    };

  const createProjectOnServer =
    async (
      project: Project
    ): Promise<Project | null> => {
      try {
        const response =
          await fetch('/api/projects', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify(project),
          });

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !data.project
        ) {
          throw new Error(
            data?.error ||
              "Impossible d'enregistrer l'application."
          );
        }

        return normalizeProject(
          data.project
        );
      } catch (error) {
        console.error(
          'Erreur création projet serveur :',
          error
        );

        setProjectError(
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer l'application."
        );

        return null;
      }
    };

  const updateProjectOnServer =
    async (
      project: Project
    ): Promise<Project | null> => {
      try {
        const response =
          await fetch(
            `/api/projects/${encodeURIComponent(
              project.id
            )}`,
            {
              method: 'PATCH',
              credentials: 'same-origin',
              headers: {
                'Content-Type':
                  'application/json',
              },
              cache: 'no-store',
              body: JSON.stringify({
                name: project.name,
                description:
                  project.description,
                prompt: project.prompt,
                code: project.code,
                apkStatus:
                  project.apkStatus ||
                  'none',
                apkRunId:
                  project.apkRunId ||
                  null,
                apkError:
                  project.apkError ||
                  '',
                logo:
                  project.logo ??
                  null,
              }),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !data.project
        ) {
          throw new Error(
            data?.error ||
              "Impossible d'enregistrer les modifications."
          );
        }

        return normalizeProject(
          data.project
        );
      } catch (error) {
        console.error(
          'Erreur modification projet serveur :',
          error
        );

        setProjectError(
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer les modifications."
        );

        return null;
      }
    };

  const deleteProjectOnServer =
    async (
      projectId: string
    ): Promise<boolean> => {
      try {
        const response =
          await fetch(
            `/api/projects/${encodeURIComponent(
              projectId
            )}`,
            {
              method: 'DELETE',
              credentials: 'same-origin',
              cache: 'no-store',
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data?.error ||
              "Impossible de supprimer l'application."
          );
        }

        return true;
      } catch (error) {
        console.error(
          'Erreur suppression projet serveur :',
          error
        );

        setProjectError(
          error instanceof Error
            ? error.message
            : "Impossible de supprimer l'application."
        );

        return false;
      }
    };

  useEffect(() => {
    let cancelled = false;

    const loadData =
      async () => {
        const serverProjects =
          await fetchProjects();

        if (cancelled) {
          return;
        }

        if (!serverProjects) {
          try {
            const savedProjects =
              localStorage.getItem(
                STORAGE_KEY
              );

            if (savedProjects) {
              const parsed =
                JSON.parse(
                  savedProjects
                );

              if (
                Array.isArray(parsed)
              ) {
                setProjects(
                  parsed.map(
                    (
                      project
                    ) =>
                      normalizeProject(
                        project
                      )
                  )
                );
              }
            }
          } catch (error) {
            console.error(
              'Impossible de charger les projets locaux de secours.',
              error
            );
          }
        }

        if (!cancelled) {
          setStorageLoaded(true);
        }

        void refreshCredits();
        void refreshUsageHistory();
      };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageLoaded) {
      return;
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(projects)
      );
    } catch (error) {
      console.error(
        'Impossible de mettre à jour la sauvegarde locale :',
        error
      );
    }
  }, [
    projects,
    storageLoaded,
  ]);

  const updateProject =
    async (
      projectId: string,
      patch: Partial<Project>
    ): Promise<boolean> => {
      const existingProject =
        projects.find(
          (project) =>
            project.id === projectId
        );

      if (!existingProject) {
        return false;
      }

      const nextProject =
        normalizeProject({
          ...existingProject,
          ...patch,
        });

      setProjects(
        (previous) =>
          previous.map(
            (project) =>
              project.id === projectId
                ? nextProject
                : project
          )
      );

      setCurrentProject(
        (previous) =>
          previous &&
          previous.id === projectId
            ? nextProject
            : previous
      );

      const savedProject =
        await updateProjectOnServer(
          nextProject
        );

      if (!savedProject) {
        return false;
      }

      setProjects(
        (previous) =>
          previous.map(
            (project) =>
              project.id === projectId
                ? savedProject
                : project
          )
      );

      setCurrentProject(
        (previous) =>
          previous &&
          previous.id === projectId
            ? savedProject
            : previous
      );

      return true;
    };

  const startApkPolling =
    async (
      projectId: string,
      runId: string
    ) => {
      if (
        activeApkPolls.current.has(
          runId
        )
      ) {
        return;
      }

      activeApkPolls.current.add(
        runId
      );

      try {
        for (
          let attempt = 0;
          attempt < 120;
          attempt++
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                5000
              )
          );

          const statusResponse =
            await fetch(
              `/api/build-apk/status?runId=${encodeURIComponent(
                runId
              )}`,
              {
                credentials:
                  'same-origin',
                cache: 'no-store',
              }
            );

          const statusData =
            await statusResponse.json();

          if (
            !statusResponse.ok ||
            !statusData.success
          ) {
            throw new Error(
              statusData.error ||
                'Erreur pendant le suivi du build.'
            );
          }

          if (
            statusData.status ===
              'completed' &&
            statusData.conclusion ===
              'success' &&
            statusData.artifactReady
          ) {
            await updateProject(
              projectId,
              {
                apkStatus:
                  'ready',
                apkRunId:
                  runId,
                apkError:
                  '',
              }
            );

            return;
          }

          if (
            statusData.status ===
              'completed' &&
            statusData.conclusion !==
              'success'
          ) {
            throw new Error(
              statusData.error ||
                "La construction de l'APK a échoué."
            );
          }
        }

        throw new Error(
          'La construction prend trop de temps. Vérifiez GitHub Actions.'
        );
      } catch (error) {
        console.error(
          'Erreur suivi APK :',
          error
        );

        await updateProject(
          projectId,
          {
            apkStatus:
              'error',
            apkRunId:
              runId,
            apkError:
              error instanceof
              Error
                ? error.message
                : "Erreur pendant la génération de l'APK.",
          }
        );
      } finally {
        activeApkPolls.current.delete(
          runId
        );
      }
    };

  useEffect(() => {
    if (!storageLoaded) {
      return;
    }

    projects.forEach(
      (project) => {
        if (
          project.apkStatus ===
            'building' &&
          project.apkRunId
        ) {
          void startApkPolling(
            project.id,
            project.apkRunId
          );
        }
      }
    );
  }, [
    projects,
    storageLoaded,
  ]);

  const handleCreateProject =
    async () => {
      const name =
        newName.trim();

      if (!name) {
        alert(
          'Veuillez donner un nom à votre application.'
        );
        return;
      }

      setProjectError('');

      const now =
        new Date().toISOString();

      const localProject: Project =
        {
          id: crypto.randomUUID(),
          name,
          description:
            newDescription.trim(),
          prompt: '',
          code: '',
          createdAt: now,
          updatedAt: now,
          apkStatus: 'none',
          apkRunId: null,
          apkError: '',
        };

      const serverProject =
        await createProjectOnServer(
          localProject
        );

      if (!serverProject) {
        alert(
          projectError ||
            "Impossible d'enregistrer la nouvelle application."
        );
        return;
      }

      setProjects(
        (previous) => [
          serverProject,
          ...previous.filter(
            (project) =>
              project.id !==
              serverProject.id
          ),
        ]
      );

      setCurrentProject(
        serverProject
      );

      setPrompt('');
      setGeneratedCode('');
      setNewName('');
      setNewDescription('');
      setShowNewProject(false);
      setActiveTab('prompt');
      setLastUsage(null);
      setLogoProposals([]);
      setLogoError('');
      setLastLogoCost(null);
    };

  const handleOpenProject =
    async (
      project: Project
    ) => {
      try {
        const response =
          await fetch(
            `/api/projects/${encodeURIComponent(
              project.id
            )}`,
            {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
            }
          );

        const data =
          await response.json();

        if (
          response.ok &&
          data.success &&
          data.project
        ) {
          project =
            normalizeProject(
              data.project
            );

          setProjects(
            (previous) =>
              previous.map(
                (item) =>
                  item.id === project.id
                    ? project
                    : item
              )
          );
        }
      } catch (error) {
        console.error(
          'Impossible de rafraîchir le projet :',
          error
        );
      }

      const normalizedProject =
        normalizeProject(
          project
        );

      setCurrentProject(
        normalizedProject
      );

      setPrompt(
        normalizedProject.prompt ||
          ''
      );

      setGeneratedCode(
        normalizedProject.code ||
          ''
      );

      setActiveTab(
        normalizedProject.code
          ? 'preview'
          : 'prompt'
      );

      const projectUsage =
        usageHistory.find(
          (usage) =>
            usage.projectId ===
            normalizedProject.id
        ) || null;

      setLastUsage(
        projectUsage
      );

      setLogoProposals([]);
      setLogoError('');
      setLastLogoCost(null);
    };

  const handleBackToProjects =
    () => {
      setCurrentProject(null);
      setPrompt('');
      setGeneratedCode('');
      setActiveTab('prompt');
      setLastUsage(null);
      setLogoProposals([]);
      setLogoError('');
      setLastLogoCost(null);
      void fetchProjects();
    };

  const handleDeleteProject =
    async (
      id: string
    ) => {
      const confirmed =
        window.confirm(
          'Voulez-vous vraiment supprimer cette application ?'
        );

      if (!confirmed) {
        return;
      }

      setProjectError('');

      const deleted =
        await deleteProjectOnServer(
          id
        );

      if (!deleted) {
        alert(
          projectError ||
            "Impossible de supprimer l'application."
        );
        return;
      }

      setProjects(
        (previous) =>
          previous.filter(
            (project) =>
              project.id !== id
          )
      );

      if (
        currentProject?.id === id
      ) {
        setCurrentProject(null);
        setPrompt('');
        setGeneratedCode('');
        setActiveTab('prompt');
        setLastUsage(null);
        setLogoProposals([]);
        setLogoError('');
        setLastLogoCost(null);
      }
    };

  const saveCurrentProject =
    async (
      code: string,
      projectPrompt: string
    ) => {
      if (!currentProject) {
        return false;
      }

      const updatedProject: Project =
        normalizeProject({
          ...currentProject,
          prompt: projectPrompt,
          code,
          updatedAt:
            new Date().toISOString(),
          apkStatus: 'none',
          apkRunId: null,
          apkError: '',
        });

      setProjects(
        (previous) =>
          previous.map(
            (project) =>
              project.id ===
              updatedProject.id
                ? updatedProject
                : project
          )
      );

      setCurrentProject(
        updatedProject
      );

      const savedProject =
        await updateProjectOnServer(
          updatedProject
        );

      if (!savedProject) {
        return false;
      }

      setProjects(
        (previous) =>
          previous.map(
            (project) =>
              project.id ===
              savedProject.id
                ? savedProject
                : project
          )
      );

      setCurrentProject(
        savedProject
      );

      return true;
    };

  const handleExportHTML =
    (
      project?: Project
    ) => {
      const code =
        project?.code ||
        generatedCode;

      const name =
        project?.name ||
        currentProject?.name ||
        'simirork-app';

      if (!code) {
        alert(
          "Générez d'abord votre application."
        );
        return;
      }

      const blob =
        new Blob(
          [code],
          {
            type:
              'text/html;charset=utf-8',
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          'a'
        );

      link.href = url;

      link.download =
        `${createSafeFileBaseName(
          name
        )}.html`;

      document.body.appendChild(
        link
      );

      link.click();

      document.body.removeChild(
        link
      );

      URL.revokeObjectURL(url);
    };

  const handleGenerateLogos =
    async () => {
      if (
        !currentProject ||
        logoLoading
      ) {
        return;
      }

      if (!currentProject.code) {
        alert(
          "Générez d'abord votre application avant de créer son logo."
        );
        return;
      }

      setLogoLoading(true);
      setLogoError('');
      setLastLogoCost(null);

      try {
        const response =
          await fetch(
            '/api/generate-logo',
            {
              method: 'POST',
              credentials:
                'same-origin',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                projectId:
                  currentProject.id,
                projectName:
                  currentProject.name,
                description:
                  currentProject.description,
                prompt:
                  currentProject.prompt,
              }),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !Array.isArray(
            data.logos
          )
        ) {
          throw new Error(
            data?.error ||
              'Impossible de générer les logos.'
          );
        }

        const proposals: LogoProposal[] =
          data.logos
            .map(
              (
                logo: Partial<LogoProposal>,
                index: number
              ) => ({
                id:
                  Number(
                    logo.id
                  ) ||
                  index + 1,
                mediaType:
                  typeof logo.mediaType ===
                  'string'
                    ? logo.mediaType
                    : 'image/png',
                base64:
                  typeof logo.base64 ===
                  'string'
                    ? logo.base64
                    : '',
                image:
                  typeof logo.image ===
                  'string'
                    ? logo.image
                    : '',
              })
            )
            .filter(
              (logo: LogoProposal) =>
                logo.image.startsWith(
                  'data:image/'
                )
            );

        if (
          proposals.length !== 3
        ) {
          throw new Error(
            `SimiRork a reçu ${proposals.length} logo(s) au lieu de 3.`
          );
        }

        setLogoProposals(
          proposals
        );

        const cost =
          Number(
            data?.usage?.cost
          );

        setLastLogoCost(
          Number.isFinite(cost) &&
          cost > 0
            ? cost
            : null
        );
      } catch (error) {
        console.error(
          'Erreur génération logos :',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : 'Erreur pendant la génération des logos.';

        setLogoError(message);
        alert(message);
      } finally {
        setLogoLoading(false);
      }
    };

  const handleSelectLogo =
    async (
      proposal: LogoProposal
    ) => {
      if (!currentProject) {
        return;
      }

      const savedLogo: SavedLogo = {
        id: proposal.id,
        image: proposal.image,
        mediaType:
          proposal.mediaType,
        model:
          'bytedance-seed/seedream-4.5',
        selectedAt:
          new Date().toISOString(),
      };

      const saved =
        await updateProject(
          currentProject.id,
          {
            logo:
              JSON.stringify(
                savedLogo
              ),
            apkStatus:
              'none',
            apkRunId:
              null,
            apkError:
              '',
          }
        );

      if (!saved) {
        alert(
          "Impossible d'enregistrer le logo choisi."
        );
        return;
      }

      alert(
        `Logo ${proposal.id} enregistré pour ${currentProject.name}.`
      );
    };

  const handleBuildAPK =
    async (
      project: Project
    ) => {
      const code =
        currentProject?.id ===
        project.id
          ? generatedCode ||
            project.code
          : project.code;

      if (!code) {
        alert(
          "Générez d'abord votre application."
        );
        return;
      }

      if (
        project.apkStatus ===
          'building' ||
        activeApkPolls.current.has(
          project.apkRunId || ''
        )
      ) {
        return;
      }

      const sourceLogo =
        getProjectLogoImage(
          project
        );

      let logoForApk:
        | string
        | null = null;

      if (sourceLogo) {
        try {
          logoForApk =
            await prepareLogoForApk(
              sourceLogo
            );

          console.log(
            'Logo APK préparé :',
            {
              originalCharacters:
                sourceLogo.length,
              compressedCharacters:
                logoForApk.length,
            }
          );
        } catch (error) {
          console.error(
            'Erreur préparation logo APK :',
            error
          );

          alert(
            error instanceof Error
              ? error.message
              : 'Impossible de préparer le logo pour l’APK.'
          );

          return;
        }
      }

      const markedBuilding =
        await updateProject(
          project.id,
          {
            apkStatus:
              'building',
            apkRunId: null,
            apkError: '',
          }
        );

      if (!markedBuilding) {
        alert(
          "Impossible d'enregistrer l'état de construction de l'APK."
        );
        return;
      }

      try {
        const response =
          await fetch(
            '/api/build-apk',
            {
              method: 'POST',
              credentials:
                'same-origin',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                code,
                appName:
                  project.name,
                projectId:
                  project.id,
                logo:
                  logoForApk,
              }),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !data.runId
        ) {
          throw new Error(
            data.error ||
              "Impossible de lancer la construction de l'APK."
          );
        }

        const runId =
          String(data.runId);

        await updateProject(
          project.id,
          {
            apkStatus:
              'building',
            apkRunId:
              runId,
            apkError: '',
          }
        );

        void startApkPolling(
          project.id,
          runId
        );
      } catch (error) {
        console.error(
          'Erreur lancement APK :',
          error
        );

        await updateProject(
          project.id,
          {
            apkStatus:
              'error',
            apkRunId: null,
            apkError:
              error instanceof
              Error
                ? error.message
                : "Erreur pendant la génération de l'APK.",
          }
        );
      }
    };

  const handleDownloadAPK =
    (
      project: Project
    ) => {
      if (
        !project.apkRunId ||
        project.apkStatus !==
          'ready'
      ) {
        return;
      }

      const appName =
        encodeURIComponent(
          project.name
        );

      const downloadUrl =
        `/api/build-apk/download?runId=${encodeURIComponent(
          project.apkRunId
        )}&appName=${appName}`;

      window.location.href =
        downloadUrl;
    };

  const handleGenerate =
    async () => {
      const currentPrompt =
        prompt.trim();

      if (
        !currentPrompt ||
        loading
      ) {
        return;
      }

      if (!currentProject) {
        alert(
          "Veuillez d'abord créer ou ouvrir une application."
        );
        return;
      }

      const freshCredits =
        await refreshCredits();

      if (!freshCredits) {
        alert(
          'Impossible de vérifier votre solde de crédits.'
        );
        return;
      }

      if (
        freshCredits.balance <=
        0
      ) {
        alert(
          'Votre solde de crédits est épuisé.'
        );
        return;
      }

      setLoading(true);

      try {
        const response =
          await fetch(
            '/api/generate',
            {
              method: 'POST',
              credentials:
                'same-origin',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                prompt:
                  currentPrompt,
                modelVersion,
                projectId:
                  currentProject.id,
                projectName:
                  currentProject.name,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          void refreshCredits();
          void refreshUsageHistory();

          throw new Error(
            data.error ||
              "Erreur pendant la génération de l'application."
          );
        }

        if (
          !data.code ||
          typeof data.code !==
            'string'
        ) {
          throw new Error(
            "L'IA n'a pas retourné de code d'application."
          );
        }

        const usage =
          data.usage || {};

        const promptWords =
          Number(
            usage.promptWords
          );

        const promptChars =
          Number(
            usage.promptChars
          );

        const promptTokens =
          Number(
            usage.promptTokens
          ) || 0;

        const completionTokens =
          Number(
            usage.completionTokens
          ) || 0;

        const totalTokens =
          Number(
            usage.totalTokens
          ) ||
          promptTokens +
            completionTokens;

        const creditsUsed =
          Number(
            usage.creditsUsed
          );

        const cost =
          Number(
            usage.cost
          ) || 0;

        const creditValueUsd =
          Number(
            usage.creditValueUsd
          ) || 0;

        const creditsExact =
          Number(
            usage.creditsExact
          );

        const balanceAfter =
          Number(
            usage.balanceAfter
          );

        const consumedAfter =
          Number(
            usage.consumedAfter
          );

        const billingMethod =
          typeof usage.billingMethod ===
          'string'
            ? usage.billingMethod
            : '';

        const billingVersion =
          typeof usage.billingVersion ===
          'string'
            ? usage.billingVersion
            : '';

        if (
          !Number.isFinite(
            creditsUsed
          ) ||
          creditsUsed < 0
        ) {
          throw new Error(
            'La consommation de crédits retournée par le serveur est invalide.'
          );
        }

        if (
          !Number.isFinite(
            balanceAfter
          ) ||
          balanceAfter < 0
        ) {
          throw new Error(
            'Le nouveau solde retourné par le serveur est invalide.'
          );
        }

        if (
          !Number.isFinite(
            consumedAfter
          ) ||
          consumedAfter < 0
        ) {
          throw new Error(
            'Le cumul de crédits retourné par le serveur est invalide.'
          );
        }

        const generationUsage:
          GenerationUsage = {
            id: crypto.randomUUID(),
            createdAt:
              new Date().toISOString(),
            projectId:
              currentProject.id,
            projectName:
              currentProject.name,
            model:
              modelVersion,
            promptWords:
              Number.isFinite(
                promptWords
              )
                ? promptWords
                : countWords(
                    currentPrompt
                  ),
            promptChars:
              Number.isFinite(
                promptChars
              )
                ? promptChars
                : currentPrompt.length,
            promptTokens,
            completionTokens,
            totalTokens,
            cost,
            creditsUsed,
            creditValueUsd:
              Number.isFinite(
                creditValueUsd
              ) &&
              creditValueUsd > 0
                ? creditValueUsd
                : undefined,
            creditsExact:
              Number.isFinite(
                creditsExact
              ) &&
              creditsExact >= 0
                ? creditsExact
                : undefined,
            billingMethod,
            billingVersion,
            balanceAfter,
            consumedAfter,
          };

        setGeneratedCode(
          data.code
        );

        const saved =
          await saveCurrentProject(
            data.code,
            currentPrompt
          );

        if (!saved) {
          throw new Error(
            "L'application a été générée, mais son enregistrement serveur a échoué."
          );
        }

        setLastUsage(
          generationUsage
        );

        setCreditState({
          balance:
            balanceAfter,
          consumed:
            consumedAfter,
        });

        setActiveTab(
          'preview'
        );

        void refreshUsageHistory();
        void refreshCredits();
      } catch (error) {
        console.error(
          'Erreur génération :',
          error
        );

        alert(
          error instanceof
          Error
            ? error.message
            : 'Une erreur est survenue pendant la génération.'
        );
      } finally {
        setLoading(false);
      }
    };

  const promptWords =
    countWords(prompt);

  const promptChars =
    prompt.length;

  const hasPrompt =
    prompt.trim().length > 0;

  const getApkLabel =
    (
      project: Project
    ) => {
      switch (
        project.apkStatus
      ) {
        case 'building':
          return '⏳ Génération APK...';

        case 'ready':
          return `⬇ Télécharger ${createSafeFileBaseName(
            project.name
          )}.apk`;

        case 'error':
          return '↻ Réessayer APK';

        default:
          return '📱 Générer APK';
      }
    };

  const creditsLabel =
    !creditsLoaded
      ? '...'
      : `${creditState.balance} crédits`;

  const handleOpenHistory =
    () => {
      setShowHistory(true);
      void refreshUsageHistory();
      void refreshCredits();
    };

  /*
   * ============================================================
   * ÉCRAN 1 : MES APPLICATIONS
   *
   * IMPORTANT :
   * SimiRork démarre toujours ici.
   * On n'ouvre jamais directement le prompt.
   * ============================================================
   */

  if (!currentProject) {
    return (
      <main className="min-h-screen bg-[#030712] text-white">
        <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

          <header className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                SimiRork
              </h1>

              <p className="mt-1 text-sm text-white/50">
                Studio IA de création d'applications
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
                <span className="text-white/50">
                  Crédits :
                </span>{' '}
                <span className="font-semibold">
                  {creditsLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={handleOpenHistory}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
              >
                Historique
              </button>
            </div>
          </header>

          {projectError && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {projectError}
            </div>
          )}

          {creditError && (
            <div className="mb-5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
              {creditError}
            </div>
          )}

          <section>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  Mes applications
                </h2>

                <p className="mt-1 text-sm text-white/45">
                  Retrouvez vos applications créées avec SimiRork.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowNewProject(true)
                }
                className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 sm:w-auto"
              >
                + Nouvelle application
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl">
                  ✦
                </div>

                <h3 className="text-lg font-semibold">
                  Aucune application
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm text-white/45">
                  Commencez par créer votre première application avec SimiRork.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setShowNewProject(true)
                  }
                  className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"
                >
                  + Créer ma première application
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map(
                  (project) => (
                    <article
                      key={project.id}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("button")) {
                          return;
                        }

                        void handleOpenProject(project);
                      }}
                      className="flex min-h-[250px] cursor-pointer flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold">
                            {project.name}
                          </h3>

                          <p className="mt-1 line-clamp-2 text-sm text-white/45">
                            {project.description ||
                              'Application créée avec SimiRork'}
                          </p>
                        </div>

                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                          {getProjectLogoImage(
                            project
                          ) ? (
                            <img
                              src={getProjectLogoImage(
                                project
                              )}
                              alt={`Logo ${project.name}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span>
                              📱
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 space-y-2 text-xs text-white/40">
                        <div>
                          Créée le{' '}
                          {new Date(
                            project.createdAt
                          ).toLocaleDateString(
                            'fr-FR'
                          )}
                        </div>

                        {project.code && (
                          <div className="text-emerald-400">
                            ✓ Application générée
                          </div>
                        )}

                        {project.apkStatus ===
                          'building' && (
                          <div className="text-yellow-400">
                            ⏳ APK en construction
                          </div>
                        )}

                        {project.apkStatus ===
                          'ready' && (
                          <div className="text-emerald-400">
                            ✓ APK disponible
                          </div>
                        )}

                        {project.apkStatus ===
                          'error' && (
                          <div className="text-red-400">
                            ⚠ Erreur APK
                          </div>
                        )}
                      </div>

                      <div className="mt-auto flex flex-col gap-2 pt-5">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenProject(
                              project
                            )
                          }
                          className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
                        >
                          Ouvrir
                        </button>

                        {project.code && (
                          <button
                            type="button"
                            onClick={() =>
                              handleExportHTML(
                                project
                              )
                            }
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:bg-white/10"
                          >
                            Exporter HTML
                          </button>
                        )}

                        {project.apkStatus ===
                        'ready' ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadAPK(
                                project
                              )
                            }
                            className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            {getApkLabel(
                              project
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              !project.code ||
                              project.apkStatus ===
                                'building'
                            }
                            onClick={() =>
                              handleBuildAPK(
                                project
                              )
                            }
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {getApkLabel(
                              project
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteProject(
                              project.id
                            )
                          }
                          className="w-full rounded-xl px-4 py-2 text-xs text-red-400/70 transition hover:bg-red-500/10 hover:text-red-300"
                        >
                          Supprimer
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        </div>

        {showNewProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1120] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Nouvelle application
                </h2>

                <button
                  type="button"
                  onClick={() =>
                    setShowNewProject(false)
                  }
                  className="rounded-lg px-3 py-2 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    Nom de l'application
                  </label>

                  <input
                    value={newName}
                    onChange={(event) =>
                      setNewName(
                        event.target.value
                      )
                    }
                    placeholder="Ex. MonBudget"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    Description
                  </label>

                  <textarea
                    value={newDescription}
                    onChange={(event) =>
                      setNewDescription(
                        event.target.value
                      )
                    }
                    rows={4}
                    placeholder="Décrivez brièvement votre application..."
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-white/30"
                  />
                </div>

                <button
                  type="button"
                  onClick={
                    handleCreateProject
                  }
                  className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-black transition hover:bg-white/90"
                >
                  Créer l'application
                </button>
              </div>
            </div>
          </div>
        )}

        {showHistory && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b1120] p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    Historique des générations
                  </h2>

                  <p className="mt-1 text-sm text-white/45">
                    Consommation des crédits et tokens.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowHistory(false)
                  }
                  className="rounded-lg px-3 py-2 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-6">
                {!usageLoaded ? (
                  <div className="rounded-xl bg-white/5 p-6 text-center text-sm text-white/50">
                    Chargement...
                  </div>
                ) : usageHistory.length ===
                  0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
                    Aucun historique de génération.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {usageHistory.map(
                      (usage) => (
                        <div
                          key={usage.id}
                          className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="font-medium">
                                {usage.projectName}
                              </div>

                              <div className="mt-1 text-xs text-white/40">
                                {new Date(
                                  usage.createdAt
                                ).toLocaleString(
                                  'fr-FR'
                                )}
                              </div>
                            </div>

                            <div className="text-sm">
                              <span className="text-white/50">
                                Coût :
                              </span>{' '}
                              {formatCost(
                                usage.cost
                              )}
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                            <div className="rounded-lg bg-black/20 p-3">
                              <div className="text-white/40">
                                Modèle
                              </div>
                              <div className="mt-1">
                                {formatModel(
                                  usage.model
                                )}
                              </div>
                            </div>

                            <div className="rounded-lg bg-black/20 p-3">
                              <div className="text-white/40">
                                Prompt
                              </div>
                              <div className="mt-1">
                                {usage.promptWords}{' '}
                                mots
                              </div>
                            </div>

                            <div className="rounded-lg bg-black/20 p-3">
                              <div className="text-white/40">
                                Tokens
                              </div>
                              <div className="mt-1">
                                {usage.totalTokens}
                              </div>
                            </div>

                            <div className="rounded-lg bg-black/20 p-3">
                              <div className="text-white/40">
                                Crédits
                              </div>
                              <div className="mt-1">
                                {usage.creditsExact !==
                                undefined
                                  ? formatCreditsExact(
                                      usage.creditsExact
                                    )
                                  : usage.creditsUsed}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-white/40">
                            Valeur d'un crédit :{' '}
                            {formatCreditValue(
                              usage.creditValueUsd
                            )}
                            {' · '}
                            Solde après :{' '}
                            {usage.balanceAfter ??
                              '—'}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                {usageError && (
                  <div className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-300">
                    {usageError}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  /*
   * ============================================================
   * ÉCRAN 2 : APPLICATION OUVERTE
   *
   * Cet écran n'est accessible qu'après avoir choisi une
   * application existante ou après avoir cliqué sur
   * "+ Nouvelle application".
   * ============================================================
   */

  return (
    <main className="min-h-screen bg-[#030712] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">

        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={
                handleBackToProjects
              }
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
            >
              ←
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold sm:text-xl">
                {currentProject.name}
              </h1>

              <p className="truncate text-xs text-white/40">
                {currentProject.description ||
                  'Application SimiRork'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
              <span className="text-white/50">
                Crédits :
              </span>{' '}
              <span className="font-semibold">
                {creditsLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={
                handleOpenHistory
              }
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10"
            >
              Historique
            </button>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setActiveTab('prompt')
            }
            className={`rounded-xl px-4 py-2 text-sm ${
              activeTab === 'prompt'
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/60'
            }`}
          >
            Prompt
          </button>

          <button
            type="button"
            disabled={!generatedCode}
            onClick={() =>
              setActiveTab('preview')
            }
            className={`rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-30 ${
              activeTab === 'preview'
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/60'
            }`}
          >
            Aperçu
          </button>

          {generatedCode && (
            <>
              <button
                type="button"
                onClick={() =>
                  handleExportHTML()
                }
                className="rounded-xl bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                Exporter HTML
              </button>

              {currentProject.apkStatus ===
              'ready' ? (
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadAPK(
                      currentProject
                    )
                  }
                  className="rounded-xl bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
                >
                  ⬇ Télécharger APK
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    handleBuildAPK(
                      currentProject
                    )
                  }
                  disabled={
                    currentProject.apkStatus ===
                    'building'
                  }
                  className="rounded-xl bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {getApkLabel(
                    currentProject
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {generatedCode && (
          <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">
                  Logo de l'application
                </h2>

                <p className="mt-1 text-xs text-white/40">
                  Générez trois propositions puis choisissez celle qui sera enregistrée pour cette application.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  logoLoading
                }
                onClick={
                  handleGenerateLogos
                }
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {logoLoading
                  ? '🎨 Génération des 3 logos...'
                  : logoProposals.length
                    ? '🎨 Générer 3 nouveaux logos'
                    : '🎨 Générer 3 logos'}
              </button>
            </div>

            {logoError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {logoError}
              </div>
            )}

            {getProjectLogoImage(
              currentProject
            ) && (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
                <img
                  src={getProjectLogoImage(
                    currentProject
                  )}
                  alt={`Logo sélectionné pour ${currentProject.name}`}
                  className="h-20 w-20 rounded-2xl object-cover"
                />

                <div>
                  <div className="text-sm font-semibold text-emerald-300">
                    ✓ Logo sélectionné
                  </div>

                  <div className="mt-1 text-xs text-white/45">
                    Ce logo est enregistré avec l'application.
                  </div>
                </div>
              </div>
            )}

            {logoProposals.length >
              0 && (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {logoProposals.map(
                  (logo) => {
                    const selected =
                      getProjectLogoImage(
                        currentProject
                      ) ===
                      logo.image;

                    return (
                      <button
                        key={logo.id}
                        type="button"
                        onClick={() =>
                          void handleSelectLogo(
                            logo
                          )
                        }
                        className={`group overflow-hidden rounded-2xl border p-3 text-left transition ${
                          selected
                            ? 'border-emerald-400/70 bg-emerald-500/10'
                            : 'border-white/10 bg-black/20 hover:border-white/30'
                        }`}
                      >
                        <img
                          src={logo.image}
                          alt={`Proposition de logo ${logo.id}`}
                          className="aspect-square w-full rounded-xl object-cover"
                        />

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            Logo {logo.id}
                          </span>

                          <span
                            className={
                              selected
                                ? 'text-xs text-emerald-300'
                                : 'text-xs text-white/40'
                            }
                          >
                            {selected
                              ? '✓ Sélectionné'
                              : 'Choisir'}
                          </span>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            )}

            {lastLogoCost !==
              null && (
              <div className="mt-4 text-xs text-white/40">
                Coût OpenRouter des 3 propositions :{' '}
                {formatCost(
                  lastLogoCost
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'prompt' ? (
          <section className="mt-5 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
              <div className="mb-5">
                <h2 className="text-xl font-semibold">
                  Décrivez votre application
                </h2>

                <p className="mt-1 text-sm text-white/45">
                  Décrivez précisément ce que vous voulez créer.
                </p>
              </div>

              <textarea
                value={prompt}
                onChange={(event) =>
                  setPrompt(
                    event.target.value
                  )
                }
                placeholder="Exemple : crée une application de gestion de budget avec revenus, dépenses, catégories, graphiques et stockage local..."
                className="min-h-[300px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 outline-none transition placeholder:text-white/25 focus:border-white/30 sm:min-h-[400px]"
              />

              <div className="mt-3 flex flex-col gap-2 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {promptWords} mots ·{' '}
                  {promptChars} caractères
                </div>

                <div>
                  Solde :{' '}
                  <span className="text-white/70">
                    {creditsLabel}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={modelVersion}
                  onChange={(event) =>
                    setModelVersion(
                      event.target.value
                    )
                  }
                  className="rounded-xl border border-white/10 bg-[#0b1120] px-4 py-3 text-sm outline-none"
                >
                  <option value="google/gemini-3.6-flash">
                    Gemini 3.6 Flash
                  </option>

                  <option value="google/gemini-3.5-flash-lite">
                    Gemini 3.5 Flash Lite
                  </option>

                  <option value="google/gemini-2.5-flash-lite">
                    Gemini 2.5 Flash Lite
                  </option>

                  <option value="openai/gpt-4o-mini">
                    GPT-4o Mini
                  </option>
                </select>

                <button
                  type="button"
                  disabled={
                    !hasPrompt ||
                    loading
                  }
                  onClick={
                    handleGenerate
                  }
                  className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading
                    ? 'Génération...'
                    : '✨ Générer'}
                </button>
              </div>
            </div>

            <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="font-semibold">
                Informations
              </h3>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl bg-black/20 p-4">
                  <div className="text-xs text-white/40">
                    Modèle
                  </div>

                  <div className="mt-1">
                    {formatModel(
                      modelVersion
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-black/20 p-4">
                  <div className="text-xs text-white/40">
                    Crédits disponibles
                  </div>

                  <div className="mt-1 text-lg font-semibold">
                    {creditsLabel}
                  </div>
                </div>

                {lastUsage && (
                  <div className="rounded-xl bg-black/20 p-4">
                    <div className="text-xs text-white/40">
                      Dernière génération
                    </div>

                    <div className="mt-2 space-y-1 text-xs">
                      <div>
                        Tokens :{' '}
                        {lastUsage.totalTokens}
                      </div>

                      <div>
                        Coût :{' '}
                        {formatCost(
                          lastUsage.cost
                        )}
                      </div>

                      <div>
                        Crédits :{' '}
                        {lastUsage.creditsExact !==
                        undefined
                          ? formatCreditsExact(
                              lastUsage.creditsExact
                            )
                          : lastUsage.creditsUsed}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </section>
        ) : (
          <section className="mt-5 flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">
                  Aperçu de l'application
                </h2>

                <p className="text-xs text-white/40">
                  {currentProject.name}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      'prompt'
                    )
                  }
                  className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10"
                >
                  Modifier le prompt
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleExportHTML()
                  }
                  className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10"
                >
                  Exporter HTML
                </button>
              </div>
            </div>

            <div className="min-h-[600px] flex-1 bg-white">
              {generatedCode ? (
                <iframe
                  title="Aperçu de l'application"
                  srcDoc={
                    generatedCode
                  }
                  className="h-[70vh] min-h-[600px] w-full border-0"
                  sandbox="allow-scripts allow-forms allow-modals allow-popups"
                />
              ) : (
                <div className="flex h-[600px] items-center justify-center text-black/50">
                  Aucune application générée.
                </div>
              )}
            </div>
          </section>
        )}

        {currentProject.apkStatus ===
          'error' &&
          currentProject.apkError && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <strong>
                Erreur APK :
              </strong>{' '}
              {currentProject.apkError}
            </div>
          )}

        {showHistory && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b1120] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    Historique
                  </h2>

                  <p className="mt-1 text-sm text-white/45">
                    Générations et consommation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowHistory(false)
                  }
                  className="rounded-lg px-3 py-2 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {usageHistory.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
                    Aucun historique.
                  </div>
                ) : (
                  usageHistory.map(
                    (usage) => (
                      <div
                        key={usage.id}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium">
                              {
                                usage.projectName
                              }
                            </div>

                            <div className="text-xs text-white/40">
                              {new Date(
                                usage.createdAt
                              ).toLocaleString(
                                'fr-FR'
                              )}
                            </div>
                          </div>

                          <div className="text-sm">
                            {formatCost(
                              usage.cost
                            )}
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-white/45">
                          {formatModel(
                            usage.model
                          )}{' '}
                          ·{' '}
                          {
                            usage.promptWords
                          }{' '}
                          mots ·{' '}
                          {
                            usage.totalTokens
                          }{' '}
                          tokens ·{' '}
                          {
                            usage.creditsUsed
                          }{' '}
                          crédits
                        </div>
                      </div>
                    )
                  )
                )}
              </div>

              {usageError && (
                <div className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-300">
                  {usageError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

