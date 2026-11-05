'use client';

import { useEffect, useRef, useState } from 'react';

type Source = {
	id: string;
	title: string;
	source: string;
};

type SourceGroup = {
	source: string;
	titles: string[];
};

function groupSources(sources: Source[]): SourceGroup[] {
	const groups = new Map<string, SourceGroup>();

	for (const source of sources) {
		const group = groups.get(source.source) ?? { source: source.source, titles: [] };
		group.titles.push(source.title.replace(/^#+\s*/, ''));
		groups.set(source.source, group);
	}

	return [...groups.values()];
}

type Message = {
	role: 'user' | 'assistant';
	content: string;
	sources?: Source[];
};

type RagResponse = {
	answer?: string;
	sources?: Source[];
	error?: string;
};

const suggestions = [
	'Jak działają hooki useState i useEffect?',
	'Jak zbudować aplikację Next.js?',
	'Jak działa API Ollama?',
];

export default function Home() {
	const [messages, setMessages] = useState<Message[]>([]);
	const [draft, setDraft] = useState('');
	const [error, setError] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const conversationEndRef = useRef<HTMLDivElement>(null);
	const controllerRef = useRef<AbortController | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		conversationEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
	}, [messages]);

	function startNewChat() {
		controllerRef.current?.abort();
		controllerRef.current = null;
		setMessages([]);
		setDraft('');
		setError('');
		setIsLoading(false);
		textareaRef.current?.focus();
	}

	async function sendMessage(text = draft) {
		const content = text.trim();
		if (!content || isLoading) return;

		const controller = new AbortController();
		controllerRef.current = controller;
		setMessages((current) => [...current, { role: 'user', content }, { role: 'assistant', content: '' }]);
		setDraft('');
		setError('');
		setIsLoading(true);

		try {
			const response = await fetch('/api/rag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: content }),
				signal: controller.signal,
			});

			const result = (await response.json()) as RagResponse;
			if (!response.ok) throw new Error(result.error ?? 'Nie udało się uzyskać odpowiedzi.');

			setMessages((current) => {
				const updated = [...current];
				const lastMessage = updated[updated.length - 1];
				if (lastMessage?.role === 'assistant') {
					updated[updated.length - 1] = {
						...lastMessage,
						content: result.answer ?? 'Nie otrzymano odpowiedzi.',
						sources: result.sources ?? [],
					};
				}
				return updated;
			});
		} catch (caughtError) {
			if (caughtError instanceof Error && caughtError.name === 'AbortError') {
				setMessages((current) => {
					const updated = [...current];
					const lastMessage = updated[updated.length - 1];
					if (lastMessage?.role === 'assistant' && !lastMessage.content) {
						updated[updated.length - 1] = { ...lastMessage, content: 'Zapytanie zatrzymane.' };
					}
					return updated;
				});
			} else {
				setError(caughtError instanceof Error ? caughtError.message : 'Wystąpił nieoczekiwany błąd.');
				setMessages((current) => current.filter((message) => message.role !== 'assistant' || message.content));
			}
		} finally {
			controllerRef.current = null;
			setIsLoading(false);
			textareaRef.current?.focus();
		}
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void sendMessage();
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			void sendMessage();
		}
	}

	return (
		<main className="app-shell">
			<header className="topbar">
				<a className="brand" href="/" aria-label="Lokalnie, strona główna">
					<span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
					<span>lokalnie</span>
				</a>
				<div className="topbar-right">
					<span className="model-status"><span className="status-dot" /> asystent dokumentacji</span>
					<button className="icon-button new-chat-button" onClick={startNewChat} title="Nowa rozmowa" aria-label="Nowa rozmowa">
						<span className="plus-icon" aria-hidden="true">+</span>
						<span>Nowa rozmowa</span>
					</button>
				</div>
			</header>

			<section className={`chat-layout${messages.length ? ' has-messages' : ''}`}>
				{messages.length === 0 ? (
					<div className="welcome-view">
						<div className="welcome-orbit" aria-hidden="true">
							<div className="orbit-ring orbit-ring-outer" />
							<div className="orbit-ring orbit-ring-inner" />
							<div className="orbit-core"><span className="sparkle">✳</span></div>
							<span className="orbit-dot orbit-dot-one" />
							<span className="orbit-dot orbit-dot-two" />
						</div>
						<p className="eyebrow">RAG <span /> LOKALNA DOKUMENTACJA</p>
						<h1>Czego szukasz<br /><em>w dokumentacji?</em></h1>
						<p className="welcome-copy">Odpowiedzi oparte na materiałach z Twojej bazy wiedzy.</p>
						<div className="suggestions" aria-label="Propozycje pytań">
							{suggestions.map((suggestion, index) => (
								<button className="suggestion" key={suggestion} onClick={() => void sendMessage(suggestion)}>
									<span className="suggestion-index">0{index + 1}</span>
									<span>{suggestion}</span>
									<span className="suggestion-arrow" aria-hidden="true">↗</span>
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="conversation" role="log" aria-live="polite" aria-relevant="additions text">
						{messages.map((message, index) => (
							<article className={`message message-${message.role}`} key={`${index}-${message.role}`}>
								{message.role === 'assistant' ? (
									<div className="assistant-mark" aria-hidden="true"><span>✳</span></div>
								) : null}
								<div className="message-content">
									{message.role === 'assistant' ? <span className="message-label">ASYSTENT</span> : null}
									{message.content ? (
										<>
											<p>{message.content}</p>
											{message.sources?.length ? (
												<div className="source-list" aria-label="Źródła odpowiedzi">
													<span className="source-heading">ŹRÓDŁA</span>
													{groupSources(message.sources).map((sourceGroup) => (
														<div className="source-chip" key={sourceGroup.source}>
															<span className="source-file">{sourceGroup.source}:</span>
															<span className="source-sections">{sourceGroup.titles.join('; ')}</span>
														</div>
													))}
												</div>
											) : null}
										</>
									) : isLoading && index === messages.length - 1 ? (
										<span className="typing-indicator" aria-label="Asystent szuka odpowiedzi">
											<i /><i /><i />
										</span>
									) : null}
								</div>
							</article>
						))}
						<div ref={conversationEndRef} />
					</div>
				)}

				<div className="composer-wrap">
					{error ? <p className="error-message" role="alert">{error}</p> : null}
					<form className="composer" onSubmit={handleSubmit}>
						<textarea
							ref={textareaRef}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Zapytaj o dokumentację..."
							aria-label="Pytanie do dokumentacji"
							rows={1}
							disabled={isLoading}
						/>
						<button
							className={`send-button${isLoading ? ' is-stop' : ''}`}
							type={isLoading ? 'button' : 'submit'}
							onClick={isLoading ? () => controllerRef.current?.abort() : undefined}
							disabled={!isLoading && !draft.trim()}
							title={isLoading ? 'Zatrzymaj zapytanie' : 'Wyślij pytanie'}
							aria-label={isLoading ? 'Zatrzymaj zapytanie' : 'Wyślij pytanie'}
						>
							{isLoading ? <span className="stop-icon" aria-hidden="true" /> : <span className="send-icon" aria-hidden="true">↑</span>}
						</button>
					</form>
					<div className="composer-meta">
						<span>BAZA WIEDZY</span>
						<span className="meta-divider" />
						<span>Ollama <span className="status-dot status-dot-small" /></span>
					</div>
				</div>
			</section>
		</main>
	);
}
