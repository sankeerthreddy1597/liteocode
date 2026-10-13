import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ai-sdk-ollama";
import {
  findSupportedChatModel,
  isOllamaModelId,
  type SupportedChatModel,
} from "@litecode/shared";
import type { LanguageModel } from "ai";

type AnthropicModelId = Extract<SupportedChatModel, { provider: "anthropic" }>["id"];
type OpenAIModelId = Extract<SupportedChatModel, { provider: "openai" }>["id"];

// ProviderOptions shape used by the AI SDK
type ProviderOptions = Record<string, Record<string, unknown>>;

export type ResolvedModel = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
};

const ANTHROPIC_PROVIDER_OPTIONS: Partial<Record<AnthropicModelId, ProviderOptions>> = {
  "claude-opus-4-6": {
    anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
  },
  "claude-sonnet-4-6": {
    anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
  },
};

const OPENAI_PROVIDER_OPTIONS: Partial<Record<OpenAIModelId, ProviderOptions>> = {
  "gpt-5.4": {
    openai: { thinking: { reasoningSummary: "detailed" } },
  },
};

// ai-sdk-ollama uses the native Ollama API (not /v1 compat), so strip /v1 if present
const ollamaBaseURL = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/v1\/?$/, "");

const ollamaProvider = createOllama({ baseURL: ollamaBaseURL });

// Ollama silently truncates prompts longer than num_ctx, so set it explicitly
// and treat it as the model's context window.
const OLLAMA_CONTEXT_WINDOW = Number(process.env.OLLAMA_NUM_CTX) || 32_768;

const FALLBACK_CONTEXT_WINDOW = 128_000;

export function getContextWindow(modelId: string): number {
  if (isOllamaModelId(modelId)) return OLLAMA_CONTEXT_WINDOW;
  return findSupportedChatModel(modelId)?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
}

export function resolveChatModel(modelId: string): ResolvedModel {
  if (isOllamaModelId(modelId)) {
    return {
      model: ollamaProvider.chat(modelId.slice("ollama:".length), {
        think: true,
        reliableToolCalling: true,
        options: { num_ctx: OLLAMA_CONTEXT_WINDOW },
      }) as unknown as LanguageModel,
    };
  }

  const model = findSupportedChatModel(modelId);
  if (!model) throw new Error(`Unsupported model: ${modelId}`);

  if (model.provider === "anthropic") {
    const id = model.id as AnthropicModelId;
    return {
      model: anthropic(id),
      providerOptions: ANTHROPIC_PROVIDER_OPTIONS[id],
    };
  }

  if (model.provider === "openai") {
    const id = model.id as OpenAIModelId;
    return {
      model: openai(id),
      providerOptions: OPENAI_PROVIDER_OPTIONS[id],
    };
  }

  throw new Error(`Unsupported provider: ${(model as { provider: string }).provider}`);
}
