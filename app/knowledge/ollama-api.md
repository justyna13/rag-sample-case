# API Ollama

Ollama udostępnia lokalne API HTTP. Domyślny adres serwera to `http://localhost:11434`.

## Czat

Do rozmowy z modelem służy endpoint `POST /api/chat`. Żądanie zawiera nazwę modelu, historię wiadomości i opcję `stream`:

```json
{
	"model": "gemma4:e2b",
	"messages": [
		{ "role": "system", "content": "Odpowiadaj po polsku." },
		{ "role": "user", "content": "Co to jest komponent React?" }
	],
	"stream": false
}
```

Przykładowe wywołanie z terminala:

```bash
curl http://localhost:11434/api/chat \
	-H 'Content-Type: application/json' \
	-d '{"model":"gemma4:e2b","messages":[{"role":"user","content":"Cześć!"}],"stream":false}'
```

Przy `stream: false` serwer zwraca jeden obiekt JSON. Tekst odpowiedzi znajduje się w `message.content`:

```json
{
	"model": "gemma4:e2b",
	"message": {
		"role": "assistant",
		"content": "Cześć! W czym mogę pomóc?"
	},
	"done": true
}
```

Przy `stream: true` odpowiedź jest strumieniem obiektów JSON zakończonych znakiem nowej linii. Kolejne fragmenty tekstu również znajdują się w `message.content`.

## Konfiguracja aplikacji

Endpoint RAG korzysta z `OLLAMA_BASE_URL` i `OLLAMA_MODEL`. Jeśli zmienne nie są ustawione, używa adresu `http://localhost:11434` oraz modelu `gemma4:e2b`.

Model musi być dostępny lokalnie w Ollama. Można go pobrać poleceniem:

```bash
ollama pull gemma4:e2b
```
