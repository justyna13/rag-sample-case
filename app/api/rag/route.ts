import { searchKnowledge } from '../../lib/rag';

export const runtime = 'nodejs';

const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const model = process.env.OLLAMA_MODEL ?? 'gemma4:e2b';

export async function POST(req: Request) {
    const { question } = await req.json();

    if (!question) {
        return Response.json(
            { error: 'Question is required' },
            { status: 400 }
        );
    }

    let chunks: Awaited<ReturnType<typeof searchKnowledge>>;
    try {
        chunks = await searchKnowledge(question, 3, req.signal);
    } catch (error) {
        return Response.json(
            { error: error instanceof Error ? error.message : 'Nie udało się wyszukać dokumentacji.' },
            { status: 502 },
        );
    }

    if (chunks.length === 0) {
        return Response.json({
            answer: 'No relevant information found',
            sources: [],
        });
    }

    const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.title}\n${chunk.content}`,
    )
    .join('\n\n');
        const sources = chunks.map((chunk) => ({
                id: chunk.id,
                title: chunk.title,
                source: chunk.source,
                score: chunk.score,
        }));

    let response: Response;
    try {
        response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'system',
                        content: `Jesteś asystentem dokumentacji.
                            Odpowiadaj wyłącznie na podstawie podanego kontekstu.
                            Jeśli odpowiedzi nie ma w kontekście, napisz:
                            "Nie znalazłem tej informacji w dokumentacji."
                            Podaj numery źródeł, których użyłeś, np. [1], [2].
                            KONTEKST:
                            ${context}`,
                    },
                    {
                        role: 'user',
                        content: question,
                    },
                ],
                stream: true,
            }),
            signal: req.signal,
        });
    } catch {
        return Response.json(
            { error: 'Nie można połączyć się z Ollama. Sprawdź, czy działa lokalnie.' },
            { status: 502 },
        );
    }

    if (!response.ok) {
        return Response.json(
            { error: `Ollama zwróciła błąd (${response.status}).` },
            { status: 502 }
        );
    }

    const headers = new Headers({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
    });
    headers.set('X-RAG-Sources', encodeURIComponent(JSON.stringify(sources)));

    return new Response(response.body, {
        headers,
    });
}