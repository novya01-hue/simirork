'use client';

import { useEffect, useState } from 'react';

type Project = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  code: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = 'simirork_projects';

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [prompt, setPrompt] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [buildingApk, setBuildingApk] = useState(false);
  const [apkReady, setApkReady] = useState(false);
  const [apkError, setApkError] = useState('');
  const [apkRunId, setApkRunId] = useState<string | null>(null);

  const [modelVersion, setModelVersion] = useState(
    'google/gemini-3.6-flash'
  );

  const [activeTab, setActiveTab] = useState<'prompt' | 'preview'>(
    'prompt'
  );

  // ============================================================
  // CHARGEMENT DES PROJETS
  // ============================================================

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        setProjects(parsed);
      }
    } catch (error) {
      console.error('Impossible de charger les projets.', error);
    }
  }, []);

  // ============================================================
  // SAUVEGARDE DES PROJETS
  // ============================================================

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  // ============================================================
  // RESET APK
  // ============================================================

  const resetApkState = () => {
    setApkReady(false);
    setApkError('');
    setApkRunId(null);
    setBuildingApk(false);
  };

  // ============================================================
  // CRÉER UN PROJET
  // ============================================================

  const handleCreateProject = () => {
    const name = newName.trim();

    if (!name) {
      alert("Veuillez donner un nom à votre application.");
      return;
    }

    const now = new Date().toISOString();

    const project: Project = {
      id: crypto.randomUUID(),
      name,
      description: newDescription.trim(),
      prompt: '',
      code: '',
      createdAt: now,
      updatedAt: now,
    };

    setProjects((previous) => [project, ...previous]);

    setCurrentProject(project);
    setPrompt('');
    setGeneratedCode('');
    setNewName('');
    setNewDescription('');
    setShowNewProject(false);
    setActiveTab('prompt');

    resetApkState();
  };

  // ============================================================
  // OUVRIR UN PROJET
  // ============================================================

  const handleOpenProject = (project: Project) => {
    setCurrentProject(project);
    setPrompt(project.prompt || '');
    setGeneratedCode(project.code || '');
    setActiveTab(project.code ? 'preview' : 'prompt');

    resetApkState();
  };

  // ============================================================
  // RETOUR
  // ============================================================

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setPrompt('');
    setGeneratedCode('');
    setActiveTab('prompt');

    resetApkState();
  };

  // ============================================================
  // SUPPRIMER
  // ============================================================

  const handleDeleteProject = (id: string) => {
    const confirmed = window.confirm(
      'Voulez-vous vraiment supprimer cette application ?'
    );

    if (!confirmed) {
      return;
    }

    setProjects((previous) =>
      previous.filter((project) => project.id !== id)
    );

    if (currentProject?.id === id) {
      setCurrentProject(null);
      setPrompt('');
      setGeneratedCode('');
      setActiveTab('prompt');

      resetApkState();
    }
  };

  // ============================================================
  // SAUVEGARDER LE PROJET
  // ============================================================

  const saveCurrentProject = (
    code: string,
    projectPrompt: string
  ) => {
    if (!currentProject) {
      return;
    }

    const updatedProject: Project = {
      ...currentProject,
      prompt: projectPrompt,
      code,
      updatedAt: new Date().toISOString(),
    };

    setProjects((previous) =>
      previous.map((project) =>
        project.id === updatedProject.id
          ? updatedProject
          : project
      )
    );

    setCurrentProject(updatedProject);
  };

  // ============================================================
  // EXPORT HTML
  // ============================================================

  const handleExportHTML = () => {
    if (!generatedCode) {
      alert("Générez d'abord votre application.");
      return;
    }

    const blob = new Blob([generatedCode], {
      type: 'text/html;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProject?.name || 'simirork-app'}.html`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // ============================================================
  // CONSTRUIRE L'APK
  // ============================================================

  const handleBuildAPK = async () => {
    if (!generatedCode) {
      alert("Générez d'abord votre application.");
      return;
    }

    if (!currentProject || buildingApk) {
      return;
    }

    setBuildingApk(true);
    setApkReady(false);
    setApkError('');
    setApkRunId(null);

    try {
      const response = await fetch('/api/build-apk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: generatedCode,
          appName: currentProject.name,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.runId) {
        throw new Error(
          data.error ||
            "Impossible de lancer la construction de l'APK."
        );
      }

      const runId = String(data.runId);

      setApkRunId(runId);

      // Suivi du workflow GitHub
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, 5000)
        );

        const statusResponse = await fetch(
          `/api/build-apk/status?runId=${encodeURIComponent(runId)}`,
          {
            cache: 'no-store',
          }
        );

        const statusData = await statusResponse.json();

        if (!statusResponse.ok || !statusData.success) {
          throw new Error(
            statusData.error ||
              'Erreur pendant le suivi du build.'
          );
        }

        if (
          statusData.status === 'completed' &&
          statusData.conclusion === 'success' &&
          statusData.artifactReady
        ) {
          setApkReady(true);
          setBuildingApk(false);
          return;
        }

        if (
          statusData.status === 'completed' &&
          statusData.conclusion !== 'success'
        ) {
          throw new Error(
            statusData.error ||
              "La construction de l'APK a échoué."
          );
        }
      }

      throw new Error(
        "La construction prend trop de temps. Vérifiez GitHub Actions."
      );
    } catch (error) {
      console.error('Erreur APK :', error);

      setApkError(
        error instanceof Error
          ? error.message
          : "Erreur pendant la génération de l'APK."
      );
    } finally {
      setBuildingApk(false);
    }
  };

  // ============================================================
  // TÉLÉCHARGER L'APK
  // ============================================================

  const handleDownloadAPK = () => {
    if (!apkRunId || !currentProject) {
      return;
    }

    const appName = encodeURIComponent(
      currentProject.name
    );

    const downloadUrl =
      `/api/build-apk/download?runId=${encodeURIComponent(
        apkRunId
      )}&appName=${appName}`;

    window.location.href = downloadUrl;
  };

  // ============================================================
  // GÉNÉRATION IA
  // ============================================================

  const handleGenerate = async () => {
    const currentPrompt = prompt.trim();

    if (!currentPrompt || loading) {
      return;
    }

    if (!currentProject) {
      alert(
        "Veuillez d'abord créer ou ouvrir une application."
      );
      return;
    }

    setLoading(true);
    resetApkState();

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          modelVersion,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erreur pendant la génération de l'application."
        );
      }

      if (!data.code || typeof data.code !== 'string') {
        throw new Error(
          "L'IA n'a pas retourné de code d'application."
        );
      }

      setGeneratedCode(data.code);

      saveCurrentProject(data.code, currentPrompt);

      setActiveTab('preview');
    } catch (error) {
      console.error('Erreur génération :', error);

      alert(
        error instanceof Error
          ? error.message
          : 'Une erreur est survenue pendant la génération.'
      );
    } finally {
      setLoading(false);
    }
  };

  const hasPrompt = prompt.trim().length > 0;

  // ============================================================
  // PAGE MES APPLICATIONS
  // ============================================================

  if (!currentProject) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-gray-800 bg-gray-950">
          <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold">
                S
              </div>

              <div>
                <h1 className="text-lg font-bold sm:text-xl">
                  SimiRork
                </h1>

                <p className="hidden text-xs text-gray-500 sm:block">
                  AI App Generator
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              + Nouvelle application
            </button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Mes applications
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Créez, ouvrez et gérez vos applications avec SimiRork.
            </p>
          </div>

          {projects.length === 0 ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-gray-900 px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800 text-2xl">
                +
              </div>

              <h3 className="text-lg font-semibold text-gray-300">
                Aucune application
              </h3>

              <p className="mt-2 max-w-md text-sm text-gray-500">
                Créez votre première application pour commencer à
                utiliser SimiRork.
              </p>

              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500"
              >
                Créer ma première application
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-xl"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-xl">
                      📱
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteProject(project.id)
                      }
                      className="text-xs text-gray-600 transition hover:text-red-400"
                    >
                      Supprimer
                    </button>
                  </div>

                  <h3 className="truncate text-lg font-semibold">
                    {project.name}
                  </h3>

                  <p className="mt-2 min-h-[40px] text-sm text-gray-500">
                    {project.description ||
                      'Aucune description'}
                  </p>

                  <p className="mt-3 text-xs text-gray-600">
                    {project.code
                      ? 'Application générée'
                      : 'Projet non généré'}
                  </p>

                  <button
                    type="button"
                    onClick={() => handleOpenProject(project)}
                    className="mt-5 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm font-semibold transition hover:bg-gray-700"
                  >
                    Ouvrir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {showNewProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-2xl sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Nouvelle application
                </h2>

                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="text-xl text-gray-500 transition hover:text-white"
                >
                  ×
                </button>
              </div>

              <label className="text-sm text-gray-400">
                Nom de l'application
              </label>

              <input
                value={newName}
                onChange={(event) =>
                  setNewName(event.target.value)
                }
                placeholder="Exemple : MonBudget"
                className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
              />

              <label className="mt-5 block text-sm text-gray-400">
                Description
              </label>

              <textarea
                value={newDescription}
                onChange={(event) =>
                  setNewDescription(event.target.value)
                }
                placeholder="Décrivez brièvement votre application..."
                className="mt-2 min-h-[120px] w-full resize-none rounded-xl border border-gray-700 bg-gray-950 p-4 text-sm text-white outline-none focus:border-blue-500"
              />

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowNewProject(false)
                  }
                  className="flex-1 rounded-xl bg-gray-800 px-4 py-3 text-sm font-semibold transition hover:bg-gray-700"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={handleCreateProject}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold transition hover:bg-blue-500"
                >
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ============================================================
  // ÉDITEUR
  // ============================================================

  return (
    <main className="min-h-screen overflow-x-hidden bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleBackToProjects}
              className="rounded-lg px-2 py-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
              ←
            </button>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold">
              S
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-base font-bold sm:text-xl">
                {currentProject.name}
              </h1>

              <p className="hidden text-xs text-gray-500 sm:block">
                Projet SimiRork
              </p>
            </div>
          </div>

          <select
            value={modelVersion}
            onChange={(event) =>
              setModelVersion(event.target.value)
            }
            className="hidden rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500 sm:block"
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
        </div>
      </header>

      {/* ========================================================
          BARRE APK
         ======================================================== */}

      <div className="border-b border-purple-900/60 bg-purple-950/40">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-5 md:flex-row md:items-center md:justify-between lg:px-6">
          <div>
            <p className="text-sm font-bold text-purple-200 sm:text-base">
              📱 Application Android
            </p>

            <p className="mt-1 text-xs text-purple-300/70">
              {apkReady
                ? 'Votre APK est prêt à être téléchargé et installé.'
                : generatedCode
                  ? 'Transformez cette application en APK utilisable en dehors de SimiRork.'
                  : "Générez d'abord votre application pour activer la création de l'APK."}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {!apkReady && (
              <button
                type="button"
                onClick={handleBuildAPK}
                disabled={!generatedCode || buildingApk}
                className={`w-full rounded-xl px-5 py-3 text-sm font-bold transition sm:w-auto ${
                  generatedCode && !buildingApk
                    ? 'bg-purple-600 text-white shadow-lg hover:bg-purple-500 active:scale-[0.98]'
                    : 'cursor-not-allowed bg-gray-800 text-gray-600'
                }`}
              >
                {buildingApk
                  ? '⏳ Création de l’APK...'
                  : '📱 Créer mon APK'}
              </button>
            )}

            {apkReady && apkRunId && (
              <button
                type="button"
                onClick={handleDownloadAPK}
                className="w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-green-500 active:scale-[0.98] sm:w-auto"
              >
                ⬇ Télécharger l’APK
              </button>
            )}

            <button
              type="button"
              onClick={handleExportHTML}
              disabled={!generatedCode}
              className={`w-full rounded-xl px-5 py-3 text-sm font-semibold transition sm:w-auto ${
                generatedCode
                  ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  : 'cursor-not-allowed bg-gray-900 text-gray-700'
              }`}
            >
              📦 Exporter HTML
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          APK PRÊT
         ======================================================== */}

      {apkReady && apkRunId && (
        <div className="border-b border-green-800 bg-green-950/70 px-4 py-3">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-green-300">
                ✅ APK généré avec succès
              </p>

              <p className="mt-1 text-xs text-green-400/80">
                {currentProject.name} est maintenant disponible comme
                application Android indépendante.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadAPK}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-500"
            >
              ⬇ Télécharger l’APK
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          ERREUR APK
         ======================================================== */}

      {apkError && (
        <div className="border-b border-red-800 bg-red-950/70 px-4 py-3">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold text-red-300">
              ❌ Erreur pendant la création de l’APK
            </p>

            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-red-400">
              {apkError}
            </pre>
          </div>
        </div>
      )}

      {/* ========================================================
          ONGLETS MOBILE
         ======================================================== */}

      <div className="border-b border-gray-800 bg-gray-950 md:hidden">
        <div className="grid grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`min-h-12 border-b-2 text-sm font-medium ${
              activeTab === 'prompt'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500'
            }`}
          >
            Modifier
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`min-h-12 border-b-2 text-sm font-medium ${
              activeTab === 'preview'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500'
            }`}
          >
            Aperçu
          </button>
        </div>
      </div>

      {/* ========================================================
          CONTENU
         ======================================================== */}

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 sm:p-5 md:min-h-[calc(100vh-64px)] md:flex-row md:gap-5 md:p-6">
        {/* ======================================================
            PANNEAU PROMPT
           ====================================================== */}

        <section
          className={`w-full flex-col rounded-2xl border border-gray-800 bg-gray-900 p-3 shadow-xl sm:p-5 md:w-[38%] ${
            activeTab === 'prompt'
              ? 'flex'
              : 'hidden md:flex'
          }`}
        >
          <div className="mb-4 shrink-0">
            <h2 className="text-base font-semibold sm:text-lg">
              Modifier votre application
            </h2>

            <p className="mt-1 text-xs leading-5 text-gray-500 sm:text-sm">
              Décrivez ce que vous voulez créer ou modifier.
            </p>
          </div>

          <textarea
            value={prompt}
            onChange={(event) =>
              setPrompt(event.target.value)
            }
            className="min-h-[240px] w-full resize-none rounded-xl border border-gray-700 bg-gray-950 p-4 text-sm leading-6 text-white outline-none placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:min-h-[320px] sm:text-base"
            placeholder="Exemple : Crée une application de gestion de dépenses avec ajout de dépenses, catégories, total mensuel, historique et solde disponible."
          />

          <div className="mt-2 text-xs">
            {hasPrompt ? (
              <span className="text-green-400">
                Prompt prêt
              </span>
            ) : (
              <span className="text-gray-600">
                Saisissez votre demande
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!hasPrompt || loading}
            className={`mt-3 min-h-12 w-full shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition sm:min-h-14 sm:text-base ${
              hasPrompt && !loading
                ? 'bg-blue-600 hover:bg-blue-500 active:scale-[0.98]'
                : 'cursor-not-allowed bg-gray-700 opacity-50'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Génération en cours...
              </span>
            ) : (
              'Générer / Modifier'
            )}
          </button>
        </section>

        {/* ======================================================
            APERÇU
           ====================================================== */}

        <section
          className={`w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-800 bg-white shadow-xl ${
            activeTab === 'preview'
              ? 'flex'
              : 'hidden md:flex'
          }`}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-3 sm:px-4">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
            </div>

            <span className="text-xs font-medium text-gray-500">
              Aperçu — {currentProject.name}
            </span>

            <div className="w-12" />
          </div>

          <div className="min-h-0 flex-1">
            {generatedCode ? (
              <iframe
                key={generatedCode}
                srcDoc={generatedCode}
                title="Aperçu de l'application"
                className="block h-full min-h-[500px] w-full border-0 bg-white"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
              />
            ) : (
              <div className="flex min-h-[500px] flex-col items-center justify-center bg-gray-950 px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-800 bg-gray-900 text-2xl">
                  ✨
                </div>

                <h3 className="text-base font-semibold text-gray-300 sm:text-lg">
                  Votre application apparaîtra ici
                </h3>

                <p className="mt-2 max-w-sm text-xs leading-5 text-gray-600 sm:text-sm">
                  Décrivez votre application puis appuyez sur Générer.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}