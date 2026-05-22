# litecode

A terminal-based AI coding assistant with a chat interface. Built as a monorepo with a CLI frontend, HTTP API backend, and PostgreSQL database.

> **Work in progress** — core infrastructure is in place; AI chat integration is actively being developed.

## Overview

litecode runs in your terminal and lets you chat with AI models (Claude and GPT) within the context of your codebase. Sessions and messages are persisted so you can resume conversations across runs.

## Packages

| Package | Description |
|---|---|
| `packages/cli` | Terminal UI built with [@opentui/react](https://github.com/max-scope/opentui) — renders the chat interface, session list, and command menu |
| `packages/server` | Hono HTTP API — manages sessions and messages, runs on port 3000 |
| `packages/database` | Prisma client + schema for PostgreSQL |
| `packages/shared` | Shared types, Zod schemas, and supported model definitions |

## Supported Models

- **Anthropic:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- **OpenAI:** `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`
- **Ollama** *(coming soon)* — local models via Ollama will be supported in a future release

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) and a PostgreSQL database.

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Fill in DATABASE_URL in .env

# Generate Prisma client
cd packages/database && bun run db:generate

# Run the server (port 3000)
bun run dev:server

# Run the CLI (in a separate terminal)
bun run dev:cli
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `API_URL` | Server URL for the CLI to connect to (default: `http://localhost:3000`) |
