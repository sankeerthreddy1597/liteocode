# liteocode

A terminal-based AI coding assistant. Chat with Claude, GPT, or local Ollama models directly from your terminal — no server, no database, no setup beyond your API keys.

![liteocode](https://github.com/sankeerthreddy1597/liteocode/raw/main/docs/screenshot.png)

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/sankeerthreddy1597/liteocode/main/install.sh | bash
```

Installs the `liteocode` binary to `~/.local/bin`. Set `LITEOCODE_INSTALL_DIR` to override the install location.

## Features

- **No server required** — runs entirely as a local CLI; sessions are stored as JSON files at `~/.litecode/sessions/`
- **First-run setup** — prompts for API keys on first launch and saves them to `~/.litecode/config.json`
- **Ollama support** — use any locally running Ollama model (free, private, no API key needed)
- **Plan and Build modes** — switch between planning a task and executing it with tool calls
- **Extended thinking** — reasoning/thinking tokens surfaced for models that support it (Claude, Qwen3 via Ollama)
- **Multi-step tool calling** — the assistant can call tools across multiple turns to complete complex tasks
- **Persistent sessions** — resume any previous conversation from the session list

## Supported Models

| Provider      | Models                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| **Anthropic** | `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`                    |
| **OpenAI**    | `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`                                     |
| **Ollama**    | Any model running locally — picked up automatically from your Ollama instance |

You only need API keys for the providers you want to use. Ollama works with no key at all.

## Running from Source

**Prerequisites:** [Bun](https://bun.sh)

```bash
# Clone and install dependencies
git clone https://github.com/sankeerthreddy1597/liteocode.git
cd liteocode
bun install

# Start the CLI
bun run dev
```

On first run you'll be walked through entering your API keys. You can skip any provider you don't use.

## Environment Variables

These are optional — if not set, defaults are used.

| Variable          | Default                  | Description                       |
| ----------------- | ------------------------ | --------------------------------- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Base URL for your Ollama instance |

## Local Data

liteocode stores everything under `~/.litecode/`:

```
~/.litecode/
  config.json        # API keys
  sessions/
    <id>.json        # One file per session
```

## Packages

| Package           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `packages/cli`    | Terminal UI and all runtime logic                |
| `packages/shared` | Shared types, Zod schemas, and model definitions |
