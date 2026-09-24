'use client';

import { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelVersion, setModelVersion] = useState(
    'google/gemini-3.6-flash'
  );
  const [activeTab, setActiveTab] = useState<'prompt' | 'preview'>('prompt');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setGeneratedCode('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          modelVersion,
        }),
      });

      const data = await res.json();

      if (data.code) {
        setGeneratedCode(data.code);
        setActiveTab('preview');
      } else {
        alert(data.error || 'Erreur lors de la generation.');
      }
    } catch (err) {
      console.error(err);
      alert('Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold shadow-lg shadow-blue-600/20">
              S
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-base font-bold sm:text-xl">
                SimiRork
              </h1>

              <p className="hidden text-xs text-gray-500 sm:block">
                AI App Generator
              </p>
            </div>
          </div>

          {/* MODELE */}
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-gray-500 md:block">
              Modele
            </span>

            <select
              value={modelVersion}
              onChange={(e) => setModelVersion(e.target.value)}
              className="max-w-[170px] rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-2 text-xs text-gray-200 outline-none transition focus:border-blue-500 sm:max-w-none"
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

      {/* MOBILE TABS */}
      <div className="sticky top-16 z-10 border-b border-gray-800 bg-gray-950 md:hidden">
        <div className="grid grid-cols-2">
          <button
            onClick={() => setActiveTab('prompt')}
            className={`py-3 text-sm font-medium transition ${
              activeTab === 'prompt'
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-gray-500'
            }`}
          >
            Prompt
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            className={`py-3 text-sm font-medium transition ${
              activeTab === 'preview'
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-gray-500'
            }`}
          >
            Apercu
          </button>
        </div>
      </div>

      {/* CONTENU */}
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-7xl flex-col gap-4 p-3 sm:p-5 md:flex-row md:gap-5 md:p-6">
        {/* PROMPT */}
        <section
          className={`flex min-h-[calc(100vh-130px)] w-full flex-col rounded-2xl border border-gray-800 bg-gray-900 p-3 shadow-xl sm:p-5 md:min-h-0 md:w-[38%] ${
            activeTab === 'prompt' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="mb-4">
            <h2 className="text-base font-semibold sm:text-lg">
              Que voulez-vous creer ?
            </h2>

            <p className="mt-1 text-xs leading-5 text-gray-500 sm:text-sm">
              Decrivez votre application ou votre page web.
            </p>
          </div>

          {/* TEXTAREA */}
          <textarea
            className="min-h-[260px] flex-1 resize-none rounded-xl border border-gray-700 bg-gray-950 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:min-h-[320px] sm:text-base"
            placeholder="Exemple : Cree une application de gestion de budget personnel en FCFA avec un tableau de bord, les revenus, les depenses et le solde..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          {/* BOUTON */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/10 transition active:scale-[0.98] hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-14 sm:text-base"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generation en cours...
              </span>
            ) : (
              'Generer l application'
            )}
          </button>

          {/* INFO */}
          <div className="mt-3 hidden rounded-xl border border-gray-800 bg-gray-950 p-3 sm:block">
            <p className="text-xs leading-5 text-gray-500">
              SimiRork genere une interface web complete avec son
              fonctionnement JavaScript.
            </p>
          </div>
        </section>

        {/* APERCU */}
        <section
          className={`min-h-[calc(100vh-130px)] w-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-800 bg-white shadow-xl ${
            activeTab === 'preview' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* BARRE APERCU */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-3 sm:px-4">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
            </div>

            <span className="text-xs font-medium text-gray-500">
              Apercu
            </span>

            <div className="w-12" />
          </div>

          {/* CONTENU */}
          <div className="min-h-0 flex-1">
            {generatedCode ? (
              <iframe
                srcDoc={generatedCode}
                title="Apercu de l application"
                className="h-full w-full border-none bg-white"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
              />
            ) : (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center bg-gray-950 px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-800 bg-gray-900 text-2xl">
                  ✨
                </div>

                <h3 className="text-base font-semibold text-gray-300 sm:text-lg">
                  Votre application apparaitra ici
                </h3>

                <p className="mt-2 max-w-sm text-xs leading-5 text-gray-600 sm:text-sm">
                  Decrivez votre idee dans le panneau Prompt puis appuyez
                  sur Generer.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}