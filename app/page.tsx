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

  const [activeTab, setActiveTab] = useState<'prompt' | 'preview'>('prompt');

  // Charger les projets
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProjects(parsed);
      } catch {
        console.error('Impossible de charger les projets.');
      }
    }
  }, []);

  // Sauvegarder les projets
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  // Créer un projet
  const handleCreateProject = () => {
    const name = newName.trim();

    if (!name) {
      alert('Veuillez donner un nom à votre application.');
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

    const updatedProjects = [project, ...projects];

    setProjects(updatedProjects);
    setCurrentProject(project);
    setPrompt('');
    setGeneratedCode('');
    setNewName('');
    setNewDescription('');
    setShowNewProject(false);
    setActiveTab('prompt');
    setApkReady(false);
    setApkError('');
    setApkRunId(null);
  };

  // Ouvrir un projet
  const handleOpenProject = (project: Project) => {
    setCurrentProject(project);
    setPrompt(project.prompt || '');
    setGeneratedCode(project.code || '');
    setActiveTab(project.code ? 'preview' : 'prompt');
    setApkReady(false);
    setApkError('');
    setApkRunId(null);
  };

  // Retour aux applications
  const handleBackToProjects = () => {
    setCurrentProject(null);
    setPrompt('');
    setGeneratedCode('');
    setApkReady(false);
    setApkError('');
    setApkRunId(null);
  };

  // Supprimer un projet
  const handleDeleteProject = (id: string) => {
    const confirmed = window.confirm(
      'Voulez-vous vraiment supprimer cette application ?'
    );

    if (!confirmed) {
      return;
    }

    const updatedProjects = projects.filter((project) => project.id !== id);

    setProjects(updatedProjects);

    if (currentProject?.id === id) {
      setCurrentProject(null);
      setPrompt('');
      setGeneratedCode('');
      setApkReady(false);
      setApkError('');
      setApkRunId(null);
    }
  };

  // Sauvegarder le projet après génération
  const saveCurrentProject = (code: string, projectPrompt: string) => {
    if (!currentProject) {
      return;
    }

    const updatedProject: Project = {
      ...currentProject,
      prompt: projectPrompt,
      code,
      updatedAt: new Date().toISOString(),
    };

    const updatedProjects = projects.map((project) =>
      project.id === updatedProject.id ? updatedProject : project
    );

    setProjects(updatedProjects);
    setCurrentProject(updatedProject);
  };

  // Export HTML
  const handleExportHTML = () => {
    if (!generatedCode) {
      alert("Générez d'abord votre application avant de l'exporter.");
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

  // Génération APK Android via GitHub Actions
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
      // 1. Lancer le build GitHub
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
          data.error || 'Impossible de lancer la construction de l’APK.'
        );
      }

      const runId = data.runId;

      // 2. Suivre le build jusqu'à sa fin
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const statusResponse = await fetch(
          `/api/build-apk/status?runId=${runId}`,
          {
            cache: 'no-store',
          }
        );

        const statusData = await statusResponse.json();

        if (!statusResponse.ok || !statusData.success) {
          throw new Error(
            statusData.error || 'Erreur pendant le suivi du build.'
          );
        }

        // APK disponible
        if (
          statusData.status === 'completed' &&
          statusData.conclusion === 'success' &&
          statusData.artifactReady
        ) {
          setApkRunId(String(runId));
          setApkReady(true);
          return;
        }

        // Build terminé mais en erreur
        if (
          statusData.status === 'completed' &&
          statusData.conclusion !== 'success'
        ) {
          throw new Error(
            statusData.error || 'Le build Android a échoué.'
          );
        }
      }

      throw new Error(
        'La construction prend trop de temps. Vérifiez le build dans GitHub Actions.'
      );
    } catch (error) {
      console.error('Erreur APK:', error);

      setApkError(
        error instanceof Error
          ? error.message
          : 'Erreur pendant la génération de l’APK.'
      );
    } finally {
      setBuildingApk(false);
    }
  };

  // Génération IA
  const handleGenerate = async () => {
    const currentPrompt = prompt.trim();

    if (!currentPrompt || loading) {
      return;
    }

    if (!currentProject) {
      alert("Veuillez d'abord créer ou ouvrir une application.");
      return;
    }

    setLoading(true);
    setApkReady(false);
    setApkError('');
    setApkRunId(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          modelVersion,
        }),
      });

      const data = await res.json();

      if (data.code) {
        setGeneratedCode(data.code);

        saveCurrentProject(data.code, currentPrompt);

        setActiveTab('preview');
      } else {
        alert(data.error || 'Erreur lors de la génération.');
      }
    } catch (error) {
      console.error('Erreur génération:', error);
      alert('Une erreur est survenue pendant la génération.');
    } finally {
      setLoading(false);
    }
  };

  const hasPrompt = prompt.trim().length > 0;

  // ============================================================
  // PAGE "MES APPLICATIONS"
  // ============================================================

  if (!currentProject) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-gray-800 bg-gray-950">
          <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
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
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
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
                Créez votre première application pour commencer à utiliser
                SimiRork.
              </p>

              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500"
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
                      onClick={() => handleDeleteProject(project.id)}
                      className="text-xs text-gray-600 hover:text-red-400"
                    >
                      Supprimer
                    </button>
                  </div>

                  <h3 className="truncate text-lg font-semibold">
                    {project.name}
                  </h3>

                  <p className="mt-2 min-h-[40px] text-sm text-gray-500">
                    {project.description || 'Aucune description'}
                  </p>

                  <p className="mt-3 text-xs text-gray-600">
                    {project.code
                      ? 'Application générée'
                      : 'Projet non généré'}
                  </p>

                  <button
                    type="button"
                    onClick={() => handleOpenProject(project)}
                    className="mt-5 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm font-semibold hover:bg-gray-700"
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
                  className="text-gray-500 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <label className="text-sm text-gray-400">
                Nom de l'application
              </label>

              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Exemple : MonBudget"
                className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
              />

              <label className="mt-5 block text-sm text-gray-400">
                Description
              </label>

              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Décrivez brièvement votre application..."
                className="mt-2 min-h-[120px] w-full resize-none rounded-xl border border-gray-700 bg-gray-950 p-4 text-sm text-white outline-none focus:border-blue-500"
              />

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="flex-1 rounded-xl bg-gray-800 px-4 py-3 text-sm font-semibold hover:bg-gray-700"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={handleCreateProject}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500"
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
  // ÉDITEUR DU PROJET
  // ============================================================

  return (
    <main className="min-h-screen overflow-x-hidden bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleBackToProjects}
              className="rounded-lg px-2 py-2 text-gray-400 hover:bg-gray-800 hover:text-white"
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportHTML}
              disabled={!generatedCode}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                generatedCode
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'cursor-not-allowed bg-gray-800 text-gray-600'
              }`}
            >
              📦 Exporter HTML
            </button>

            <button
              type="button"
              onClick={handleBuildAPK}
              disabled={!generatedCode || buildingApk}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                generatedCode && !buildingApk
                  ? 'bg-purple-600 text-white hover:bg-purple-500'
                  : 'cursor-not-allowed bg-gray-800 text-gray-600'
              }`}
            >
              {buildingApk ? '⏳ Génération APK...' : '📱 Générer APK'}
            </button>

            <select
              value={modelVersion}
              onChange={(e) => setModelVersion(e.target.value)}
              className="hidden w-[145px] rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500 sm:block sm:w-auto sm:px-3"
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
        </div>
      </header>

      {apkReady && (
        <div className="border-b border-green-800 bg-green-950 px-4 py-3">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-green-300">
                ✅ APK généré avec succès
              </p>

              <p className="text-xs text-green-500">
                {currentProject.name} est prêt à être installé sur Android.
              </p>
            </div>

            <a
              href={
                apkRunId
                  ? `/api/build-apk/download?runId=${apkRunId}`
                  : '#'
              }
              className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-500"
            >
              ⬇ Télécharger l'APK
            </a>
          </div>
        </div>
      )}

      {apkError && (
        <div className="border-b border-red-800 bg-red-950 px-4 py-3">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold text-red-300">
              ❌ Erreur génération APK
            </p>

            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-red-400">
              {apkError}
            </pre>
          </div>
        </div>
      )}

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

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 sm:p-5 md:min-h-[calc(100vh-64px)] md:flex-row md:gap-5 md:p-6">
        <section
          className={`w-full flex-col rounded-2xl border border-gray-800 bg-gray-900 p-3 shadow-xl sm:p-5 md:w-[38%] ${
            activeTab === 'prompt' ? 'flex' : 'hidden md:flex'
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
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[240px] w-full resize-none rounded-xl border border-gray-700 bg-gray-950 p-4 text-sm leading-6 text-white outline-none placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:min-h-[320px] sm:text-base"
            placeholder="Exemple : Ajoute une page statistiques..."
          />

          <div className="mt-2 text-xs">
            {hasPrompt ? (
              <span className="text-green-400">Prompt prêt</span>
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

          {generatedCode && (
            <button
              type="button"
              onClick={handleBuildAPK}
              disabled={buildingApk}
              className={`mt-3 min-h-12 w-full rounded-xl px-4 text-sm font-semibold text-white ${
                buildingApk
                  ? 'cursor-not-allowed bg-gray-700'
                  : 'bg-purple-600 hover:bg-purple-500'
              }`}
            >
              {buildingApk
                ? '⏳ Construction de l’APK...'
                : '📱 Construire mon APK Android'}
            </button>
          )}
        </section>

        <section
          className={`w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-800 bg-white shadow-xl ${
            activeTab === 'preview' ? 'flex' : 'hidden md:flex'
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