import { useState, useCallback, useRef } from "react";
import { streamText, stepCountIs } from "ai";
import { getToolContracts, type ModeType, type AnyChatModelId } from "@litecode/shared";
import { resolveChatModel } from "../lib/models";
import { buildSystemPrompt } from "../lib/system-prompt";
import { executeLocalTool } from "../lib/local-tools";
import { saveSessionMessages } from "../lib/sessions";

// ---- Message types --------------------------------------------------------

export type TextPart = { type: "text"; text: string };
export type ReasoningPart = { type: "reasoning"; text: string };
export type ToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  input: Record<string, unknown>;
} & (
  | { state: "call" }
  | { state: "partial-call" }
  | { state: "output-available"; output: unknown }
  | { state: "output-error"; errorText: string }
);

export type MessagePart = TextPart | ReasoningPart | ToolPart;

export type Message = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  metadata?: {
    mode: ModeType;
    model: string;
    durationMs?: number;
  };
};

// ---- Helpers --------------------------------------------------------------

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type.startsWith("tool-");
}

// Text-only history — consistent with original server behaviour
function buildCoreHistory(messages: Message[]): { role: "user" | "assistant"; content: string }[] {
  return messages.flatMap((msg) => {
    const text = msg.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (!text.trim()) return [];
    return [{ role: msg.role as "user" | "assistant", content: text }];
  });
}

// Parses <think>…</think> tags from Ollama text-delta chunks, routing the
// content inside to reasoning events and everything outside to text events.
function makeThinkParser() {
  let buffer = "";
  let inThinkBlock = false;

  return function process(chunk: string): { reasoning: string; text: string } {
    let remaining = buffer + chunk;
    buffer = "";
    let reasoningOut = "";
    let textOut = "";

    while (remaining.length > 0) {
      if (inThinkBlock) {
        const closeIdx = remaining.indexOf("</think>");
        if (closeIdx === -1) {
          const CLOSE = "</think>";
          let partialLen = 0;
          for (let i = 1; i < CLOSE.length; i++) {
            if (remaining.endsWith(CLOSE.slice(0, i))) partialLen = i;
          }
          const safeEnd = remaining.length - partialLen;
          if (safeEnd > 0) reasoningOut += remaining.slice(0, safeEnd);
          buffer = remaining.slice(safeEnd);
          remaining = "";
        } else {
          if (closeIdx > 0) reasoningOut += remaining.slice(0, closeIdx);
          inThinkBlock = false;
          remaining = remaining.slice(closeIdx + "</think>".length);
        }
      } else {
        const openIdx = remaining.indexOf("<think>");
        if (openIdx === -1) {
          const OPEN = "<think>";
          let partialLen = 0;
          for (let i = 1; i < OPEN.length; i++) {
            if (remaining.endsWith(OPEN.slice(0, i))) partialLen = i;
          }
          const safeEnd = remaining.length - partialLen;
          if (safeEnd > 0) textOut += remaining.slice(0, safeEnd);
          buffer = remaining.slice(safeEnd);
          remaining = "";
        } else {
          if (openIdx > 0) textOut += remaining.slice(0, openIdx);
          inThinkBlock = true;
          remaining = remaining.slice(openIdx + "<think>".length);
        }
      }
    }

    return { reasoning: reasoningOut, text: textOut };
  };
}

// ---- Hook -----------------------------------------------------------------

export function useChat(sessionId: string, initialMessages: Message[]) {
  const [messages, _setMessages] = useState<Message[]>(initialMessages);
  const [status, setStatus] = useState<"idle" | "submitted" | "streaming" | "error">("idle");
  const [error, setError] = useState<Error | null>(null);

  // Keep a ref in sync so the submit callback never has stale message state
  const messagesRef = useRef(initialMessages);
  const setMessages = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      const next = typeof updater === "function" ? updater(messagesRef.current) : updater;
      messagesRef.current = next;
      _setMessages(next);
    },
    [],
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStatus("idle");
  }, []);

  const interrupt = abort;

  const submit = useCallback(
    async ({
      userText,
      mode,
      model,
    }: {
      userText: string;
      mode: ModeType;
      model: AnyChatModelId;
    }) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);

      const prevMessages = messagesRef.current;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: userText }],
        metadata: { mode, model },
      };
      setMessages([...prevMessages, userMessage]);
      setStatus("submitted");

      const assistantId = crypto.randomUUID();
      const assistantParts: MessagePart[] = [];
      const startTime = Date.now();

      const emitAssistant = (durationMs?: number) => {
        const msg: Message = {
          id: assistantId,
          role: "assistant",
          parts: [...assistantParts],
          metadata: { mode, model, ...(durationMs != null ? { durationMs } : {}) },
        };
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === assistantId);
          return exists ? prev.map((m) => (m.id === assistantId ? msg : m)) : [...prev, msg];
        });
      };

      const appendReasoning = (text: string) => {
        const last = assistantParts[assistantParts.length - 1];
        if (last?.type === "reasoning") {
          last.text += text;
        } else {
          assistantParts.push({ type: "reasoning", text });
        }
      };

      const appendText = (text: string) => {
        const last = assistantParts[assistantParts.length - 1];
        if (last?.type === "text") {
          last.text += text;
        } else {
          assistantParts.push({ type: "text", text });
        }
      };

      const parseThink = makeThinkParser();

      try {
        const resolvedModel = resolveChatModel(model);
        const contracts = getToolContracts(mode);

        // Tools with execute so each streamText call closes after one step.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolsWithExecute = Object.fromEntries(
          Object.entries(contracts).map(([name, contract]) => [
            name,
            {
              description: contract.description,
              inputSchema: contract.inputSchema,
              execute: async (args: Record<string, unknown>) => {
                try {
                  return await executeLocalTool(name, args, mode);
                } catch (err) {
                  return { _toolError: err instanceof Error ? err.message : String(err) };
                }
              },
            },
          ]),
        );

        setStatus("streaming");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = streamText({
          model: resolvedModel.model,
          system: buildSystemPrompt({ mode }),
          messages: [
            ...buildCoreHistory(prevMessages),
            { role: "user" as const, content: userText },
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: toolsWithExecute as any,
          stopWhen: stepCountIs(50),
          abortSignal: controller.signal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          providerOptions: resolvedModel.providerOptions as any,
        });

        for await (const part of result.fullStream) {
          if (controller.signal.aborted) break;

          if (part.type === "reasoning-delta") {
            appendReasoning(part.text);
            emitAssistant();
          }

          if (part.type === "text-delta") {
            const { reasoning, text } = parseThink(part.text);
            if (reasoning) appendReasoning(reasoning);
            if (text) appendText(text);
            emitAssistant();
          }

          if (part.type === "tool-call") {
            assistantParts.push({
              type: `tool-${part.toolName}` as `tool-${string}`,
              toolCallId: part.toolCallId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input: (part as any).input as Record<string, unknown>,
              state: "call",
            });
            emitAssistant();
          }

          if (part.type === "tool-result") {
            const toolPart = assistantParts.find(
              (p): p is ToolPart => isToolPart(p) && p.toolCallId === part.toolCallId,
            );
            if (toolPart) {
              const out = part.output as Record<string, unknown> | null;
              if (out && "_toolError" in out) {
                Object.assign(toolPart, { state: "output-error", errorText: String(out._toolError) });
              } else {
                Object.assign(toolPart, { state: "output-available", output: out });
              }
            }
            emitAssistant();
          }
        }

        if (!controller.signal.aborted) {
          const durationMs = Date.now() - startTime;
          emitAssistant(durationMs);
          void saveSessionMessages(sessionId, messagesRef.current);
          setStatus("idle");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus("error");
      }
    },
    [sessionId, setMessages],
  );

  return { messages, status, error, submit, abort, interrupt };
}
