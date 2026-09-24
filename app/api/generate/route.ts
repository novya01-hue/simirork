import { NextResponse } from 'next/server';

const SYSTEM_INSTRUCTION = `Tu es SimiRork AI, un assistant expert en création d'applications web interactives.

Lorsque l'utilisateur demande de créer une application ou une page web, génère uniquement un fichier HTML complet et autonome contenant :

1. Tailwind CSS via CDN
2. Tout le JavaScript nécessaire dans une balise <script>
3. Une interface moderne, responsive et mobile-first
4. Aucun texte explicatif avant ou après le code
5. Le résultat doit être directement exécutable dans un navigateur
6. Utilise localStorage lorsque des données doivent être conservées localement
7. L'application doit être fonctionnelle et interactive
8. N'utilise pas de framework nécessitant une compilation externe

Le HTML doit commencer directement par <!DOCTYPE html>.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const prompt = body?.prompt;
    const modelVersion = body?.modelVersion || 'openai/gpt-4o-mini';

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Le prompt est obligatoire.',
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'OPENROUTER_API_KEY est absente.',
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://simirork-azsenl1cn-debutant2.vercel.app',
          'X-Title': 'SimiRork',
        },
        body: JSON.stringify({
          model: modelVersion,
          messages: [
            {
              role: 'system',
              content: SYSTEM_INSTRUCTION,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            data?.error?.message ||
            'Erreur lors de la génération avec OpenRouter.',
        },
        { status: response.status }
      );
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: 'Aucun code HTML généré.',
        },
        { status: 500 }
      );
    }

    let generatedCode = content.trim();

    generatedCode = generatedCode
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return NextResponse.json({
      success: true,
      code: generatedCode,
      model: modelVersion,
    });
  } catch (error) {
    console.error('Erreur génération:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue pendant la génération.',
      },
      { status: 500 }
    );
  }
}
