import fs from 'node:fs/promises';
import path from 'node:path';

export type Chunk = {
    id: string;
    source: string;
    title: string;
    content: string;
    score: number;
};

const KNOWLEDGE_DIR = path.join(process.cwd(), 'app', 'knowledge');

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

function tokenize(text: string) {
    return text
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2);
}

export async function searchKnowledge(
    question: string,
    limit = 3
): Promise<Chunk[]> {
    const documents = await loadDocuments();
    const questionWords = new Set(tokenize(question));
    const chunks: Chunk[] = [];

    for (const document of documents) {
        const sections = splitByHeadings(document.content);

        for (const [index, section] of sections.entries()) {
            const words = tokenize(section);
            let score = 0;

            for (const word of questionWords) {
                if (words.includes(word)) {
                    score += 1;
                }
            }

            if (score > 0) {
                chunks.push({
                    id: `${document.file}-${index}`,
                    source: document.file,
                    title: section.split('\n')[0],
                    content: section,
                    score,
                });
            }
        }
    }

    return chunks
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}