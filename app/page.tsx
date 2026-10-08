'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

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
  officialAt?: string;
  sha256?: string;
  logoVersionId?: string;
  status?: 'selected' | 'official';
};

type ProjectLogoVersion = {
  id: string;
  projectId: string;
  parentLogoId: string | null;
  versionNumber: number;
  status:
    | 'generated'
    | 'selected'
    | 'edited'
    | 'official'
    | 'archived';
  imageData: string;
  imageMimeType: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  fileSizeBytes: number | null;
  sourceType:
    | 'ai'
    | 'manual_edit'
    | 'ai_edit'
    | 'imported';
  model: string | null;
  generationPrompt: string | null;
  editPrompt: string | null;
  editData: Record<string, unknown>;
  sha256: string;
  createdAt: string;
  selectedAt: string | null;
  officialAt: string | null;
};


type LogoEditorSettings = {
  imageScale: number;
  imageX: number;
  imageY: number;
  rotation: number;
  hue: number;
  saturation: number;
  brightness: number;
  backgroundColor: string;
  text: string;
  textColor: string;
  textSize: number;
  textX: number;
  textY: number;
};

type LogoSelectionMode =
  | 'smart'
  | 'rect'
  | 'all';

type LogoSelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const LOGO_EDITOR_SIZE = 512;

const DEFAULT_LOGO_EDITOR_SETTINGS: LogoEditorSettings = {
  imageScale: 1,
  imageX: 0,
  imageY: 0,
  rotation: 0,
  hue: 0,
  saturation: 100,
  brightness: 100,
  backgroundColor: '#ffffff',
  text: '',
  textColor: '#000000',
  textSize: 42,
  textX: 0,
  textY: 175,
};

function hexToRgb(
  value: string
): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);

  if (!match) {
    return null;
  }

  const hex = match[1];

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function replaceCanvasBackground(
  context: CanvasRenderingContext2D,
  color: string
) {
  const target = hexToRgb(color);

  if (!target) {
    return;
  }

  const size = LOGO_EDITOR_SIZE;
  const imageData = context.getImageData(0, 0, size, size);
  const data = imageData.data;

  const corners = [
    0,
    (size - 1) * 4,
    ((size - 1) * size) * 4,
    ((size * size) - 1) * 4,
  ];

  let seedR = 0;
  let seedG = 0;
  let seedB = 0;

  for (const offset of corners) {
    seedR += data[offset];
    seedG += data[offset + 1];
    seedB += data[offset + 2];
  }

  seedR /= corners.length;
  seedG /= corners.length;
  seedB /= corners.length;

  const tolerance = 48;
  const maxDistance = tolerance * tolerance * 3;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];

    if (alpha === 0) {
      continue;
    }

    const dr = data[offset] - seedR;
    const dg = data[offset + 1] - seedG;
    const db = data[offset + 2] - seedB;
    const distance = dr * dr + dg * dg + db * db;

    if (distance <= maxDistance) {
      data[offset] = target.r;
      data[offset + 1] = target.g;
      data[offset + 2] = target.b;
    }
  }

  context.putImageData(imageData, 0, 0);
}

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
      officialAt:
        typeof parsed.officialAt === 'string'
          ? parsed.officialAt
          : undefined,
      sha256:
        typeof parsed.sha256 === 'string'
          ? parsed.sha256
          : undefined,
      logoVersionId:
        typeof parsed.logoVersionId === 'string'
          ? parsed.logoVersionId
          : undefined,
      status:
        parsed.status === 'official' ||
        parsed.status === 'selected'
          ? parsed.status
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

  const [logoVersions, setLogoVersions] =
    useState<ProjectLogoVersion[]>([]);

  const [selectedLogoVersion, setSelectedLogoVersion] =
    useState<ProjectLogoVersion | null>(null);

  const [officialLogoVersion, setOfficialLogoVersion] =
    useState<ProjectLogoVersion | null>(null);

  const [logoHistoryLoading, setLogoHistoryLoading] =
    useState(false);

  const [logoHistoryError, setLogoHistoryError] =
    useState('');

  const [showLogoHistory, setShowLogoHistory] =
    useState(false);

  const [officializingLogoId, setOfficializingLogoId] =
    useState<string | null>(null);

  const [logoEditorOpen, setLogoEditorOpen] =
    useState(false);

  const [logoEditorSource, setLogoEditorSource] =
    useState('');

  const [logoEditorParentId, setLogoEditorParentId] =
    useState<string | null>(null);

  const [logoEditorSettings, setLogoEditorSettings] =
    useState<LogoEditorSettings>({
      ...DEFAULT_LOGO_EDITOR_SETTINGS,
    });

  const [logoEditorSaving, setLogoEditorSaving] =
    useState(false);

  const [logoEditorError, setLogoEditorError] =
    useState('');

  const [logoSelectionMode, setLogoSelectionMode] =
    useState<LogoSelectionMode>('smart');

  const [logoSelectionTolerance, setLogoSelectionTolerance] =
    useState(35);

  const [logoSelectionActive, setLogoSelectionActive] =
    useState(false);

  const [logoSelectionImage, setLogoSelectionImage] =
    useState('');

  const [logoSelectionBase, setLogoSelectionBase] =
    useState('');

  const [logoSelectionSnapshot, setLogoSelectionSnapshot] =
    useState('');

  const [logoSelectionBounds, setLogoSelectionBounds] =
    useState<LogoSelectionBounds | null>(null);

  const [logoRectStart, setLogoRectStart] =
    useState<{ x: number; y: number } | null>(null);

  const [logoRectCurrent, setLogoRectCurrent] =
    useState<{ x: number; y: number } | null>(null);

  const logoSelectionDragRef =
    useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      startImageX: number;
      startImageY: number;
    } | null>(null);

  const logoEditorCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

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

  const refreshLogoVersions =
    async (
      projectId: string
    ): Promise<ProjectLogoVersion[] | null> => {
      try {
        setLogoHistoryLoading(true);
        setLogoHistoryError('');

        const response =
          await fetch(
            `/api/projects/${encodeURIComponent(
              projectId
            )}/logos`,
            {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !Array.isArray(data.logos)
        ) {
          throw new Error(
            data?.error ||
              "Impossible de récupérer l'historique des logos."
          );
        }

        const versions: ProjectLogoVersion[] =
          data.logos.map(
            (logo: ProjectLogoVersion) => ({
              ...logo,
              id: String(logo.id),
              projectId:
                String(logo.projectId),
              parentLogoId:
                logo.parentLogoId
                  ? String(
                      logo.parentLogoId
                    )
                  : null,
              versionNumber:
                Number(
                  logo.versionNumber
                ) || 1,
              imageData:
                String(
                  logo.imageData || ''
                ),
              sha256:
                String(
                  logo.sha256 || ''
                ),
            })
          );

        setLogoVersions(
          versions
        );

        setSelectedLogoVersion(
          data.selectedLogo
            ? ({
                ...data.selectedLogo,
                id: String(
                  data.selectedLogo.id
                ),
                projectId:
                  String(
                    data.selectedLogo
                      .projectId
                  ),
                versionNumber:
                  Number(
                    data.selectedLogo
                      .versionNumber
                  ) || 1,
              } as ProjectLogoVersion)
            : null
        );

        setOfficialLogoVersion(
          data.officialLogo
            ? ({
                ...data.officialLogo,
                id: String(
                  data.officialLogo.id
                ),
                projectId:
                  String(
                    data.officialLogo
                      .projectId
                  ),
                versionNumber:
                  Number(
                    data.officialLogo
                      .versionNumber
                  ) || 1,
              } as ProjectLogoVersion)
            : null
        );

        return versions;
      } catch (error) {
        console.error(
          'Erreur historique logos :',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : "Impossible de récupérer l'historique des logos.";

        setLogoHistoryError(
          message
        );

        return null;
      } finally {
        setLogoHistoryLoading(
          false
        );
      }
    };

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
      setLogoVersions([]);
      setSelectedLogoVersion(null);
      setOfficialLogoVersion(null);
      setLogoHistoryError('');
      setShowLogoHistory(false);
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
      setLogoHistoryError('');
      setShowLogoHistory(false);

      await refreshLogoVersions(
        normalizedProject.id
      );
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
      setLogoVersions([]);
      setSelectedLogoVersion(null);
      setOfficialLogoVersion(null);
      setLogoHistoryError('');
      setShowLogoHistory(false);
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
        setLogoVersions([]);
        setSelectedLogoVersion(null);
        setOfficialLogoVersion(null);
        setLogoHistoryError('');
        setShowLogoHistory(false);
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

      const selectedAt =
        new Date().toISOString();

      const savedLogo: SavedLogo = {
        id: proposal.id,
        image: proposal.image,
        mediaType:
          proposal.mediaType,
        model:
          'bytedance-seed/seedream-4.5',
        selectedAt,
        status:
          'selected',
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

      try {
        const versionResponse =
          await fetch(
            `/api/projects/${encodeURIComponent(
              currentProject.id
            )}/logos`,
            {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                imageData:
                  proposal.image,
                status:
                  'selected',
                sourceType:
                  'ai',
                model:
                  'bytedance-seed/seedream-4.5',
                generationPrompt:
                  currentProject.prompt ||
                  null,
                editData: {
                  proposalId:
                    proposal.id,
                  selectedFrom:
                    'logo_proposals',
                },
              }),
            }
          );

        const versionData =
          await versionResponse.json();

        if (
          !versionResponse.ok ||
          !versionData.success
        ) {
          throw new Error(
            versionData?.error ||
              "Le logo a été sélectionné, mais sa version n'a pas pu être enregistrée."
          );
        }

        await refreshLogoVersions(
          currentProject.id
        );

        alert(
          `Logo ${proposal.id} enregistré comme nouvelle version pour ${currentProject.name}.`
        );
      } catch (error) {
        console.error(
          'Erreur versionnement logo :',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer la version du logo.";

        setLogoHistoryError(
          message
        );

        alert(
          `Le logo est sélectionné, mais son historique n'a pas pu être mis à jour : ${message}`
        );
      }
    };

  useEffect(() => {
    if (
      !logoEditorOpen ||
      !logoEditorSource
    ) {
      return;
    }

    let cancelled = false;

    const loadImage = (
      source: string
    ) =>
      new Promise<HTMLImageElement>(
        (resolve, reject) => {
          const image = new Image();
          image.onload = () =>
            resolve(image);
          image.onerror = () =>
            reject(
              new Error(
                "Impossible de charger le logo dans l'éditeur."
              )
            );
          image.src = source;
        }
      );

    const renderEditor =
      async () => {
        try {
          const canvas =
            logoEditorCanvasRef.current;

          if (!canvas) {
            return;
          }

          const context =
            canvas.getContext('2d');

          if (!context) {
            return;
          }

          const {
            imageScale,
            imageX,
            imageY,
            rotation,
            hue,
            saturation,
            brightness,
            backgroundColor,
            text,
            textColor,
            textSize,
            textX,
            textY,
          } = logoEditorSettings;

          canvas.width =
            LOGO_EDITOR_SIZE;
          canvas.height =
            LOGO_EDITOR_SIZE;

          context.clearRect(
            0,
            0,
            LOGO_EDITOR_SIZE,
            LOGO_EDITOR_SIZE
          );

          context.fillStyle =
            backgroundColor;
          context.fillRect(
            0,
            0,
            LOGO_EDITOR_SIZE,
            LOGO_EDITOR_SIZE
          );

          if (
            logoSelectionActive &&
            logoSelectionBase
          ) {
            const baseImage =
              await loadImage(
                logoSelectionBase
              );

            if (cancelled) {
              return;
            }

            context.save();
            context.filter = 'none';
            context.drawImage(
              baseImage,
              0,
              0,
              LOGO_EDITOR_SIZE,
              LOGO_EDITOR_SIZE
            );
            context.restore();

            if (
              logoSelectionImage &&
              logoSelectionBounds
            ) {
              const selectedImage =
                await loadImage(
                  logoSelectionImage
                );

              if (cancelled) {
                return;
              }

              const centerX =
                logoSelectionBounds.x +
                logoSelectionBounds.width / 2;
              const centerY =
                logoSelectionBounds.y +
                logoSelectionBounds.height / 2;

              context.save();
              context.translate(
                centerX + imageX,
                centerY + imageY
              );
              context.rotate(
                (rotation * Math.PI) /
                  180
              );
              context.scale(
                imageScale,
                imageScale
              );
              context.filter =
                `hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${brightness}%)`;
              context.drawImage(
                selectedImage,
                -centerX,
                -centerY,
                LOGO_EDITOR_SIZE,
                LOGO_EDITOR_SIZE
              );
              context.restore();
            }
          } else {
            const image =
              await loadImage(
                logoEditorSource
              );

            if (cancelled) {
              return;
            }

            const fitScale =
              Math.min(
                LOGO_EDITOR_SIZE /
                  image.naturalWidth,
                LOGO_EDITOR_SIZE /
                  image.naturalHeight
              );

            const width =
              image.naturalWidth *
              fitScale;

            const height =
              image.naturalHeight *
              fitScale;

            context.save();
            context.translate(
              LOGO_EDITOR_SIZE / 2 +
                imageX,
              LOGO_EDITOR_SIZE / 2 +
                imageY
            );
            context.rotate(
              (rotation * Math.PI) /
                180
            );
            context.scale(
              imageScale,
              imageScale
            );
            context.filter =
              `hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${brightness}%)`;
            context.drawImage(
              image,
              -width / 2,
              -height / 2,
              width,
              height
            );
            context.restore();
          }

          replaceCanvasBackground(
            context,
            backgroundColor
          );

          if (text.trim()) {
            context.save();
            context.filter = 'none';
            context.textAlign =
              'center';
            context.textBaseline =
              'middle';
            context.font =
              `700 ${textSize}px Arial, sans-serif`;
            context.fillStyle =
              textColor;
            context.shadowColor =
              'rgba(0, 0, 0, 0.30)';
            context.shadowBlur = 4;
            context.shadowOffsetY = 2;
            context.fillText(
              text.trim(),
              LOGO_EDITOR_SIZE / 2 +
                textX,
              LOGO_EDITOR_SIZE / 2 +
                textY,
              LOGO_EDITOR_SIZE - 32
            );
            context.restore();
          }
        } catch (error) {
          if (!cancelled) {
            setLogoEditorError(
              error instanceof Error
                ? error.message
                : "Impossible de charger le logo dans l'éditeur."
            );
          }
        }
      };

    void renderEditor();

    return () => {
      cancelled = true;
    };
  }, [
    logoEditorOpen,
    logoEditorSource,
    logoEditorSettings,
    logoSelectionActive,
    logoSelectionImage,
    logoSelectionBase,
    logoSelectionBounds,
  ]);

  const getLogoCanvasPoint = (
    event:
      | ReactPointerEvent<HTMLCanvasElement>
      | PointerEvent
  ) => {
    const canvas =
      logoEditorCanvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect =
      canvas.getBoundingClientRect();

    const x =
      Math.max(
        0,
        Math.min(
          LOGO_EDITOR_SIZE - 1,
          Math.round(
            ((event.clientX - rect.left) /
              rect.width) *
              LOGO_EDITOR_SIZE
          )
        )
      );

    const y =
      Math.max(
        0,
        Math.min(
          LOGO_EDITOR_SIZE - 1,
          Math.round(
            ((event.clientY - rect.top) /
              rect.height) *
              LOGO_EDITOR_SIZE
          )
        )
      );

    return { x, y };
  };

  const createLogoSelection = (
    mask: Uint8Array,
    bounds: LogoSelectionBounds
  ) => {
    const canvas =
      logoEditorCanvasRef.current;

    if (!canvas) {
      return;
    }

    const context =
      canvas.getContext('2d');

    if (!context) {
      return;
    }

    const snapshot =
      canvas.toDataURL('image/png');

    const sourceData =
      context.getImageData(
        0,
        0,
        LOGO_EDITOR_SIZE,
        LOGO_EDITOR_SIZE
      );

    const baseCanvas =
      document.createElement(
        'canvas'
      );
    const selectedCanvas =
      document.createElement(
        'canvas'
      );

    baseCanvas.width =
      selectedCanvas.width =
        LOGO_EDITOR_SIZE;
    baseCanvas.height =
      selectedCanvas.height =
        LOGO_EDITOR_SIZE;

    const baseContext =
      baseCanvas.getContext('2d');
    const selectedContext =
      selectedCanvas.getContext('2d');

    if (
      !baseContext ||
      !selectedContext
    ) {
      return;
    }

    const baseData =
      new ImageData(
        new Uint8ClampedArray(
          sourceData.data
        ),
        LOGO_EDITOR_SIZE,
        LOGO_EDITOR_SIZE
      );

    const selectedData =
      selectedContext.createImageData(
        LOGO_EDITOR_SIZE,
        LOGO_EDITOR_SIZE
      );

    for (
      let pixel = 0;
      pixel < mask.length;
      pixel++
    ) {
      if (!mask[pixel]) {
        continue;
      }

      const offset = pixel * 4;
      selectedData.data[offset] =
        sourceData.data[offset];
      selectedData.data[offset + 1] =
        sourceData.data[offset + 1];
      selectedData.data[offset + 2] =
        sourceData.data[offset + 2];
      selectedData.data[offset + 3] =
        sourceData.data[offset + 3];

      baseData.data[offset + 3] = 0;
    }

    baseContext.putImageData(
      baseData,
      0,
      0
    );
    selectedContext.putImageData(
      selectedData,
      0,
      0
    );

    setLogoSelectionSnapshot(
      snapshot
    );
    setLogoSelectionBase(
      baseCanvas.toDataURL(
        'image/png'
      )
    );
    setLogoSelectionImage(
      selectedCanvas.toDataURL(
        'image/png'
      )
    );
    setLogoSelectionBounds(
      bounds
    );
    setLogoSelectionActive(
      true
    );
    setLogoEditorSettings(
      (previous) => ({
        ...previous,
        imageScale: 1,
        imageX: 0,
        imageY: 0,
        rotation: 0,
        hue: 0,
        saturation: 100,
        brightness: 100,
      })
    );
    setLogoEditorError('');
  };

  const handleSmartLogoSelection = (
    point: { x: number; y: number }
  ) => {
    const canvas =
      logoEditorCanvasRef.current;

    if (!canvas) {
      return;
    }

    const context =
      canvas.getContext('2d');

    if (!context) {
      return;
    }

    const imageData =
      context.getImageData(
        0,
        0,
        LOGO_EDITOR_SIZE,
        LOGO_EDITOR_SIZE
      );

    const totalPixels =
      LOGO_EDITOR_SIZE *
      LOGO_EDITOR_SIZE;
    const mask =
      new Uint8Array(
        totalPixels
      );
    const visited =
      new Uint8Array(
        totalPixels
      );

    const seedIndex =
      point.y *
        LOGO_EDITOR_SIZE +
      point.x;
    const seedOffset =
      seedIndex * 4;

    const sr =
      imageData.data[
        seedOffset
      ];
    const sg =
      imageData.data[
        seedOffset + 1
      ];
    const sb =
      imageData.data[
        seedOffset + 2
      ];
    const sa =
      imageData.data[
        seedOffset + 3
      ];

    const threshold =
      Math.max(
        4,
        logoSelectionTolerance *
          4.5
      );

    const queue =
      new Int32Array(
        totalPixels
      );
    let head = 0;
    let tail = 0;
    queue[tail++] = seedIndex;
    visited[seedIndex] = 1;

    let minX = point.x;
    let maxX = point.x;
    let minY = point.y;
    let maxY = point.y;
    let count = 0;

    while (head < tail) {
      const index =
        queue[head++];
      const x =
        index %
        LOGO_EDITOR_SIZE;
      const y =
        Math.floor(
          index /
            LOGO_EDITOR_SIZE
        );
      const offset =
        index * 4;

      const dr =
        imageData.data[offset] -
        sr;
      const dg =
        imageData.data[
          offset + 1
        ] - sg;
      const db =
        imageData.data[
          offset + 2
        ] - sb;
      const da =
        imageData.data[
          offset + 3
        ] - sa;

      const distance =
        Math.sqrt(
          dr * dr +
            dg * dg +
            db * db +
            0.25 * da * da
        );

      if (distance > threshold) {
        continue;
      }

      mask[index] = 1;
      count++;
      minX = Math.min(
        minX,
        x
      );
      maxX = Math.max(
        maxX,
        x
      );
      minY = Math.min(
        minY,
        y
      );
      maxY = Math.max(
        maxY,
        y
      );

      const neighbors = [
        index - 1,
        index + 1,
        index - LOGO_EDITOR_SIZE,
        index + LOGO_EDITOR_SIZE,
      ];

      for (
        const next of neighbors
      ) {
        if (
          next < 0 ||
          next >= totalPixels ||
          visited[next]
        ) {
          continue;
        }

        const nx =
          next %
          LOGO_EDITOR_SIZE;
        const ny =
          Math.floor(
            next /
              LOGO_EDITOR_SIZE
          );

        if (
          Math.abs(nx - x) +
            Math.abs(ny - y) !==
          1
        ) {
          continue;
        }

        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    // Si la sélection connectée est trop petite (cas fréquent sur les
    // traits fins, dégradés ou pixels anti-crénelés), on élargit la
    // recherche autour du point cliqué sans sélectionner tout le fond.
    if (count < 12) {
      const radius = 18;
      const localThreshold = Math.max(
        threshold * 1.35,
        28
      );

      for (
        let y = Math.max(0, point.y - radius);
        y <= Math.min(LOGO_EDITOR_SIZE - 1, point.y + radius);
        y++
      ) {
        for (
          let x = Math.max(0, point.x - radius);
          x <= Math.min(LOGO_EDITOR_SIZE - 1, point.x + radius);
          x++
        ) {
          const index = y * LOGO_EDITOR_SIZE + x;
          if (mask[index]) {
            continue;
          }

          const offset = index * 4;
          const dr = imageData.data[offset] - sr;
          const dg = imageData.data[offset + 1] - sg;
          const db = imageData.data[offset + 2] - sb;
          const da = imageData.data[offset + 3] - sa;
          const distance = Math.sqrt(
            dr * dr +
            dg * dg +
            db * db +
            0.25 * da * da
          );

          if (distance <= localThreshold) {
            mask[index] = 1;
            count++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
    }

    if (count < 2) {
      setLogoEditorError(
        'Cette partie est trop fine pour la sélection intelligente. Utilisez Rectangle pour l’encadrer précisément.'
      );
      return;
    }

    createLogoSelection(
      mask,
      {
        x: minX,
        y: minY,
        width:
          maxX - minX + 1,
        height:
          maxY - minY + 1,
      }
    );
  };

  const handleSelectWholeLogo =
    () => {
      setLogoSelectionMode('all');
      setLogoEditorError('');

      const mask =
        new Uint8Array(
          LOGO_EDITOR_SIZE *
            LOGO_EDITOR_SIZE
        );
      mask.fill(1);

      createLogoSelection(
        mask,
        {
          x: 0,
          y: 0,
          width:
            LOGO_EDITOR_SIZE,
          height:
            LOGO_EDITOR_SIZE,
        }
      );
  };

  const handleLogoCanvasPointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    const point =
      getLogoCanvasPoint(
        event
      );

    if (!point) {
      return;
    }

    if (
      logoSelectionActive &&
      logoSelectionBounds
    ) {
      const centerX =
        logoSelectionBounds.x +
        logoSelectionBounds.width / 2 +
        logoEditorSettings.imageX;

      const centerY =
        logoSelectionBounds.y +
        logoSelectionBounds.height / 2 +
        logoEditorSettings.imageY;

      const width =
        logoSelectionBounds.width *
        logoEditorSettings.imageScale;

      const height =
        logoSelectionBounds.height *
        logoEditorSettings.imageScale;

      const left =
        centerX - width / 2;
      const top =
        centerY - height / 2;

      const inside =
        point.x >= left &&
        point.x <= left + width &&
        point.y >= top &&
        point.y <= top + height;

      if (inside) {
        logoSelectionDragRef.current = {
          pointerId: event.pointerId,
          startX: point.x,
          startY: point.y,
          startImageX:
            logoEditorSettings.imageX,
          startImageY:
            logoEditorSettings.imageY,
        };

        event.currentTarget.setPointerCapture(
          event.pointerId
        );
      }

      return;
    }

    if (
      logoSelectionMode ===
      'smart'
    ) {
      handleSmartLogoSelection(
        point
      );
      return;
    }

    if (
      logoSelectionMode ===
      'rect'
    ) {
      setLogoRectStart(point);
      setLogoRectCurrent(point);
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    }
  };

  const handleLogoCanvasPointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    const point =
      getLogoCanvasPoint(
        event
      );

    if (!point) {
      return;
    }

    const drag =
      logoSelectionDragRef.current;

    if (
      logoSelectionActive &&
      drag &&
      drag.pointerId ===
        event.pointerId
    ) {
      setLogoEditorSettings(
        (previous) => ({
          ...previous,
          imageX:
            drag.startImageX +
            point.x -
            drag.startX,
          imageY:
            drag.startImageY +
            point.y -
            drag.startY,
        })
      );

      return;
    }

    if (
      logoSelectionMode !==
        'rect' ||
      !logoRectStart ||
      logoSelectionActive
    ) {
      return;
    }

    setLogoRectCurrent(
      point
    );
  };

  const handleLogoCanvasPointerUp = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    const drag =
      logoSelectionDragRef.current;

    if (
      drag &&
      drag.pointerId ===
        event.pointerId
    ) {
      logoSelectionDragRef.current =
        null;

      try {
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
      } catch {
        // Aucun verrou actif.
      }

      return;
    }

    if (
      logoSelectionMode !==
        'rect' ||
      !logoRectStart ||
      logoSelectionActive
    ) {
      return;
    }

    const point =
      getLogoCanvasPoint(
        event
      ) || logoRectCurrent;

    if (!point) {
      return;
    }

    const x = Math.min(
      logoRectStart.x,
      point.x
    );
    const y = Math.min(
      logoRectStart.y,
      point.y
    );
    const width = Math.max(
      1,
      Math.abs(
        point.x -
          logoRectStart.x
      ) + 1
    );
    const height = Math.max(
      1,
      Math.abs(
        point.y -
          logoRectStart.y
      ) + 1
    );

    const mask =
      new Uint8Array(
        LOGO_EDITOR_SIZE *
          LOGO_EDITOR_SIZE
      );

    for (
      let py = y;
      py < y + height;
      py++
    ) {
      for (
        let px = x;
        px < x + width;
        px++
      ) {
        mask[
          py *
            LOGO_EDITOR_SIZE +
            px
        ] = 1;
      }
    }

    createLogoSelection(
      mask,
      {
        x,
        y,
        width,
        height,
      }
    );

    setLogoRectStart(null);
    setLogoRectCurrent(null);

    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Aucun verrou actif.
    }
  };

  const handleDeleteLogoSelection =
    () => {
      if (!logoSelectionActive) {
        return;
      }

      setLogoSelectionImage('');
      setLogoEditorSettings(
        (previous) => ({
          ...previous,
          imageScale: 1,
          imageX: 0,
          imageY: 0,
          rotation: 0,
          hue: 0,
          saturation: 100,
          brightness: 100,
        })
      );
    };

  const clearLogoSelectionState =
    () => {
      setLogoSelectionActive(false);
      setLogoSelectionImage('');
      setLogoSelectionBase('');
      setLogoSelectionSnapshot('');
      setLogoSelectionBounds(null);
      setLogoRectStart(null);
      setLogoRectCurrent(null);
      logoSelectionDragRef.current = null;
    };

  const handleApplyLogoSelection =
    () => {
      const canvas =
        logoEditorCanvasRef.current;

      if (!canvas) {
        return;
      }

      setLogoEditorSource(
        canvas.toDataURL(
          'image/png'
        )
      );
      clearLogoSelectionState();
      setLogoEditorSettings(
        (previous) => ({
          ...previous,
          imageScale: 1,
          imageX: 0,
          imageY: 0,
          rotation: 0,
          hue: 0,
          saturation: 100,
          brightness: 100,
          text: '',
        })
      );
    };

  const handleCancelLogoSelection =
    () => {
      if (
        logoSelectionSnapshot
      ) {
        setLogoEditorSource(
          logoSelectionSnapshot
        );
      }
      clearLogoSelectionState();
      setLogoEditorSettings(
        (previous) => ({
          ...previous,
          imageScale: 1,
          imageX: 0,
          imageY: 0,
          rotation: 0,
          hue: 0,
          saturation: 100,
          brightness: 100,
        })
      );
    };

  const handleOpenLogoEditor =
    (
      logo:
        | ProjectLogoVersion
        | null,
      fallbackImage: string
    ) => {
      const source =
        logo?.imageData ||
        fallbackImage;

      if (
        !source ||
        !source.startsWith(
          'data:image/'
        )
      ) {
        alert(
          'Aucun logo valide à modifier.'
        );
        return;
      }

      setLogoEditorSource(
        source
      );

      setLogoEditorParentId(
        logo?.id || null
      );

      setLogoEditorSettings({
        ...DEFAULT_LOGO_EDITOR_SETTINGS,
      });
      clearLogoSelectionState();
      setLogoSelectionMode('smart');
      setLogoSelectionTolerance(35);

      setLogoEditorError('');
      setLogoEditorOpen(true);
    };

  const handleCloseLogoEditor =
    () => {
      if (logoEditorSaving) {
        return;
      }

      setLogoEditorOpen(false);
      clearLogoSelectionState();
      setLogoEditorError('');
    };

  const handleResetLogoEditor =
    () => {
      setLogoEditorSettings({
        ...DEFAULT_LOGO_EDITOR_SETTINGS,
      });
      clearLogoSelectionState();
      setLogoSelectionMode('smart');
      setLogoSelectionTolerance(35);
      setLogoEditorError('');
    };

  const handleSaveLogoEditor =
    async () => {
      if (
        !currentProject ||
        logoEditorSaving
      ) {
        return;
      }

      const canvas =
        logoEditorCanvasRef.current;

      if (!canvas) {
        setLogoEditorError(
          "L'aperçu du logo n'est pas disponible."
        );
        return;
      }

      setLogoEditorSaving(true);
      setLogoEditorError('');

      try {
        const imageData =
          canvas.toDataURL(
            'image/png'
          );

        if (
          !imageData.startsWith(
            'data:image/png'
          )
        ) {
          throw new Error(
            "Impossible d'exporter le logo modifié."
          );
        }

        const response =
          await fetch(
            `/api/projects/${encodeURIComponent(
              currentProject.id
            )}/logos`,
            {
              method: 'POST',
              credentials:
                'same-origin',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                imageData,
                status:
                  'selected',
                sourceType:
                  'manual_edit',
                parentLogoId:
                  logoEditorParentId,
                generationPrompt:
                  currentProject.prompt ||
                  null,
                editPrompt:
                  'Modification manuelle avec Logo Editor V1.1',
                editData: {
                  editorVersion:
                    'v1.1',
                  ...logoEditorSettings,
                },
                imageWidth:
                  LOGO_EDITOR_SIZE,
                imageHeight:
                  LOGO_EDITOR_SIZE,
              }),
            }
          );

        const rawResponse =
          await response.text();

        let data:
          | {
              success?: boolean;
              error?: string;
              logo?: ProjectLogoVersion;
            }
          | null = null;

        try {
          data =
            JSON.parse(
              rawResponse
            );
        } catch {
          throw new Error(
            `La route des logos a retourné une réponse invalide (HTTP ${response.status}).`
          );
        }

        if (
          !response.ok ||
          !data?.success ||
          !data.logo
        ) {
          throw new Error(
            data?.error ||
              "Impossible d'enregistrer le logo modifié."
          );
        }

        const newVersion =
          data.logo;

        const savedLogo: SavedLogo = {
          id:
            Number(
              newVersion.versionNumber
            ) || 1,
          image:
            newVersion.imageData ||
            imageData,
          mediaType:
            newVersion.imageMimeType ||
            'image/png',
          model:
            'logo-editor-v1',
          selectedAt:
            newVersion.selectedAt ||
            new Date().toISOString(),
          sha256:
            newVersion.sha256,
          logoVersionId:
            String(
              newVersion.id
            ),
          status:
            'selected',
        };

        const projectSaved =
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

        if (!projectSaved) {
          throw new Error(
            "La nouvelle version a été créée, mais le projet n'a pas pu être synchronisé."
          );
        }

        await refreshLogoVersions(
          currentProject.id
        );

        setLogoEditorOpen(false);

        alert(
          `Logo modifié enregistré comme version ${newVersion.versionNumber}. L'ancien logo officiel reste protégé jusqu'à une nouvelle officialisation.`
        );
      } catch (error) {
        console.error(
          'Erreur Logo Editor V1.1 :',
          error
        );

        setLogoEditorError(
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer le logo modifié."
        );
      } finally {
        setLogoEditorSaving(
          false
        );
      }
    };

  const handleSetOfficialLogo =
    async (
      logoId: string
    ) => {
      if (
        !currentProject ||
        officializingLogoId
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Définir cette version comme identité officielle de l'application ?"
        );

      if (!confirmed) {
        return;
      }

      setOfficializingLogoId(
        logoId
      );
      setLogoHistoryError('');

      try {
        const response =
          await fetch(
            `/api/projects/${encodeURIComponent(
              currentProject.id
            )}/logos/${encodeURIComponent(
              logoId
            )}/official`,
            {
              method: 'POST',
              credentials: 'same-origin',
              cache: 'no-store',
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success ||
          !data.logo
        ) {
          throw new Error(
            data?.error ||
              "Impossible de définir ce logo comme identité officielle."
          );
        }

        const projectResponse =
          await fetch(
            `/api/projects/${encodeURIComponent(
              currentProject.id
            )}`,
            {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
            }
          );

        const projectData =
          await projectResponse.json();

        if (
          projectResponse.ok &&
          projectData.success &&
          projectData.project
        ) {
          const refreshedProject =
            normalizeProject(
              projectData.project
            );

          setCurrentProject(
            refreshedProject
          );

          setProjects(
            (previous) =>
              previous.map(
                (project) =>
                  project.id ===
                  refreshedProject.id
                    ? refreshedProject
                    : project
              )
          );
        }

        await refreshLogoVersions(
          currentProject.id
        );

        alert(
          'Logo défini comme identité officielle.'
        );
      } catch (error) {
        console.error(
          'Erreur identité officielle :',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : "Impossible de définir le logo comme identité officielle.";

        setLogoHistoryError(
          message
        );

        alert(message);
      } finally {
        setOfficializingLogoId(
          null
        );
      }
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
            ) && (() => {
              const currentImage =
                getProjectLogoImage(
                  currentProject
                );

              const currentVersion =
                logoVersions.find(
                  (logo) =>
                    logo.imageData ===
                    currentImage
                ) ||
                selectedLogoVersion ||
                officialLogoVersion ||
                null;

              const isOfficial =
                currentVersion?.status ===
                  'official' ||
                officialLogoVersion?.imageData ===
                  currentImage;

              return (
                <div
                  className={`mt-5 rounded-xl border p-4 ${
                    isOfficial
                      ? 'border-amber-400/30 bg-amber-500/5'
                      : 'border-emerald-500/20 bg-emerald-500/5'
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <img
                        src={
                          currentImage
                        }
                        alt={`Logo de ${currentProject.name}`}
                        className="h-20 w-20 rounded-2xl object-cover"
                      />

                      <div>
                        <div
                          className={`text-sm font-semibold ${
                            isOfficial
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                          }`}
                        >
                          {isOfficial
                            ? '★ Logo officiel'
                            : '✓ Logo sélectionné'}
                        </div>

                        <div className="mt-1 text-xs text-white/45">
                          {currentVersion
                            ? `Version ${currentVersion.versionNumber} · ${currentVersion.sourceType}`
                            : "Logo enregistré avec l'application."}
                        </div>

                        {currentVersion?.sha256 && (
                          <div className="mt-1 font-mono text-[10px] text-white/30">
                            SHA-256 :{' '}
                            {currentVersion.sha256.slice(
                              0,
                              16
                            )}
                            …
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenLogoEditor(
                            currentVersion,
                            currentImage
                          )
                        }
                        className="rounded-xl bg-sky-500/15 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
                      >
                        ✏️ Modifier ce logo
                      </button>

                      {currentVersion &&
                        !isOfficial && (
                          <button
                            type="button"
                            disabled={
                              officializingLogoId ===
                              currentVersion.id
                            }
                            onClick={() =>
                              void handleSetOfficialLogo(
                                currentVersion.id
                              )
                            }
                            className="rounded-xl bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {officializingLogoId ===
                            currentVersion.id
                              ? 'Officialisation...'
                              : '★ Définir comme identité officielle'}
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() =>
                          setShowLogoHistory(
                            (value) =>
                              !value
                          )
                        }
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 transition hover:bg-white/10"
                      >
                        {showLogoHistory
                          ? "Masquer l'historique"
                          : `Historique des versions (${logoVersions.length})`}
                      </button>
                    </div>
                  </div>

                  {isOfficial && (
                    <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                      Identité officielle dans SimiRork. Cela ne signifie pas encore que la marque est juridiquement déposée.
                    </div>
                  )}
                </div>
              );
            })()}

            {logoHistoryError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {logoHistoryError}
              </div>
            )}

            {showLogoHistory && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Historique des logos
                    </h3>
                    <p className="mt-1 text-xs text-white/40">
                      Chaque version reste conservée avec son empreinte numérique.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      logoHistoryLoading
                    }
                    onClick={() =>
                      void refreshLogoVersions(
                        currentProject.id
                      )
                    }
                    className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10 disabled:opacity-40"
                  >
                    {logoHistoryLoading
                      ? 'Actualisation...'
                      : 'Actualiser'}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {logoVersions.length ===
                  0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/40">
                      Aucune version enregistrée.
                    </div>
                  ) : (
                    logoVersions.map(
                      (version) => (
                        <div
                          key={
                            version.id
                          }
                          className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                version.imageData
                              }
                              alt={`Logo version ${version.versionNumber}`}
                              className="h-14 w-14 rounded-xl object-cover"
                            />

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">
                                  Version{' '}
                                  {
                                    version.versionNumber
                                  }
                                </span>

                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    version.status ===
                                    'official'
                                      ? 'bg-amber-500/15 text-amber-300'
                                      : version.status ===
                                          'selected'
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : version.status ===
                                            'edited'
                                          ? 'bg-violet-500/15 text-violet-300'
                                          : 'bg-white/5 text-white/45'
                                  }`}
                                >
                                  {
                                    version.status
                                  }
                                </span>
                              </div>

                              <div className="mt-1 text-[11px] text-white/40">
                                {new Date(
                                  version.createdAt
                                ).toLocaleString(
                                  'fr-FR'
                                )}{' '}
                                ·{' '}
                                {
                                  version.sourceType
                                }
                              </div>

                              <div className="mt-1 font-mono text-[10px] text-white/25">
                                {version.sha256.slice(
                                  0,
                                  24
                                )}
                                …
                              </div>
                            </div>
                          </div>

                          {version.status !==
                            'official' && (
                            <button
                              type="button"
                              disabled={
                                officializingLogoId ===
                                version.id
                              }
                              onClick={() =>
                                void handleSetOfficialLogo(
                                  version.id
                                )
                              }
                              className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {officializingLogoId ===
                              version.id
                                ? 'Officialisation...'
                                : 'Définir officiel'}
                            </button>
                          )}
                        </div>
                      )
                    )
                  )}
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

        {logoEditorOpen && (
          <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-[#0b1120] p-4 shadow-2xl sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    ✏️ Logo Editor V1.1.1
                  </h2>
                  <p className="mt-1 text-sm text-white/45">
                    Modifiez le logo puis enregistrez-le comme une nouvelle version. L’original reste conservé.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCloseLogoEditor}
                  disabled={logoEditorSaving}
                  className="rounded-lg px-3 py-2 text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  ✕ Fermer
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-sky-400/40 bg-sky-500/[0.08] p-4 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]">
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-sm font-semibold text-sky-100">Mode de sélection</div>
                    <p className="mt-1 text-xs text-white/50">
                      Le mode choisi reste clairement surligné. Une fois une zone sélectionnée, son contour clignote et vous pouvez la déplacer directement avec la souris.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={logoSelectionActive}
                      onClick={() => {
                        setLogoSelectionMode('smart');
                        setLogoEditorError('');
                        setLogoRectStart(null);
                        setLogoRectCurrent(null);
                      }}
                      className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${logoSelectionMode === 'smart'
                        ? 'border-sky-300 bg-sky-300 text-slate-950 ring-2 ring-sky-300/50'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {logoSelectionMode === 'smart' ? '✓ ' : ''}Intelligent
                    </button>

                    <button
                      type="button"
                      disabled={logoSelectionActive}
                      onClick={() => {
                        setLogoSelectionMode('rect');
                        setLogoEditorError('');
                        setLogoRectStart(null);
                        setLogoRectCurrent(null);
                      }}
                      className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${logoSelectionMode === 'rect'
                        ? 'border-amber-300 bg-amber-300 text-slate-950 ring-2 ring-amber-300/50'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {logoSelectionMode === 'rect' ? '✓ ' : ''}Rectangle
                    </button>

                    <button
                      type="button"
                      disabled={logoSelectionActive}
                      onClick={handleSelectWholeLogo}
                      className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${logoSelectionMode === 'all'
                        ? 'border-emerald-300 bg-emerald-300 text-slate-950 ring-2 ring-emerald-300/50'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {logoSelectionMode === 'all' ? '✓ ' : ''}Logo entier
                    </button>
                  </div>

                  <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
                    logoSelectionActive
                      ? 'border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200'
                      : logoSelectionMode === 'smart'
                        ? 'border-sky-400/30 bg-sky-500/10 text-sky-200'
                        : logoSelectionMode === 'rect'
                          ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                          : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  }`}>
                    {logoSelectionActive
                      ? 'PHASE 2 — Sélection active : cliquez-glissez directement la sélection pour la déplacer.'
                      : logoSelectionMode === 'smart'
                        ? 'PHASE 1 — Intelligent : cliquez une fois sur la forme à isoler.'
                        : logoSelectionMode === 'rect'
                          ? 'PHASE 1 — Rectangle : maintenez le clic, encadrez la zone, puis relâchez.'
                          : 'PHASE 1 — Logo entier : le logo complet va être sélectionné.'}
                  </div>

                  {logoSelectionMode === 'smart' && !logoSelectionActive && (
                    <label className="block text-xs text-white/60">
                      Tolérance intelligente : {logoSelectionTolerance}%
                      <input
                        type="range"
                        min="2"
                        max="100"
                        step="1"
                        value={logoSelectionTolerance}
                        onChange={(event) => setLogoSelectionTolerance(Number(event.target.value))}
                        className="mt-2 w-full"
                      />
                    </label>
                  )}
                </div>

                {logoSelectionActive && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-semibold text-emerald-300">✓ Sélection active</span>
                    <button
                      type="button"
                      onClick={handleDeleteLogoSelection}
                      className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25"
                    >
                      🗑 Supprimer
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyLogoSelection}
                      className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                    >
                      ✓ Appliquer
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelLogoSelection}
                      className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-white/65 hover:bg-white/10"
                    >
                      ✕ Annuler
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="mx-auto max-w-[560px]">
                    <div className="relative overflow-hidden rounded-2xl">
                      <canvas
                        ref={logoEditorCanvasRef}
                        width={LOGO_EDITOR_SIZE}
                        height={LOGO_EDITOR_SIZE}
                        onPointerDown={handleLogoCanvasPointerDown}
                        onPointerMove={handleLogoCanvasPointerMove}
                        onPointerUp={handleLogoCanvasPointerUp}
                        onPointerCancel={() => {
                          setLogoRectStart(null);
                          setLogoRectCurrent(null);
                          logoSelectionDragRef.current = null;
                        }}
                        style={{ touchAction: 'none' }}
                        className={`aspect-square w-full border border-white/10 bg-white object-contain shadow-xl ${logoSelectionActive ? 'cursor-move' : 'cursor-crosshair'}`}
                      />

                      {logoSelectionBounds && logoSelectionActive && (
                        <div
                          className="pointer-events-none absolute box-border border-4 border-dashed border-fuchsia-400 bg-fuchsia-400/10 shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_0_18px_rgba(232,121,249,0.95)] animate-pulse"
                          style={{
                            left: `${((logoSelectionBounds.x + logoSelectionBounds.width / 2 + logoEditorSettings.imageX - (logoSelectionBounds.width * logoEditorSettings.imageScale) / 2) / LOGO_EDITOR_SIZE) * 100}%`,
                            top: `${((logoSelectionBounds.y + logoSelectionBounds.height / 2 + logoEditorSettings.imageY - (logoSelectionBounds.height * logoEditorSettings.imageScale) / 2) / LOGO_EDITOR_SIZE) * 100}%`,
                            width: `${((logoSelectionBounds.width * logoEditorSettings.imageScale) / LOGO_EDITOR_SIZE) * 100}%`,
                            height: `${((logoSelectionBounds.height * logoEditorSettings.imageScale) / LOGO_EDITOR_SIZE) * 100}%`,
                          }}
                        />
                      )}

                      {logoRectStart && logoRectCurrent && !logoSelectionActive && logoSelectionMode === 'rect' && (
                        <div
                          className="pointer-events-none absolute border-2 border-dashed border-amber-300 bg-amber-300/10"
                          style={{
                            left: `${(Math.min(logoRectStart.x, logoRectCurrent.x) / LOGO_EDITOR_SIZE) * 100}%`,
                            top: `${(Math.min(logoRectStart.y, logoRectCurrent.y) / LOGO_EDITOR_SIZE) * 100}%`,
                            width: `${(Math.abs(logoRectCurrent.x - logoRectStart.x) / LOGO_EDITOR_SIZE) * 100}%`,
                            height: `${(Math.abs(logoRectCurrent.y - logoRectStart.y) / LOGO_EDITOR_SIZE) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-3 text-center text-xs text-white/40">
                      {logoSelectionActive
                        ? 'Les réglages Image et Couleurs agissent uniquement sur la sélection. Cliquez sur Appliquer ou Annuler avant de changer de mode.'
                        : logoSelectionMode === 'smart'
                          ? 'Intelligent : un clic sur la partie à isoler. Ajustez la tolérance si nécessaire.'
                          : 'Rectangle : maintenez le clic gauche, glissez pour entourer la partie, puis relâchez.'}
                    </p>
                  </div>

                  {logoEditorError && (
                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      {logoEditorError}
                    </div>
                  )}
                </div>

                <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                  <div>
                    <h3 className="font-semibold">{logoSelectionActive ? 'Sélection' : 'Image complète'}</h3>
                    <div className="mt-4 space-y-4">
                      <label className="block text-xs text-white/60">
                        Taille : {Math.round(logoEditorSettings.imageScale * 100)}%
                        <input
                          type="range"
                          min="0.4"
                          max="2"
                          step="0.01"
                          value={logoEditorSettings.imageScale}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              imageScale: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-4 py-3 text-xs text-fuchsia-100">
                        <div className="font-semibold">Déplacement direct</div>
                        <div className="mt-1 text-fuchsia-100/70">
                          {logoSelectionActive
                            ? 'Cliquez sur la sélection dans le logo, maintenez le clic et déplacez-la avec la souris.'
                            : 'Sélectionnez d’abord une partie du logo. Vous pourrez ensuite la déplacer directement avec la souris.'}
                        </div>
                      </div>

                      <label className="block text-xs text-white/60">
                        Rotation : {logoEditorSettings.rotation}°
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={logoEditorSettings.rotation}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              rotation: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-5">
                    <h3 className="font-semibold">Couleurs</h3>
                    <div className="mt-4 space-y-4">
                      <label className="block text-xs text-white/60">
                        Teinte : {logoEditorSettings.hue}°
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={logoEditorSettings.hue}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              hue: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <label className="block text-xs text-white/60">
                        Saturation : {logoEditorSettings.saturation}%
                        <input
                          type="range"
                          min="0"
                          max="200"
                          step="1"
                          value={logoEditorSettings.saturation}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              saturation: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <label className="block text-xs text-white/60">
                        Luminosité : {logoEditorSettings.brightness}%
                        <input
                          type="range"
                          min="30"
                          max="180"
                          step="1"
                          value={logoEditorSettings.brightness}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              brightness: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 text-xs text-white/60">
                        Couleur du fond du logo
                        <input
                          type="color"
                          value={logoEditorSettings.backgroundColor}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              backgroundColor: event.target.value,
                            }))
                          }
                          className="h-10 w-16 cursor-pointer rounded border border-white/10 bg-transparent"
                        />
                      </label>
                      <p className="text-[11px] leading-5 text-white/40">
                        Le fond d’origine étant intégré au JPEG, SimiRork remplace maintenant automatiquement les pixels proches de la couleur des coins du logo par la couleur choisie.
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-5">
                    <h3 className="font-semibold">Texte</h3>
                    <div className="mt-4 space-y-4">
                      <input
                        type="text"
                        value={logoEditorSettings.text}
                        onChange={(event) =>
                          setLogoEditorSettings((previous) => ({
                            ...previous,
                            text: event.target.value,
                          }))
                        }
                        placeholder="Ajouter un texte..."
                        className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none focus:border-white/30"
                      />

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-white/60">Couleur du texte</span>
                        <input
                          type="color"
                          value={logoEditorSettings.textColor}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              textColor: event.target.value,
                            }))
                          }
                          className="h-10 w-16 cursor-pointer rounded border border-white/10 bg-transparent"
                        />
                      </div>

                      <label className="block text-xs text-white/60">
                        Taille du texte : {logoEditorSettings.textSize}px
                        <input
                          type="range"
                          min="14"
                          max="120"
                          step="1"
                          value={logoEditorSettings.textSize}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              textSize: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <label className="block text-xs text-white/60">
                        Texte X : {logoEditorSettings.textX}px
                        <input
                          type="range"
                          min="-220"
                          max="220"
                          step="1"
                          value={logoEditorSettings.textX}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              textX: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>

                      <label className="block text-xs text-white/60">
                        Texte Y : {logoEditorSettings.textY}px
                        <input
                          type="range"
                          min="-220"
                          max="220"
                          step="1"
                          value={logoEditorSettings.textY}
                          onChange={(event) =>
                            setLogoEditorSettings((previous) => ({
                              ...previous,
                              textY: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-white/10 pt-5 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleResetLogoEditor}
                      disabled={logoEditorSaving}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Réinitialiser
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSaveLogoEditor()}
                      disabled={logoEditorSaving}
                      className="flex-1 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {logoEditorSaving
                        ? 'Enregistrement...'
                        : '✓ Enregistrer nouvelle version'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
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

