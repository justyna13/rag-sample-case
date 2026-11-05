import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type Chunk = {
    id: string;
    source: string;
    title: string;
    content: string;
    score: number;
};

type KnowledgeChunk = Omit<Chunk, 'score'>;

type VectorEntry = {
    hash: string;
    embedding: number[];
};

type VectorStore = {
    model: string;
    entries: Record<string, VectorEntry>;
};

const KNOWLEDGE_DIR = path.join(process.cwd(), 'app', 'knowledge');
const VECTOR_STORE_PATH = path.join(process.cwd(), 'app', 'data', 'vectors.json');
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';
const MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY ?? '0.6');
const TOP_SCORE_MARGIN = 0.04;

async function loadDocuments(): Promise<{ file: string; content: string}[]> {
    const files = await fs.readdir(KNOWLEDGE_DIR);

    const markdownFiles = files.filter((file) => file.endsWith('.md'));

    return Promise.all(
        markdownFiles.map(async (file) => {
            const content = await fs.readFile(
                path.join(KNOWLEDGE_DIR, file),
                'utf-8'
            );
            return { file, content };
        }),
    );
}


function splitByHeadings(content: string) {
    const sections = content.split(/\n(?=#{1,3} )/);

    return sections
        .map((section) => section.trim())
        .filter(Boolean);
}

function createKnowledgeChunks(documents: { file: string; content: string }[]): KnowledgeChunk[] {
    return documents.flatMap((document) =>
        splitByHeadings(document.content).map((section, index) => ({
            id: `${document.file}-${index}`,
            source: document.file,
            title: section.split('\n')[0],
            content: section,
        })),
    );
}

function getContentHash(chunk: KnowledgeChunk) {
    return createHash('sha256').update(`${chunk.title}\n${chunk.content}`).digest('hex');
}

async function readVectorStore(): Promise<VectorStore> {
    try {
        const content = await fs.readFile(VECTOR_STORE_PATH, 'utf-8');
        if (!content.trim()) return { model: EMBEDDING_MODEL, entries: {} };

        const store = JSON.parse(content) as Partial<VectorStore>;
        if (store.model !== EMBEDDING_MODEL || !store.entries || typeof store.entries !== 'object') {
            return { model: EMBEDDING_MODEL, entries: {} };
        }

        return { model: EMBEDDING_MODEL, entries: store.entries };
    } catch (error) {
        if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { model: EMBEDDING_MODEL, entries: {} };
        }
        throw error;
    }
}

async function embedTexts(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Nie udało się wygenerować embeddingów (Ollama: ${response.status}).`);
    }

    const result = await response.json() as { embeddings?: number[][]; error?: string };
    if (!result.embeddings || result.embeddings.length !== texts.length) {
        throw new Error(result.error ?? 'Ollama zwróciła nieprawidłowe embeddingi.');
    }

    return result.embeddings;
}

async function getDocumentEmbeddings(
    chunks: KnowledgeChunk[],
    store: VectorStore,
    signal?: AbortSignal,
) {
    const missingChunks = chunks.filter((chunk) => {
        const entry = store.entries[chunk.id];
        return !entry || entry.hash !== getContentHash(chunk);
    });

    if (missingChunks.length > 0) {
        const embeddings = await embedTexts(
            missingChunks.map((chunk) => `search_document: ${chunk.title}\n${chunk.content}`),
            signal,
        );

        missingChunks.forEach((chunk, index) => {
            store.entries[chunk.id] = {
                hash: getContentHash(chunk),
                embedding: embeddings[index],
            };
        });

        await fs.mkdir(path.dirname(VECTOR_STORE_PATH), { recursive: true });
        await fs.writeFile(VECTOR_STORE_PATH, JSON.stringify(store), 'utf-8');
    }

    return chunks.map((chunk) => store.entries[chunk.id].embedding);
}

function cosineSimilarity(left: number[], right: number[]) {
    if (left.length !== right.length) return 0;

    let dotProduct = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < left.length; index += 1) {
        dotProduct += left[index] * right[index];
        leftMagnitude += left[index] ** 2;
        rightMagnitude += right[index] ** 2;
    }

    const magnitude = Math.sqrt(leftMagnitude * rightMagnitude);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export async function searchKnowledge(
    question: string,
    limit = 3,
    signal?: AbortSignal,
): Promise<Chunk[]> {
    const documents = await loadDocuments();
    const chunks = createKnowledgeChunks(documents);
    if (chunks.length === 0) return [];

    const store = await readVectorStore();
    const documentEmbeddings = await getDocumentEmbeddings(chunks, store, signal);
    const [queryEmbedding] = await embedTexts([`search_query: ${question}`], signal);

    const rankedChunks = chunks
        .map((chunk, index) => ({
            ...chunk,
            score: cosineSimilarity(queryEmbedding, documentEmbeddings[index]),
        }))
        .sort((left, right) => right.score - left.score);
    const minimumScore = Math.max(MIN_SIMILARITY, rankedChunks[0].score - TOP_SCORE_MARGIN);

    return rankedChunks
        .filter((chunk) => chunk.score >= minimumScore)
        .slice(0, limit);
}